import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  custoIdaVolta,
  slippageDeCompra,
  posicaoNaFaixa,
  mediaSimples,
  rsi,
  percentualDeDiasVolateis,
} from '../src/analise.mjs'

// --- custo de ida e volta -----------------------------------------------

test('custo de ida e volta soma o spread com a taxa dos dois lados', () => {
  const r = custoIdaVolta({ bid: 99, ask: 101, taxaPorLado: 0.1 })
  assert.equal(r.spreadPct, 2)
  assert.equal(r.custoTotalPct, 2.2)
})

test('par sem spread custa apenas as duas taxas', () => {
  const r = custoIdaVolta({ bid: 100, ask: 100, taxaPorLado: 0.1 })
  assert.equal(r.spreadPct, 0)
  assert.equal(r.custoTotalPct, 0.2)
})

// --- slippage percorrendo o livro ---------------------------------------

test('slippage percorre os niveis do livro ate gastar o valor pedido', () => {
  // 5 USDT esgotam o primeiro nivel (0,5 un a 10); o resto vai a 11.
  const asks = [
    ['10', '0.5'],
    ['11', '1'],
  ]
  const r = slippageDeCompra(asks, 10)

  assert.equal(r.insuficiente, false)
  assert.ok(Math.abs(r.precoMedio - 10.476190476) < 1e-6, `precoMedio=${r.precoMedio}`)
  assert.ok(Math.abs(r.slippagePct - 4.76190476) < 1e-6, `slippagePct=${r.slippagePct}`)
})

test('compra que cabe no primeiro nivel nao tem slippage', () => {
  const r = slippageDeCompra([['10', '100']], 50)
  assert.equal(r.slippagePct, 0)
})

test('livro raso e sinalizado como insuficiente', () => {
  const r = slippageDeCompra([['10', '0.1']], 50)
  assert.equal(r.insuficiente, true)
})

// --- posicao do preco na faixa ------------------------------------------

test('posicao na faixa mostra o quao perto do topo o preco esta', () => {
  assert.equal(posicaoNaFaixa(0.013255, 0.0113, 0.01343), 91.78)
})

test('preco na minima fica em zero por cento da faixa', () => {
  assert.equal(posicaoNaFaixa(10, 10, 20), 0)
})

test('faixa sem amplitude nao tem posicao definida', () => {
  assert.equal(posicaoNaFaixa(10, 10, 10), null)
})

// --- medias -------------------------------------------------------------

test('media simples usa apenas os ultimos valores do periodo', () => {
  assert.equal(mediaSimples([1, 2, 3, 4, 5], 3), 4)
})

test('media exige valores suficientes para o periodo', () => {
  assert.equal(mediaSimples([1, 2], 3), null)
})

// --- RSI ----------------------------------------------------------------

test('RSI calcula a forca relativa entre ganhos e perdas', () => {
  // periodo 2: variacoes +1 e -0,5 → ganho medio 0,5, perda media 0,25, RS = 2
  assert.equal(rsi([10, 11, 10.5], 2), 66.67)
})

test('serie so de alta leva o RSI ao maximo', () => {
  assert.equal(rsi([1, 2, 3, 4, 5], 2), 100)
})

test('serie so de queda leva o RSI ao minimo', () => {
  assert.equal(rsi([5, 4, 3, 2, 1], 2), 0)
})

test('RSI exige mais fechamentos que o periodo', () => {
  assert.equal(rsi([10, 11], 14), null)
})

// --- volatilidade -------------------------------------------------------

test('conta a proporcao de dias que se moveram acima do limiar', () => {
  // variacoes: +10%, -4,55%, 0% → apenas a primeira passa de 5%
  assert.equal(percentualDeDiasVolateis([100, 110, 105, 105], 5), 33.33)
})
