/**
 * Datas sem hora (AAAA-MM-DD) sao armadilha em JavaScript.
 *
 * `new Date('2026-08-03')` e interpretado como meia-noite UTC. Ao formatar em
 * UTC-3, volta para 02/08. Aqui elas sao tratadas como data civil local, que e o
 * que o usuario quis dizer ao anotar "li o saldo do Alpha neste dia".
 */

/** '2026-08-03' → Date na meia-noite LOCAL. */
export function comoDataLocal(texto) {
  const [ano, mes, dia] = texto.split('-').map(Number)
  return new Date(ano, mes - 1, dia)
}

/** '2026-08-03' → '03/08/2026' */
export function formatarDataBR(texto) {
  const [ano, mes, dia] = texto.split('-')
  return `${dia}/${mes}/${ano}`
}

/** Dias civis inteiros entre a data e agora. Meia-noite vira 1, nao 0,4. */
export function diasDesde(texto, agora = new Date()) {
  const inicio = comoDataLocal(texto)
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.round((hoje - inicio) / 86_400_000)
}
