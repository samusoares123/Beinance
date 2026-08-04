import { test } from 'node:test'
import assert from 'node:assert/strict'

import { anatomia, martelo, engolfoDeAlta, estrelaDaManha, tresSoldadosBrancos, padroesEm } from '../src/candles.mjs'

const vela = (abertura, maxima, minima, fechamento) => ({ abertura, maxima, minima, fechamento })

// --- anatomia ------------------------------------------------------------

test('anatomia separa corpo, sombras e amplitude', () => {
  const a = anatomia(vela(100, 105, 98, 103))
  assert.equal(a.corpo, 3)
  assert.equal(a.sombraSuperior, 2)
  assert.equal(a.sombraInferior, 2)
  assert.equal(a.amplitude, 7)
  assert.equal(a.alta, true)
})

test('vela de baixa e identificada como tal', () => {
  assert.equal(anatomia(vela(103, 105, 98, 100)).alta, false)
})

test('vela sem amplitude nao quebra a divisao', () => {
  const a = anatomia(vela(100, 100, 100, 100))
  assert.equal(a.amplitude, 0)
  assert.equal(a.corpo, 0)
})

// --- martelo -------------------------------------------------------------

test('martelo tem sombra inferior longa e corpo pequeno no topo', () => {
  // corpo 1, sombra inferior 4 (4x o corpo), sombra superior 0,2
  assert.equal(martelo(vela(100, 101.2, 96, 101)), true)
})

test('vela com sombra superior grande nao e martelo', () => {
  assert.equal(martelo(vela(100, 105, 99, 101)), false)
})

test('vela de corpo longo nao e martelo mesmo com sombra inferior', () => {
  // corpo 5, sombra inferior 4 — menor que 2x o corpo
  assert.equal(martelo(vela(100, 105.2, 96, 105)), false)
})

// --- engolfo de alta -----------------------------------------------------

test('engolfo de alta cobre inteiramente o corpo da vela de baixa anterior', () => {
  const anterior = vela(102, 102.5, 99.5, 100)
  const atual = vela(99.5, 103, 99, 102.5)
  assert.equal(engolfoDeAlta(anterior, atual), true)
})

test('vela de alta que nao cobre o corpo anterior nao e engolfo', () => {
  const anterior = vela(102, 102.5, 99.5, 100)
  const atual = vela(100.5, 102, 100, 101.5)
  assert.equal(engolfoDeAlta(anterior, atual), false)
})

test('nao ha engolfo de alta se a vela anterior ja era de alta', () => {
  const anterior = vela(100, 102.5, 99.5, 102)
  const atual = vela(99, 104, 98.5, 103)
  assert.equal(engolfoDeAlta(anterior, atual), false)
})

// --- estrela da manha ----------------------------------------------------

test('estrela da manha: queda, indecisao, e retomada acima do meio da queda', () => {
  const c1 = vela(105, 105.5, 99.5, 100) // baixa, corpo 5
  const c2 = vela(99.5, 100, 99, 99.8) // corpo pequeno
  const c3 = vela(100, 104, 99.8, 103.5) // alta, fecha acima de 102,5
  assert.equal(estrelaDaManha(c1, c2, c3), true)
})

test('sem retomada acima do meio da queda nao e estrela da manha', () => {
  const c1 = vela(105, 105.5, 99.5, 100)
  const c2 = vela(99.5, 100, 99, 99.8)
  const c3 = vela(100, 102, 99.8, 101.5) // fecha abaixo de 102,5
  assert.equal(estrelaDaManha(c1, c2, c3), false)
})

test('vela do meio com corpo grande descaracteriza a indecisao', () => {
  const c1 = vela(105, 105.5, 99.5, 100)
  const c2 = vela(99.5, 104, 99, 103.5) // corpo grande
  const c3 = vela(103, 106, 102.8, 105.5)
  assert.equal(estrelaDaManha(c1, c2, c3), false)
})

// --- tres soldados brancos ----------------------------------------------

test('tres soldados brancos sobem em sequencia abrindo dentro do corpo anterior', () => {
  const c1 = vela(100, 101.2, 99.8, 101)
  const c2 = vela(100.8, 102.2, 100.5, 102)
  const c3 = vela(101.5, 103.2, 101.3, 103)
  assert.equal(tresSoldadosBrancos(c1, c2, c3), true)
})

test('uma vela de baixa no meio quebra os tres soldados', () => {
  const c1 = vela(100, 101.2, 99.8, 101)
  const c2 = vela(100.8, 101, 100, 100.2) // baixa
  const c3 = vela(100.5, 103.2, 100.3, 103)
  assert.equal(tresSoldadosBrancos(c1, c2, c3), false)
})

test('abertura acima do corpo anterior descaracteriza (e gap, nao soldado)', () => {
  const c1 = vela(100, 101.2, 99.8, 101)
  const c2 = vela(102, 103, 101.8, 102.8) // abriu acima do fechamento anterior
  const c3 = vela(102.5, 104, 102.3, 103.8)
  assert.equal(tresSoldadosBrancos(c1, c2, c3), false)
})

// --- deteccao sobre a serie ---------------------------------------------

test('padroesEm devolve os padroes fechados na ultima vela', () => {
  const velas = [
    vela(105, 105.5, 99.5, 100),
    vela(99.5, 100, 99, 99.8),
    vela(100, 104, 99.8, 103.5),
  ]
  assert.deepEqual(padroesEm(velas), ['estrela-da-manha'])
})

test('serie de uma vela nao quebra ao procurar padroes de duas ou tres', () => {
  // Vela comum: corpo grande, sombras curtas — nao e martelo.
  assert.deepEqual(padroesEm([vela(100, 103.2, 99.8, 103)]), [])
})

test('martelo e reconhecido mesmo numa serie de uma vela so', () => {
  // Ele depende de uma vela apenas; exigir historico seria errado.
  assert.deepEqual(padroesEm([vela(100, 101.2, 96, 101)]), ['martelo'])
})

test('serie vazia devolve lista vazia', () => {
  assert.deepEqual(padroesEm([]), [])
})
