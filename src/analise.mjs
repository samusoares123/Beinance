/**
 * Funcoes puras de analise de um par da Binance.
 * Sem rede, sem estado — tudo aqui e aritmetica testavel.
 */

const arredondar = (valor, casas = 2) => {
  const f = 10 ** casas
  return Math.round(valor * f) / f
}

/**
 * Quanto custa entrar e sair de uma posicao, em % do valor operado.
 * Spread e pago uma vez (ao cruzar o livro); a taxa, nos dois lados.
 */
export function custoIdaVolta({ bid, ask, taxaPorLado }) {
  const meio = (bid + ask) / 2
  const spreadPct = meio === 0 ? 0 : ((ask - bid) / meio) * 100
  return {
    spreadPct: arredondar(spreadPct, 4),
    custoTotalPct: arredondar(spreadPct + taxaPorLado * 2, 4),
  }
}

/**
 * Percorre os niveis de venda do livro gastando `valorUsdt` e devolve o preco
 * medio realmente pago. A diferenca para o melhor preco e o slippage.
 *
 * `asks` vem da API como [[preco, quantidade], ...], com valores em string.
 */
export function slippageDeCompra(asks, valorUsdt) {
  const melhorPreco = Number(asks[0][0])
  let restante = valorUsdt
  let quantidade = 0

  for (const [precoStr, qtdStr] of asks) {
    if (restante <= 0) break
    const preco = Number(precoStr)
    const disponivel = preco * Number(qtdStr)
    const gasto = Math.min(disponivel, restante)
    quantidade += gasto / preco
    restante -= gasto
  }

  const insuficiente = restante > 0
  const precoMedio = quantidade === 0 ? 0 : (valorUsdt - restante) / quantidade

  return {
    insuficiente,
    precoMedio,
    slippagePct: melhorPreco === 0 ? 0 : ((precoMedio - melhorPreco) / melhorPreco) * 100,
  }
}

/**
 * Onde o preco esta entre a minima e a maxima da janela, em %.
 * 0 = na minima, 100 = na maxima. Alto significa "comprando perto do topo".
 */
export function posicaoNaFaixa(preco, minimo, maximo) {
  const amplitude = maximo - minimo
  if (amplitude === 0) return null
  return arredondar(((preco - minimo) / amplitude) * 100)
}

/** Media dos ultimos `periodo` valores. Null se nao houver valores suficientes. */
export function mediaSimples(valores, periodo) {
  if (valores.length < periodo) return null
  const janela = valores.slice(-periodo)
  return janela.reduce((a, b) => a + b, 0) / periodo
}

/**
 * Indice de Forca Relativa: compara o tamanho medio das altas com o das quedas
 * nos ultimos `periodo` movimentos. Acima de 70 costuma ser lido como "esticado
 * para cima", abaixo de 30 como "esticado para baixo" — leitura do passado, nao
 * previsao.
 */
export function rsi(fechamentos, periodo = 14) {
  if (fechamentos.length < periodo + 1) return null

  const variacoes = []
  for (let i = 1; i < fechamentos.length; i++) {
    variacoes.push(fechamentos[i] - fechamentos[i - 1])
  }

  let ganhoMedio = 0
  let perdaMedia = 0
  for (let i = 0; i < periodo; i++) {
    if (variacoes[i] > 0) ganhoMedio += variacoes[i]
    else perdaMedia += Math.abs(variacoes[i])
  }
  ganhoMedio /= periodo
  perdaMedia /= periodo

  // Suavizacao de Wilder para o restante da serie.
  for (let i = periodo; i < variacoes.length; i++) {
    const ganho = variacoes[i] > 0 ? variacoes[i] : 0
    const perda = variacoes[i] < 0 ? Math.abs(variacoes[i]) : 0
    ganhoMedio = (ganhoMedio * (periodo - 1) + ganho) / periodo
    perdaMedia = (perdaMedia * (periodo - 1) + perda) / periodo
  }

  if (perdaMedia === 0) return 100
  const forcaRelativa = ganhoMedio / perdaMedia
  return arredondar(100 - 100 / (1 + forcaRelativa))
}

/**
 * Maior queda que a serie sofreu, do topo ate o fundo que veio DEPOIS dele.
 *
 * E o numero que diz o tamanho do estrago possivel: uma moeda que ja caiu 80%
 * do topo pode cair 80% de novo. Queda anterior ao topo nao conta — nao se
 * perde dinheiro num fundo que aconteceu antes de voce entrar no pico.
 */
export function maiorQueda(fechamentos) {
  let topo = -Infinity
  let pior = 0
  for (const valor of fechamentos) {
    if (valor > topo) topo = valor
    const queda = ((valor - topo) / topo) * 100
    if (queda < pior) pior = queda
  }
  return arredondar(pior)
}

/** O melhor e o pior dia da serie, em %. Mostra a amplitude do que ja aconteceu. */
export function melhorEPiorDia(fechamentos) {
  if (fechamentos.length < 2) return { melhorPct: null, piorPct: null }

  let melhor = -Infinity
  let pior = Infinity
  for (let i = 1; i < fechamentos.length; i++) {
    const variacao = ((fechamentos[i] - fechamentos[i - 1]) / fechamentos[i - 1]) * 100
    if (variacao > melhor) melhor = variacao
    if (variacao < pior) pior = variacao
  }
  return { melhorPct: arredondar(melhor), piorPct: arredondar(pior) }
}

/** Proporcao de periodos cuja variacao passou de `limiarPct`, em %. */
export function percentualDeDiasVolateis(fechamentos, limiarPct) {
  let volateis = 0
  let total = 0
  for (let i = 1; i < fechamentos.length; i++) {
    const variacao = ((fechamentos[i] - fechamentos[i - 1]) / fechamentos[i - 1]) * 100
    total++
    if (Math.abs(variacao) >= limiarPct) volateis++
  }
  return total === 0 ? 0 : arredondar((volateis / total) * 100)
}
