/**
 * Simulador de juros compostos por operacao, com as restricoes reais do mercado.
 *
 * Uso:  node simular.mjs [ganhoPctPorOperacao] [operacoesPorDia] [capitalBRL]
 *       node simular.mjs 1 86400 33      (1% por segundo, um dia inteiro)
 *
 * Existe para responder "e se eu ganhar X% varias vezes ao dia?" com aritmetica
 * em vez de entusiasmo. O limite nunca e a matematica — e a liquidez do livro.
 */

import { API } from './src/api.mjs'

const ganhoPct = Number(process.argv[2] ?? 1)
const operacoes = Number(process.argv[3] ?? 86_400)
const capitalBRL = Number(process.argv[4] ?? 33)
const PAR = 'BTCUSDT'

const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })

/** Notacao curta para numeros que passam do absurdo. */
function escala(v) {
  if (!Number.isFinite(v)) return 'infinito (estourou o limite do computador)'
  if (v < 1e6) return `R$ ${num(v)}`
  const expoente = Math.floor(Math.log10(v))
  const nomes = [[1e12, 'trilhao'], [1e9, 'bilhao'], [1e6, 'milhao']]
  for (const [limite, nome] of nomes) {
    if (v >= limite && v < limite * 1000) return `R$ ${num(v / limite)} ${nome}(es)`
  }
  return `R$ 10^${expoente}  (1 seguido de ${expoente} zeros)`
}

/** Quantos USDT cabem no livro antes de o preco subir `limitePct`. */
async function liquidezAte(par, limitePct) {
  const r = await fetch(`${API}/api/v3/depth?symbol=${par}&limit=5000`)
  const livro = await r.json()
  const melhor = Number(livro.asks[0][0])
  const teto = melhor * (1 + limitePct / 100)
  let absorvido = 0
  for (const [precoStr, qtdStr] of livro.asks) {
    const preco = Number(precoStr)
    if (preco > teto) break
    absorvido += preco * Number(qtdStr)
  }
  return { absorvido, niveis: livro.asks.length }
}

async function main() {
  const fator = 1 + ganhoPct / 100

  console.log(`\nSIMULACAO`)
  console.log(`  Capital inicial      R$ ${num(capitalBRL)}`)
  console.log(`  Ganho por operacao   ${num(ganhoPct)} % (ja liquido de taxa)`)
  console.log(`  Operacoes            ${num(operacoes, 0)}`)

  const final = capitalBRL * fator ** operacoes
  console.log(`\nRESULTADO MATEMATICO`)
  console.log(`  ${escala(final)}`)

  // Marcos: quantas operacoes para atingir cada patamar.
  console.log(`\nQUANDO CADA PATAMAR SERIA ATINGIDO`)
  const marcos = [
    [1e6, 'R$ 1 milhao'],
    [1e9, 'R$ 1 bilhao'],
    [1.04e9 * 5.1, 'o volume diario inteiro de BTC/USDT na Binance'],
    [1e14, 'o PIB mundial de um ano'],
  ]
  for (const [alvo, nome] of marcos) {
    const n = Math.log(alvo / capitalBRL) / Math.log(fator)
    if (n > operacoes) {
      console.log(`  ${nome.padEnd(48)} nao alcancado`)
      continue
    }
    const seg = Math.round(n)
    const tempo = seg < 120 ? `${seg} s` : `${num(seg / 60, 0)} min`
    console.log(`  ${nome.padEnd(48)} operacao ${num(seg, 0).padStart(7)}  (${tempo})`)
  }

  // A restricao que a matematica ignora.
  console.log(`\nRESTRICAO REAL — liquidez do livro de ${PAR}`)
  const { absorvido, niveis } = await liquidezAte(PAR, ganhoPct)
  const absorvidoBRL = absorvido * 5.1
  console.log(`  Comprando a mercado, o livro absorve  R$ ${num(absorvidoBRL, 0)}`)
  console.log(`  antes de o proprio preco subir ${num(ganhoPct)}% (${niveis} niveis lidos).`)
  console.log(`  Acima disso, VOCE vira o movimento de 1% — e compra de si mesmo.`)

  const nLimite = Math.log(absorvidoBRL / capitalBRL) / Math.log(fator)
  console.log(`\n  Seu capital passa desse limite na operacao ${num(Math.round(nLimite), 0)}`)
  console.log(`  — ou seja, depois de ${num(Math.round(nLimite) / 60, 0)} minutos a simulacao deixa`)
  console.log(`  de descrever um mercado e passa a descrever uma planilha.\n`)
}

main().catch((e) => {
  console.error(`FALHOU: ${e.message}`)
  process.exit(1)
})
