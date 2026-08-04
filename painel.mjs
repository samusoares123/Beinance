/**
 * Painel local: posicao, sinais e o scanner ao vivo em uma pagina.
 *
 * Uso:  node --env-file=.env painel.mjs
 *       depois abra http://localhost:4300
 *
 * Sobe o scanner como processo filho e serve o estado por HTTP. Zero dependencias.
 * Porta 4300 para nao colidir com os 3000/3001 dos outros projetos.
 */

import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

import { criarCliente } from './src/binance/client.mjs'
import { buscarPrecos, buscarSaldos } from './src/binance/carteiras.mjs'
import { consolidarPosicao } from './src/posicao.mjs'
import { lerSinais, lerAlphaManual } from './src/armazenamento.mjs'
import { formatarDataBR, diasDesde } from './src/datas.mjs'

const PORTA = 4300
const LIMIAR_POEIRA = 5
const MAX_LINHAS_LOG = 200

const chave = process.env.BINANCE_API_KEY
const segredo = process.env.BINANCE_API_SECRET
const temChave = Boolean(chave && segredo)

const log = []
let statusScanner = 'iniciando'

// --- scanner como processo filho ----------------------------------------

const scanner = spawn(process.execPath, ['scanner.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] })
const registrar = (linha) => {
  log.push({ momento: new Date().toISOString(), texto: linha })
  if (log.length > MAX_LINHAS_LOG) log.shift()
}
const consumir = (fluxo) => {
  let resto = ''
  fluxo.setEncoding('utf8')
  fluxo.on('data', (pedaco) => {
    const linhas = (resto + pedaco).split('\n')
    resto = linhas.pop()
    for (const l of linhas) if (l.trim()) registrar(l)
  })
}
consumir(scanner.stdout)
consumir(scanner.stderr)
scanner.on('spawn', () => (statusScanner = 'rodando'))
scanner.on('exit', (codigo) => {
  statusScanner = `encerrado (codigo ${codigo})`
  registrar(`scanner encerrado com codigo ${codigo}`)
})

// --- posicao (cache curto: a API tem limite de requisicao) ---------------

let cachePosicao = { em: 0, dados: null }

async function obterPosicao() {
  if (!temChave) return { erro: 'sem chave — rode com: node --env-file=.env painel.mjs' }
  if (Date.now() - cachePosicao.em < 30_000) return cachePosicao.dados

  const cliente = criarCliente({ chave, segredo })
  const precos = await buscarPrecos()
  const { porCarteira, saldos } = await buscarSaldos(cliente, precos)
  const posicao = consolidarPosicao(saldos, precos, { limiarPoeira: LIMIAR_POEIRA })
  const alpha = await lerAlphaManual()

  const dados = {
    porCarteira,
    itens: posicao.itens.sort((a, b) => b.valorUsdt - a.valorUsdt),
    rastreadoUsdt: posicao.totalUsdt,
    // Formatado no servidor: data civil nao sobrevive a `new Date` no navegador.
    alpha: alpha
      ? { ...alpha, dataLeituraBR: formatarDataBR(alpha.dataLeitura), diasDesdeLeitura: diasDesde(alpha.dataLeitura) }
      : null,
    totalUsdt: posicao.totalUsdt + (alpha?.valorUsdt ?? 0),
    cotacaoUsdtBrl: precos.get('USDTBRL'),
  }
  cachePosicao = { em: Date.now(), dados }
  return dados
}

// --- servidor ------------------------------------------------------------

createServer(async (req, res) => {
  if (req.url === '/api/estado') {
    try {
      const [posicao, sinais] = await Promise.all([obterPosicao(), lerSinais()])
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ posicao, sinais: sinais.slice(-50).reverse(), log: log.slice(-60), statusScanner }))
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ erro: e.message }))
    }
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(PAGINA)
}).listen(PORTA, () => {
  console.log(`\n  Painel em http://localhost:${PORTA}`)
  console.log(`  Scanner rodando junto. Ctrl+C encerra os dois.\n`)
})

process.on('SIGINT', () => {
  scanner.kill()
  process.exit(0)
})

// --- pagina --------------------------------------------------------------

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Beinance</title>
<style>
  :root {
    --fundo: #fbfbfa; --superficie: #fff; --borda: #e6e4e0;
    --tinta: #1a1a18; --tinta2: #5c5a55; --tinta3: #8a8781;
    --bom: #1a7f4b; --ruim: #b3261e; --aviso: #8a5a00;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --fundo: #16161a; --superficie: #1e1e23; --borda: #33333b;
      --tinta: #f0efec; --tinta2: #adaba5; --tinta3: #7c7a75;
      --bom: #4ade80; --ruim: #f87171; --aviso: #fbbf24;
    }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--fundo); color:var(--tinta);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .envolucro { max-width: 1080px; margin: 0 auto; }
  h1 { font-size:15px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    color:var(--tinta3); margin:0 0 20px; }
  h2 { font-size:13px; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    color:var(--tinta3); margin:32px 0 12px; }
  .heroi { font-size:44px; font-weight:600; letter-spacing:-.02em; font-variant-numeric: tabular-nums; }
  .heroi span { font-size:20px; color:var(--tinta2); font-weight:400; }
  .sub { color:var(--tinta2); font-size:14px; margin-top:2px; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:20px; }
  .tile { background:var(--superficie); border:1px solid var(--borda); border-radius:10px; padding:12px 14px; }
  .tile .rotulo { font-size:12px; color:var(--tinta3); text-transform:uppercase; letter-spacing:.04em; }
  .tile .valor { font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; margin-top:4px; }
  .tile .nota { font-size:12px; color:var(--tinta3); margin-top:2px; }
  .rolagem { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.04em;
    color:var(--tinta3); font-weight:600; padding:6px 10px; border-bottom:1px solid var(--borda); }
  td { padding:8px 10px; border-bottom:1px solid var(--borda); font-variant-numeric:tabular-nums; white-space:nowrap; }
  .vazio { color:var(--tinta2); background:var(--superficie); border:1px dashed var(--borda);
    border-radius:10px; padding:20px; font-size:14px; }
  pre { background:var(--superficie); border:1px solid var(--borda); border-radius:10px;
    padding:12px 14px; overflow:auto; max-height:320px; margin:0;
    font: 12px/1.7 ui-monospace, "Cascadia Code", Consolas, monospace; color:var(--tinta2); }
  .selo { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--tinta2); }
  .ponto { width:7px; height:7px; border-radius:50%; background:var(--bom); }
  .ponto.parado { background:var(--ruim); }
  .poeira { color:var(--tinta3); }
</style></head><body><div class="envolucro">

<h1>Beinance — painel local</h1>
<div id="topo"><div class="sub">carregando…</div></div>
<div class="tiles" id="tiles"></div>

<h2>Sinais detectados</h2>
<div id="sinais"></div>

<h2>Scanner <span id="status" class="selo"></span></h2>
<pre id="log">aguardando…</pre>

<script>
const brl = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })
const dec = (v, c=2) => v.toLocaleString('pt-BR', { minimumFractionDigits:c, maximumFractionDigits:c })
const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR')

async function atualizar() {
  let e
  try { e = await (await fetch('/api/estado')).json() } catch { return }

  const p = e.posicao
  if (p?.erro) {
    document.getElementById('topo').innerHTML = '<div class="vazio">' + p.erro + '</div>'
  } else if (p) {
    document.getElementById('topo').innerHTML =
      '<div class="heroi">' + dec(p.totalUsdt) + ' <span>USDT</span></div>' +
      '<div class="sub">' + brl.format(p.totalUsdt * p.cotacaoUsdtBrl) +
      ' · cotacao ' + dec(p.cotacaoUsdtBrl, 4) + '</div>'

    const tiles = p.porCarteira.map(c =>
      '<div class="tile"><div class="rotulo">' + c.nome + '</div><div class="valor">' +
      dec(c.valorUsdt) + '</div><div class="nota">USDT</div></div>').join('')
    const alphaTile = p.alpha
      ? '<div class="tile"><div class="rotulo">Alpha</div><div class="valor">' + dec(p.alpha.valorUsdt) +
        '</div><div class="nota">leitura manual de ' + p.alpha.dataLeituraBR +
        (p.alpha.diasDesdeLeitura > 7 ? ' — <strong>desatualizada</strong>' : '') +
        ' · fora da API</div></div>'
      : '<div class="tile"><div class="rotulo">Alpha</div><div class="valor">—</div>' +
        '<div class="nota">nao informado</div></div>'
    document.getElementById('tiles').innerHTML = tiles + alphaTile
  }

  const s = e.sinais ?? []
  document.getElementById('sinais').innerHTML = s.length === 0
    ? '<div class="vazio">Nenhum sinal ainda. O scanner precisa de 5 minutos para encher a primeira janela, ' +
      'e o gatilho exige volume 5x acima da media com o preco subindo 2%. Silencio aqui e resultado valido, nao erro.</div>'
    : '<div class="rolagem"><table><thead><tr><th>Hora</th><th>Par</th><th>Regra</th>' +
      '<th>Entrada</th><th>Custo</th><th>Detalhe</th></tr></thead><tbody>' +
      s.map(x => '<tr><td>' + hora(x.momento) + '</td><td><strong>' + x.simbolo + '</strong></td><td>' +
        x.regra + '</td><td>' + x.precoEntrada + '</td><td>' + dec(x.custoTotalPct, 3) + '%</td><td>' +
        (x.detalhe ?? '') + '</td></tr>').join('') + '</tbody></table></div>'

  const rodando = e.statusScanner === 'rodando'
  document.getElementById('status').innerHTML =
    '<span class="ponto' + (rodando ? '' : ' parado') + '"></span>' + e.statusScanner
  document.getElementById('log').textContent =
    (e.log ?? []).map(l => l.texto).join('\\n') || 'aguardando primeira saida do scanner…'
}

atualizar()
setInterval(atualizar, 5000)
</script></div></body></html>`
