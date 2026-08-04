/**
 * Backtest de padroes de candlestick sobre historico real da Binance.
 *
 * Uso:  node backtest.mjs [intervalo] [maxPares]
 *       node backtest.mjs 1h 80
 *
 * Padrao de candle e funcao pura de OHLC: da para medir em meses de historico
 * agora, sem esperar coleta ao vivo. Cada ocorrencia e avaliada pelo que o preco
 * fez nas velas seguintes, ja descontado o custo de entrar e sair.
 *
 * LIMITACAO HONESTA: o custo aqui e uma estimativa fixa. O spread de meses atras
 * nao existe no historico de candles — so o preco existe. Em pares liquidos o
 * erro e pequeno; em pares finos, subestima o custo real.
 */

import { padroesEm } from './src/candles.mjs'
import { custoIdaVolta } from './src/analise.mjs'

const BASE = 'https://api.binance.com'
const intervalo = process.argv[2] ?? '1h'
const maxPares = Number(process.argv[3] ?? 80)

const TAXA_POR_LADO = 0.075 // % com BNB
const CUSTO_ESTIMADO_PCT = 0.25 // spread tipico + taxa dos dois lados
const HORIZONTES = [1, 3, 6, 12] // em velas
const LIMITES = { custoTotalPct: 0.5, volume24hUsdt: 1_000_000 }

const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v) => (v >= 0 ? '+' : '') + num(v)

const buscar = async (caminho) => {
  const r = await fetch(`${BASE}${caminho}`)
  if (!r.ok) throw new Error(`${caminho} → ${r.status}`)
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
    const { custoTotalPct } = custoIdaVolta({ bid, ask, taxaPorLado: TAXA_POR_LADO })
    if (custoTotalPct > LIMITES.custoTotalPct) continue
    if (Number(t.quoteVolume) < LIMITES.volume24hUsdt) continue
    aprovados.push({ simbolo: s.symbol, volume: Number(t.quoteVolume) })
  }
  return aprovados.sort((a, b) => b.volume - a.volume).slice(0, maxPares)
}

async function velasDe(simbolo) {
  const cru = await buscar(`/api/v3/klines?symbol=${simbolo}&interval=${intervalo}&limit=1000`)
  return cru.map((k) => ({
    abertura: Number(k[1]),
    maxima: Number(k[2]),
    minima: Number(k[3]),
    fechamento: Number(k[4]),
  }))
}

/** Acumulador por padrao e horizonte. */
const resultados = new Map()
const registrar = (padrao, horizonte, retornoLiquido) => {
  if (!resultados.has(padrao)) resultados.set(padrao, new Map())
  const porH = resultados.get(padrao)
  if (!porH.has(horizonte)) porH.set(horizonte, [])
  porH.get(horizonte).push(retornoLiquido)
}

/** Linha de base: o que teria acontecido comprando em QUALQUER vela. */
const base = new Map(HORIZONTES.map((h) => [h, []]))

async function main() {
  console.log(`\nBACKTEST DE PADROES — intervalo ${intervalo}, ate ${maxPares} pares`)
  const pares = await selecionarPares()
  console.log(`${pares.length} pares selecionados (mais liquidos que passam no filtro de custo).\n`)

  let velasLidas = 0
  let processados = 0

  for (const { simbolo } of pares) {
    let velas
    try {
      velas = await velasDe(simbolo)
    } catch {
      continue
    }
    velasLidas += velas.length
    processados++
    if (processados % 20 === 0) process.stdout.write(`  ${processados}/${pares.length} pares...\n`)

    const maiorHorizonte = Math.max(...HORIZONTES)
    for (let i = 2; i < velas.length - maiorHorizonte; i++) {
      const entrada = velas[i].fechamento
      if (entrada <= 0) continue

      // Linha de base: toda vela, sem filtro nenhum.
      for (const h of HORIZONTES) {
        const saida = velas[i + h].fechamento
        base.get(h).push(((saida - entrada) / entrada) * 100 - CUSTO_ESTIMADO_PCT)
      }

      const padroes = padroesEm(velas.slice(i - 2, i + 1))
      if (padroes.length === 0) continue

      for (const p of padroes) {
        for (const h of HORIZONTES) {
          const saida = velas[i + h].fechamento
          registrar(p, h, ((saida - entrada) / entrada) * 100 - CUSTO_ESTIMADO_PCT)
        }
      }
    }
  }

  console.log(`\n${num(velasLidas, 0)} velas analisadas em ${processados} pares.`)
  console.log(`Custo descontado: ${num(CUSTO_ESTIMADO_PCT, 2)}% por operacao (estimativa).\n`)

  const resumo = (valores) => {
    const media = valores.reduce((a, b) => a + b, 0) / valores.length
    const positivos = valores.filter((v) => v > 0).length
    return { media, acerto: (positivos / valores.length) * 100, n: valores.length }
  }

  console.log(`LINHA DE BASE — comprar em qualquer vela, sem padrao nenhum`)
  for (const h of HORIZONTES) {
    const r = resumo(base.get(h))
    console.log(`  +${String(h).padStart(2)} velas   media ${sinalDe(r.media).padStart(7)}%   positivos ${num(r.acerto, 1).padStart(5)}%   (${num(r.n, 0)} casos)`)
  }

  for (const [padrao, porH] of [...resultados].sort()) {
    console.log(`\n${padrao.toUpperCase()}`)
    for (const h of HORIZONTES) {
      const valores = porH.get(h) ?? []
      if (valores.length === 0) continue
      const r = resumo(valores)
      const b = resumo(base.get(h))
      const vantagem = r.media - b.media
      console.log(
        `  +${String(h).padStart(2)} velas   media ${sinalDe(r.media).padStart(7)}%   ` +
          `positivos ${num(r.acerto, 1).padStart(5)}%   (${num(r.n, 0).padStart(6)} casos)   ` +
          `vantagem sobre a base ${sinalDe(vantagem).padStart(7)} p.p.`,
      )
    }
  }

  console.log(`\nO que importa e a coluna de VANTAGEM: quanto o padrao entrega alem`)
  console.log(`de comprar sem criterio. Perto de zero significa que o padrao nao`)
  console.log(`carrega informacao — o resultado dele e o do mercado.\n`)
}

main().catch((e) => {
  console.error(`FALHOU: ${e.message}`)
  process.exit(1)
})
