/**
 * Monitor de posicao: quanto voce tem, quanto disso e dinheiro seu aportado,
 * e o que mudou desde a ultima execucao.
 *
 * Uso:  node --env-file=.env monitor.mjs
 */

import { criarCliente } from './src/binance/client.mjs'
import { buscarPrecos, buscarSaldos } from './src/binance/carteiras.mjs'
import { consolidarPosicao, resultadoVsAportes } from './src/posicao.mjs'
import { salvarSnapshot, lerSnapshots, lerAportes, lerAlphaManual } from './src/armazenamento.mjs'
import { diasDesde } from './src/datas.mjs'

const LIMIAR_POEIRA = 5 // USDT — abaixo disso a maioria dos pares nao aceita ordem

const chave = process.env.BINANCE_API_KEY
const segredo = process.env.BINANCE_API_SECRET
if (!chave || !segredo) {
  console.error('Faltam BINANCE_API_KEY / BINANCE_API_SECRET.')
  console.error('Rode com: node --env-file=.env monitor.mjs')
  process.exit(1)
}

const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinal = (v) => (v >= 0 ? '+' : '') + num(v)

async function main() {
  const cliente = criarCliente({ chave, segredo })
  const precos = await buscarPrecos()
  const { porCarteira, saldos } = await buscarSaldos(cliente, precos)

  const posicao = consolidarPosicao(saldos, precos, { limiarPoeira: LIMIAR_POEIRA })
  const cotacao = precos.get('USDTBRL')
  const [aportes, alpha, historico] = await Promise.all([lerAportes(), lerAlphaManual(), lerSnapshots()])

  console.log(`\n${'='.repeat(58)}`)
  console.log(`  POSICAO — ${new Date().toLocaleString('pt-BR')}`)
  console.log(`${'='.repeat(58)}`)

  console.log('\nPOR CARTEIRA')
  for (const c of porCarteira) console.log(`  ${c.nome.padEnd(20)} ${num(c.valorUsdt).padStart(10)} USDT`)

  console.log('\nPOR MOEDA')
  for (const i of [...posicao.itens].sort((a, b) => b.valorUsdt - a.valorUsdt)) {
    const etiqueta = i.poeira ? '  poeira (abaixo do minimo de ordem)' : ''
    console.log(`  ${i.ativo.padEnd(10)} ${num(i.valorUsdt, 4).padStart(12)} USDT${etiqueta}`)
  }

  console.log('\nTOTAL')
  console.log(`  Rastreado pela API   ${num(posicao.totalUsdt).padStart(10)} USDT`)

  // O que a API nao alcanca entra explicitamente, com a idade da informacao.
  let totalDeclarado = posicao.totalUsdt
  if (alpha) {
    totalDeclarado += alpha.valorUsdt
    const dias = diasDesde(alpha.dataLeitura)
    console.log(`  Alpha (leitura manual) ${num(alpha.valorUsdt).padStart(8)} USDT   lido ha ${dias} dia(s)`)
    if (dias > 7) console.log(`    Atencao: leitura de mais de uma semana. Atualize data/alpha-manual.json.`)
  } else {
    console.log(`  Alpha                     nao informado — crie data/alpha-manual.json`)
  }
  if (posicao.naoPrecificaveis.length) {
    console.log(`  Sem preco no Spot: ${posicao.naoPrecificaveis.map((n) => n.ativo).join(', ')}`)
  }
  console.log(`  ${'TOTAL'.padEnd(20)} ${num(totalDeclarado).padStart(10)} USDT   =  R$ ${num(totalDeclarado * cotacao)}`)

  console.log('\nSEU DINHEIRO')
  const r = resultadoVsAportes({ totalUsdt: totalDeclarado, cotacaoUsdtBrl: cotacao, aportes })
  if (r.aportadoBrl === 0) {
    console.log('  Nenhum aporte registrado. Preencha data/aportes.json para medir o resultado real.')
  } else {
    console.log(`  Aportado             R$ ${num(r.aportadoBrl).padStart(10)}  (${aportes.length} aporte(s))`)
    console.log(`  Vale hoje            R$ ${num(r.valorAtualBrl).padStart(10)}`)
    console.log(`  Resultado            R$ ${sinal(r.resultadoBrl).padStart(10)}  (${sinal(r.resultadoPct)}%)`)
  }

  const anterior = historico.at(-1)
  if (anterior) {
    const delta = totalDeclarado - anterior.totalUsdt
    const dias = ((Date.now() - new Date(anterior.momento)) / 86_400_000).toFixed(1)
    console.log(`\nDESDE A ULTIMA LEITURA (ha ${dias} dia(s))`)
    console.log(`  ${sinal(delta)} USDT  (${sinal((delta / anterior.totalUsdt) * 100)}%)`)
  }

  await salvarSnapshot({
    momento: new Date().toISOString(),
    totalUsdt: totalDeclarado,
    rastreadoUsdt: posicao.totalUsdt,
    cotacaoUsdtBrl: cotacao,
    itens: posicao.itens.map(({ ativo, quantidade, valorUsdt }) => ({ ativo, quantidade, valorUsdt })),
  })
  console.log(`\n  Snapshot ${historico.length + 1} gravado em data/snapshots.jsonl\n`)
}

main().catch((e) => {
  console.error(`\nFALHOU: ${e.message}`)
  process.exit(1)
})
