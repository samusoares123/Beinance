/**
 * Limites de risco. Puro, e deliberadamente pessimista: na duvida, nao abre.
 *
 * A ordem das verificacoes importa. O kill switch vem primeiro porque ele
 * responde "o dia deu errado o bastante para parar tudo?" — pergunta que
 * antecede qualquer outra.
 */

const arredondar = (v, casas = 2) => {
  const f = 10 ** casas
  return Math.round(v * f) / f
}

export function podeAbrir(estado, limites) {
  const { posicoesAbertas, stopsSeguidos, capitalAtual, capitalInicioDoDia } = estado
  const { maxPosicoes, maxStopsSeguidos, quedaMaximaDiaPct } = limites

  const quedaPct = ((capitalInicioDoDia - capitalAtual) / capitalInicioDoDia) * 100
  if (quedaPct >= quedaMaximaDiaPct) {
    return { pode: false, motivo: `kill switch: capital caiu ${arredondar(quedaPct)}% hoje` }
  }
  if (stopsSeguidos >= maxStopsSeguidos) {
    return { pode: false, motivo: `${stopsSeguidos} stops seguidos: encerrado por hoje o dia` }
  }
  if (posicoesAbertas >= maxPosicoes) {
    return { pode: false, motivo: `${posicoesAbertas} posicoes simultaneas no limite` }
  }
  return { pode: true, motivo: null }
}

/**
 * Desempenho das operacoes ja fechadas.
 * Sem operacoes, o acerto e `null` — desconhecido nao e zero.
 */
export function resumoDoDia(operacoes) {
  if (operacoes.length === 0) {
    return { total: 0, vencedoras: 0, acertoPct: null, resultadoUsdt: 0 }
  }

  const vencedoras = operacoes.filter((o) => o.resultadoUsdt > 0).length
  const resultadoUsdt = operacoes.reduce((soma, o) => soma + o.resultadoUsdt, 0)

  return {
    total: operacoes.length,
    vencedoras,
    acertoPct: arredondar((vencedoras / operacoes.length) * 100),
    resultadoUsdt: arredondar(resultadoUsdt),
  }
}
