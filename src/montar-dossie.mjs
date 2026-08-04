/**
 * Monta o dossie de uma moeda como DADOS, nao como texto.
 *
 * Separado da apresentacao de proposito: o mesmo calculo alimenta o terminal
 * (dossie.mjs) e o painel web (painel-dossie.mjs). Duas copias da aritmetica
 * seriam duas chances de elas discordarem — e a que discorda seria a que voce
 * esta olhando na hora de decidir.
 */

import { padroesEm, martelo, engolfoDeAlta, estrelaDaManha, tresSoldadosBrancos } from './candles.mjs'
import { custoIdaVolta, slippageDeCompra, posicaoNaFaixa, rsi, maiorQueda } from './analise.mjs'
import { tamanhoDaPosicao, quedaAteOMinimo } from './estrategia.mjs'
import { desfechosDe, taxaDeAcionamento, percentil } from './dossie.mjs'
import { momentoLocal, estatisticas, DIAS } from './calendario.mjs'

const BASE = 'https://api.binance.com'
export const FUSO = -3
const TAXA_POR_LADO = 0.1

/** Amostra abaixo disso nao e evidencia — e coincidencia com cara de tabela. */
export const AMOSTRA_MINIMA = 20
export const HORIZONTES = [3, 6, 12, 24]
export const STOPS_TESTADOS = [5, 8, 10, 15]

const DETECTORES = {
  martelo: (v, i) => martelo(v[i]),
  'engolfo-de-alta': (v, i) => i >= 1 && engolfoDeAlta(v[i - 1], v[i]),
  'estrela-da-manha': (v, i) => i >= 2 && estrelaDaManha(v[i - 2], v[i - 1], v[i]),
  'tres-soldados-brancos': (v, i) => i >= 2 && tresSoldadosBrancos(v[i - 2], v[i - 1], v[i]),
}

export const normalizarPar = (texto) => {
  const t = texto.trim().toUpperCase()
  return t.endsWith('USDT') ? t : `${t}USDT`
}

const buscar = async (caminho) => {
  const r = await fetch(`${BASE}${caminho}`)
  if (!r.ok) {
    const corpo = await r.text().catch(() => '')
    throw new Error(`${caminho} -> ${r.status} ${corpo.slice(0, 120)}`)
  }
  return r.json()
}

/** Historico paginado para tras — a API devolve no maximo 1000 velas por chamada. */
async function historico(simbolo, intervalo, desejadas) {
  const velas = []
  let fim = Date.now()
  while (velas.length < desejadas) {
    const lote = await buscar(`/api/v3/klines?symbol=${simbolo}&interval=${intervalo}&endTime=${fim}&limit=1000`)
    if (!Array.isArray(lote) || lote.length === 0) break
    velas.unshift(
      ...lote.map((k) => ({
        t: k[0],
        abertura: Number(k[1]),
        maxima: Number(k[2]),
        minima: Number(k[3]),
        fechamento: Number(k[4]),
      })),
    )
    fim = lote[0][0] - 1
    if (lote.length < 1000) break
  }
  return velas.slice(-desejadas)
}

export async function montarDossie({ par, intervalo = '1h', capitalUsdt = 33, velasDesejadas = 3000 }) {
  const simbolo = normalizarPar(par)

  const [info, livro, ticker, velas] = await Promise.all([
    buscar(`/api/v3/exchangeInfo?symbol=${simbolo}`),
    buscar(`/api/v3/depth?symbol=${simbolo}&limit=100`),
    buscar(`/api/v3/ticker/24hr?symbol=${simbolo}`),
    historico(simbolo, intervalo, velasDesejadas),
  ])

  const meta = info.symbols[0]
  const filtros = Object.fromEntries(meta.filters.map((f) => [f.filterType, f]))
  const minNotional = Number(filtros.NOTIONAL?.minNotional ?? 5)
  const tickSize = Number(filtros.PRICE_FILTER?.tickSize ?? 0)
  const bid = Number(livro.bids[0][0])
  const ask = Number(livro.asks[0][0])
  const preco = Number(ticker.lastPrice)

  // --- custo e tamanho -----------------------------------------------------
  const { spreadPct, custoTotalPct } = custoIdaVolta({ bid, ask, taxaPorLado: TAXA_POR_LADO })
  const dim = tamanhoDaPosicao({ capitalUsdt, minNotional, fracaoMaxima: 0.25, margemSeguranca: 0.37 })
  const tamanho = dim.tamanhoUsdt ?? minNotional
  const slip = slippageDeCompra(livro.asks, tamanho)
  const custoRealPct = custoTotalPct + slip.slippagePct

  // --- situacao ------------------------------------------------------------
  const fechamentos = velas.map((v) => v.fechamento)
  const recentes = velas.slice(-720)
  const minimo = Math.min(...recentes.map((v) => v.minima))
  const maximo = Math.max(...recentes.map((v) => v.maxima))

  // --- padroes -------------------------------------------------------------
  const padroesAgora = padroesEm(velas)
  const padroes = []
  for (const [nome, detecta] of Object.entries(DETECTORES)) {
    const indices = []
    for (let i = 2; i < velas.length; i++) if (detecta(velas, i)) indices.push(i)

    const linhas = []
    if (indices.length >= AMOSTRA_MINIMA) {
      for (const h of HORIZONTES) {
        const d = desfechosDe({ velas, indices, horizonte: h, custoPct: custoRealPct })
        if (d.length === 0) continue
        const r = estatisticas(d.map((x) => x.retornoLiquidoPct))
        linhas.push({
          horizonte: h,
          n: d.length,
          mediana: r.mediana,
          media: r.media,
          positivos: r.positivos,
          piorQueda10: percentil(d.map((x) => x.piorQuedaPct), 10),
        })
      }
    }
    padroes.push({
      nome,
      ocorrencias: indices.length,
      acontecendoAgora: padroesAgora.includes(nome),
      amostraSuficiente: indices.length >= AMOSTRA_MINIMA,
      linhas,
    })
  }

  // --- calendario ----------------------------------------------------------
  const m = momentoLocal(Date.now(), FUSO)
  const mesmoDia = []
  const mesmaHora = []
  for (const v of velas) {
    if (!(v.abertura > 0)) continue
    const q = momentoLocal(v.t, FUSO)
    const ret = ((v.fechamento - v.abertura) / v.abertura) * 100
    if (q.diaSemana === m.diaSemana) mesmoDia.push(ret)
    if (q.hora === m.hora) mesmaHora.push(ret)
  }

  // --- stop ----------------------------------------------------------------
  const todos = []
  for (let i = 2; i < velas.length; i++) todos.push(i)
  const janelas = desfechosDe({ velas, indices: todos, horizonte: 12, custoPct: custoRealPct })
  const quedas = janelas.map((x) => x.piorQuedaPct)

  return {
    par: simbolo,
    intervalo,
    capitalUsdt,
    fuso: FUSO,
    momento: Date.now(),

    preco,
    spreadPct,
    tickPct: preco === 0 ? null : (tickSize / preco) * 100,
    taxaPct: TAXA_POR_LADO * 2,
    slippagePct: slip.slippagePct,
    livroRaso: slip.insuficiente,
    custoRealPct,

    minNotional,
    tamanhoUsdt: dim.tamanhoUsdt,
    pisoDeAbertura: dim.pisoDeSaida ?? null,
    motivoInviavel: dim.motivo,
    quedaAteOMinimoPct: dim.tamanhoUsdt === null ? null : quedaAteOMinimo({ tamanhoUsdt: dim.tamanhoUsdt, minNotional }),

    velasLidas: velas.length,
    primeiraVela: velas[0]?.t ?? null,
    faixa: { minimo, maximo, velas: recentes.length, posicaoPct: posicaoNaFaixa(preco, minimo, maximo) },
    rsi: rsi(fechamentos),
    maiorQuedaPct: maiorQueda(fechamentos),
    volume24hUsdt: Number(ticker.quoteVolume),
    variacao24hPct: Number(ticker.priceChangePercent),

    padroesAgora,
    padroes,

    calendario: {
      diaSemana: m.diaSemana,
      nomeDia: DIAS[m.diaSemana],
      hora: m.hora,
      porDia: estatisticas(mesmoDia),
      porHora: estatisticas(mesmaHora),
    },

    stop: {
      janelas: quedas.length,
      testados: STOPS_TESTADOS.map((s) => ({ stopPct: s, acionadoPct: taxaDeAcionamento(quedas, s) })),
      p10: percentil(quedas, 10),
      p25: percentil(quedas, 25),
      p50: percentil(quedas, 50),
    },
  }
}
