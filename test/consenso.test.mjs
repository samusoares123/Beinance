import { test } from 'node:test'
import assert from 'node:assert/strict'

import { consensoDeFontes } from '../src/fontes.mjs'

// Capitalizacao da FF medida em 03/08/2026 pelas tres fontes.
const FF = [
  { fonte: 'CoinMarketCap', valor: 191_360_264 },
  { fonte: 'CoinGecko', valor: 193_600_000 },
  { fonte: 'CoinPaprika', valor: 151_941_354 },
]

test('mediana ignora o valor extremo em vez de deixar ele puxar a media', () => {
  // Media seria 178,9 mi, arrastada pelo Paprika. Mediana fica em 191,4 mi.
  assert.equal(consensoDeFontes(FF).mediana, 191_360_264)
})

test('aponta qual fonte esta fora da curva, nao apenas que ha divergencia', () => {
  const c = consensoDeFontes(FF)
  assert.equal(c.discordante.fonte, 'CoinPaprika')
  assert.equal(c.alerta, true)
})

test('fontes proximas nao apontam discordante', () => {
  const c = consensoDeFontes([
    { fonte: 'A', valor: 100 },
    { fonte: 'B', valor: 102 },
    { fonte: 'C', valor: 101 },
  ])
  assert.equal(c.alerta, false)
  assert.equal(c.discordante, null)
})

test('com duas fontes a mediana e a media delas', () => {
  const c = consensoDeFontes([
    { fonte: 'A', valor: 100 },
    { fonte: 'B', valor: 200 },
  ])
  assert.equal(c.mediana, 150)
})

test('uma fonte so nao tem do que divergir', () => {
  const c = consensoDeFontes([{ fonte: 'A', valor: 100 }])
  assert.equal(c.mediana, 100)
  assert.equal(c.alerta, false)
})

test('valores ausentes sao descartados antes do calculo', () => {
  const c = consensoDeFontes([
    { fonte: 'A', valor: 100 },
    { fonte: 'B', valor: null },
    { fonte: 'C', valor: 102 },
  ])
  assert.equal(c.fontesUsadas, 2)
})

test('sem nenhum valor devolve null', () => {
  assert.equal(consensoDeFontes([{ fonte: 'A', valor: null }]), null)
})
