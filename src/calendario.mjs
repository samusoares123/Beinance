/**
 * Agrupamento de retornos por dia da semana e hora do dia.
 *
 * A pergunta que isto existe para responder: "toda sexta a noite o mercado esta
 * em baixa e segunda de manha comeca a subir" — e crenca ou e efeito medivel?
 *
 * O cuidado central e o FUSO. Os candles da Binance vem em UTC. Sexta 21h no
 * Brasil ja e sabado em UTC. Agrupar pelos campos UTC jogaria metade das noites
 * de sexta no balde do sabado e a tese seria testada errada — parecendo refutada
 * quando na verdade nem foi medida. Por isso o offset e explicito e obrigatorio
 * no calculo, nunca herdado do relogio da maquina.
 */

const MS_POR_HORA = 3_600_000

export const DIAS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

/** Instante em ms (UTC) → { diaSemana: 0=domingo, hora: 0-23 } no fuso pedido. */
export function momentoLocal(ms, offsetHoras) {
  const deslocado = new Date(ms + offsetHoras * MS_POR_HORA)
  return { diaSemana: deslocado.getUTCDay(), hora: deslocado.getUTCHours() }
}

/** Resumo de uma lista de retornos. Lista vazia devolve nulos, nunca NaN. */
export function estatisticas(valores) {
  const n = valores.length
  if (n === 0) return { n: 0, media: null, mediana: null, positivos: null }

  const media = valores.reduce((a, b) => a + b, 0) / n
  const ordenados = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(n / 2)
  const mediana = n % 2 === 0 ? (ordenados[meio - 1] + ordenados[meio]) / 2 : ordenados[meio]
  const positivos = (valores.filter((v) => v > 0).length / n) * 100

  return { n, media, mediana, positivos }
}

/** Agrupa itens numa Map chave → lista de valores. */
export function agruparPor(itens, chaveDe, valorDe) {
  const g = new Map()
  for (const item of itens) {
    const chave = chaveDe(item)
    if (!g.has(chave)) g.set(chave, [])
    g.get(chave).push(valorDe(item))
  }
  return g
}
