import { test } from 'node:test'
import assert from 'node:assert/strict'

import { caminhosEm } from '../src/armazenamento.mjs'

test('os caminhos saem todos da mesma pasta base', () => {
  const c = caminhosEm('data')
  assert.equal(c.sinais, 'data/sinais.jsonl')
  assert.equal(c.estadoRobo, 'data/robo-estado.json')
})

test('trocar a base move todos os arquivos juntos', () => {
  // A coleta no Actions grava em `coleta/`, que e versionada. Se algum caminho
  // ficasse preso em `data/`, o dado seria escrito na pasta ignorada pelo git e
  // sumiria com o runner — sem erro nenhum, so um arquivo vazio no fim do mes.
  const c = caminhosEm('coleta')
  for (const valor of Object.values(c)) {
    assert.ok(valor.startsWith('coleta/'), `${valor} nao respeitou a base`)
  }
})

test('o snapshot anterior tem caminho proprio', () => {
  assert.equal(caminhosEm('coleta').snapshotAnterior, 'coleta/snapshot-anterior.json')
})
