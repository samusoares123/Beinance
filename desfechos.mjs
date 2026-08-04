/**
 * Julga os sinais gravados: o que o preco fez depois, liquido de custo.
 *
 * Uso:  node desfechos.mjs
 *
 * Roda a qualquer momento — os desfechos vem dos candles historicos, entao nao
 * importa se o PC estava ligado. Sinais recentes demais ficam pendentes.
 */

import { calcularDesfecho } from './src/sinais.mjs'
import { lerSinais, regravarSinais } from './src/armazenamento.mjs'

const BASE = 'https://api.binance.com'
const HORIZONTES = [
  { nome: '15min', ms: 15 * 60_000 },
  { nome: '1h', ms: 60 * 60_000 },
  { nome: '4h', ms: 4 * 60 * 60_000 },
]

const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v) => (v >= 0 ? '+' : '') + num(v)

/** Preco de fechamento do minuto que contem `instante`. */
async function precoEm(simbolo, instante) {
  const r = await fetch(`${BASE}/api/v3/klines?symbol=${simbolo}&interval=1m&startTime=${instante}&limit=1`)
  const velas = await r.json()
  if (!Array.isArray(velas) || velas.length === 0) return null
  return Number(velas[0][4])
}

async function main() {
  const sinais = await lerSinais()
  if (sinais.length === 0) {
    console.log('Nenhum sinal gravado ainda. Rode `node scanner.mjs` e deixe coletando.')
    return
  }

  let julgados = 0
  let pendentes = 0

  for (const s of sinais) {
    if (s.desfechos) continue
    const entrada = new Date(s.momento).getTime()
    const maduro = Date.now() - entrada >= HORIZONTES.at(-1).ms

    if (!maduro) {
      pendentes++
      continue
    }

    const desfechos = {}
    for (const h of HORIZONTES) {
      const preco = await precoEm(s.simbolo, entrada + h.ms)
      if (preco === null) continue
      desfechos[h.nome] = calcularDesfecho({
        precoEntrada: s.precoEntrada,
        precoSaida: preco,
        custoTotalPct: s.custoTotalPct,
      })
    }
    s.desfechos = desfechos
    julgados++
  }

  if (julgados) await regravarSinais(sinais)

  console.log(`\n${sinais.length} sinal(is) no arquivo — ${julgados} julgado(s) agora, ${pendentes} ainda maturando.\n`)

  // --- resumo por regra: a resposta que o projeto inteiro existe para dar ---
  const porRegra = new Map()
  for (const s of sinais) {
    if (!s.desfechos) continue
    if (!porRegra.has(s.regra)) porRegra.set(s.regra, [])
    porRegra.get(s.regra).push(s)
  }

  if (porRegra.size === 0) {
    console.log('Nenhum sinal maduro o bastante para julgar (precisa de 4h de historia).')
    return
  }

  for (const [regra, lista] of porRegra) {
    console.log(`${regra}   (${lista.length} sinais)`)
    for (const h of HORIZONTES) {
      const valores = lista.map((s) => s.desfechos[h.nome]?.retornoLiquidoPct).filter((v) => v !== undefined)
      if (!valores.length) continue
      const media = valores.reduce((a, b) => a + b, 0) / valores.length
      const positivos = valores.filter((v) => v > 0).length
      console.log(
        `  ${h.nome.padEnd(6)} media ${sinalDe(media).padStart(8)}%   ` +
          `positivos ${positivos}/${valores.length} (${num((positivos / valores.length) * 100, 0)}%)`,
      )
    }
    console.log()
  }

  console.log('Media liquida negativa = a regra perde dinheiro depois dos custos.')
  console.log('Poucos sinais = numero sem significado. Espere acumular antes de decidir.\n')
}

main().catch((e) => {
  console.error(`\nFALHOU: ${e.message}`)
  process.exit(1)
})
