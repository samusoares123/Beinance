/**
 * Historico condicionado: o que aconteceu DEPOIS, nas vezes em que a moeda ja
 * esteve nesta situacao.
 *
 * Isto nao e previsao e nao deve ser apresentado como tal. E a distribuicao do
 * passado, que serve para duas coisas concretas: dimensionar o stop e saber com
 * que frequencia ele teria sido acionado.
 *
 * A decisao de projeto que mais importa aqui: a pior queda do caminho e medida
 * pela MINIMA das velas, nao pelo fechamento. Uma operacao que fecha em +2% mas
 * mergulhou -6% no meio ja teria acionado um stop de 5% — o fechamento sozinho
 * esconde exatamente o evento que decide se voce continuava na posicao.
 */

const arredondar = (v, casas = 2) => {
  const f = 10 ** casas
  return Math.round(v * f) / f
}

/**
 * Para cada ocorrencia, o que o preco fez ate `horizonte` velas depois.
 *
 * Ocorrencia sem futuro suficiente no historico e descartada — estimar seria
 * inventar dado justamente nas amostras mais recentes.
 */
export function desfechosDe({ velas, indices, horizonte, custoPct }) {
  const saida = []

  for (const i of indices) {
    const entrada = velas[i]?.fechamento
    const fim = velas[i + horizonte]
    if (!(entrada > 0) || !fim) continue

    let piorQueda = 0
    // Comeca em i+1: a minima da propria vela de entrada acontece antes de a
    // compra existir, entao nao e prejuizo que o comprador tenha visto.
    for (let j = i + 1; j <= i + horizonte; j++) {
      const queda = ((velas[j].minima - entrada) / entrada) * 100
      if (queda < piorQueda) piorQueda = queda
    }

    saida.push({
      retornoLiquidoPct: arredondar(((fim.fechamento - entrada) / entrada) * 100 - custoPct),
      piorQuedaPct: arredondar(piorQueda),
    })
  }

  return saida
}

/** Em que % dos casos um stop de `stopPct` teria sido acionado. */
export function taxaDeAcionamento(piorQuedas, stopPct) {
  if (piorQuedas.length === 0) return null
  const acionadas = piorQuedas.filter((q) => q <= -stopPct).length
  return arredondar((acionadas / piorQuedas.length) * 100)
}

/** Percentil com interpolacao linear. 0 = minimo, 100 = maximo. */
export function percentil(valores, p) {
  if (valores.length === 0) return null
  const ordenados = [...valores].sort((a, b) => a - b)
  if (ordenados.length === 1) return ordenados[0]

  const posicao = (p / 100) * (ordenados.length - 1)
  const abaixo = Math.floor(posicao)
  const acima = Math.ceil(posicao)
  if (abaixo === acima) return ordenados[abaixo]
  return ordenados[abaixo] + (ordenados[acima] - ordenados[abaixo]) * (posicao - abaixo)
}
