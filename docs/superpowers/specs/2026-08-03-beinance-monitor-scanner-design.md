# Beinance — Monitor de posição + Scanner de sinais

Data: 2026-08-03
Autor: Samuel (projeto pessoal, sem relação com a Construtora Just)

## Problema

Samuel tem US$ 33,35 na Binance (R$ 170) e quer fazer esse capital crescer com aportes de
R$ 100/mês. Já tentou especulação manual em tokens Alpha e perdeu ~86% do que aplicou
(HANA: 5,84 → 0,83 USDT). Não quer apenas acumular nem operar grid: quer uma estratégia
ativa, com risco assumido, mas **calculado** — decidido por medição, não por palpite.

O problema real não é falta de estratégia, é falta de **evidência**. Nenhuma decisão de
trade dele hoje é baseada em dado registrado.

## Objetivo

Construir, em fases de custo zero, a evidência que permite decidir se alguma regra de
sinal tem retorno esperado positivo **depois de taxa e spread** — e só então arriscar
dinheiro.

Não-objetivos desta fase: executar ordens, prever preço, operar tokens Alpha.

## Fatos verificados (2026-08-03)

Medidos, não presumidos. Revalidar antes de usar em cálculo futuro.

| Fato | Valor | Como foi verificado |
|---|---|---|
| Pares USDT em TRADING no Spot | 479 | `/api/v3/exchangeInfo` |
| `minNotional` | 5 USDT por ordem | filtro NOTIONAL de BTCUSDT/ETHUSDT |
| Taxa Spot | 0,1%/lado (0,075% com BNB) | tabela pública |
| Pares com spread > 0,20% | 135 | `/api/v3/ticker/bookTicker` |
| Tick do BTTC como % do preço | 3,774% | PRICE_FILTER vs preço médio |
| **Alpha não aparece na API** | confirmado | `probe.mjs`: API soma 33,35; app mostra 34,19; diferença 0,84 = Alpha |
| Carteiras com saldo | Spot 21,50 + Funding 11,86 | `/sapi/v1/asset/wallet/balance` |

A última linha é a mais importante para a arquitetura: **nenhum endpoint cobre o Alpha**.
O sistema reporta essa parcela como não rastreável; nunca a esconde num total redondo.

## Restrições

- **Chave read-only nas Fases 0–2.** Sem trade, sem saque, em nenhuma fase. Garantido por
  lista branca de endpoints no cliente, não por disciplina.
- **Capital de US$ 33** com mínimo de 5 USDT/ordem → no máximo 3 posições simultâneas.
- **Windows + Node 24**, zero dependências externas (`fetch`, `node:crypto`, `node:test`).
- Preço unitário baixo é filtro proibido. O filtro válido é **spread ≤ 0,5% e tick ≤ 0,1%**.

## Arquitetura

```
src/
  binance/
    client.js       assinatura HMAC + lista branca de endpoints de leitura
    carteiras.js    saldos das 3 carteiras + marcação do que a API não alcança
    precos.js       preços e filtros (público, sem chave)
    stream.js       WebSocket !ticker@arr — 479 pares, 1 conexão
  dominio/
    posicao.js      saldos + preços → posição em USDT e BRL
    aportes.js      ledger de aportes → total investido
    resultado.js    posição vs aportes → resultado real
    sinais.js       as 3 regras de detecção
    custo.js        spread + taxa de um par → custo de ida e volta
  armazenamento/
    snapshots.js       salvarSnapshot / lerSnapshots (JSONL)
    registroSinais.js  gravarSinal / gravarDesfecho (JSONL)
  relatorio/
    terminal.js     tabelas
  monitor.js        entrada: posição
  scanner.js        entrada: sinais ao vivo
data/
  snapshots.jsonl   1 linha por execução do monitor
  sinais.jsonl      1 linha por sinal detectado
  aportes.json      [{ data, valorBRL, cotacaoUSDT }]
```

O armazenamento fica atrás de uma interface (`salvarSnapshot`/`lerSnapshots`) para que a
troca de JSONL por Postgres, se a Fase 3 exigir, não toque no resto.

## Componentes

**`client.js`** — o único ponto que toca o segredo. Exporta `chamarAssinado(metodo, caminho)`.
Uma lista branca constante rejeita qualquer caminho fora dela. Não existe função de ordem no
código; ausência é a garantia. Aplica offset de relógio contra `/api/v3/time` antes de assinar
(erro `-1021`) e traduz `-2015`/`-1022` para causa provável em vez de repassar código cru.

**`carteiras.js`** — consulta as três fontes e devolve `{ carteiras, naoRastreavel }`. A parcela
Alpha entra sempre em `naoRastreavel`. Como nenhum endpoint a cobre, seu valor vem de
`data/alpha-manual.json` (`{ dataLeitura, valorUsdt }`), preenchido por Samuel a partir do app.
O relatório exibe a data dessa leitura ao lado do valor — um número de 40 dias atrás precisa
ser lido como estimativa velha, não como saldo atual.

**`custo.js`** — para um par, devolve o custo de ida e volta: `spread% + 0,2%`. É o filtro que
decide se um sinal é sequer considerado. Um sinal em par com custo de 4% precisa de um
movimento de 4% só para empatar.

**`sinais.js`** — três regras, avaliadas em paralelo sobre o mesmo stream:

| Regra | Gatilho inicial | Hipótese |
|---|---|---|
| Estouro de volume | volume da janela de 5min ≥ **5×** a média das janelas de 5min das últimas 24h, com preço **≥ +2%** na janela | fluxo grande inicia movimento que continua |
| Queda súbita | **−5%** em 10min enquanto o BTC cai **menos de 1%** no mesmo período | venda forçada exagera e reverte |
| Listagem nova | par presente no `exchangeInfo` e ausente na varredura anterior (varredura de hora em hora) | volatilidade previsível na 1ª hora |

Os limiares acima são **valores iniciais**, vivem em `config/sinais.json` e são deliberadamente
frouxos: na Fase 1 o objetivo é coletar sinais em volume suficiente para medir, não acertar.
Ajustar limiar depois de ver os dados é análise; ajustar antes é palpite.

Nenhuma regra é assumida como boa. As três são gravadas para serem julgadas por dado.

**`stream.js`** — uma conexão WebSocket (`!ticker@arr`) cobre os 479 pares, atualizando a cada
segundo. Sem chave, sem custo, sem limite de requisição.

## Fluxo de dados

**Monitor** (`node --env-file=.env monitor.js`, sob demanda):
preços + carteiras em paralelo → consolida posição → compara com último snapshot e com o
ledger de aportes → grava snapshot → imprime.

**Scanner** (`node scanner.js`, roda continuamente):
stream → filtra pares por custo → avalia as 3 regras → grava sinal com o livro de ofertas do
momento → agenda releitura do mesmo par em 15min, 1h e 4h → grava o desfecho na mesma linha.

O desfecho gravado ao vivo é o ponto central do projeto: backtest sobre candle de 1 minuto
mente sobre spread e slippage justamente nas moedas pequenas, que é onde a estratégia opera.

## Fases

| Fase | Entrega | Critério de saída |
|---|---|---|
| 0 | Monitor + scanner imprimindo ao vivo | reconcilia com o app, diferença explicada |
| 1 | Sinais e desfechos gravados | 3–4 semanas de dados |
| 2 | Relatório de edge por regra | um número líquido por regra |
| 3 | Execução — só se a Fase 2 der positivo | fora do escopo deste spec |

## Regras de risco (para a Fase 3, registradas agora)

| Regra | Valor |
|---|---|
| Posição | US$ 5 (mínimo permitido) = 15% do capital |
| Máximo simultâneo | 3 posições |
| Stop | −10% da posição = −1,5% do capital |
| Limite diário | 3 stops seguidos → para o dia |
| Kill switch | −20% do capital → para tudo |

## Erros e casos de borda

| Situação | Comportamento |
|---|---|
| Chave sem permissão / IP mudou | mensagem com a causa provável, sai com código 1 |
| Relógio dessincronizado | offset automático; se ainda falhar, instrui a sincronizar o Windows |
| Falha de rede no meio da coleta | **não grava snapshot parcial** — série histórica corrompida é pior que lacuna |
| WebSocket cai | reconecta com backoff; registra a lacuna no arquivo de sinais |
| Par sem preço em USDT | marcado como não precificável, nunca somado como zero |
| Ativo abaixo de 5 USDT | marcado como poeira não negociável |

## Testes

`node:test`, sem rede. Funções puras (`custo`, `resultado`, `sinais`, consolidação de posição)
testadas contra fixtures capturadas de respostas reais da API. O `client.js` tem um teste
que verifica que **um caminho fora da lista branca é rejeitado** — a garantia de segurança
precisa de teste, não de confiança.

Sem teste com chave real automatizado. O `probe.mjs` cumpre o papel de verificação manual.

## Riscos conhecidos

- **A resposta da Fase 2 pode ser "nenhuma regra tem edge".** É um resultado válido e barato:
  custa 4 semanas e R$ 0, contra descobrir o mesmo perdendo dinheiro.
- Ganho absoluto na Fase 3 é de centavos sobre US$ 15. O valor está em validar a regra numa
  escala em que errar é barato.
- Regra que funciona em 4 semanas pode não funcionar depois. A medição precisa continuar
  rodando durante a Fase 3.
