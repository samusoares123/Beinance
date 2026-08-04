/**
 * Fundamentos da moeda, via CoinGecko.
 *
 * A Binance responde QUANTO a moeda custa. Ela nao responde O QUE a moeda e:
 * capitalizacao, quanto do supply ja circula, quanto falta desbloquear, ha
 * quanto tempo existe. E esse segundo grupo que explica por que uma moeda sobe
 * 14% num dia — e por que ela pode devolver tudo no dia seguinte.
 *
 * API publica, sem chave, com limite de requisicao — por isso o cache em disco.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const BASE = 'https://api.coingecko.com/api/v3'
const CACHE = 'data/coingecko-cache.json'
const VALIDADE_CACHE = 12 * 60 * 60 * 1000 // 12h: fundamento nao muda de minuto a minuto

/**
 * A busca do CoinGecko e difusa e ordena por relevancia: procurar "FF" devolve
 * "official-trump" em primeiro. Casar por simbolo exato nao e refinamento, e
 * requisito — sem isso o sistema atribui os dados de uma moeda a outra.
 */
export function escolherMoeda(resultados, simbolo) {
  const alvo = simbolo.toUpperCase()
  const exatos = resultados.filter((r) => r.symbol?.toUpperCase() === alvo)
  if (exatos.length === 0) return null

  // Menor rank = maior capitalizacao. Sem rank vai para o fim da fila.
  return exatos.sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))[0]
}

/** Quanto do supply maximo ja esta em circulacao, em %. */
export function percentualCirculante(circulante, maximo) {
  if (!maximo || maximo <= 0) return null
  return Math.round((circulante / maximo) * 1000) / 10
}

// --- acesso a rede -------------------------------------------------------

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
  await writeFile(CACHE, JSON.stringify(cache, null, 2), 'utf8')
}

async function buscarJson(caminho) {
  const r = await fetch(`${BASE}${caminho}`)
  if (r.status === 429) throw new Error('CoinGecko: limite de requisicoes atingido. Tente em 1 minuto.')
  if (!r.ok) throw new Error(`CoinGecko ${r.status} em ${caminho}`)
  return r.json()
}

/**
 * Devolve os fundamentos do ativo, ou { encontrado: false } quando o CoinGecko
 * nao tem essa moeda — o que e informacao, nao erro: moeda sem cobertura
 * costuma ser recem-listada ou obscura demais.
 */
export async function buscarFundamentos(base) {
  const cache = await lerCache()
  const guardado = cache[base.toUpperCase()]
  if (guardado && Date.now() - guardado.em < VALIDADE_CACHE) return guardado.dados

  const busca = await buscarJson(`/search?query=${encodeURIComponent(base)}`)
  const escolhida = escolherMoeda(busca.coins ?? [], base)
  if (!escolhida) {
    const dados = { encontrado: false }
    cache[base.toUpperCase()] = { em: Date.now(), dados }
    await gravarCache(cache)
    return dados
  }

  const c = await buscarJson(
    `/coins/${escolhida.id}?localization=false&tickers=false&community_data=false&developer_data=false`,
  )
  const m = c.market_data ?? {}

  const dados = {
    encontrado: true,
    id: c.id,
    nome: c.name,
    rank: c.market_cap_rank ?? null,
    marketCapUsd: m.market_cap?.usd ?? null,
    volume24hUsd: m.total_volume?.usd ?? null,
    circulante: m.circulating_supply ?? null,
    total: m.total_supply ?? null,
    maximo: m.max_supply ?? null,
    percentualCirculante: percentualCirculante(m.circulating_supply, m.max_supply),
    ath: m.ath?.usd ?? null,
    athData: m.ath_date?.usd ?? null,
    athVariacaoPct: m.ath_change_percentage?.usd ?? null,
    atl: m.atl?.usd ?? null,
    atlVariacaoPct: m.atl_change_percentage?.usd ?? null,
    genesis: c.genesis_date ?? null,
    categorias: (c.categories ?? []).filter(Boolean).slice(0, 5),
  }

  cache[base.toUpperCase()] = { em: Date.now(), dados }
  await gravarCache(cache)
  return dados
}
