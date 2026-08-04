/**
 * Scanner ao vivo: acompanha todos os pares USDT elegiveis e grava os sinais.
 *
 * Uso:  node scanner.mjs           (Ctrl+C para parar)
 *
 * Nao precisa de chave — dados de mercado sao publicos.
 * Nao executa nada: apenas observa e grava. O julgamento dos sinais e feito
 * depois, por desfechos.mjs, a partir dos candles.
 */

import { detectarEstouroDeVolume, detectarQuedaSubita, janelaDe } from './src/sinais.mjs'
import { custoIdaVolta, slippageDeCompra } from './src/analise.mjs'
import { gravarSinal } from './src/armazenamento.mjs'

import { API, STREAM as BASE_STREAM } from './src/api.mjs'
const BASE = API
/**
 * !miniTicker@arr, nao !ticker@arr.
 *
 * Ambos cobrem o mercado inteiro a cada 1s. O !ticker@arr carrega as estatisticas
 * completas de 24h de ~3000 simbolos — frames de centenas de KB que o caminho de
 * rede descarta silenciosamente (medido: 0 mensagens em 20s, enquanto o
 * miniTicker entregava 8 em 10s com frames de 10 KB).
 *
 * O scanner le apenas s (simbolo), c (preco) e q (volume em USDT), os tres
 * presentes no miniTicker. Nada se perde.
 */
const STREAM = `${BASE_STREAM}/ws/!miniTicker@arr`

const TAXA_POR_LADO = 0.1
const LIMITES = { custoTotalPct: 0.5, tickPct: 0.1, volume24hUsdt: 100_000 }

const CFG = {
  volume: { multiplicador: 5, variacaoMinima: 2 },
  queda: { quedaMinima: 5, tetoQuedaBtc: 1 },
}

const INTERVALO_AMOSTRA = 15_000 // ms entre amostras por par
const JANELA_ESTOURO = 5 * 60_000
const JANELA_QUEDA = 10 * 60_000
const TOLERANCIA_JANELA = 60_000 // quanto a amostra pode desviar do inicio ideal
const RETENCAO = 20 * 60_000 // historico mantido por par
const ESPERA_ENTRE_SINAIS = 30 * 60_000 // nao repetir o mesmo par/regra por 30min

const historico = new Map() // simbolo → [{ t, preco, volumeAcumulado }]
const ultimoSinal = new Map() // `${simbolo}:${regra}` → timestamp
let elegiveis = new Set()
let contagemSinais = 0
let mensagensRecebidas = 0

const agora = () => new Date().toLocaleTimeString('pt-BR')
const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })

async function buscar(caminho) {
  const r = await fetch(`${BASE}${caminho}`)
  if (!r.ok) throw new Error(`${caminho} → ${r.status}`)
  return r.json()
}

/** Pares que valem a pena observar: baratos de operar e com liquidez. */
async function montarElegiveis() {
  const [info, livros, tickers] = await Promise.all([
    buscar('/api/v3/exchangeInfo'),
    buscar('/api/v3/ticker/bookTicker'),
    buscar('/api/v3/ticker/24hr'),
  ])

  const mapaLivro = new Map(livros.map((l) => [l.symbol, l]))
  const mapaTicker = new Map(tickers.map((t) => [t.symbol, t]))
  const aprovados = new Set()
  let avaliados = 0

  for (const s of info.symbols) {
    if (s.quoteAsset !== 'USDT' || s.status !== 'TRADING' || !s.isSpotTradingAllowed) continue
    const livro = mapaLivro.get(s.symbol)
    const ticker = mapaTicker.get(s.symbol)
    if (!livro || !ticker) continue

    const bid = Number(livro.bidPrice)
    const ask = Number(livro.askPrice)
    if (bid <= 0 || ask <= 0) continue
    avaliados++

    const preco = (bid + ask) / 2
    const tick = Number(s.filters.find((f) => f.filterType === 'PRICE_FILTER').tickSize)
    const { custoTotalPct } = custoIdaVolta({ bid, ask, taxaPorLado: TAXA_POR_LADO })

    if (custoTotalPct > LIMITES.custoTotalPct) continue
    if ((tick / preco) * 100 > LIMITES.tickPct) continue
    if (Number(ticker.quoteVolume) < LIMITES.volume24hUsdt) continue
    aprovados.add(s.symbol)
  }

  // Saida em ASCII: este processo costuma ser redirecionado para arquivo de log.
  console.log(`${avaliados} pares USDT avaliados -> ${aprovados.size} passam no filtro de custo e liquidez.`)
  console.log(`Descartados: ${avaliados - aprovados.size} (caros de operar ou sem liquidez).`)
  return aprovados
}

function amostrar(simbolo, preco, volumeAcumulado) {
  let serie = historico.get(simbolo)
  if (!serie) historico.set(simbolo, (serie = []))

  const t = Date.now()
  if (serie.length && t - serie.at(-1).t < INTERVALO_AMOSTRA) return null

  serie.push({ t, preco, volumeAcumulado })
  // Retencao por tempo, nao por contagem: par pouco negociado amostra devagar e
  // perderia o inicio da janela se a poda fosse por numero de amostras.
  while (serie.length && t - serie[0].t > RETENCAO) serie.shift()
  return serie
}

async function registrar(simbolo, regra, dados) {
  const chave = `${simbolo}:${regra}`
  const ultimo = ultimoSinal.get(chave) ?? 0
  if (Date.now() - ultimo < ESPERA_ENTRE_SINAIS) return
  ultimoSinal.set(chave, Date.now())

  // O livro no momento do sinal e o dado que backtest nenhum reconstroi.
  const livro = await buscar(`/api/v3/depth?symbol=${simbolo}&limit=50`)
  const bid = Number(livro.bids[0][0])
  const ask = Number(livro.asks[0][0])
  const { spreadPct, custoTotalPct } = custoIdaVolta({ bid, ask, taxaPorLado: TAXA_POR_LADO })
  const slip = slippageDeCompra(livro.asks, 5)

  const sinal = {
    momento: new Date().toISOString(),
    simbolo,
    regra,
    precoEntrada: ask, // comprando a mercado, paga-se o ask
    spreadPct,
    slippagePct: slip.slippagePct,
    custoTotalPct: custoTotalPct + slip.slippagePct * 2,
    ...dados,
    desfechos: null, // preenchido depois por desfechos.mjs
  }

  await gravarSinal(sinal)
  contagemSinais++
  console.log(
    `${agora()}  ${regra.padEnd(18)} ${simbolo.padEnd(14)} ` +
      `entrada ${ask}  custo ${num(sinal.custoTotalPct, 3)}%  ${dados.detalhe ?? ''}`,
  )
}

function processar(tickers) {
  const btc = tickers.find((t) => t.s === 'BTCUSDT')
  if (btc) amostrar('BTCUSDT', Number(btc.c), Number(btc.q))
  const serieBtc = historico.get('BTCUSDT')
  const janelaBtc = serieBtc ? janelaDe(serieBtc, JANELA_QUEDA, TOLERANCIA_JANELA) : null

  for (const t of tickers) {
    if (!elegiveis.has(t.s)) continue
    const serie = amostrar(t.s, Number(t.c), Number(t.q))
    if (!serie) continue

    const janela5 = janelaDe(serie, JANELA_ESTOURO, TOLERANCIA_JANELA)
    if (janela5) {
      const volumeMedioJanela = Number(t.q) / 288 // 24h divididas em janelas de 5 min
      const dados = {
        volumeJanela: janela5.volumeJanela,
        volumeMedioJanela,
        variacaoPct: janela5.variacaoPct,
        janelaSegundos: janela5.duracaoSegundos,
      }
      if (detectarEstouroDeVolume(dados, CFG.volume)) {
        registrar(t.s, 'estouro-volume', {
          ...dados,
          detalhe: `+${num(janela5.variacaoPct)}% em ${janela5.duracaoSegundos}s, volume ${num(janela5.volumeJanela / volumeMedioJanela, 1)}x o normal`,
        }).catch((e) => console.error(`  erro ao registrar ${t.s}: ${e.message}`))
      }
    }

    const janela10 = janelaDe(serie, JANELA_QUEDA, TOLERANCIA_JANELA)
    if (janela10 && janelaBtc) {
      const dados = {
        variacaoPct: janela10.variacaoPct,
        variacaoBtcPct: janelaBtc.variacaoPct,
        janelaSegundos: janela10.duracaoSegundos,
      }
      if (detectarQuedaSubita(dados, CFG.queda)) {
        registrar(t.s, 'queda-subita', {
          ...dados,
          detalhe: `${num(janela10.variacaoPct)}% em ${janela10.duracaoSegundos}s com BTC em ${num(janelaBtc.variacaoPct)}%`,
        }).catch((e) => console.error(`  erro ao registrar ${t.s}: ${e.message}`))
      }
    }
  }
}

function conectar(tentativa = 0) {
  const ws = new WebSocket(STREAM)

  ws.addEventListener('open', () => {
    console.log(`${agora()}  conectado. Aguardando ${JANELA_ESTOURO / 60_000} min para a primeira janela fechar.\n`)
  })

  ws.addEventListener('message', (ev) => {
    try {
      mensagensRecebidas++
      processar(JSON.parse(ev.data))
    } catch (e) {
      console.error(`erro ao processar mensagem: ${e.message}`)
    }
  })

  ws.addEventListener('close', () => {
    const espera = Math.min(30_000, 2 ** tentativa * 1000)
    console.warn(`${agora()}  conexao caiu — LACUNA nos dados. Reconectando em ${espera / 1000}s.`)
    setTimeout(() => conectar(tentativa + 1), espera)
  })

  ws.addEventListener('error', () => ws.close())
}

/** Pulso de status: sem isto, o scanner fica minutos em silencio e parece travado. */
function iniciarPulso() {
  const inicio = Date.now()
  setInterval(() => {
    const series = [...historico.values()]
    const prontos = series.filter((s) => janelaDe(s, JANELA_ESTOURO, TOLERANCIA_JANELA)).length
    const minutos = ((Date.now() - inicio) / 60_000).toFixed(1)
    // `com amostra` cresce desde o primeiro minuto: se ficar em 0, o stream nao
    // esta entregando e da para ver na hora, sem esperar os 5 min da janela.
    console.log(
      `${agora()}  ${minutos} min | ${elegiveis.size} observados | ` +
        `${series.length} com amostra | ${prontos} com janela cheia | ` +
        `${contagemSinais} sinal(is) | ${mensagensRecebidas} msg do stream`,
    )
  }, 60_000).unref()
}

const encerrar = () => {
  console.log(`\n${agora()}  encerrado. ${contagemSinais} sinal(is) gravado(s) em data/sinais.jsonl`)
  process.exit(0)
}
process.on('SIGINT', encerrar)

elegiveis = await montarElegiveis()
conectar()
iniciarPulso()
