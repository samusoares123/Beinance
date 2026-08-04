/**
 * Consolidacao da posicao: saldos crus + precos → quanto voce tem, de fato.
 * Puro: sem rede, sem disco.
 */

const arredondar = (v, casas = 2) => {
  const f = 10 ** casas
  return Math.round(v * f) / f
}

/** Valor de 1 unidade do ativo em USDT, ou null se nao houver caminho no Spot. */
function precoEmUsdt(ativo, precos) {
  if (ativo === 'USDT') return 1
  const direto = precos.get(`${ativo}USDT`)
  if (direto) return direto
  const viaBtc = precos.get(`${ativo}BTC`)
  const btc = precos.get('BTCUSDT')
  if (viaBtc && btc) return viaBtc * btc
  return null
}

/**
 * Devolve { itens, totalUsdt, naoPrecificaveis }.
 *
 * O que nao tem preco no Spot NAO entra no total — fica em `naoPrecificaveis`
 * para ser reportado como lacuna. Um total que engole o desconhecido mente.
 */
export function consolidarPosicao(saldos, precos, { limiarPoeira }) {
  const itens = []
  const naoPrecificaveis = []
  let totalUsdt = 0

  for (const { ativo, quantidade } of saldos) {
    if (quantidade <= 0) continue

    const preco = precoEmUsdt(ativo, precos)
    if (preco === null) {
      naoPrecificaveis.push({ ativo, quantidade })
      continue
    }

    const valorUsdt = quantidade * preco
    totalUsdt += valorUsdt
    itens.push({ ativo, quantidade, precoUsdt: preco, valorUsdt, poeira: valorUsdt < limiarPoeira })
  }

  return { itens, totalUsdt, naoPrecificaveis }
}

/**
 * O numero que interessa no fim do mes: o dinheiro que voce colocou versus
 * o que ele vale hoje, em reais — nao em USDT, porque o aporte foi em reais.
 */
export function resultadoVsAportes({ totalUsdt, cotacaoUsdtBrl, aportes }) {
  const aportadoBrl = aportes.reduce((soma, a) => soma + a.valorBRL, 0)
  const valorAtualBrl = arredondar(totalUsdt * cotacaoUsdtBrl)
  const resultadoBrl = arredondar(valorAtualBrl - aportadoBrl)

  return {
    aportadoBrl,
    valorAtualBrl,
    resultadoBrl,
    resultadoPct: aportadoBrl === 0 ? null : arredondar((resultadoBrl / aportadoBrl) * 100),
  }
}
