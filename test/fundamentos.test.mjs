import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escolherMoeda, percentualCirculante } from '../src/fundamentos.mjs'

// Resposta real da busca por "FF" no CoinGecko, em 03/08/2026.
const BUSCA_FF = [
  { id: 'official-trump', symbol: 'TRUMP', name: 'Official Trump', market_cap_rank: 114 },
  { id: 'falcon-finance-ff', symbol: 'FF', name: 'Falcon Finance', market_cap_rank: 172 },
  { id: 'shuffle-2', symbol: 'SHFL', name: 'Shuffle', market_cap_rank: 238 },
]

test('ignora o primeiro resultado quando o simbolo nao bate', () => {
  // A busca difusa poe TRUMP na frente; atribuir os dados dele a FF seria desastre.
  assert.equal(escolherMoeda(BUSCA_FF, 'FF').id, 'falcon-finance-ff')
})

test('compara simbolo sem diferenciar maiuscula', () => {
  assert.equal(escolherMoeda(BUSCA_FF, 'ff').id, 'falcon-finance-ff')
})

test('sem correspondencia exata devolve null em vez de chutar', () => {
  assert.equal(escolherMoeda(BUSCA_FF, 'XYZ'), null)
})

test('entre simbolos repetidos fica o de melhor rank', () => {
  const repetidos = [
    { id: 'copia-obscura', symbol: 'FF', name: 'FF Falsa', market_cap_rank: 4000 },
    { id: 'falcon-finance-ff', symbol: 'FF', name: 'Falcon Finance', market_cap_rank: 172 },
  ]
  assert.equal(escolherMoeda(repetidos, 'FF').id, 'falcon-finance-ff')
})

test('moeda sem rank perde para moeda com rank', () => {
  const comNulo = [
    { id: 'sem-rank', symbol: 'FF', name: 'Sem rank', market_cap_rank: null },
    { id: 'falcon-finance-ff', symbol: 'FF', name: 'Falcon Finance', market_cap_rank: 172 },
  ]
  assert.equal(escolherMoeda(comNulo, 'FF').id, 'falcon-finance-ff')
})

test('lista vazia nao quebra', () => {
  assert.equal(escolherMoeda([], 'FF'), null)
})

test('percentual circulante mostra quanto do supply ja foi liberado', () => {
  // TRUMP: 248,25M em circulacao de 1B no maximo.
  assert.equal(percentualCirculante(248_251_149, 1_000_000_000), 24.8)
})

test('sem supply maximo nao ha percentual a calcular', () => {
  assert.equal(percentualCirculante(1000, null), null)
})
