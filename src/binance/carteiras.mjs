/**
 * Busca os saldos espalhados pelas carteiras da conta.
 *
 * /api/v3/account cobre apenas o Spot. Verificado em 03/08/2026: os tokens
 * Alpha nao aparecem em nenhum destes endpoints — por isso o monitor precisa
 * da leitura manual em data/alpha-manual.json.
 */

const BASE = 'https://api.binance.com'

export async function buscarPrecos() {
  const r = await fetch(`${BASE}/api/v3/ticker/price`)
  const lista = await r.json()
  return new Map(lista.map((p) => [p.symbol, Number(p.price)]))
}

export async function buscarSaldos(cliente, precos) {
  const [carteiras, conta, funding] = await Promise.all([
    cliente.chamarAssinado('GET', '/sapi/v1/asset/wallet/balance'),
    cliente.chamarAssinado('GET', '/api/v3/account'),
    cliente.chamarAssinado('POST', '/sapi/v1/asset/get-funding-asset'),
  ])

  const btcUsdt = precos.get('BTCUSDT')

  // O endpoint de carteiras devolve o saldo denominado em BTC.
  const porCarteira = carteiras
    .map((c) => ({ nome: c.walletName, valorUsdt: Number(c.balance) * btcUsdt }))
    .filter((c) => c.valorUsdt > 0)

  const acumulado = new Map()
  const somar = (ativo, quantidade) => {
    if (quantidade > 0) acumulado.set(ativo, (acumulado.get(ativo) ?? 0) + quantidade)
  }

  for (const b of conta.balances) somar(b.asset, Number(b.free) + Number(b.locked))
  for (const f of funding) somar(f.asset, Number(f.free) + Number(f.locked) + Number(f.freeze))

  const saldos = [...acumulado].map(([ativo, quantidade]) => ({ ativo, quantidade }))
  return { porCarteira, saldos }
}
