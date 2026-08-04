import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectarEstouroDeVolume, detectarQuedaSubita, calcularDesfecho } from '../src/sinais.mjs'

const CFG_VOLUME = { multiplicador: 5, variacaoMinima: 2 }

test('volume muito acima da media com preco subindo e um estouro', () => {
  const r = detectarEstouroDeVolume({ volumeJanela: 500, volumeMedioJanela: 50, variacaoPct: 3 }, CFG_VOLUME)
  assert.equal(r, true)
})

test('volume alto sem o preco subir nao e estouro', () => {
  const r = detectarEstouroDeVolume({ volumeJanela: 500, volumeMedioJanela: 50, variacaoPct: 1 }, CFG_VOLUME)
  assert.equal(r, false)
})

test('preco subindo com volume normal nao e estouro', () => {
  const r = detectarEstouroDeVolume({ volumeJanela: 100, volumeMedioJanela: 50, variacaoPct: 5 }, CFG_VOLUME)
  assert.equal(r, false)
})

test('media de volume zerada nao gera sinal por divisao vazia', () => {
  const r = detectarEstouroDeVolume({ volumeJanela: 500, volumeMedioJanela: 0, variacaoPct: 5 }, CFG_VOLUME)
  assert.equal(r, false)
})

const CFG_QUEDA = { quedaMinima: 5, tetoQuedaBtc: 1 }

test('queda forte enquanto o BTC esta parado e uma queda subita', () => {
  const r = detectarQuedaSubita({ variacaoPct: -6, variacaoBtcPct: -0.5 }, CFG_QUEDA)
  assert.equal(r, true)
})

test('queda acompanhando o mercado inteiro nao conta', () => {
  const r = detectarQuedaSubita({ variacaoPct: -6, variacaoBtcPct: -3 }, CFG_QUEDA)
  assert.equal(r, false)
})

test('queda pequena nao atinge o limiar', () => {
  const r = detectarQuedaSubita({ variacaoPct: -2, variacaoBtcPct: 0 }, CFG_QUEDA)
  assert.equal(r, false)
})

test('desfecho desconta o custo de entrar e sair do retorno bruto', () => {
  const r = calcularDesfecho({ precoEntrada: 100, precoSaida: 110, custoTotalPct: 0.5 })
  assert.equal(r.retornoBrutoPct, 10)
  assert.equal(r.retornoLiquidoPct, 9.5)
})

test('prejuizo fica maior depois do custo, nao menor', () => {
  const r = calcularDesfecho({ precoEntrada: 100, precoSaida: 95, custoTotalPct: 0.5 })
  assert.equal(r.retornoBrutoPct, -5)
  assert.equal(r.retornoLiquidoPct, -5.5)
})

test('movimento menor que o custo vira prejuizo', () => {
  const r = calcularDesfecho({ precoEntrada: 100, precoSaida: 100.3, custoTotalPct: 0.5 })
  assert.equal(r.retornoLiquidoPct, -0.2)
})
