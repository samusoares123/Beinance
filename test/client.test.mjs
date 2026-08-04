import { test } from 'node:test'
import assert from 'node:assert/strict'

import { criarCliente, ENDPOINTS_LEITURA } from '../src/binance/client.mjs'

const cliente = criarCliente({ chave: 'chave-de-teste', segredo: 'segredo-de-teste' })

test('recusa endpoint fora da lista branca antes de tocar a rede', async () => {
  await assert.rejects(
    () => cliente.chamarAssinado('POST', '/api/v3/order'),
    /lista branca/i,
    'enviar ordem deve ser impossivel, nao apenas desaconselhado',
  )
})

test('recusa saque mesmo que a chave tivesse permissao', async () => {
  await assert.rejects(() => cliente.chamarAssinado('POST', '/sapi/v1/capital/withdraw/apply'), /lista branca/i)
})

test('recusa metodo diferente no mesmo caminho permitido', async () => {
  // GET /api/v3/account e permitido; POST no mesmo caminho, nao.
  await assert.rejects(() => cliente.chamarAssinado('POST', '/api/v3/account'), /lista branca/i)
})

test('a lista branca nao contem nenhum endpoint de escrita', () => {
  const proibidos = ['order', 'withdraw', 'transfer', 'oco', 'cancel']
  for (const caminho of ENDPOINTS_LEITURA) {
    for (const p of proibidos) {
      assert.ok(!caminho.toLowerCase().includes(p), `${caminho} parece endpoint de escrita`)
    }
  }
})
