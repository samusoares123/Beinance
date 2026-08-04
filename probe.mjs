/**
 * Diagnostico read-only da conta Binance.
 *
 * Responde as tres perguntas em aberto do projeto:
 *   1. A chave conecta e assina corretamente?
 *   2. Quanto a API enxerga do seu patrimonio, carteira por carteira?
 *   3. Os tokens Alpha aparecem em algum endpoint?
 *
 * Uso:  node --env-file=.env probe.mjs
 */

import { createHmac } from 'node:crypto'

const BASE = 'https://api.binance.com'

/**
 * Lista branca. Nenhum caminho fora daqui pode ser chamado.
 * Todos sao de leitura. Ordem, saque e transferencia nao estao aqui
 * e nao ha funcao neste arquivo capaz de executa-los.
 */
const ENDPOINTS_LEITURA = new Set([
  'GET /api/v3/account',
  'GET /sapi/v1/asset/wallet/balance',
  'POST /sapi/v1/asset/get-funding-asset',
])

const chave = process.env.BINANCE_API_KEY
const segredo = process.env.BINANCE_API_SECRET

if (!chave || !segredo) {
  console.error('Faltam BINANCE_API_KEY / BINANCE_API_SECRET.')
  console.error('Copie .env.example para .env, preencha, e rode: node --env-file=.env probe.mjs')
  process.exit(1)
}

/** Diferenca entre o relogio da Binance e o do seu PC, em ms. Evita o erro -1021. */
async function calcularDefasagemDoRelogio() {
  const r = await fetch(`${BASE}/api/v3/time`)
  const { serverTime } = await r.json()
  return serverTime - Date.now()
}

async function chamarAssinado(metodo, caminho, defasagem, params = {}) {
  if (!ENDPOINTS_LEITURA.has(`${metodo} ${caminho}`)) {
    throw new Error(`Endpoint fora da lista branca de leitura: ${metodo} ${caminho}`)
  }

  const query = new URLSearchParams({
    ...params,
    recvWindow: '10000',
    timestamp: String(Date.now() + defasagem),
  }).toString()

  const assinatura = createHmac('sha256', segredo).update(query).digest('hex')

  const resposta = await fetch(`${BASE}${caminho}?${query}&signature=${assinatura}`, {
    method: metodo,
    headers: { 'X-MBX-APIKEY': chave },
  })

  const corpo = await resposta.json()

  if (!resposta.ok) {
    throw Object.assign(new Error(traduzirErro(corpo)), { codigoBinance: corpo.code })
  }
  return corpo
}

function traduzirErro(corpo) {
  const mapa = {
    '-1021': 'Relogio do PC fora de sincronia com a Binance (mesmo com o ajuste). Sincronize o horario do Windows.',
    '-2015': 'Chave invalida, sem permissao de leitura, ou o seu IP nao esta na whitelist da chave.',
    '-1022': 'Assinatura invalida — o Secret Key provavelmente esta errado ou incompleto.',
    '-2014': 'Formato da API Key invalido — confira se copiou o valor inteiro.',
  }
  const extra = mapa[String(corpo.code)]
  return `Binance ${corpo.code}: ${corpo.msg}${extra ? `\n  → ${extra}` : ''}`
}

/** Mapa simbolo → preco, para avaliar cada moeda em USDT. */
async function buscarPrecos() {
  const r = await fetch(`${BASE}/api/v3/ticker/price`)
  const lista = await r.json()
  return new Map(lista.map((p) => [p.symbol, Number(p.price)]))
}

/** Valor de 1 unidade do ativo em USDT, ou null se nao houver par no Spot. */
function precoEmUsdt(ativo, precos) {
  if (ativo === 'USDT') return 1
  const direto = precos.get(`${ativo}USDT`)
  if (direto) return direto
  const viaBtc = precos.get(`${ativo}BTC`)
  const btc = precos.get('BTCUSDT')
  if (viaBtc && btc) return viaBtc * btc
  return null
}

const num = (v, casas = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

async function main() {
  const defasagem = await calcularDefasagemDoRelogio()
  console.log(`Defasagem do relogio: ${defasagem} ms${Math.abs(defasagem) > 1000 ? '  (alta — o ajuste automatico esta cobrindo)' : ''}\n`)

  const precos = await buscarPrecos()
  const usdtBrl = precos.get('USDTBRL') ?? null

  // --- Visao por carteira (valores vem denominados em BTC) ---
  const btcUsdt = precos.get('BTCUSDT')
  const carteiras = await chamarAssinado('GET', '/sapi/v1/asset/wallet/balance', defasagem)

  console.log('CARTEIRAS')
  let totalCarteiras = 0
  for (const c of carteiras) {
    const emUsdt = Number(c.balance) * btcUsdt
    if (emUsdt <= 0) continue
    totalCarteiras += emUsdt
    console.log(`  ${c.walletName.padEnd(22)} ${num(emUsdt).padStart(10)} USDT`)
  }
  console.log(`  ${'TOTAL'.padEnd(22)} ${num(totalCarteiras).padStart(10)} USDT`)

  // --- Detalhe do Spot ---
  const conta = await chamarAssinado('GET', '/api/v3/account', defasagem)
  const naoPrecificaveis = []
  let totalSpot = 0

  console.log('\nSPOT — moeda a moeda')
  for (const b of conta.balances) {
    const qtd = Number(b.free) + Number(b.locked)
    if (qtd <= 0) continue
    const preco = precoEmUsdt(b.asset, precos)
    if (preco === null) {
      naoPrecificaveis.push({ ativo: b.asset, qtd })
      continue
    }
    const valor = qtd * preco
    totalSpot += valor
    const poeira = valor < 5 ? '  ← poeira: abaixo do minimo de 5 USDT, nao da para vender' : ''
    console.log(`  ${b.asset.padEnd(10)} ${qtd.toString().padStart(18)}  = ${num(valor, 4).padStart(10)} USDT${poeira}`)
  }
  console.log(`  ${'TOTAL SPOT'.padEnd(10)} ${''.padStart(18)}  = ${num(totalSpot, 4).padStart(10)} USDT`)

  // --- Detalhe do Funding ---
  const funding = await chamarAssinado('POST', '/sapi/v1/asset/get-funding-asset', defasagem)
  let totalFunding = 0
  console.log('\nFUNDING (Fundos) — moeda a moeda')
  for (const f of funding) {
    const qtd = Number(f.free) + Number(f.locked) + Number(f.freeze)
    if (qtd <= 0) continue
    // btcValuation ja e o valor TOTAL da posicao em BTC (nao por unidade).
    // Cuidado: vem como string, e a string "0" e truthy — comparar como numero.
    const btcVal = Number(f.btcValuation)
    const valor = btcVal > 0 && btcUsdt
      ? btcVal * btcUsdt
      : qtd * (precoEmUsdt(f.asset, precos) ?? 0)
    totalFunding += valor
    console.log(`  ${f.asset.padEnd(10)} ${qtd.toString().padStart(18)}  = ${num(valor, 4).padStart(10)} USDT`)
  }
  console.log(`  ${'TOTAL FUNDING'.padEnd(10)} ${''.padStart(15)}  = ${num(totalFunding, 4).padStart(10)} USDT`)

  // --- O que a API nao consegue precificar (candidatos a Alpha) ---
  if (naoPrecificaveis.length) {
    console.log('\nSEM PAR NO SPOT — provavelmente tokens Alpha')
    for (const n of naoPrecificaveis) {
      console.log(`  ${n.ativo.padEnd(10)} ${n.qtd.toString().padStart(18)}  = valor desconhecido via API`)
    }
    console.log('  Estes nao tem preco no Spot e nao podem ser negociados por API.')
  } else {
    console.log('\nSEM PAR NO SPOT: nenhum. Os tokens Alpha NAO aparecem em /api/v3/account.')
  }

  // --- Reconciliacao ---
  console.log('\nRECONCILIACAO')
  console.log(`  Soma das carteiras (API):  ${num(totalCarteiras)} USDT`)
  if (usdtBrl) console.log(`  Equivalente em reais:      R$ ${num(totalCarteiras * usdtBrl)}  (USDT/BRL ${num(usdtBrl, 4)})`)
  console.log('  Compare com o "Valor total estimado" do app. Se divergir, a diferenca')
  console.log('  esta em carteira nao coberta por estes endpoints (Alpha, Earn travado).')
}

main().catch((e) => {
  console.error(`\nFALHOU: ${e.message}`)
  process.exit(1)
})
