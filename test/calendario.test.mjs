import { test } from 'node:test'
import assert from 'node:assert/strict'

import { momentoLocal, estatisticas, agruparPor } from '../src/calendario.mjs'

// 2026-08-03 e uma segunda-feira. 2026-08-07 e uma sexta.
const SEGUNDA = Date.UTC(2026, 7, 3, 12, 0, 0)

// --- momentoLocal --------------------------------------------------------

test('momentoLocal traduz um instante UTC para dia e hora do fuso pedido', () => {
  assert.deepEqual(momentoLocal(SEGUNDA, -3), { diaSemana: 1, hora: 9 })
})

test('offset zero devolve o proprio UTC', () => {
  assert.deepEqual(momentoLocal(SEGUNDA, 0), { diaSemana: 1, hora: 12 })
})

test('sexta a noite no Brasil e sabado em UTC — e precisa continuar sendo sexta', () => {
  // Sexta 21h em UTC-3 e 2026-08-08T00:00Z, que em UTC ja e sabado.
  // Agrupar por dia em UTC jogaria essa amostra no balde errado.
  const sextaANoite = Date.UTC(2026, 7, 8, 0, 0, 0)
  assert.deepEqual(momentoLocal(sextaANoite, -3), { diaSemana: 5, hora: 21 })
  assert.equal(momentoLocal(sextaANoite, 0).diaSemana, 6)
})

test('a virada de dia para tras nao quebra o inicio da semana', () => {
  // Domingo 00:30 UTC e ainda sabado 21:30 no Brasil.
  const domingoDeMadrugada = Date.UTC(2026, 7, 9, 0, 30, 0)
  assert.deepEqual(momentoLocal(domingoDeMadrugada, -3), { diaSemana: 6, hora: 21 })
})

// --- estatisticas --------------------------------------------------------

test('estatisticas resume media, mediana e taxa de positivos', () => {
  const r = estatisticas([-2, 1, 3])
  assert.equal(r.n, 3)
  assert.equal(Math.round(r.media * 100) / 100, 0.67)
  assert.equal(r.mediana, 1)
  assert.equal(Math.round(r.positivos), 67)
})

test('mediana de conjunto par e a media dos dois centrais', () => {
  assert.equal(estatisticas([1, 2, 4, 10]).mediana, 3)
})

test('conjunto vazio devolve nulos em vez de NaN', () => {
  const r = estatisticas([])
  assert.equal(r.n, 0)
  assert.equal(r.media, null)
  assert.equal(r.mediana, null)
  assert.equal(r.positivos, null)
})

// --- agruparPor ----------------------------------------------------------

test('agruparPor junta valores sob a chave calculada', () => {
  const itens = [
    { tipo: 'a', v: 1 },
    { tipo: 'b', v: 2 },
    { tipo: 'a', v: 3 },
  ]
  const g = agruparPor(itens, (i) => i.tipo, (i) => i.v)
  assert.deepEqual(g.get('a'), [1, 3])
  assert.deepEqual(g.get('b'), [2])
})
