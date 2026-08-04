/**
 * Dossie de decisao de uma moeda, no terminal.
 *
 * Uso:  node dossie.mjs HOME
 *       node dossie.mjs TUTUSDT 1h 33
 *
 * Publico — nao usa chave, nao executa ordem. O calculo vive em
 * src/montar-dossie.mjs; aqui so ha apresentacao.
 *
 * O QUE ESTE COMANDO NAO FAZ: dizer para onde a moeda vai. Ele responde
 * "nas N vezes que esta moeda esteve nesta situacao, o que aconteceu depois?"
 */

import { montarDossie, HORIZONTES } from './src/montar-dossie.mjs'

const entrada = process.argv[2]
if (!entrada) {
  console.error('Uso: node dossie.mjs <MOEDA> [intervalo] [capital]   ex: node dossie.mjs HOME 1h 33')
  process.exit(1)
}

const num = (v, c = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v, c = 2) => (v === null || v === undefined ? '—' : (v >= 0 ? '+' : '') + num(v, c))
const titulo = (t) => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`)

const d = await montarDossie({
  par: entrada,
  intervalo: process.argv[3] ?? '1h',
  capitalUsdt: Number(process.argv[4] ?? 33),
}).catch((e) => {
  console.error(`\nFALHOU: ${e.message}`)
  process.exit(1)
})

console.log(`\n╔${'═'.repeat(70)}╗`)
console.log(`║  DOSSIE ${d.par.padEnd(14)} velas de ${d.intervalo.padEnd(4)} · capital US$ ${String(d.capitalUsdt).padEnd(6)} · UTC${d.fuso}      ║`)
console.log(`╚${'═'.repeat(70)}╝`)

titulo('1. QUANTO CUSTA ENTRAR E SAIR AGORA')
console.log(`  preco                 US$ ${d.preco}`)
console.log(`  spread                ${num(d.spreadPct, 3)}%`)
console.log(`  tick como % do preco  ${num(d.tickPct, 4)}%`)
console.log(`  taxa (2 lados)        ${num(d.taxaPct, 2)}%`)
console.log(`  slippage              ${num(d.slippagePct, 3)}%${d.livroRaso ? '  ⚠ livro raso demais' : ''}`)
console.log(`  ─────────────────────────────`)
console.log(`  CUSTO IDA E VOLTA     ${num(d.custoRealPct, 3)}%  ← o preco precisa subir mais que isso so para empatar`)
console.log(`\n  minNotional do par    ${d.minNotional} USDT`)
if (d.tamanhoUsdt === null) {
  console.log(`  ⛔ POSICAO INVIAVEL   ${d.motivoInviavel}`)
} else {
  console.log(`  posicao sugerida      US$ ${num(d.tamanhoUsdt)}  (piso de abertura US$ ${num(d.pisoDeAbertura)})`)
  console.log(`  queda maxima tolerada ${num(d.quedaAteOMinimoPct, 1)}% antes de a venda ser recusada por tamanho`)
}

titulo('2. ONDE ELA ESTA')
console.log(`  historico lido        ${num(d.velasLidas, 0)} velas de ${d.intervalo}`)
console.log(`  desde                 ${d.primeiraVela ? new Date(d.primeiraVela).toISOString().slice(0, 10) : '—'}`)
console.log(`  faixa (${num(d.faixa.velas, 0)} velas)   US$ ${d.faixa.minimo}  ───  US$ ${d.faixa.maximo}`)
console.log(`  posicao na faixa      ${num(d.faixa.posicaoPct, 1)}%   (100 = no topo da faixa)`)
console.log(`  RSI(14)               ${num(d.rsi, 1)}`)
console.log(`  maior queda do topo   ${num(d.maiorQuedaPct, 1)}%   ← ja aconteceu, pode acontecer de novo`)
console.log(`  volume 24h            US$ ${num(d.volume24hUsdt, 0)}`)
console.log(`  variacao 24h          ${sinalDe(d.variacao24hPct)}%`)

titulo('3. PADROES FECHANDO NA VELA ATUAL')
console.log(d.padroesAgora.length === 0 ? '  Nenhum dos quatro padroes fecha nesta vela.' : `  ${d.padroesAgora.join(', ')}`)
console.log(`\n  Lembrete da medicao de 03-04/08: em 146 mil velas, nenhum destes quatro`)
console.log(`  padroes mostrou vantagem estavel sobre comprar em vela aleatoria.`)

titulo('4. O QUE JA ACONTECEU DEPOIS DE CADA PADRAO — NESTA MOEDA')
for (const p of d.padroes) {
  console.log(`\n  ${p.nome.toUpperCase()}   ${p.ocorrencias} ocorrencia(s)${p.acontecendoAgora ? '  ◀ ACONTECENDO AGORA' : ''}`)
  if (!p.amostraSuficiente) {
    console.log(`    Amostra pequena demais. Nao ha o que ler aqui.`)
    continue
  }
  console.log(`    ${'depois de'.padEnd(11)} ${'mediana'.padStart(9)} ${'media'.padStart(9)} ${'positivos'.padStart(10)} ${'pior queda'.padStart(11)}`)
  for (const l of p.linhas) {
    console.log(
      `    ${(l.horizonte + ' velas').padEnd(11)} ${(sinalDe(l.mediana) + '%').padStart(9)} ${(sinalDe(l.media) + '%').padStart(9)} ` +
        `${(num(l.positivos, 0) + '%').padStart(10)} ${(num(l.piorQueda10, 1) + '%').padStart(11)}`,
    )
  }
}
console.log(`\n  "pior queda" = percentil 10 do mergulho maximo durante a operacao.`)

titulo('5. ESTE DIA E ESTA HORA, NO HISTORICO DESTA MOEDA')
const c = d.calendario
console.log(`  agora e ${c.nomeDia}, ${String(c.hora).padStart(2, '0')}h (UTC${d.fuso})\n`)
console.log(`  todas as ${c.nomeDia}s   media ${sinalDe(c.porDia.media, 3)}%   positivos ${num(c.porDia.positivos, 0)}%   (${num(c.porDia.n, 0)} velas)`)
console.log(`  todas as ${String(c.hora).padStart(2, '0')}h        media ${sinalDe(c.porHora.media, 3)}%   positivos ${num(c.porHora.positivos, 0)}%   (${num(c.porHora.n, 0)} velas)`)
console.log(`\n  Escala: o custo de operar e ${num(d.custoRealPct, 2)}%. Nenhum efeito de calendario`)
console.log(`  desta escala paga o proprio custo.`)

titulo('6. ONDE COLOCAR O STOP')
console.log(`  Baseado em ${num(d.stop.janelas, 0)} janelas de 12 velas desta moeda:\n`)
for (const s of d.stop.testados) {
  const aviso = s.acionadoPct > 40 ? '  ← te tira da posicao cedo demais' : s.acionadoPct < 5 ? '  ← quase nunca protege' : ''
  console.log(`    ${('-' + s.stopPct + '%').padEnd(9)} ${(num(s.acionadoPct, 1) + '% das janelas').padStart(18)}${aviso}`)
}
console.log(`\n  A moeda mergulha ${num(d.stop.p10, 1)}% ou mais em 10% das janelas de 12 velas.`)
console.log(`  Um stop mais apertado que isso e acionado por oscilacao normal, nao por perigo.`)
if (d.quedaAteOMinimoPct !== null) {
  console.log(`\n  ⚠ TETO DURO: sua posicao de US$ ${num(d.tamanhoUsdt)} so pode cair ${num(d.quedaAteOMinimoPct, 1)}% antes de`)
  console.log(`    a venda ser recusada por ${d.minNotional} USDT de minimo. O stop precisa estar na`)
  console.log(`    corretora — nao no seu monitoramento.`)
}

console.log(`\n${'─'.repeat(72)}`)
console.log(`Isto e distribuicao do passado, nao previsao. Nada aqui diz que a moeda vai subir.`)
console.log(`${'─'.repeat(72)}\n`)
