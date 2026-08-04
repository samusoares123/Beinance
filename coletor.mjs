/**
 * Coletor sem estado em memoria — feito para rodar no GitHub Actions.
 *
 * Uso:  node coletor.mjs
 *       BEINANCE_DADOS=coleta node coletor.mjs
 *
 * POR QUE NAO E O scanner.mjs: o scanner mantem um WebSocket aberto e acumula
 * serie na memoria. Um runner do Actions e efemero — ele nasce, roda e morre, e
 * a memoria vai junto. Aqui o estado vive no repositorio: cada execucao le o
 * snapshot que a anterior gravou, compara, e grava o proprio.
 *
 * O QUE ISTO CAPTURA QUE O HISTORICO DE CANDLES NAO TEM: o livro de ofertas no
 * instante do sinal. Spread e slippage de meses atras nao existem em kline
 * nenhum — e sao justamente eles que decidem se um sinal daria lucro. Por isso
 * a coleta ao vivo continua valendo mesmo com anos de candle disponiveis.
 *
 * Publico: nenhuma chave, nenhuma ordem.
 */

import { custoIdaVolta, slippageDeCompra } from './src/analise.mjs'
import { gravarSinal, lerSnapshotAnterior, salvarSnapshotAnterior, PASTA_DADOS } from './src/armazenamento.mjs'

import { API } from './src/api.mjs'
const BASE = API

const LIMITES = {
  custoTotalPct: 0.5, // acima disso o sinal ja nasce sem chance
  volume24hUsdt: 1_000_000,
  variacaoPct: 2, // o que conta como movimento na janela
  maxSinaisPorRodada: 12, // teto de requisicoes de livro por execucao
  janelaMinimaMs: 3 * 60_000,
  janelaMaximaMs: 90 * 60_000, // gap maior que isso nao e "a janela", e buraco
}
const TAXA_POR_LADO = 0.1
const POSICAO_DE_TESTE_USDT = 8.25

const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v, c = 2) => (v >= 0 ? '+' : '') + num(v, c)

const buscar = async (caminho) => {
  const r = await fetch(`${BASE}${caminho}`)
  if (!r.ok) throw new Error(`${caminho} -> ${r.status}`)
  return r.json()
}

async function main() {
  const agora = Date.now()
  const anterior = await lerSnapshotAnterior()

  const [tickers, livros] = await Promise.all([buscar('/api/v3/ticker/24hr'), buscar('/api/v3/ticker/bookTicker')])
  const mapaLivro = new Map(livros.map((l) => [l.symbol, l]))

  // --- elegiveis: o filtro de custo vem antes de qualquer ideia de sinal ---
  const elegiveis = []
  for (const t of tickers) {
    if (!t.symbol.endsWith('USDT')) continue
    if (Number(t.quoteVolume) < LIMITES.volume24hUsdt) continue
    const l = mapaLivro.get(t.symbol)
    if (!l) continue
    const bid = Number(l.bidPrice)
    const ask = Number(l.askPrice)
    if (!(bid > 0) || !(ask > 0)) continue
    const { spreadPct, custoTotalPct } = custoIdaVolta({ bid, ask, taxaPorLado: TAXA_POR_LADO })
    if (custoTotalPct > LIMITES.custoTotalPct) continue
    elegiveis.push({ simbolo: t.symbol, preco: Number(t.lastPrice), volume24h: Number(t.quoteVolume), spreadPct, custoTotalPct })
  }

  const snapshot = { momento: agora, precos: Object.fromEntries(elegiveis.map((e) => [e.simbolo, e.preco])) }

  if (!anterior) {
    await salvarSnapshotAnterior(snapshot)
    console.log(`Primeira execucao — ${elegiveis.length} pares fotografados em ${PASTA_DADOS}/. Sem comparacao ainda.`)
    return
  }

  const janelaMs = agora - anterior.momento
  if (janelaMs < LIMITES.janelaMinimaMs) {
    console.log(`Janela de ${Math.round(janelaMs / 1000)}s e curta demais. Nada gravado.`)
    return
  }
  if (janelaMs > LIMITES.janelaMaximaMs) {
    // Gap grande nao e uma janela — atribuir a variacao a ele mentiria sobre a
    // velocidade do movimento, que e o proprio conteudo do sinal.
    await salvarSnapshotAnterior(snapshot)
    console.log(`Buraco de ${Math.round(janelaMs / 60_000)} min desde a ultima coleta. Refotografado sem gravar sinal.`)
    return
  }

  // --- quem se mexeu na janela --------------------------------------------
  const movimentos = []
  for (const e of elegiveis) {
    const antes = anterior.precos[e.simbolo]
    if (!(antes > 0)) continue
    const variacaoPct = ((e.preco - antes) / antes) * 100
    if (Math.abs(variacaoPct) < LIMITES.variacaoPct) continue
    movimentos.push({ ...e, precoAnterior: antes, variacaoPct })
  }
  movimentos.sort((a, b) => Math.abs(b.variacaoPct) - Math.abs(a.variacaoPct))
  const selecionados = movimentos.slice(0, LIMITES.maxSinaisPorRodada)

  console.log(`Janela de ${Math.round(janelaMs / 60_000)} min · ${elegiveis.length} elegiveis · ${movimentos.length} se mexeram mais de ${LIMITES.variacaoPct}%`)
  if (movimentos.length > selecionados.length) {
    console.log(`Gravando os ${selecionados.length} maiores. ${movimentos.length - selecionados.length} descartados pelo teto de requisicoes.`)
  }

  let gravados = 0
  for (const m of selecionados) {
    // O livro real no instante do sinal e o dado que candle nenhum devolve.
    let livro
    try {
      livro = await buscar(`/api/v3/depth?symbol=${m.simbolo}&limit=50`)
    } catch {
      continue
    }
    const slip = slippageDeCompra(livro.asks, POSICAO_DE_TESTE_USDT)

    await gravarSinal({
      momento: new Date().toISOString(),
      simbolo: m.simbolo,
      regra: m.variacaoPct > 0 ? 'alta-rapida' : 'queda-subita',
      precoEntrada: m.preco,
      precoAnterior: m.precoAnterior,
      variacaoPct: Number(m.variacaoPct.toFixed(3)),
      janelaSegundos: Math.round(janelaMs / 1000),
      spreadPct: m.spreadPct,
      slippagePct: Number(slip.slippagePct.toFixed(4)),
      custoTotalPct: Number((m.custoTotalPct + slip.slippagePct).toFixed(4)),
      livroRaso: slip.insuficiente,
      volume24hUsdt: m.volume24h,
      origem: 'coletor-actions',
    })
    gravados++
    console.log(`  ${m.simbolo.padEnd(14)} ${sinalDe(m.variacaoPct).padStart(8)}%  custo ${num(m.custoTotalPct + slip.slippagePct, 3)}%`)
  }

  await salvarSnapshotAnterior(snapshot)
  console.log(`\n${gravados} sinal(is) gravado(s) em ${PASTA_DADOS}/sinais.jsonl`)
}

main().catch((e) => {
  console.error(`FALHOU: ${e.message}`)
  process.exit(1)
})
