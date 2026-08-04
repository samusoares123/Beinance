import { test } from 'node:test'
import assert from 'node:assert/strict'

import { maiorQueda, melhorEPiorDia } from '../src/analise.mjs'

test('maior queda mede do topo ate o fundo que veio depois dele', () => {
  // Topo 120, fundo posterior 60 → perdeu metade.
  assert.equal(maiorQueda([100, 120, 60, 80]), -50)
})

test('serie que so sobe nunca teve queda', () => {
  assert.equal(maiorQueda([100, 110, 120]), 0)
})

test('queda anterior ao topo global tambem conta', () => {
  // Quem comprou a 100 e viu chegar a 50 perdeu 50%, mesmo que a moeda tenha
  // ido a 200 depois. A medida e sempre a partir do topo corrente, nao do
  // topo global — e a maior queda aqui e -50%, nao os -25% de 200 para 150.
  assert.equal(maiorQueda([100, 50, 200, 150]), -50)
})

test('serie vazia nao quebra', () => {
  assert.equal(maiorQueda([]), 0)
})

test('identifica o melhor e o pior dia da serie', () => {
  const r = melhorEPiorDia([100, 110, 99])
  assert.equal(r.melhorPct, 10)
  assert.equal(r.piorPct, -10)
})

test('serie de um valor nao tem variacao diaria', () => {
  assert.deepEqual(melhorEPiorDia([100]), { melhorPct: null, piorPct: null })
})
