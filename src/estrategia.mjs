/**
 * Decisoes de entrada e saida. Puro: numeros entram, decisao sai.
 */

const arredondar = (v, casas = 2) => {
  const f = 10 ** casas
  return Math.round(v * f) / f
}

/**
 * Tamanho da posicao em USDT.
 *
 * Duas restricoes ao mesmo tempo:
 *  - teto de risco: nunca mais que `fracaoMaxima` do capital numa posicao
 *  - PISO DE SAIDA: `minNotional` vale para a venda tambem. Uma posicao que,
 *    depois de cair, valer menos que o minimo NAO PODE SER VENDIDA — vira poeira
 *    travada. Por isso ela precisa aguentar uma queda de `margemSeguranca` e
 *    ainda ficar acima do minimo.
 *
 * Quando o teto de risco nao alcanca o piso de saida, o par simplesmente nao
 * serve para este capital. Devolver null e a resposta certa; comprar seria criar
 * um HEMI novo.
 */
export function tamanhoDaPosicao({ capitalUsdt, minNotional, fracaoMaxima, margemSeguranca }) {
  const teto = arredondar(capitalUsdt * fracaoMaxima)
  const piso = arredondar(minNotional / (1 - margemSeguranca))

  if (teto < piso) {
    return {
      tamanhoUsdt: null,
      motivo:
        `posicao possivel (${teto} USDT) fica abaixo do minimo de venda seguro ` +
        `(${piso} USDT) para este par`,
    }
  }
  return { tamanhoUsdt: teto, pisoDeSaida: piso, motivo: null }
}

/**
 * Quanto a posicao pode cair antes de a VENDA ser recusada por tamanho.
 *
 * O ponto de recusa e o `minNotional`, nao o piso de abertura. Confundir os dois
 * subestima grosseiramente a folga: uma posicao de 8,25 num par de minimo 5
 * aguenta -39%, nao os -4% que a distancia ate o piso de abertura sugere. Errar
 * para baixo aqui produz um stop apertado demais, que sai da posicao por
 * oscilacao normal e transforma ruido em prejuizo realizado.
 */
export function quedaAteOMinimo({ tamanhoUsdt, minNotional }) {
  if (!(tamanhoUsdt > 0) || tamanhoUsdt < minNotional) return null
  return arredondar((minNotional / tamanhoUsdt - 1) * 100)
}

/**
 * A posicao deve ser encerrada?
 *
 * O stop e avaliado ANTES do alvo: numa vela violenta que atravessa os dois, o
 * que protege capital tem precedencia. Assumir o melhor dos dois seria inflar o
 * resultado da simulacao justamente nos casos extremos.
 */
export function avaliarSaida({ precoEntrada, precoAtual, alvoPct, stopPct, abertaHaMs, tempoMaximoMs }) {
  const variacaoPct = ((precoAtual - precoEntrada) / precoEntrada) * 100

  if (variacaoPct <= -stopPct) return { sair: true, motivo: 'stop', variacaoPct: arredondar(variacaoPct) }
  if (variacaoPct >= alvoPct) return { sair: true, motivo: 'alvo', variacaoPct: arredondar(variacaoPct) }
  if (abertaHaMs >= tempoMaximoMs) return { sair: true, motivo: 'tempo', variacaoPct: arredondar(variacaoPct) }

  return { sair: false, motivo: null, variacaoPct: arredondar(variacaoPct) }
}
