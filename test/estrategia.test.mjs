import { test } from 'node:test'
import assert from 'node:assert/strict'

import { tamanhoDaPosicao, avaliarSaida } from '../src/estrategia.mjs'

const PADRAO = { fracaoMaxima: 0.25, margemSeguranca: 0.35 }

// --- tamanho da posicao -------------------------------------------------

test('posicao usa a fracao maxima do capital quando ela cobre o minimo de venda', () => {
  // 25% de 33 = 8,25. Piso para vender apos -35%: 5 / 0,65 = 7,69.
  const t = tamanhoDaPosicao({ capitalUsdt: 33, minNotional: 5, ...PADRAO })
  assert.equal(t.tamanhoUsdt, 8.25)
})

test('recusa o par quando a posicao possivel nao sobreviveria ao stop', () => {
  // 25% de 20 = 5,00, mas seria preciso 7,69 para ainda poder vender apos queda.
  // Comprar aqui e criar poeira travada — como HEMI e PUMP.
  const t = tamanhoDaPosicao({ capitalUsdt: 20, minNotional: 5, ...PADRAO })
  assert.equal(t.tamanhoUsdt, null)
  assert.match(t.motivo, /minimo de venda/i)
})

test('par com minimo de 1 USDT aceita posicao pequena', () => {
  const t = tamanhoDaPosicao({ capitalUsdt: 33, minNotional: 1, fracaoMaxima: 0.15, margemSeguranca: 0.35 })
  assert.equal(t.tamanhoUsdt, 4.95)
})

test('capital insuficiente para qualquer posicao devolve motivo, nao numero', () => {
  const t = tamanhoDaPosicao({ capitalUsdt: 3, minNotional: 5, ...PADRAO })
  assert.equal(t.tamanhoUsdt, null)
})

// --- avaliacao de saida -------------------------------------------------

const POSICAO = { precoEntrada: 100, alvoPct: 3, stopPct: 2, tempoMaximoMs: 4 * 60 * 60_000 }

test('sai no alvo quando o preco alcanca a meta', () => {
  const r = avaliarSaida({ ...POSICAO, precoAtual: 103, abertaHaMs: 60_000 })
  assert.equal(r.sair, true)
  assert.equal(r.motivo, 'alvo')
})

test('sai no stop quando o preco cai o limite', () => {
  const r = avaliarSaida({ ...POSICAO, precoAtual: 98, abertaHaMs: 60_000 })
  assert.equal(r.sair, true)
  assert.equal(r.motivo, 'stop')
})

test('stop tem prioridade sobre alvo quando o preco pula os dois', () => {
  // Vela violenta que passou pelos dois: o stop e o que protege, entao ele manda.
  const r = avaliarSaida({ ...POSICAO, precoAtual: 97, abertaHaMs: 60_000, maximaDesdeEntrada: 104 })
  assert.equal(r.motivo, 'stop')
})

test('sai por tempo quando a posicao envelhece sem decidir', () => {
  const r = avaliarSaida({ ...POSICAO, precoAtual: 101, abertaHaMs: 5 * 60 * 60_000 })
  assert.equal(r.sair, true)
  assert.equal(r.motivo, 'tempo')
})

test('posicao no meio do caminho continua aberta', () => {
  const r = avaliarSaida({ ...POSICAO, precoAtual: 101, abertaHaMs: 60_000 })
  assert.equal(r.sair, false)
  assert.equal(r.motivo, null)
})
