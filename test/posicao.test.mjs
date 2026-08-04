import { test } from 'node:test'
import assert from 'node:assert/strict'

import { consolidarPosicao, resultadoVsAportes } from '../src/posicao.mjs'

const precos = new Map([
  ['HEMIUSDT', 0.00461],
  ['BTCUSDT', 60000],
])

test('consolida saldos em valor de USDT usando os precos do Spot', () => {
  const r = consolidarPosicao([{ ativo: 'USDT', quantidade: 21.22 }], precos, { limiarPoeira: 5 })

  assert.equal(r.itens.length, 1)
  assert.equal(r.itens[0].valorUsdt, 21.22)
  assert.equal(r.totalUsdt, 21.22)
})

test('marca como poeira o que vale menos que o limiar', () => {
  const r = consolidarPosicao([{ ativo: 'HEMI', quantidade: 59.994 }], precos, { limiarPoeira: 5 })

  assert.equal(r.itens[0].poeira, true)
  assert.ok(Math.abs(r.itens[0].valorUsdt - 0.27657) < 1e-4)
})

test('saldo acima do limiar nao e poeira', () => {
  const r = consolidarPosicao([{ ativo: 'BTC', quantidade: 0.001 }], precos, { limiarPoeira: 5 })
  assert.equal(r.itens[0].poeira, false)
})

test('ativo sem par no Spot fica separado e nao entra no total', () => {
  const r = consolidarPosicao(
    [
      { ativo: 'USDT', quantidade: 10 },
      { ativo: 'HANA', quantidade: 26.99 },
    ],
    precos,
    { limiarPoeira: 5 },
  )

  assert.equal(r.totalUsdt, 10)
  assert.deepEqual(r.naoPrecificaveis, [{ ativo: 'HANA', quantidade: 26.99 }])
})

test('saldo zerado e ignorado', () => {
  const r = consolidarPosicao([{ ativo: 'USDT', quantidade: 0 }], precos, { limiarPoeira: 5 })
  assert.equal(r.itens.length, 0)
})

test('compara o valor atual com o total realmente aportado', () => {
  const r = resultadoVsAportes({
    totalUsdt: 33.35,
    cotacaoUsdtBrl: 5,
    aportes: [
      { data: '2026-08-01', valorBRL: 100 },
      { data: '2026-09-01', valorBRL: 150 },
    ],
  })

  assert.equal(r.aportadoBrl, 250)
  assert.equal(r.valorAtualBrl, 166.75)
  assert.equal(r.resultadoBrl, -83.25)
  assert.equal(r.resultadoPct, -33.3)
})

test('sem aportes registrados nao ha percentual a calcular', () => {
  const r = resultadoVsAportes({ totalUsdt: 33.35, cotacaoUsdtBrl: 5, aportes: [] })

  assert.equal(r.aportadoBrl, 0)
  assert.equal(r.resultadoPct, null)
})
