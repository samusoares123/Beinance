/**
 * Supervisor do robo: mantem ele vivo a noite toda e escreve o relatorio.
 *
 * Uso:  node vigia.mjs        (deixe rodando; Ctrl+C encerra os dois)
 *
 * Faz tres coisas que o robo sozinho nao faz:
 *   1. reinicia se ele morrer, com espera crescente
 *   2. registra tudo com carimbo de hora em data/vigia.log
 *   3. atualiza data/RELATORIO.txt a cada 15 min — e esse arquivo que voce le
 *      de manha, sem precisar rolar log nenhum
 */

import { spawn } from 'node:child_process'
import { appendFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

import { lerOperacoes, lerEstadoRobo } from './src/armazenamento.mjs'
import { resumoDoDia } from './src/risco.mjs'

const LOG = 'data/vigia.log'
const RELATORIO = 'data/RELATORIO.txt'
const INTERVALO_RELATORIO = 15 * 60_000
const ESPERA_MAXIMA = 60_000

const CFG = { capitalInicial: 33, alvoPct: 3, stopPct: 2, taxaPorLado: 0.075 }

let processo = null
let reinicios = 0
let encerrando = false
const inicio = Date.now()

const carimbo = () => new Date().toLocaleString('pt-BR')
const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v) => (v >= 0 ? '+' : '') + num(v)

async function registrar(linha) {
  if (!existsSync('data')) await mkdir('data', { recursive: true })
  const texto = `${carimbo()}  ${linha}\n`
  process.stdout.write(texto)
  await appendFile(LOG, texto, 'utf8').catch(() => {})
}

function iniciarRobo() {
  processo = spawn(process.execPath, ['robo.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] })

  const consumir = (fluxo, prefixo) => {
    let resto = ''
    fluxo.setEncoding('utf8')
    fluxo.on('data', (pedaco) => {
      const linhas = (resto + pedaco).split('\n')
      resto = linhas.pop()
      for (const l of linhas) if (l.trim()) registrar(`${prefixo}${l}`)
    })
  }
  consumir(processo.stdout, '')
  consumir(processo.stderr, 'ERRO| ')

  processo.on('exit', (codigo) => {
    if (encerrando) return
    reinicios++
    const espera = Math.min(ESPERA_MAXIMA, 2 ** Math.min(reinicios, 6) * 1000)
    registrar(`VIGIA: robo saiu com codigo ${codigo}. Reinicio ${reinicios} em ${espera / 1000}s.`)
    setTimeout(iniciarRobo, espera)
  })
}

/** O arquivo que voce abre de manha. Sobrescrito, nao acumulado. */
async function escreverRelatorio() {
  const [operacoes, estado] = await Promise.all([lerOperacoes(), lerEstadoRobo(CFG.capitalInicial)])
  const r = resumoDoDia(operacoes)
  const emPosicao = estado.posicoes.reduce((s, p) => s + p.tamanhoUsdt, 0)
  const total = estado.capitalUsdt + emPosicao
  const equilibrio = ((CFG.stopPct + CFG.taxaPorLado * 2) / (CFG.alvoPct + CFG.stopPct)) * 100
  const horas = (Date.now() - inicio) / 3_600_000

  // Somente ASCII neste arquivo: ele e lido no Bloco de Notas / terminal do
  // Windows, onde acentuacao e travessao viram lixo dependendo do encoding.
  const l = []
  l.push(`RELATORIO DA NOITE - MODO SIMULADO, NENHUMA ORDEM FOI ENVIADA`)
  l.push(`Atualizado em ${carimbo()}   |   rodando ha ${num(horas, 1)} h`)
  l.push('')
  l.push(`CAPITAL`)
  l.push(`  Inicial            US$ ${num(CFG.capitalInicial)}`)
  l.push(`  Caixa              US$ ${num(estado.capitalUsdt)}`)
  l.push(`  Em ${String(estado.posicoes.length).padStart(2)} posicao(oes)   US$ ${num(emPosicao)}`)
  l.push(`  Total              US$ ${num(total)}   (${sinalDe(((total - CFG.capitalInicial) / CFG.capitalInicial) * 100)}%)`)
  l.push('')

  if (r.total === 0) {
    l.push(`OPERACOES`)
    l.push(`  Nenhuma fechada ainda.`)
    l.push(`  Sinal exige volume 5x a media com preco subindo 2% em 5 min:`)
    l.push(`  silencio aqui e resultado valido, nao falha.`)
  } else {
    l.push(`OPERACOES`)
    l.push(`  Fechadas           ${r.total}`)
    l.push(`  Vencedoras         ${r.vencedoras}  (${num(r.acertoPct, 1)}%)`)
    l.push(`  Resultado          US$ ${sinalDe(r.resultadoUsdt)}`)
    l.push(`  Precisa acertar    ${num(equilibrio, 1)}% para empatar`)
    l.push(`  Voce esta ${r.acertoPct >= equilibrio ? 'ACIMA' : 'ABAIXO'} por ${num(Math.abs(r.acertoPct - equilibrio), 1)} ponto(s)`)
    l.push(`  (com menos de 30 operacoes, esse numero ainda e ruido)`)
    l.push('')

    const porRegra = new Map()
    for (const o of operacoes) {
      if (!porRegra.has(o.regra)) porRegra.set(o.regra, [])
      porRegra.get(o.regra).push(o)
    }
    l.push(`POR REGRA`)
    for (const [regra, lista] of porRegra) {
      const x = resumoDoDia(lista)
      l.push(`  ${regra.padEnd(18)} ${String(x.total).padStart(3)} ops | acerto ${num(x.acertoPct, 1).padStart(5)}% | US$ ${sinalDe(x.resultadoUsdt)}`)
    }
    l.push('')

    const porMotivo = new Map()
    for (const o of operacoes) porMotivo.set(o.motivo, (porMotivo.get(o.motivo) ?? 0) + 1)
    l.push(`COMO TERMINARAM`)
    for (const [motivo, n] of porMotivo) l.push(`  ${motivo.padEnd(8)} ${String(n).padStart(3)}  (${num((n / r.total) * 100, 0)}%)`)
    l.push('')

    l.push(`ULTIMAS 5`)
    for (const o of operacoes.slice(-5).reverse()) {
      l.push(
        `  ${new Date(o.fechamentoEm).toLocaleTimeString('pt-BR')}  ${o.simbolo.padEnd(12)} ` +
          `${o.motivo.padEnd(5)} ${sinalDe(o.resultadoPct).padStart(7)}%  US$ ${sinalDe(o.resultadoUsdt)}`,
      )
    }
    l.push('')

    if (r.total < 30) {
      l.push(`AVISO: ${r.total} operacoes nao sustentam conclusao.`)
      l.push(`Abaixo de ~30, sorte e vantagem sao indistinguiveis.`)
    }
  }

  l.push('')
  l.push(`SAUDE`)
  l.push(`  Reinicios do robo  ${reinicios}${reinicios > 3 ? '   <-- olhar data/vigia.log, algo o derruba' : ''}`)
  l.push(`  Ordens enviadas    0   (o projeto nao possui funcao de ordem)`)
  l.push('')

  if (!existsSync('data')) await mkdir('data', { recursive: true })
  await writeFile(RELATORIO, l.join('\n'), 'utf8')
}

const encerrar = async () => {
  encerrando = true
  processo?.kill()
  await escreverRelatorio()
  await registrar('VIGIA: encerrado. Relatorio em data/RELATORIO.txt')
  process.exit(0)
}
process.on('SIGINT', encerrar)

await registrar(`VIGIA: iniciado. Relatorio em ${RELATORIO} a cada ${INTERVALO_RELATORIO / 60_000} min.`)
iniciarRobo()
await escreverRelatorio()
setInterval(() => escreverRelatorio().catch((e) => registrar(`VIGIA: erro no relatorio — ${e.message}`)), INTERVALO_RELATORIO)
