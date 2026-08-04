import { test } from 'node:test'
import assert from 'node:assert/strict'

import { escolherProtocolo, divergenciaEntreFontes } from '../src/fontes.mjs'

test('entre protocolos de mesmo simbolo fica o de maior TVL', () => {
  const protocolos = [
    { name: 'FF Fork Abandonado', symbol: 'FF', slug: 'ff-fork', tvl: 1200 },
    { name: 'Falcon Finance', symbol: 'FF', slug: 'falcon-finance', tvl: 1_256_479_275 },
  ]
  assert.equal(escolherProtocolo(protocolos, 'FF').slug, 'falcon-finance')
})

test('protocolo de outro simbolo nunca e escolhido', () => {
  const protocolos = [{ name: 'Outra Coisa', symbol: 'XYZ', slug: 'outra', tvl: 9e9 }]
  assert.equal(escolherProtocolo(protocolos, 'FF'), null)
})

test('protocolo sem TVL perde para protocolo com TVL', () => {
  const protocolos = [
    { name: 'Sem TVL', symbol: 'FF', slug: 'sem-tvl', tvl: null },
    { name: 'Falcon Finance', symbol: 'FF', slug: 'falcon-finance', tvl: 100 },
  ]
  assert.equal(escolherProtocolo(protocolos, 'FF').slug, 'falcon-finance')
})

test('lista vazia devolve null', () => {
  assert.equal(escolherProtocolo([], 'FF'), null)
})

test('divergencia entre fontes e medida sobre o maior valor', () => {
  // 200 contra 150: diferenca de 50 sobre 200 = 25%.
  const d = divergenciaEntreFontes(200, 150)
  assert.equal(d.divergenciaPct, 25)
  assert.equal(d.alerta, true)
})

test('fontes proximas nao levantam alerta', () => {
  const d = divergenciaEntreFontes(100, 95)
  assert.equal(d.divergenciaPct, 5)
  assert.equal(d.alerta, false)
})

test('ordem dos argumentos nao muda a divergencia', () => {
  assert.equal(divergenciaEntreFontes(150, 200).divergenciaPct, 25)
})

test('sem valor em uma das fontes nao ha comparacao', () => {
  assert.equal(divergenciaEntreFontes(200, null), null)
})
