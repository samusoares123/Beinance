import { test } from 'node:test'
import assert from 'node:assert/strict'

import { baseDaApi, baseDoStream, OFICIAL, ESPELHO_PUBLICO } from '../src/api.mjs'

test('sem configuracao aponta para a api oficial', () => {
  assert.equal(baseDaApi({}), OFICIAL)
})

test('a variavel de ambiente redireciona para o espelho publico', () => {
  // E assim que o GitHub Actions escapa do 451: runner americano nao consegue
  // falar com api.binance.com, mas fala com o espelho de market data.
  assert.equal(baseDaApi({ BEINANCE_API: ESPELHO_PUBLICO }), ESPELHO_PUBLICO)
})

test('valor vazio nao vira URL vazia', () => {
  // `env.X || padrao` em vez de `env.X ?? padrao`: string vazia e um erro de
  // configuracao, e cair na oficial e melhor que montar `undefined/api/v3/...`.
  assert.equal(baseDaApi({ BEINANCE_API: '' }), OFICIAL)
})

test('o stream tem a propria configuracao', () => {
  assert.equal(baseDoStream({}), 'wss://stream.binance.com:9443')
  assert.equal(baseDoStream({ BEINANCE_STREAM: 'wss://x' }), 'wss://x')
})
