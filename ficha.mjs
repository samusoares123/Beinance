/**
 * Ficha de uma moeda: tudo que a API publica sabe sobre um par, em uma tela.
 *
 * Uso:  node ficha.mjs ROBO
 *       node ficha.mjs SHIBUSDT
 *
 * Nao precisa de chave — usa apenas endpoints publicos.
 */

import {
  custoIdaVolta,
  slippageDeCompra,
  posicaoNaFaixa,
  mediaSimples,
  rsi,
  percentualDeDiasVolateis,
  maiorQueda,
  melhorEPiorDia,
} from './src/analise.mjs'
import { buscarFundamentos } from './src/fundamentos.mjs'
import { buscarPaprika, buscarCmc, buscarTvl, buscarMedoGanancia, consensoDeFontes } from './src/fontes.mjs'

import { API } from './src/api.mjs'
const BASE = API
const TAXA_POR_LADO = 0.1 // % — 0,075 se pagar com BNB

// Limites de elegibilidade (ver .claude/skills/binance-trader)
const LIMITES = {
  custoTotalPct: 0.5,
  slippagePct: 0.2,
  tickPct: 0.1,
  volume24hUsdt: 100_000,
}

const entrada = process.argv[2]
if (!entrada) {
  console.error('Uso: node ficha.mjs <MOEDA>   ex: node ficha.mjs ROBO')
  process.exit(1)
}
const par = entrada.toUpperCase().endsWith('USDT')
  ? entrada.toUpperCase()
  : `${entrada.toUpperCase()}USDT`

const buscar = async (caminho) => {
  const r = await fetch(`${BASE}${caminho}`)
  const corpo = await r.json()
  if (!r.ok) throw new Error(`${caminho} → ${corpo.msg ?? r.status}`)
  return corpo
}

const pct = (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const num = (v, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const marca = (ok) => (ok ? 'ok  ' : 'NAO ')

async function main() {
  const info = await buscar(`/api/v3/exchangeInfo?symbol=${par}`)
  const simbolo = info.symbols[0]
  if (!simbolo || simbolo.status !== 'TRADING') {
    console.error(`${par} nao esta disponivel para negociacao no Spot.`)
    process.exit(1)
  }

  const [ticker, livro, diarios] = await Promise.all([
    buscar(`/api/v3/ticker/24hr?symbol=${par}`),
    buscar(`/api/v3/depth?symbol=${par}&limit=100`),
    buscar(`/api/v3/klines?symbol=${par}&interval=1d&limit=1000`),
  ])

  const bid = Number(livro.bids[0][0])
  const ask = Number(livro.asks[0][0])
  const preco = (bid + ask) / 2
  const tick = Number(simbolo.filters.find((f) => f.filterType === 'PRICE_FILTER').tickSize)
  const minNotional = Number(
    simbolo.filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL').minNotional,
  )

  const custo = custoIdaVolta({ bid, ask, taxaPorLado: TAXA_POR_LADO })
  const slip5 = slippageDeCompra(livro.asks, 5)
  const slip20 = slippageDeCompra(livro.asks, 20)
  const tickPct = (tick / preco) * 100

  const fechamentos = diarios.map((k) => Number(k[4]))
  const maximas = diarios.map((k) => Number(k[2]))
  const minimas = diarios.map((k) => Number(k[3]))
  const ultimos = (arr, n) => arr.slice(-n)

  const idadeDias = diarios.length
  const primeiroDia = new Date(diarios[0][0]).toLocaleDateString('pt-BR')

  const variacao = (dias) =>
    fechamentos.length > dias
      ? ((preco - fechamentos[fechamentos.length - 1 - dias]) / fechamentos[fechamentos.length - 1 - dias]) * 100
      : null

  console.log(`\n${'='.repeat(58)}`)
  console.log(`  ${par}   ${preco}   ${pct(Number(ticker.priceChangePercent))} em 24h`)
  console.log(`${'='.repeat(58)}`)

  console.log(`\nIDADE`)
  console.log(`  Negociado desde ${primeiroDia} (${idadeDias} dias de historico)`)
  if (idadeDias < 90) console.log(`  Par novo — pouca historia para julgar comportamento.`)

  console.log(`\nCUSTO DE ENTRAR E SAIR   (o movimento precisa passar disso so para empatar)`)
  console.log(`  Spread agora        ${num(custo.spreadPct, 3).padStart(8)} %`)
  console.log(`  Taxa (2 lados)      ${num(TAXA_POR_LADO * 2, 3).padStart(8)} %`)
  console.log(`  Slippage US$ 5      ${num(slip5.slippagePct, 3).padStart(8)} %${slip5.insuficiente ? '  LIVRO RASO' : ''}`)
  console.log(`  Slippage US$ 20     ${num(slip20.slippagePct, 3).padStart(8)} %${slip20.insuficiente ? '  LIVRO RASO' : ''}`)
  console.log(`  ---`)
  console.log(`  Custo ida e volta   ${num(custo.custoTotalPct + slip5.slippagePct * 2, 3).padStart(8)} %  (com US$ 5)`)
  console.log(`  Ordem minima        ${num(minNotional, 2).padStart(8)} USDT`)
  console.log(`  Tick (menor passo)  ${num(tickPct, 3).padStart(8)} % do preco`)

  console.log(`\nLIQUIDEZ`)
  console.log(`  Volume 24h          ${num(Number(ticker.quoteVolume), 0).padStart(12)} USDT`)
  console.log(`  Negocios 24h        ${num(ticker.count, 0).padStart(12)}`)

  console.log(`\nONDE O PRECO ESTA   (0% = minima da janela, 100% = maxima)`)
  for (const [rotulo, dias] of [['24h', 1], ['30 dias', 30], ['1 ano', 365]]) {
    const janelaMax = Math.max(...ultimos(maximas, dias))
    const janelaMin = Math.min(...ultimos(minimas, dias))
    const posicao = posicaoNaFaixa(preco, janelaMin, janelaMax)
    if (posicao === null) continue
    // O par pode ser mais novo que a janela pedida — mostre o que de fato foi usado.
    const usados = Math.min(dias, idadeDias)
    const nome = usados < dias ? `${usados} dias*` : rotulo
    const alerta = posicao >= 85 ? '  ← perto do topo da janela' : posicao <= 15 ? '  ← perto do fundo' : ''
    console.log(`  ${nome.padEnd(10)} ${num(posicao, 1).padStart(6)} %${alerta}`)
  }
  if (idadeDias < 365) console.log(`  * janela encurtada: o par so tem ${idadeDias} dias de historico`)

  console.log(`\nVARIACAO`)
  for (const [rotulo, dias] of [['7 dias', 7], ['30 dias', 30], ['1 ano', 365]]) {
    const v = variacao(dias)
    if (v !== null) console.log(`  ${rotulo.padEnd(10)} ${pct(v).padStart(10)}`)
  }

  console.log(`\nVOLATILIDADE (ultimos 30 dias)`)
  const dias30 = ultimos(fechamentos, 31)
  console.log(`  Dias com movimento >= 5%   ${num(percentualDeDiasVolateis(dias30, 5), 1).padStart(6)} % dos dias`)
  console.log(`  Dias com movimento >= 10%  ${num(percentualDeDiasVolateis(dias30, 10), 1).padStart(6)} % dos dias`)

  console.log(`\nINDICADORES   (resumo do passado, nao previsao)`)
  const r14 = rsi(fechamentos, 14)
  if (r14 !== null) {
    const leitura = r14 >= 70 ? 'esticado para cima' : r14 <= 30 ? 'esticado para baixo' : 'neutro'
    console.log(`  RSI 14 dias         ${num(r14, 1).padStart(6)}   ${leitura}`)
  }
  for (const periodo of [7, 25, 99]) {
    const m = mediaSimples(fechamentos, periodo)
    if (m === null) continue
    const rel = ((preco - m) / m) * 100
    console.log(`  Media ${String(periodo).padEnd(3)} dias      ${pct(rel).padStart(8)} vs preco atual`)
  }

  console.log(`\nHISTORICO COMPLETO   (${idadeDias} dias)`)
  const { melhorPct, piorPct } = melhorEPiorDia(fechamentos)
  console.log(`  Maior queda do topo    ${pct(maiorQueda(fechamentos)).padStart(10)}`)
  if (melhorPct !== null) {
    console.log(`  Melhor dia             ${pct(melhorPct).padStart(10)}`)
    console.log(`  Pior dia               ${pct(piorPct).padStart(10)}`)
  }

  // --- fundamentos (CoinGecko): o que a Binance nao responde ---
  const base = simbolo.baseAsset
  console.log(`\nFUNDAMENTOS   (CoinGecko)`)
  try {
    const f = await buscarFundamentos(base)
    if (!f.encontrado) {
      console.log(`  ${base} nao consta no CoinGecko — moeda recem-listada ou sem cobertura.`)
      console.log(`  Sem capitalizacao nem supply, voce esta operando as cegas quanto ao tamanho dela.`)
    } else {
      const milhoes = (v) => (v === null ? '—' : `${num(v / 1e6, 1)} mi`)
      console.log(`  ${f.nome} (${f.id})${f.rank ? `   rank #${f.rank}` : '   sem rank'}`)
      console.log(`  Capitalizacao          ${f.marketCapUsd === null ? '—' : 'US$ ' + milhoes(f.marketCapUsd)}`)
      console.log(`  Em circulacao          ${milhoes(f.circulante)}`)
      console.log(`  Supply maximo          ${milhoes(f.maximo)}`)
      if (f.percentualCirculante !== null) {
        const alerta = f.percentualCirculante < 50 ? '  ← metade ou mais ainda por liberar' : ''
        console.log(`  Ja liberado            ${num(f.percentualCirculante, 1).padStart(6)} %${alerta}`)
      }
      if (f.athVariacaoPct !== null) {
        console.log(`  Distancia da maxima    ${pct(f.athVariacaoPct).padStart(10)}   (maxima US$ ${f.ath})`)
      }
      if (f.genesis) console.log(`  Existe desde           ${f.genesis}`)
      if (f.categorias.length) console.log(`  Categorias             ${f.categorias.join(', ')}`)
    }

    // --- consenso entre as tres fontes de capitalizacao ---
    const [p, cmc] = await Promise.all([
      buscarPaprika(base).catch(() => null),
      buscarCmc(base, process.env.COIN_MARKET_API_KEY).catch((e) => ({ encontrado: false, motivo: e.message })),
    ])

    const medidas = [
      { fonte: 'CoinGecko', valor: f.marketCapUsd, rank: f.rank },
      { fonte: 'CoinMarketCap', valor: cmc?.encontrado ? cmc.marketCapUsd : null, rank: cmc?.rank },
      { fonte: 'CoinPaprika', valor: p?.encontrado ? p.marketCapUsd : null, rank: p?.rank },
    ]

    console.log(`\n  Capitalizacao por fonte`)
    for (const m of medidas) {
      const valor = m.valor ? `US$ ${num(m.valor / 1e6, 1)} mi` : 'indisponivel'
      console.log(`    ${m.fonte.padEnd(16)} ${valor.padStart(16)}${m.rank ? `   rank #${m.rank}` : ''}`)
    }

    const c = consensoDeFontes(medidas)
    if (c) {
      console.log(`    ${'CONSENSO'.padEnd(16)} ${('US$ ' + num(c.mediana / 1e6, 1) + ' mi').padStart(16)}   mediana de ${c.fontesUsadas} fonte(s)`)
      if (c.alerta) {
        console.log(`    ${c.discordante.fonte} desvia ${num(c.desvioMaximoPct, 1)}% da mediana — capitalizacao aqui e estimativa, nao medida.`)
      }
    }

    if (cmc?.encontrado && cmc.marketCapDiluidoUsd) {
      const multiplo = cmc.marketCapDiluidoUsd / cmc.marketCapUsd
      console.log(`\n  Diluicao futura   (CoinMarketCap)`)
      console.log(`    Valor se tudo circulasse   US$ ${num(cmc.marketCapDiluidoUsd / 1e6, 1)} mi`)
      console.log(`    Multiplo sobre o de hoje   ${num(multiplo, 2)}x`)
      console.log(`    Ao preco de hoje, liberar o supply restante multiplica por ${num(multiplo, 1)}x`)
      console.log(`    o valor total do token. Essa oferta futura pressiona o preco.`)
    } else if (cmc?.motivo) {
      console.log(`\n  CoinMarketCap indisponivel: ${cmc.motivo}`)
    }
  } catch (e) {
    console.log(`  indisponivel: ${e.message}`)
  }

  // --- TVL: dinheiro realmente depositado no protocolo ---
  try {
    const tvl = await buscarTvl(base)
    if (tvl?.tvl) {
      console.log(`\nPROTOCOLO   (DefiLlama)`)
      console.log(`  ${tvl.name}${tvl.category ? `   categoria: ${tvl.category}` : ''}`)
      console.log(`  Valor depositado (TVL) US$ ${num(tvl.tvl / 1e6, 1)} mi`)
      if (tvl.mcap) {
        const razao = tvl.mcap / tvl.tvl
        console.log(`  Capitalizacao / TVL    ${num(razao, 2).padStart(6)}`)
        console.log(
          razao < 1
            ? `    Vale menos que o dinheiro depositado nele.`
            : `    Vale mais que o dinheiro depositado nele.`,
        )
        console.log(`    Razao baixa costuma ser lida como barato — mas tambem pode significar`)
        console.log(`    que o token nao captura o valor do protocolo. Nao e sinal de compra.`)
      }
    }
  } catch { /* fonte opcional: nao derruba a ficha */ }

  // --- humor do mercado inteiro ---
  try {
    const fng = await buscarMedoGanancia()
    if (fng) console.log(`\nMERCADO   indice Medo/Ganancia: ${fng.valor} (${fng.classificacao})`)
  } catch { /* opcional */ }

  console.log(`\nELEGIBILIDADE`)
  const custoComSlip = custo.custoTotalPct + slip5.slippagePct * 2
  const checagens = [
    [`Custo ida e volta <= ${LIMITES.custoTotalPct}%`, custoComSlip <= LIMITES.custoTotalPct],
    [`Slippage US$5 <= ${LIMITES.slippagePct}%`, slip5.slippagePct <= LIMITES.slippagePct && !slip5.insuficiente],
    [`Tick <= ${LIMITES.tickPct}% do preco`, tickPct <= LIMITES.tickPct],
    [`Volume 24h >= ${num(LIMITES.volume24hUsdt, 0)} USDT`, Number(ticker.quoteVolume) >= LIMITES.volume24hUsdt],
  ]
  for (const [rotulo, ok] of checagens) console.log(`  ${marca(ok)} ${rotulo}`)

  const aprovado = checagens.every(([, ok]) => ok)
  console.log(`\n  ${aprovado ? 'OPERAVEL' : 'FORA DOS FILTROS'} — isto diz se da para operar barato,`)
  console.log(`  nao se o preco vai subir. Direcao nenhum destes numeros preve.\n`)
}

main().catch((e) => {
  console.error(`\nFALHOU: ${e.message}`)
  process.exit(1)
})
