import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatarDataBR, diasDesde } from '../src/datas.mjs'

test('data sem hora nao volta um dia por causa do fuso', () => {
  // new Date('2026-08-03') seria meia-noite UTC e viraria 02/08 em UTC-3.
  assert.equal(formatarDataBR('2026-08-03'), '03/08/2026')
})

test('formata virada de mes sem deslocar', () => {
  assert.equal(formatarDataBR('2026-01-01'), '01/01/2026')
})

test('conta os dias inteiros passados desde a leitura', () => {
  const agora = new Date('2026-08-10T15:00:00-03:00')
  assert.equal(diasDesde('2026-08-03', agora), 7)
})

test('leitura de hoje conta zero dia', () => {
  const agora = new Date('2026-08-03T23:59:00-03:00')
  assert.equal(diasDesde('2026-08-03', agora), 0)
})

test('a virada da meia-noite conta um dia, nao um pedaco', () => {
  const agora = new Date('2026-08-04T00:30:00-03:00')
  assert.equal(diasDesde('2026-08-03', agora), 1)
})
