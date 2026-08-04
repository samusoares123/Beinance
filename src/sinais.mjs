/**
 * Regras de deteccao de sinal. Puras: recebem numeros, devolvem decisao.
 *
 * Nenhuma delas e assumida como boa. Elas existem para serem gravadas e
 * julgadas depois pelo desfecho real — ver desfechos.mjs.
 */

const arredondar = (v, casas = 2) => {
  const f = 10 ** casas
  return Math.round(v * f) / f
}

/**
 * Recorta uma janela de TEMPO da serie de amostras.
 *
 * Contar amostras nao serve: o stream so empurra o simbolo quando ele se move,
 * entao 20 amostras podem ser 5 minutos num par ativo e 40 minutos num parado.
 * Medir "variacao em 5 minutos" por contagem mentiria exatamente nos pares menos
 * liquidos. Aqui a janela e ancorada no relogio, e a serie que nao tiver amostra
 * perto do inicio pedido simplesmente nao gera sinal.
 *
 * Devolve null quando nao ha amostra dentro da tolerancia.
 */
export function janelaDe(serie, msJanela, toleranciaMs) {
  if (serie.length < 2) return null

  const fim = serie.at(-1)
  const alvo = fim.t - msJanela

  let inicio = null
  let menorDistancia = Infinity
  for (const a of serie) {
    if (a === fim) continue
    const distancia = Math.abs(a.t - alvo)
    if (distancia < menorDistancia) {
      menorDistancia = distancia
      inicio = a
    }
  }

  if (!inicio || menorDistancia > toleranciaMs) return null

  return {
    inicio,
    fim,
    // A janela real quase nunca tem a duracao pedida: a ancora cai onde houver
    // amostra. Registrar a duracao efetiva mantem o dado honesto na Fase 2 —
    // "+2% em 5min" e "+2% em 4min" nao sao o mesmo sinal.
    duracaoSegundos: Math.round((fim.t - inicio.t) / 1000),
    variacaoPct: arredondar(((fim.preco - inicio.preco) / inicio.preco) * 100),
    volumeJanela: fim.volumeAcumulado - inicio.volumeAcumulado,
  }
}

/**
 * Volume da janela muito acima do normal, com o preco reagindo.
 * Hipotese: fluxo grande inicia movimento que continua.
 */
export function detectarEstouroDeVolume({ volumeJanela, volumeMedioJanela, variacaoPct }, config) {
  if (volumeMedioJanela <= 0) return false
  return volumeJanela >= volumeMedioJanela * config.multiplicador && variacaoPct >= config.variacaoMinima
}

/**
 * Queda forte no par sem queda equivalente no BTC.
 * Hipotese: venda forcada exagera e o preco volta.
 *
 * O filtro do BTC existe para separar "essa moeda caiu" de "o mercado caiu":
 * no segundo caso nao ha exagero pontual a corrigir.
 */
export function detectarQuedaSubita({ variacaoPct, variacaoBtcPct }, config) {
  const caiuForte = variacaoPct <= -config.quedaMinima
  const mercadoEstavel = variacaoBtcPct >= -config.tetoQuedaBtc
  return caiuForte && mercadoEstavel
}

/**
 * Resultado de um sinal: o que o preco fez, e o que sobraria depois de pagar
 * spread, slippage e taxa nas duas pontas.
 */
export function calcularDesfecho({ precoEntrada, precoSaida, custoTotalPct }) {
  const retornoBrutoPct = ((precoSaida - precoEntrada) / precoEntrada) * 100
  return {
    retornoBrutoPct: arredondar(retornoBrutoPct),
    retornoLiquidoPct: arredondar(retornoBrutoPct - custoTotalPct),
  }
}
