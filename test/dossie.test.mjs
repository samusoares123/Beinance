import { test } from 'node:test'
import assert from 'node:assert/strict'

import { desfechosDe, taxaDeAcionamento, percentil } from '../src/dossie.mjs'

const vela = (abertura, maxima, minima, fechamento) => ({ abertura, maxima, minima, fechamento })

// Serie desenhada para separar fechamento de minima: a vela 1 fecha em 102 mas
// visitou 94 no caminho. Um stop teria sido acionado; o fechamento nao conta isso.
const SERIE = [
  vela(100, 101, 99, 100), // 0 — entrada
  vela(100, 103, 94, 102), // 1 — subiu, mas mergulhou ate 94
  vela(102, 106, 101, 105), // 2
]

// --- desfechosDe ---------------------------------------------------------

test('desfecho mede o retorno do fechamento de entrada ate o fechamento do horizonte', () => {
  const [d] = desfechosDe({ velas: SERIE, indices: [0], horizonte: 1, custoPct: 0 })
  assert.equal(d.retornoLiquidoPct, 2) // 100 → 102
})

test('o custo e descontado do retorno', () => {
  const [d] = desfechosDe({ velas: SERIE, indices: [0], horizonte: 1, custoPct: 0.25 })
  assert.equal(d.retornoLiquidoPct, 1.75)
})

test('a pior queda no caminho usa a MINIMA das velas, nao o fechamento', () => {
  // Esta e a razao de a funcao existir: o fechamento em 102 esconde que a
  // posicao esteve -6% no meio do caminho. E o -6% que aciona um stop.
  const [d] = desfechosDe({ velas: SERIE, indices: [0], horizonte: 1, custoPct: 0 })
  assert.equal(d.piorQuedaPct, -6) // 100 → 94
})

test('a pior queda olha todas as velas do horizonte, nao so a ultima', () => {
  const [d] = desfechosDe({ velas: SERIE, indices: [0], horizonte: 2, custoPct: 0 })
  assert.equal(d.piorQuedaPct, -6) // mergulho da vela 1 continua valendo
  assert.equal(d.retornoLiquidoPct, 5) // 100 → 105
})

test('a vela de entrada nao entra na conta da pior queda', () => {
  // A minima 99 da vela 0 acontece ANTES da compra fechar. Contar seria inventar
  // um prejuizo que o comprador nunca viu.
  const [d] = desfechosDe({ velas: SERIE, indices: [0], horizonte: 1, custoPct: 0 })
  assert.notEqual(d.piorQuedaPct, -1)
})

test('ocorrencia sem historico futuro suficiente e descartada, nao estimada', () => {
  const d = desfechosDe({ velas: SERIE, indices: [2], horizonte: 1, custoPct: 0 })
  assert.deepEqual(d, [])
})

test('varias ocorrencias devolvem varios desfechos', () => {
  const d = desfechosDe({ velas: SERIE, indices: [0, 1], horizonte: 1, custoPct: 0 })
  assert.equal(d.length, 2)
})

// --- taxaDeAcionamento ---------------------------------------------------

test('taxa de acionamento conta quantas quedas atingiram o stop', () => {
  assert.equal(taxaDeAcionamento([-2, -6, -11, 0], 5), 50)
})

test('queda exatamente igual ao stop conta como acionada', () => {
  assert.equal(taxaDeAcionamento([-5], 5), 100)
})

test('lista vazia devolve null em vez de dividir por zero', () => {
  assert.equal(taxaDeAcionamento([], 5), null)
})

// --- percentil -----------------------------------------------------------

test('percentil 0 e o menor valor e 100 o maior', () => {
  assert.equal(percentil([3, 1, 2], 0), 1)
  assert.equal(percentil([3, 1, 2], 100), 3)
})

test('percentil 50 de conjunto impar e o valor central', () => {
  assert.equal(percentil([10, 1, 5], 50), 5)
})

test('percentil interpola entre os dois vizinhos', () => {
  assert.equal(percentil([0, 10], 50), 5)
})

test('percentil de lista vazia e null', () => {
  assert.equal(percentil([], 50), null)
})
