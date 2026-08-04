import { test } from 'node:test'
import assert from 'node:assert/strict'

import { podeAbrir, resumoDoDia } from '../src/risco.mjs'

const LIMITES = { maxPosicoes: 3, maxStopsSeguidos: 3, quedaMaximaDiaPct: 20 }

const ESTADO = {
  posicoesAbertas: 0,
  stopsSeguidos: 0,
  capitalAtual: 33,
  capitalInicioDoDia: 33,
}

test('abre quando nenhum limite foi atingido', () => {
  assert.equal(podeAbrir(ESTADO, LIMITES).pode, true)
})

test('nao abre a quarta posicao simultanea', () => {
  const r = podeAbrir({ ...ESTADO, posicoesAbertas: 3 }, LIMITES)
  assert.equal(r.pode, false)
  assert.match(r.motivo, /simultane/i)
})

test('para o dia depois de tres stops seguidos', () => {
  const r = podeAbrir({ ...ESTADO, stopsSeguidos: 3 }, LIMITES)
  assert.equal(r.pode, false)
  assert.match(r.motivo, /dia/i)
})

test('kill switch corta tudo quando o capital cai 20% no dia', () => {
  const r = podeAbrir({ ...ESTADO, capitalAtual: 26.4 }, LIMITES)
  assert.equal(r.pode, false)
  assert.match(r.motivo, /kill switch/i)
})

test('queda menor que o limite nao aciona o kill switch', () => {
  const r = podeAbrir({ ...ESTADO, capitalAtual: 30 }, LIMITES)
  assert.equal(r.pode, true)
})

test('kill switch tem prioridade sobre os outros limites', () => {
  const r = podeAbrir({ ...ESTADO, posicoesAbertas: 3, capitalAtual: 20 }, LIMITES)
  assert.match(r.motivo, /kill switch/i)
})

// --- resumo de desempenho ------------------------------------------------

test('resumo calcula acerto e resultado liquido das operacoes fechadas', () => {
  const operacoes = [
    { resultadoUsdt: 0.24, motivo: 'alvo' },
    { resultadoUsdt: -0.17, motivo: 'stop' },
    { resultadoUsdt: 0.24, motivo: 'alvo' },
    { resultadoUsdt: 0.02, motivo: 'tempo' },
  ]
  const r = resumoDoDia(operacoes)

  assert.equal(r.total, 4)
  assert.equal(r.vencedoras, 3)
  assert.equal(r.acertoPct, 75)
  assert.equal(r.resultadoUsdt, 0.33)
})

test('sem operacoes o acerto e desconhecido, nao zero', () => {
  const r = resumoDoDia([])
  assert.equal(r.total, 0)
  assert.equal(r.acertoPct, null)
})
