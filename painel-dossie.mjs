/**
 * Dossie no navegador, lado a lado.
 *
 * Uso:  node painel-dossie.mjs        → http://localhost:4301
 *
 * Porta separada de proposito: o painel.mjs esta rodando com o scanner como
 * processo filho, e reinicia-lo interromperia a coleta de sinais.
 *
 * Renderizacao no servidor. Sem JS de grafico, sem CDN — o calculo ja existe em
 * src/montar-dossie.mjs e e o mesmo que o terminal usa.
 */

import { createServer } from 'node:http'
import { montarDossie, normalizarPar } from './src/montar-dossie.mjs'

const PORTA = 4301
const PADRAO = 'HOME,TUT'

const num = (v, c = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const sinalDe = (v, c = 2) => (v === null || v === undefined ? '—' : (v >= 0 ? '+' : '') + num(v, c))
const escapar = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])
const classe = (v) => (v === null || v === undefined ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '')

const ESTILO = `
:root{
  --fundo:#0e1117; --cartao:#161b22; --borda:#262d38; --linha:#1e242e;
  --tinta:#e6edf3; --tinta2:#9aa7b4; --tinta3:#6b7684;
  --pos:#3fb950; --neg:#f85149; --aviso:#d29922; --acento:#58a6ff;
}
@media (prefers-color-scheme: light){
  :root{ --fundo:#f6f8fa; --cartao:#fff; --borda:#d6dde5; --linha:#eef1f4;
         --tinta:#1f2328; --tinta2:#57606a; --tinta3:#848d97;
         --pos:#1a7f37; --neg:#cf222e; --aviso:#9a6700; --acento:#0969da; }
}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);
  font:14px/1.55 ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,monospace}
header{padding:20px 24px;border-bottom:1px solid var(--borda);display:flex;
  gap:16px;align-items:center;flex-wrap:wrap}
h1{margin:0;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--tinta2);font-weight:600}
form{display:flex;gap:8px;flex:1;min-width:260px}
input{flex:1;background:var(--cartao);border:1px solid var(--borda);color:var(--tinta);
  padding:8px 12px;border-radius:6px;font:inherit}
input:focus{outline:2px solid var(--acento);outline-offset:-1px}
button{background:var(--acento);color:#fff;border:0;padding:8px 18px;border-radius:6px;
  font:inherit;font-weight:600;cursor:pointer}
.grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:18px;padding:18px 24px 40px}
.cartao{background:var(--cartao);border:1px solid var(--borda);border-radius:10px;overflow:hidden}
.topo{padding:16px 18px;border-bottom:1px solid var(--borda);display:flex;
  justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
.par{font-size:20px;font-weight:700;letter-spacing:.02em}
.sub{color:var(--tinta3);font-size:12px}
.destaque{padding:16px 18px;border-bottom:1px solid var(--borda);background:linear-gradient(transparent,rgba(127,127,127,.045))}
.destaque .rotulo{color:var(--tinta2);font-size:11px;letter-spacing:.1em;text-transform:uppercase}
.destaque .valor{font-size:32px;font-weight:700;line-height:1.15;margin-top:2px}
.destaque .nota{color:var(--tinta3);font-size:12px;margin-top:4px}
section{padding:14px 18px;border-bottom:1px solid var(--linha)}
section:last-child{border-bottom:0}
h2{margin:0 0 10px;font-size:11px;letter-spacing:.11em;text-transform:uppercase;color:var(--tinta3);font-weight:600}
.linha{display:flex;justify-content:space-between;gap:12px;padding:3px 0}
.linha span:first-child{color:var(--tinta2)}
.linha span:last-child{font-variant-numeric:tabular-nums}
.rolagem{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:340px}
th{text-align:right;color:var(--tinta3);font-weight:600;padding:5px 6px;border-bottom:1px solid var(--borda);white-space:nowrap}
th:first-child{text-align:left}
td{text-align:right;padding:5px 6px;font-variant-numeric:tabular-nums;border-bottom:1px solid var(--linha);white-space:nowrap}
td:first-child{text-align:left;color:var(--tinta2)}
.pos{color:var(--pos)} .neg{color:var(--neg)}
.padrao{margin-top:12px}
.padrao:first-of-type{margin-top:0}
.nomePadrao{font-size:12px;font-weight:700;letter-spacing:.04em;display:flex;
  justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px}
.agora{background:var(--acento);color:#fff;border-radius:99px;padding:1px 9px;font-size:10px;letter-spacing:.06em}
.magro{color:var(--tinta3);font-size:12px;font-style:italic}
.barra{display:grid;grid-template-columns:52px 1fr 92px;gap:9px;align-items:center;padding:3px 0;font-size:12.5px}
.trilho{background:var(--linha);border-radius:3px;height:9px;overflow:hidden}
.preenche{height:100%;background:var(--acento);border-radius:3px}
.aviso{background:rgba(210,153,34,.1);border-left:3px solid var(--aviso);
  padding:10px 12px;margin-top:10px;border-radius:0 6px 6px 0;font-size:12.5px;color:var(--tinta)}
.erro{background:rgba(248,81,73,.1);border-left:3px solid var(--neg);padding:14px 16px;border-radius:0 6px 6px 0}
footer{padding:18px 24px 40px;color:var(--tinta3);font-size:12px;border-top:1px solid var(--borda);margin-top:8px}
`

const secaoPadroes = (d) =>
  d.padroes
    .map((p) => {
      const cab = `<div class="nomePadrao"><span>${p.nome.replace(/-/g, ' ')} <span class="sub">${p.ocorrencias}x</span></span>${
        p.acontecendoAgora ? '<span class="agora">AGORA</span>' : ''
      }</div>`
      if (!p.amostraSuficiente) {
        return `<div class="padrao">${cab}<div class="magro">amostra pequena demais — nada a ler</div></div>`
      }
      const linhas = p.linhas
        .map(
          (l) =>
            `<tr><td>${l.horizonte} velas</td>` +
            `<td class="${classe(l.mediana)}">${sinalDe(l.mediana)}%</td>` +
            `<td class="${classe(l.media)}">${sinalDe(l.media)}%</td>` +
            `<td>${num(l.positivos, 0)}%</td>` +
            `<td class="neg">${num(l.piorQueda10, 1)}%</td></tr>`,
        )
        .join('')
      return `<div class="padrao">${cab}<div class="rolagem"><table>
        <tr><th>depois de</th><th>mediana</th><th>média</th><th>positivos</th><th>pior queda</th></tr>
        ${linhas}</table></div></div>`
    })
    .join('')

const secaoStop = (d) => {
  const maior = Math.max(...d.stop.testados.map((s) => s.acionadoPct ?? 0), 1)
  const barras = d.stop.testados
    .map((s) => {
      const pct = s.acionadoPct ?? 0
      const nota = pct > 40 ? 'sai cedo demais' : pct < 5 ? 'quase nunca age' : ''
      return `<div class="barra"><span>−${s.stopPct}%</span>
        <span class="trilho"><span class="preenche" style="width:${Math.max(1.5, (pct / maior) * 100)}%"></span></span>
        <span>${num(pct, 1)}% ${nota ? `<span class="sub">${nota}</span>` : ''}</span></div>`
    })
    .join('')
  return `${barras}
    <div class="linha" style="margin-top:9px"><span>mergulha ao menos</span><span class="neg">${num(d.stop.p10, 1)}% em 10% das janelas</span></div>
    <div class="linha"><span>mediana do mergulho</span><span class="neg">${num(d.stop.p50, 1)}%</span></div>
    ${
      d.quedaAteOMinimoPct !== null
        ? `<div class="aviso"><strong>Teto duro:</strong> a posição de US$ ${num(d.tamanhoUsdt)} só pode cair
             <strong>${num(d.quedaAteOMinimoPct, 1)}%</strong> antes de a venda ser recusada pelo mínimo de
             ${d.minNotional} USDT. O stop tem que ser mais apertado que isso — e ficar na corretora.</div>`
        : `<div class="aviso"><strong>Posição inviável:</strong> ${escapar(d.motivoInviavel ?? '')}</div>`
    }`
}

function cartao(d) {
  const c = d.calendario
  return `<article class="cartao">
    <div class="topo">
      <span class="par">${escapar(d.par)}</span>
      <span class="sub">US$ ${d.preco} · <span class="${classe(d.variacao24hPct)}">${sinalDe(d.variacao24hPct)}% em 24h</span></span>
    </div>

    <div class="destaque">
      <div class="rotulo">custo de entrar e sair</div>
      <div class="valor ${d.custoRealPct > 0.5 ? 'neg' : ''}">${num(d.custoRealPct, 3)}%</div>
      <div class="nota">o preço precisa subir mais que isso só para você empatar</div>
    </div>

    <section>
      <h2>Composição do custo</h2>
      <div class="linha"><span>spread</span><span>${num(d.spreadPct, 3)}%</span></div>
      <div class="linha"><span>taxa (2 lados)</span><span>${num(d.taxaPct, 2)}%</span></div>
      <div class="linha"><span>slippage em US$ ${num(d.tamanhoUsdt ?? d.minNotional)}</span><span>${num(d.slippagePct, 3)}%${d.livroRaso ? ' ⚠' : ''}</span></div>
      <div class="linha"><span>tick como % do preço</span><span>${num(d.tickPct, 4)}%</span></div>
    </section>

    <section>
      <h2>Tamanho permitido</h2>
      <div class="linha"><span>mínimo do par</span><span>${d.minNotional} USDT</span></div>
      <div class="linha"><span>posição sugerida</span><span>${d.tamanhoUsdt === null ? '—' : 'US$ ' + num(d.tamanhoUsdt)}</span></div>
      <div class="linha"><span>capital considerado</span><span>US$ ${num(d.capitalUsdt)}</span></div>
    </section>

    <section>
      <h2>Onde ela está</h2>
      <div class="linha"><span>faixa (${num(d.faixa.velas, 0)} velas)</span><span>${d.faixa.minimo} — ${d.faixa.maximo}</span></div>
      <div class="linha"><span>posição na faixa</span><span>${num(d.faixa.posicaoPct, 1)}% <span class="sub">(100 = topo)</span></span></div>
      <div class="linha"><span>RSI(14)</span><span>${num(d.rsi, 1)}</span></div>
      <div class="linha"><span>maior queda do topo</span><span class="neg">${num(d.maiorQuedaPct, 1)}%</span></div>
      <div class="linha"><span>volume 24h</span><span>US$ ${num(d.volume24hUsdt, 0)}</span></div>
      <div class="linha"><span>histórico lido</span><span>${num(d.velasLidas, 0)} velas de ${d.intervalo}, desde ${
        d.primeiraVela ? new Date(d.primeiraVela).toISOString().slice(0, 10) : '—'
      }</span></div>
    </section>

    <section>
      <h2>O que aconteceu depois de cada padrão — nesta moeda</h2>
      ${secaoPadroes(d)}
      <div class="magro" style="margin-top:10px">"pior queda" = percentil 10 do mergulho máximo durante a operação, medido pelas mínimas.</div>
    </section>

    <section>
      <h2>${escapar(c.nomeDia)}, ${String(c.hora).padStart(2, '0')}h — no histórico dela</h2>
      <div class="linha"><span>todas as ${escapar(c.nomeDia)}s</span><span class="${classe(c.porDia.media)}">${sinalDe(c.porDia.media, 3)}% <span class="sub">(${num(c.porDia.n, 0)} velas)</span></span></div>
      <div class="linha"><span>todas as ${String(c.hora).padStart(2, '0')}h</span><span class="${classe(c.porHora.media)}">${sinalDe(c.porHora.media, 3)}% <span class="sub">(${num(c.porHora.n, 0)} velas)</span></span></div>
      <div class="magro" style="margin-top:8px">O custo de operar é ${num(d.custoRealPct, 2)}%. Nenhum efeito de calendário desta escala paga o próprio custo.</div>
    </section>

    <section>
      <h2>Onde colocar o stop — ${num(d.stop.janelas, 0)} janelas de 12 velas</h2>
      ${secaoStop(d)}
    </section>
  </article>`
}

const cartaoErro = (par, mensagem) =>
  `<article class="cartao"><div class="topo"><span class="par">${escapar(par)}</span></div>
   <section><div class="erro"><strong>Não deu para montar.</strong><br>${escapar(mensagem)}</div></section></article>`

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`)
  if (url.pathname !== '/') {
    res.writeHead(404).end('nao encontrado')
    return
  }

  const consulta = (url.searchParams.get('pares') ?? PADRAO).trim() || PADRAO
  const capital = Number(url.searchParams.get('capital') ?? 33) || 33
  const pares = [...new Set(consulta.split(/[,\s]+/).filter(Boolean).map(normalizarPar))].slice(0, 4)

  const cartoes = await Promise.all(
    pares.map(async (p) => {
      try {
        return cartao(await montarDossie({ par: p, intervalo: '1h', capitalUsdt: capital }))
      } catch (e) {
        return cartaoErro(p, e.message)
      }
    }),
  )

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dossiê — ${escapar(pares.join(' · '))}</title><style>${ESTILO}</style></head><body>
<header>
  <h1>Beinance · Dossiê</h1>
  <form method="get">
    <input name="pares" value="${escapar(consulta)}" placeholder="HOME, TUT, BTC" aria-label="moedas">
    <input name="capital" value="${capital}" style="max-width:96px" aria-label="capital em USDT">
    <button type="submit">analisar</button>
  </form>
</header>
<div class="grade">${cartoes.join('')}</div>
<footer>
  Distribuição do passado, não previsão. Nada aqui diz que a moeda vai subir.<br>
  Dados públicos da Binance · nenhuma chave usada · nenhuma ordem executada · fuso UTC−3
</footer>
</body></html>`)
}).listen(PORTA, () => {
  console.log(`\n  Dossiê em http://localhost:${PORTA}`)
  console.log(`  Exemplo:  http://localhost:${PORTA}/?pares=HOME,TUT\n`)
})
