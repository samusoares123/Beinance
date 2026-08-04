/**
 * Cliente assinado da Binance — o unico ponto do projeto que toca o segredo.
 *
 * Toda chamada passa por uma lista branca. Nao existe funcao de ordem, saque ou
 * transferencia aqui: a garantia e a ausencia de codigo, nao a disciplina de
 * quem edita. Ver test/client.test.mjs.
 */

import { createHmac } from 'node:crypto'

const BASE = 'https://api.binance.com'

export const ENDPOINTS_LEITURA = new Set([
  'GET /api/v3/account',
  'GET /sapi/v1/asset/wallet/balance',
  'POST /sapi/v1/asset/get-funding-asset',
])

const TRADUCOES = {
  '-1021': 'Relogio do PC fora de sincronia com a Binance. Sincronize o horario do Windows.',
  '-2015': 'Chave invalida, sem permissao de leitura, ou IP fora da whitelist da chave.',
  '-1022': 'Assinatura invalida — o Secret Key provavelmente esta errado ou incompleto.',
  '-2014': 'Formato da API Key invalido — confira se copiou o valor inteiro.',
}

export function criarCliente({ chave, segredo }) {
  let defasagem = null

  async function sincronizarRelogio() {
    const r = await fetch(`${BASE}/api/v3/time`)
    const { serverTime } = await r.json()
    defasagem = serverTime - Date.now()
    return defasagem
  }

  async function chamarAssinado(metodo, caminho, params = {}) {
    if (!ENDPOINTS_LEITURA.has(`${metodo} ${caminho}`)) {
      throw new Error(`Fora da lista branca de leitura: ${metodo} ${caminho}`)
    }
    if (defasagem === null) await sincronizarRelogio()

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
      const extra = TRADUCOES[String(corpo.code)]
      throw new Error(`Binance ${corpo.code}: ${corpo.msg}${extra ? `\n  → ${extra}` : ''}`)
    }
    return corpo
  }

  return { chamarAssinado, sincronizarRelogio, get defasagem() { return defasagem } }
}
