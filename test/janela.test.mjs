import { test } from 'node:test'
import assert from 'node:assert/strict'

import { janelaDe } from '../src/sinais.mjs'

const CINCO_MIN = 5 * 60_000
const TOLERANCIA = 60_000

const amostra = (t, preco, volumeAcumulado) => ({ t, preco, volumeAcumulado })

test('janela usa a amostra mais proxima do inicio do periodo pedido', () => {
  const serie = [amostra(0, 100, 1000), amostra(150_000, 102, 1200), amostra(300_000, 105, 1500)]

  const j = janelaDe(serie, CINCO_MIN, TOLERANCIA)

  assert.equal(j.inicio.t, 0)
  assert.equal(j.fim.t, 300_000)
  assert.equal(j.variacaoPct, 5)
  assert.equal(j.volumeJanela, 500)
  assert.equal(j.duracaoSegundos, 300)
})

test('janela informa a duracao real, nao a pedida', () => {
  // Ancorada 20s antes do ideal: a janela real tem 320s, nao 300s.
  const serie = [amostra(0, 100, 1000), amostra(320_000, 110, 1400)]

  assert.equal(janelaDe(serie, CINCO_MIN, TOLERANCIA).duracaoSegundos, 320)
})

test('serie esparsa nao produz janela: 20 amostras podem ser 40 minutos', () => {
  // Par pouco negociado: so aparece de 15 em 15 minutos.
  const esparsa = [amostra(0, 100, 1000), amostra(900_000, 130, 2000)]

  assert.equal(janelaDe(esparsa, CINCO_MIN, TOLERANCIA), null)
})

test('amostra dentro da tolerancia e aceita', () => {
  // Inicio ideal seria t=20.000; a mais proxima esta em t=0, 20s fora — dentro de 60s.
  const serie = [amostra(0, 100, 1000), amostra(320_000, 110, 1400)]

  const j = janelaDe(serie, CINCO_MIN, TOLERANCIA)

  assert.equal(j.inicio.t, 0)
  assert.equal(j.variacaoPct, 10)
})

test('amostra fora da tolerancia e recusada', () => {
  // Inicio ideal seria t=100.000; a mais proxima esta em t=0, 100s fora.
  const serie = [amostra(0, 100, 1000), amostra(400_000, 110, 1400)]

  assert.equal(janelaDe(serie, CINCO_MIN, TOLERANCIA), null)
})

test('serie com uma amostra so nao tem janela', () => {
  assert.equal(janelaDe([amostra(0, 100, 1000)], CINCO_MIN, TOLERANCIA), null)
})

test('serie vazia nao quebra', () => {
  assert.equal(janelaDe([], CINCO_MIN, TOLERANCIA), null)
})
