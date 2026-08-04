/**
 * Robo de operacao — MODO SIMULADO.
 *
 * Decide de verdade: le o mercado ao vivo, dimensiona a posicao, respeita os
 * limites de risco e fecha no alvo, no stop ou no tempo. A unica coisa que ele
 * NAO faz e mandar a ordem.
 *
 * Nao ha como ele executar por engano: nenhuma funcao de ordem existe neste
 * arquivo, e o cliente assinado ([src/binance/client.mjs]) so aceita 3 endpoints
 * de leitura. Ligar de verdade exigiria escrever codigo novo e uma chave nova.
 *
 * Uso:  node robo.mjs           (Ctrl+C encerra e imprime o resumo)
 */

import { detectarEstouroDeVolume, detectarQuedaSubita, janelaDe } from './src/sinais.mjs'
import { custoIdaVolta, slippageDeCompra } from './src/analise.mjs'
import { tamanhoDaPosicao, avaliarSaida } from './src/estrategia.mjs'
import { podeAbrir, resumoDoDia } from './src/risco.mjs'
import { lerEstadoRobo, salvarEstadoRobo, gravarOperacao, lerOperacoes } from './src/armazenamento.mjs'

const BASE = 'https://api.binance.com'
const STREAM = 'wss://stream.binance.com:9443/ws/!miniTicker@arr'

const CFG = {
  capitalInicialUsdt: 33,
  taxaPorLado: 0.075, // % — com desconto do BNB ativado
  alvoPct: 3,
  stopPct: 2,
  tempoMaximoMs: 4 * 60 * 60_000,
  fracaoMaxima: 0.25,
  margemSeguranca: 0.35,
  limites: { maxPosicoes: 3, maxStopsSeguidos: 3, quedaMaximaDiaPct: 20 },
  sinal: {
    volume: { multiplicador: 5, variacaoMinima: 2 },
    queda: { quedaMinima: 5, tetoQuedaBtc: 1 },
  },
  filtros: { custoTotalPct: 0.5, tickPct: 0.1, volume24hUsdt: 100_000 },
  janelaEstouroMs: 5 * 60_000,
  janelaQuedaMs: 10 * 60_000,
  toleranciaJanelaMs: 60_000,
  intervaloAmostraMs: 15_000,
  retencaoMs: 20 * 60_000,
}

const historico = new Map()
const elegiveis = new Map() // simbolo -> { minNotional }
let estado = null
let mensagens = 0

const agora = () => new Date().toLocaleTimeString('pt-BR')
const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v) => (v >= 0 ? '+' : '') + num(v)

const buscar = async (caminho) => {
  const r = await fetch(`${BASE}${caminho}`)
  if (!r.ok) throw new Error(`${caminho} → ${r.status}`)
  return r.json()
}

async function montarElegiveis() {
  const [info, livros, tickers] = await Promise.all([
    buscar('/api/v3/exchangeInfo'),
    buscar('/api/v3/ticker/bookTicker'),
    buscar('/api/v3/ticker/24hr'),
  ])
  const mb = new Map(livros.map((l) => [l.symbol, l]))
  const mt = new Map(tickers.map((t) => [t.symbol, t]))

  let semTamanho = 0
  for (const s of info.symbols) {
    if (s.quoteAsset !== 'USDT' || s.status !== 'TRADING' || !s.isSpotTradingAllowed) continue
    const b = mb.get(s.symbol)
    const t = mt.get(s.symbol)
    if (!b || !t) continue
    const bid = Number(b.bidPrice)
    const ask = Number(b.askPrice)
    if (bid <= 0 || ask <= 0) continue

    const preco = (bid + ask) / 2
    const tick = Number(s.filters.find((f) => f.filterType === 'PRICE_FILTER').tickSize)
    const minNotional = Number(s.filters.find((f) => f.filterType === 'NOTIONAL')?.minNotional ?? 5)
    const { custoTotalPct } = custoIdaVolta({ bid, ask, taxaPorLado: CFG.taxaPorLado })

    if (custoTotalPct > CFG.filtros.custoTotalPct) continue
    if ((tick / preco) * 100 > CFG.filtros.tickPct) continue
    if (Number(t.quoteVolume) < CFG.filtros.volume24hUsdt) continue

    // O par so entra se o capital atual permitir uma posicao vendavel nele.
    const { tamanhoUsdt } = tamanhoDaPosicao({
      capitalUsdt: estado.capitalUsdt,
      minNotional,
      fracaoMaxima: CFG.fracaoMaxima,
      margemSeguranca: CFG.margemSeguranca,
    })
    if (tamanhoUsdt === null) { semTamanho++; continue }

    elegiveis.set(s.symbol, { minNotional })
  }

  console.log(`Elegiveis: ${elegiveis.size} pares.`)
  console.log(`Descartados por nao caber posicao vendavel com US$ ${num(estado.capitalUsdt)}: ${semTamanho}.`)
}

function amostrar(simbolo, preco, volumeAcumulado) {
  let serie = historico.get(simbolo)
  if (!serie) historico.set(simbolo, (serie = []))
  const t = Date.now()
  if (serie.length && t - serie.at(-1).t < CFG.intervaloAmostraMs) return null
  serie.push({ t, preco, volumeAcumulado })
  while (serie.length && t - serie[0].t > CFG.retencaoMs) serie.shift()
  return serie
}

/** Preco realmente pago/recebido, percorrendo o livro. */
async function precoDeExecucao(simbolo, valorUsdt, lado) {
  const livro = await buscar(`/api/v3/depth?symbol=${simbolo}&limit=50`)
  if (lado === 'compra') {
    const s = slippageDeCompra(livro.asks, valorUsdt)
    return { preco: s.precoMedio, insuficiente: s.insuficiente }
  }
  // Venda: percorre as ofertas de compra, do melhor preco para baixo.
  const invertido = livro.bids.map(([p, q]) => [p, q])
  const s = slippageDeCompra(invertido, valorUsdt)
  return { preco: s.precoMedio, insuficiente: s.insuficiente }
}

async function abrir(simbolo, regra, detalhe) {
  const permissao = podeAbrir(
    {
      posicoesAbertas: estado.posicoes.length,
      stopsSeguidos: estado.stopsSeguidos,
      capitalAtual: estado.capitalUsdt,
      capitalInicioDoDia: estado.capitalInicioDoDia,
    },
    CFG.limites,
  )
  if (!permissao.pode) return
  if (estado.posicoes.some((p) => p.simbolo === simbolo)) return

  const { minNotional } = elegiveis.get(simbolo)
  const { tamanhoUsdt } = tamanhoDaPosicao({
    capitalUsdt: estado.capitalUsdt,
    minNotional,
    fracaoMaxima: CFG.fracaoMaxima,
    margemSeguranca: CFG.margemSeguranca,
  })
  if (tamanhoUsdt === null) return

  const { preco, insuficiente } = await precoDeExecucao(simbolo, tamanhoUsdt, 'compra')
  if (insuficiente || !preco) return

  const taxa = tamanhoUsdt * (CFG.taxaPorLado / 100)
  estado.posicoes.push({
    simbolo,
    regra,
    aberturaEm: new Date().toISOString(),
    precoEntrada: preco,
    tamanhoUsdt,
    quantidade: (tamanhoUsdt - taxa) / preco,
    taxaEntradaUsdt: taxa,
  })
  estado.capitalUsdt -= tamanhoUsdt

  console.log(
    `${agora()}  ABRE   ${simbolo.padEnd(14)} US$ ${num(tamanhoUsdt)} a ${preco}   ${regra}  ${detalhe ?? ''}`,
  )
  await salvarEstadoRobo(estado)
}

async function fechar(posicao, motivo, precoAtual) {
  const valorBruto = posicao.quantidade * precoAtual
  const { preco } = await precoDeExecucao(posicao.simbolo, valorBruto, 'venda')
  const precoSaida = preco || precoAtual

  const recebido = posicao.quantidade * precoSaida
  const taxa = recebido * (CFG.taxaPorLado / 100)
  const liquido = recebido - taxa
  const resultadoUsdt = liquido - posicao.tamanhoUsdt

  estado.capitalUsdt += liquido
  estado.posicoes = estado.posicoes.filter((p) => p !== posicao)
  estado.stopsSeguidos = motivo === 'stop' ? estado.stopsSeguidos + 1 : 0

  const operacao = {
    ...posicao,
    fechamentoEm: new Date().toISOString(),
    precoSaida,
    motivo,
    taxaSaidaUsdt: taxa,
    resultadoUsdt: Math.round(resultadoUsdt * 1e6) / 1e6,
    resultadoPct: Math.round(((precoSaida - posicao.precoEntrada) / posicao.precoEntrada) * 10000) / 100,
  }
  await gravarOperacao(operacao)
  await salvarEstadoRobo(estado)

  const marca = resultadoUsdt >= 0 ? 'GANHO' : 'PERDA'
  console.log(
    `${agora()}  FECHA  ${posicao.simbolo.padEnd(14)} ${motivo.padEnd(5)} ` +
      `${sinalDe(operacao.resultadoPct)}%  ${marca} US$ ${sinalDe(resultadoUsdt)}  ` +
      `caixa US$ ${num(estado.capitalUsdt)}`,
  )
}

async function processar(tickers) {
  const btc = tickers.find((t) => t.s === 'BTCUSDT')
  if (btc) amostrar('BTCUSDT', Number(btc.c), Number(btc.q))
  const serieBtc = historico.get('BTCUSDT')
  const janelaBtc = serieBtc ? janelaDe(serieBtc, CFG.janelaQuedaMs, CFG.toleranciaJanelaMs) : null

  const precoDe = new Map(tickers.map((t) => [t.s, Number(t.c)]))

  // 1) Posicoes abertas tem prioridade: sair certo importa mais que entrar.
  for (const posicao of [...estado.posicoes]) {
    const preco = precoDe.get(posicao.simbolo)
    if (!preco) continue
    const r = avaliarSaida({
      precoEntrada: posicao.precoEntrada,
      precoAtual: preco,
      alvoPct: CFG.alvoPct,
      stopPct: CFG.stopPct,
      abertaHaMs: Date.now() - new Date(posicao.aberturaEm).getTime(),
      tempoMaximoMs: CFG.tempoMaximoMs,
    })
    if (r.sair) await fechar(posicao, r.motivo, preco).catch((e) => console.error(`  erro ao fechar: ${e.message}`))
  }

  // 2) Novas entradas.
  for (const t of tickers) {
    if (!elegiveis.has(t.s)) continue
    const serie = amostrar(t.s, Number(t.c), Number(t.q))
    if (!serie) continue

    const j5 = janelaDe(serie, CFG.janelaEstouroMs, CFG.toleranciaJanelaMs)
    if (j5) {
      const volumeMedioJanela = Number(t.q) / 288
      if (
        detectarEstouroDeVolume(
          { volumeJanela: j5.volumeJanela, volumeMedioJanela, variacaoPct: j5.variacaoPct },
          CFG.sinal.volume,
        )
      ) {
        await abrir(t.s, 'estouro-volume', `+${num(j5.variacaoPct)}% em ${j5.duracaoSegundos}s`).catch((e) =>
          console.error(`  erro ao abrir ${t.s}: ${e.message}`),
        )
      }
    }

    const j10 = janelaDe(serie, CFG.janelaQuedaMs, CFG.toleranciaJanelaMs)
    if (j10 && janelaBtc) {
      if (
        detectarQuedaSubita({ variacaoPct: j10.variacaoPct, variacaoBtcPct: janelaBtc.variacaoPct }, CFG.sinal.queda)
      ) {
        await abrir(t.s, 'queda-subita', `${num(j10.variacaoPct)}% em ${j10.duracaoSegundos}s`).catch((e) =>
          console.error(`  erro ao abrir ${t.s}: ${e.message}`),
        )
      }
    }
  }
}

function conectar(tentativa = 0) {
  const ws = new WebSocket(STREAM)
  ws.addEventListener('open', () => console.log(`${agora()}  conectado.\n`))
  ws.addEventListener('message', (ev) => {
    mensagens++
    processar(JSON.parse(ev.data)).catch((e) => console.error(`erro: ${e.message}`))
  })
  ws.addEventListener('close', () => {
    const espera = Math.min(30_000, 2 ** tentativa * 1000)
    console.warn(`${agora()}  conexao caiu — reconectando em ${espera / 1000}s`)
    setTimeout(() => conectar(tentativa + 1), espera)
  })
  ws.addEventListener('error', () => ws.close())
}

async function imprimirResumo() {
  const operacoes = await lerOperacoes()
  const r = resumoDoDia(operacoes)
  const valorPosicoes = estado.posicoes.reduce((s, p) => s + p.tamanhoUsdt, 0)

  console.log(`\n${'='.repeat(56)}`)
  console.log(`  RESUMO — MODO SIMULADO, nenhuma ordem foi enviada`)
  console.log(`${'='.repeat(56)}`)
  console.log(`  Capital inicial      US$ ${num(CFG.capitalInicialUsdt)}`)
  console.log(`  Caixa                US$ ${num(estado.capitalUsdt)}`)
  console.log(`  Em posicao           US$ ${num(valorPosicoes)}  (${estado.posicoes.length} aberta(s))`)
  console.log(`  Total               US$ ${num(estado.capitalUsdt + valorPosicoes)}`)
  console.log(`\n  Operacoes fechadas   ${r.total}`)
  if (r.total > 0) {
    console.log(`  Vencedoras           ${r.vencedoras}  (${num(r.acertoPct, 1)}%)`)
    console.log(`  Resultado            US$ ${sinalDe(r.resultadoUsdt)}`)
    console.log(`\n  Ponto de equilibrio para alvo ${CFG.alvoPct}% / stop ${CFG.stopPct}%:`)
    const custo = CFG.taxaPorLado * 2
    const equilibrio = ((CFG.stopPct + custo) / (CFG.alvoPct + CFG.stopPct)) * 100
    console.log(`  precisa acertar ${num(equilibrio, 1)}% das vezes.`)
    if (r.total < 30) console.log(`  ATENCAO: ${r.total} operacoes e pouco para concluir qualquer coisa.`)
  }
  console.log()
}

process.on('SIGINT', async () => {
  await imprimirResumo()
  process.exit(0)
})

estado = await lerEstadoRobo(CFG.capitalInicialUsdt)
console.log(`\nROBO — MODO SIMULADO (nenhuma ordem sera enviada)`)
console.log(`Capital: US$ ${num(estado.capitalUsdt)}  |  alvo +${CFG.alvoPct}%  stop -${CFG.stopPct}%  tempo max ${CFG.tempoMaximoMs / 3_600_000}h\n`)
await montarElegiveis()
conectar()
setInterval(() => {
  console.log(
    `${agora()}  ${elegiveis.size} pares | ${estado.posicoes.length} aberta(s) | ` +
      `caixa US$ ${num(estado.capitalUsdt)} | ${mensagens} msg`,
  )
}, 60_000).unref()
