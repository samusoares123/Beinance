/**
 * De onde vem o dado publico de mercado.
 *
 * A `api.binance.com` responde **451 Unavailable For Legal Reasons** a IPs dos
 * Estados Unidos, e os runners do GitHub Actions ficam em datacenter americano.
 * Nao e bug, e bloqueio geografico: o mesmo codigo roda sem erro numa maquina
 * no Brasil e falha no CI.
 *
 * A `data-api.binance.vision` e o espelho publico oficial de MARKET DATA, sem
 * restricao de regiao. Verificado em 2026-08-04: mesmos precos ate o ultimo
 * decimal, mesmos 479 pares USDT em TRADING.
 *
 * ATENCAO — o espelho serve SO dado publico. Ele nao aceita requisicao
 * assinada. `src/binance/client.mjs`, que fala com a conta, continua apontando
 * para `api.binance.com` de proposito e nao deve usar isto.
 */

const OFICIAL = 'https://api.binance.com'
const ESPELHO_PUBLICO = 'https://data-api.binance.vision'

/** Pura para poder ser testada sem mexer no ambiente do processo. */
export function baseDaApi(env = {}) {
  return env.BEINANCE_API || OFICIAL
}

export function baseDoStream(env = {}) {
  return env.BEINANCE_STREAM || 'wss://stream.binance.com:9443'
}

export const API = baseDaApi(process.env)
export const STREAM = baseDoStream(process.env)
export { OFICIAL, ESPELHO_PUBLICO }
