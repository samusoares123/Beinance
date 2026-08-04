/**
 * Desempenho das operacoes simuladas — consultavel com o robo rodando.
 *
 * Uso:  node desempenho.mjs
 */

import { lerOperacoes, lerEstadoRobo } from './src/armazenamento.mjs'
import { resumoDoDia } from './src/risco.mjs'

const ALVO_PCT = 3
const STOP_PCT = 2
const TAXA_POR_LADO = 0.075

const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v) => (v >= 0 ? '+' : '') + num(v)

const operacoes = await lerOperacoes()
const estado = await lerEstadoRobo(33)

if (operacoes.length === 0) {
  console.log('\nNenhuma operacao fechada ainda. Deixe `node robo.mjs` rodando.\n')
  process.exit(0)
}

const r = resumoDoDia(operacoes)
const equilibrio = ((STOP_PCT + TAXA_POR_LADO * 2) / (ALVO_PCT + STOP_PCT)) * 100

console.log(`\nDESEMPENHO — simulado, nenhuma ordem enviada`)
console.log(`  Operacoes fechadas   ${r.total}`)
console.log(`  Vencedoras           ${r.vencedoras}  (${num(r.acertoPct, 1)}%)`)
console.log(`  Resultado            US$ ${sinalDe(r.resultadoUsdt)}`)
console.log(`  Caixa + posicoes     US$ ${num(estado.capitalUsdt + estado.posicoes.reduce((s, p) => s + p.tamanhoUsdt, 0))}`)

console.log(`\n  Precisa acertar ${num(equilibrio, 1)}% para empatar (alvo ${ALVO_PCT}% / stop ${STOP_PCT}%).`)
console.log(
  `  Seu acerto esta ${r.acertoPct >= equilibrio ? 'ACIMA' : 'ABAIXO'} disso ` +
    `por ${num(Math.abs(r.acertoPct - equilibrio), 1)} ponto(s).`,
)

// --- por regra: qual das duas hipoteses funciona ---
const porRegra = new Map()
for (const o of operacoes) {
  if (!porRegra.has(o.regra)) porRegra.set(o.regra, [])
  porRegra.get(o.regra).push(o)
}
console.log(`\nPOR REGRA`)
for (const [regra, lista] of porRegra) {
  const x = resumoDoDia(lista)
  console.log(`  ${regra.padEnd(18)} ${String(x.total).padStart(4)} ops | acerto ${num(x.acertoPct, 1).padStart(5)}% | US$ ${sinalDe(x.resultadoUsdt)}`)
}

// --- por motivo de saida: alvo, stop ou tempo ---
const porMotivo = new Map()
for (const o of operacoes) porMotivo.set(o.motivo, (porMotivo.get(o.motivo) ?? 0) + 1)
console.log(`\nCOMO AS OPERACOES TERMINARAM`)
for (const [motivo, n] of porMotivo) {
  console.log(`  ${motivo.padEnd(8)} ${String(n).padStart(4)}  (${num((n / operacoes.length) * 100, 0)}%)`)
}

if (r.total < 30) {
  console.log(`\n  ATENCAO: ${r.total} operacoes nao sustentam conclusao nenhuma.`)
  console.log(`  Abaixo de ~30, a diferenca entre sorte e vantagem e indistinguivel.`)
}
console.log()
