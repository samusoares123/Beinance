/**
 * O mercado tem hora e dia? Mede retorno por dia da semana e por hora do dia.
 *
 * Uso:  node sazonalidade.mjs [maxPares] [meses]
 *       node sazonalidade.mjs 40 12
 *
 * Nasceu de uma tese concreta do Samuel: "toda sexta a noite o mercado esta em
 * baixa e segunda de manha comeca a subir". Isso e testavel em anos de historico
 * agora, sem esperar coleta — e testar uma crenca que ja esta guiando dinheiro
 * real vale mais que testar uma ideia nova.
 *
 * Tudo em UTC-3. Ver src/calendario.mjs para por que o fuso e explicito.
 *
 * DUAS CONTAS DIFERENTES, DE PROPOSITO:
 *  - Os mapas de dia/hora sao BRUTOS. Sao a deriva do mercado naquele balde;
 *    voce nao paga taxa por hora que passa, entao descontar custo ali mentiria.
 *  - A operacao sexta→segunda e LIQUIDA. Ali existe uma compra e uma venda de
 *    verdade, entao o custo entra.
 */

import { momentoLocal, estatisticas, agruparPor, DIAS } from './src/calendario.mjs'
import { custoIdaVolta } from './src/analise.mjs'

import { API } from './src/api.mjs'
const BASE = API
const FUSO = -3
const maxPares = Number(process.argv[2] ?? 40)
const meses = Number(process.argv[3] ?? 12)

const TAXA_POR_LADO = 0.075
const CUSTO_ESTIMADO_PCT = 0.25
const LIMITES = { custoTotalPct: 0.5, volume24hUsdt: 1_000_000 }

/**
 * Duas janelas COMPLEMENTARES, fixadas antes de olhar o resultado.
 *
 * O Samuel levantou as duas direcoes ("cai na sexta e sobe na segunda" / "sobe
 * na sexta e cai de manha"). Testar so a que a gente espera e achar o que se foi
 * procurar. Como no spot nao da para vender o que nao se tem, a versao acionavel
 * da direcao negativa nao e apostar na queda — e NAO segurar naquele periodo.
 * Por isso as janelas sao "segurar o fim de semana" e "segurar a semana": juntas
 * cobrem a semana inteira e uma e o complemento da outra.
 */
const JANELAS = [
  { nome: 'segurar o fim de semana', entrada: { diaSemana: 5, hora: 21 }, saida: { diaSemana: 1, hora: 9 }, horas: 60 },
  { nome: 'segurar a semana', entrada: { diaSemana: 1, hora: 9 }, saida: { diaSemana: 5, hora: 21 }, horas: 108 },
]

const num = (v, c = 2) => (v === null ? '  —  ' : v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }))
const sinalDe = (v, c = 3) => (v === null ? '  —  ' : (v >= 0 ? '+' : '') + num(v, c))

const buscar = async (caminho) => {
  const r = await fetch(`${BASE}${caminho}`)
  if (!r.ok) throw new Error(`${caminho} -> ${r.status}`)
  return r.json()
}

async function selecionarPares() {
  const [info, livros, tickers] = await Promise.all([
    buscar('/api/v3/exchangeInfo'),
    buscar('/api/v3/ticker/bookTicker'),
    buscar('/api/v3/ticker/24hr'),
  ])
  const mb = new Map(livros.map((l) => [l.symbol, l]))
  const mt = new Map(tickers.map((t) => [t.symbol, t]))
  const aprovados = []

  for (const s of info.symbols) {
    if (s.quoteAsset !== 'USDT' || s.status !== 'TRADING' || !s.isSpotTradingAllowed) continue
    const b = mb.get(s.symbol)
    const t = mt.get(s.symbol)
    if (!b || !t) continue
    const bid = Number(b.bidPrice)
    const ask = Number(b.askPrice)
    if (bid <= 0 || ask <= 0) continue
    if (custoIdaVolta({ bid, ask, taxaPorLado: TAXA_POR_LADO }).custoTotalPct > LIMITES.custoTotalPct) continue
    if (Number(t.quoteVolume) < LIMITES.volume24hUsdt) continue
    aprovados.push({ simbolo: s.symbol, volume: Number(t.quoteVolume) })
  }
  return aprovados.sort((a, b) => b.volume - a.volume).slice(0, maxPares)
}

/** Historico de 1h paginado para tras. A API devolve no maximo 1000 por chamada. */
async function historico(simbolo, horasDesejadas) {
  const velas = []
  let fim = Date.now()
  while (velas.length < horasDesejadas) {
    const lote = await buscar(`/api/v3/klines?symbol=${simbolo}&interval=1h&endTime=${fim}&limit=1000`)
    if (!Array.isArray(lote) || lote.length === 0) break
    velas.unshift(...lote.map((k) => ({ t: k[0], abertura: Number(k[1]), fechamento: Number(k[4]) })))
    fim = lote[0][0] - 1
    if (lote.length < 1000) break
  }
  return velas.slice(-horasDesejadas)
}

async function main() {
  const horasDesejadas = Math.round(meses * 30 * 24)
  console.log(`\nSAZONALIDADE — ate ${maxPares} pares, ~${meses} meses de velas de 1h, fuso UTC${FUSO}`)
  const pares = await selecionarPares()
  console.log(`${pares.length} pares selecionados.\n`)

  const amostras = [] // { diaSemana, hora, retornoPct }
  const operacoes = new Map(JANELAS.map((j) => [j.nome, []]))
  let velasLidas = 0
  let processados = 0

  for (const { simbolo } of pares) {
    let velas
    try {
      velas = await historico(simbolo, horasDesejadas)
    } catch {
      continue
    }
    if (velas.length < 200) continue
    velasLidas += velas.length
    processados++
    if (processados % 10 === 0) process.stdout.write(`  ${processados}/${pares.length} pares...\n`)

    for (let i = 0; i < velas.length; i++) {
      const v = velas[i]
      if (!(v.abertura > 0)) continue
      const { diaSemana, hora } = momentoLocal(v.t, FUSO)
      amostras.push({ diaSemana, hora, retornoPct: ((v.fechamento - v.abertura) / v.abertura) * 100 })

      for (const j of JANELAS) {
        if (diaSemana !== j.entrada.diaSemana || hora !== j.entrada.hora) continue
        const saida = velas[i + j.horas]
        if (!saida) continue
        const m = momentoLocal(saida.t, FUSO)
        // Buraco no historico desalinha a contagem — descarta em vez de mentir.
        if (m.diaSemana !== j.saida.diaSemana || m.hora !== j.saida.hora) continue
        operacoes.get(j.nome).push({
          simbolo,
          brutoPct: ((saida.fechamento - v.fechamento) / v.fechamento) * 100,
          liquidoPct: ((saida.fechamento - v.fechamento) / v.fechamento) * 100 - CUSTO_ESTIMADO_PCT,
        })
      }
    }
  }

  console.log(`\n${num(velasLidas, 0)} velas de 1h em ${processados} pares.\n`)

  // --- 1. dia da semana (bruto) -------------------------------------------
  console.log('RETORNO MEDIO POR HORA, AGRUPADO POR DIA DA SEMANA  (bruto, sem custo)\n')
  const porDia = agruparPor(amostras, (a) => a.diaSemana, (a) => a.retornoPct)
  for (let d = 0; d < 7; d++) {
    const r = estatisticas(porDia.get(d) ?? [])
    console.log(
      `  ${DIAS[d].padEnd(8)} media ${sinalDe(r.media).padStart(8)}%   ` +
        `mediana ${sinalDe(r.mediana).padStart(8)}%   positivos ${num(r.positivos, 1).padStart(5)}%   (${num(r.n, 0)})`,
    )
  }

  // --- 2. hora do dia (bruto) ---------------------------------------------
  console.log('\nRETORNO MEDIO POR HORA DO DIA  (bruto, sem custo)\n')
  const porHora = agruparPor(amostras, (a) => a.hora, (a) => a.retornoPct)
  for (let h = 0; h < 24; h++) {
    const r = estatisticas(porHora.get(h) ?? [])
    const barra = r.media === null ? '' : (r.media >= 0 ? '+'.repeat(Math.min(30, Math.round(r.media * 300))) : '-'.repeat(Math.min(30, Math.round(-r.media * 300))))
    console.log(`  ${String(h).padStart(2)}h  ${sinalDe(r.media).padStart(8)}%  ${barra}`)
  }

  // --- 3. as duas janelas, medidas ----------------------------------------
  console.log(`\n\nAS DUAS JANELAS  (custo estimado de ${num(CUSTO_ESTIMADO_PCT)}% ja descontado no liquido)\n`)
  for (const j of JANELAS) {
    const lista = operacoes.get(j.nome)
    console.log(
      `${j.nome.toUpperCase()} — compra ${DIAS[j.entrada.diaSemana]} ${j.entrada.hora}h, ` +
        `venda ${DIAS[j.saida.diaSemana]} ${j.saida.hora}h (${j.horas}h)`,
    )
    const r = estatisticas(lista.map((o) => o.liquidoPct))
    if (r.n === 0) {
      console.log('  Sem operacoes suficientes no historico.\n')
      continue
    }
    const bruto = estatisticas(lista.map((o) => o.brutoPct))
    console.log(`  operacoes simuladas   ${num(r.n, 0)}`)
    console.log(`  movimento bruto       ${sinalDe(bruto.media, 3)}%   (mediana ${sinalDe(bruto.mediana, 3)}%)`)
    console.log(`  retorno liquido       ${sinalDe(r.media, 3)}%   (mediana ${sinalDe(r.mediana, 3)}%)`)
    console.log(`  deu lucro em          ${num(r.positivos, 1)}% das vezes`)
    const ordenado = [...lista].sort((a, b) => a.liquidoPct - b.liquidoPct)
    console.log(`  pior / melhor caso    ${sinalDe(ordenado[0].liquidoPct, 2)}% (${ordenado[0].simbolo})  /  ${sinalDe(ordenado.at(-1).liquidoPct, 2)}% (${ordenado.at(-1).simbolo})\n`)
  }

  console.log(`\nCUIDADO ESTATISTICO: 7 dias + 24 horas = 31 baldes testados de uma vez.`)
  console.log(`Sempre existe um balde que parece bom por sorte. So conta se sobreviver`)
  console.log(`em outro periodo e tiver tamanho que pague o custo de operar.\n`)
}

main().catch((e) => {
  console.error(`FALHOU: ${e.message}`)
  process.exit(1)
})
