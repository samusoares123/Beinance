/**
 * Fontes de dados alem da Binance e do CoinGecko.
 *
 * Verificado em 03/08/2026, a partir deste ambiente:
 *   CoinPaprika    aberta, sem chave
 *   DefiLlama      aberta, sem chave (protocolos/TVL)
 *   Alternative.me aberta, sem chave (indice Medo/Ganancia)
 *   CoinMarketCap  401 — exige chave
 *   CryptoCompare  401 — exige chave
 *   DefiLlama /emissions (calendario de desbloqueio)  402 — plano pago
 *
 * Ter duas fontes independentes de capitalizacao nao e redundancia: elas
 * discordam. Para a FF, CoinGecko dizia 193,6 mi e CoinPaprika 151,9 mi — 22%
 * de diferenca vinda de estimativas distintas de supply circulante. Decidir com
 * uma fonte so e decidir com falsa precisao.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const CACHE = 'data/fontes-cache.json'
const VALIDADE = 12 * 60 * 60 * 1000
const LIMITE_DIVERGENCIA = 15 // % acima do qual as fontes merecem desconfianca

/** Entre protocolos de mesmo simbolo, o de maior TVL e o real; os outros sao forks. */
export function escolherProtocolo(protocolos, simbolo) {
  const alvo = simbolo.toUpperCase()
  const exatos = protocolos.filter((p) => p.symbol?.toUpperCase() === alvo)
  if (exatos.length === 0) return null
  return exatos.sort((a, b) => (b.tvl ?? -1) - (a.tvl ?? -1))[0]
}

/**
 * Consenso entre varias fontes que medem a mesma coisa.
 *
 * Capitalizacao e estimativa: cada fonte calcula supply circulante do seu jeito.
 * Com duas fontes voce so descobre que discordam; com tres da para saber QUAL
 * esta fora da curva. A mediana e usada de proposito — a media seria arrastada
 * pelo valor extremo, que e justamente o suspeito.
 */
export function consensoDeFontes(medidas) {
  const validas = medidas.filter((m) => Number.isFinite(m.valor) && m.valor > 0)
  if (validas.length === 0) return null

  const ordenados = validas.map((m) => m.valor).sort((a, b) => a - b)
  const meio = Math.floor(ordenados.length / 2)
  const mediana =
    ordenados.length % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio]

  let discordante = null
  let maiorDesvio = 0
  for (const m of validas) {
    const desvio = (Math.abs(m.valor - mediana) / mediana) * 100
    if (desvio > maiorDesvio) {
      maiorDesvio = desvio
      discordante = m
    }
  }

  const alerta = maiorDesvio > LIMITE_DIVERGENCIA
  return {
    mediana,
    fontesUsadas: validas.length,
    desvioMaximoPct: Math.round(maiorDesvio * 10) / 10,
    discordante: alerta ? discordante : null,
    alerta,
  }
}

/** Diferenca relativa entre duas medidas da mesma coisa, sobre o maior valor. */
export function divergenciaEntreFontes(a, b) {
  if (!a || !b) return null
  const maior = Math.max(a, b)
  const divergenciaPct = Math.round((Math.abs(a - b) / maior) * 1000) / 10
  return { divergenciaPct, alerta: divergenciaPct > LIMITE_DIVERGENCIA }
}

// --- rede, com cache em disco -------------------------------------------

async function lerCache() {
  if (!existsSync(CACHE)) return {}
  try {
    return JSON.parse((await readFile(CACHE, 'utf8')).replace(/^﻿/, ''))
  } catch {
    return {}
  }
}

async function gravarCache(cache) {
  if (!existsSync('data')) await mkdir('data', { recursive: true })
  await writeFile(CACHE, JSON.stringify(cache), 'utf8')
}

async function comCache(chave, produzir, validade = VALIDADE) {
  const cache = await lerCache()
  const guardado = cache[chave]
  if (guardado && Date.now() - guardado.em < validade) return guardado.dados

  const dados = await produzir()
  cache[chave] = { em: Date.now(), dados }
  await gravarCache(cache)
  return dados
}

const buscarJson = async (url) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`${new URL(url).hostname} respondeu ${r.status}`)
  return r.json()
}

/** Segunda opiniao sobre capitalizacao e supply. */
export async function buscarPaprika(base) {
  return comCache(`paprika:${base.toUpperCase()}`, async () => {
    const busca = await buscarJson(
      `https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(base)}&c=currencies&limit=10`,
    )
    // Mesma armadilha do CoinGecko: a busca e difusa. Casar por simbolo exato.
    const alvo = base.toUpperCase()
    const exatos = (busca.currencies ?? []).filter((c) => c.symbol?.toUpperCase() === alvo)
    if (exatos.length === 0) return { encontrado: false }

    const escolhida = exatos.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity))[0]
    const t = await buscarJson(`https://api.coinpaprika.com/v1/tickers/${escolhida.id}`)
    return {
      encontrado: true,
      id: t.id,
      nome: t.name,
      rank: t.rank || null,
      marketCapUsd: t.quotes?.USD?.market_cap ?? null,
      maximo: t.max_supply || null,
      total: t.total_supply || null,
      ath: t.quotes?.USD?.ath_price ?? null,
      athVariacaoPct: t.quotes?.USD?.percent_from_price_ath ?? null,
    }
  })
}

/**
 * TVL do protocolo: dinheiro efetivamente depositado.
 * A lista completa tem ~8 MB, entao so o mapa reduzido vai para o cache.
 */
export async function buscarTvl(base) {
  const mapa = await comCache('defillama:mapa', async () => {
    const protocolos = await buscarJson('https://api.llama.fi/protocols')
    const reduzido = {}
    for (const p of protocolos) {
      if (!p.symbol || p.symbol === '-') continue
      const simbolo = p.symbol.toUpperCase()
      const atual = reduzido[simbolo]
      if (!atual || (p.tvl ?? -1) > (atual.tvl ?? -1)) {
        reduzido[simbolo] = { name: p.name, symbol: p.symbol, slug: p.slug, tvl: p.tvl, mcap: p.mcap, category: p.category }
      }
    }
    return reduzido
  })
  return mapa[base.toUpperCase()] ?? null
}

/**
 * CoinMarketCap — terceira fonte de capitalizacao, e a unica que entrega o
 * valor totalmente diluido (FDV) pronto.
 *
 * Plano gratuito: ~10 mil creditos/mes. Cache de 24h por moeda para nao queimar
 * a cota — fundamento nao muda de hora em hora. O endpoint de historico e 403
 * no plano gratuito, mas os candles vem da Binance de graca.
 */
export async function buscarCmc(base, chave) {
  if (!chave) return { encontrado: false, motivo: 'sem COIN_MARKET_API_KEY' }

  return comCache(`cmc:${base.toUpperCase()}`, async () => {
    const r = await fetch(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(base)}`,
      { headers: { 'X-CMC_PRO_API_KEY': chave, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) },
    )
    const j = await r.json()
    if (!r.ok) {
      if (r.status === 429) throw new Error('CoinMarketCap: cota mensal ou limite por minuto atingido.')
      throw new Error(`CoinMarketCap ${r.status}: ${j.status?.error_message ?? ''}`)
    }

    const bruto = j.data?.[base.toUpperCase()]
    const d = Array.isArray(bruto) ? bruto[0] : bruto
    if (!d) return { encontrado: false }

    return {
      encontrado: true,
      nome: d.name,
      rank: d.cmc_rank ?? null,
      circulante: d.circulating_supply ?? null,
      maximo: d.max_supply ?? null,
      marketCapUsd: d.quote?.USD?.market_cap ?? null,
      marketCapDiluidoUsd: d.quote?.USD?.fully_diluted_market_cap ?? null,
      variacao30dPct: d.quote?.USD?.percent_change_30d ?? null,
    }
  }, 24 * 60 * 60 * 1000)
}

/** Termometro do mercado inteiro: 0 = pânico, 100 = euforia. */
export async function buscarMedoGanancia() {
  return comCache('medo-ganancia', async () => {
    const r = await buscarJson('https://api.alternative.me/fng/?limit=1')
    const d = r.data?.[0]
    return d ? { valor: Number(d.value), classificacao: d.value_classification } : null
  })
}
