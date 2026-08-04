---
name: binance-trader
description: Use ao trabalhar no projeto Beinance — avaliar uma ideia de trade, escolher pares, dimensionar posição, calcular custo de entrada/saída, ou escrever qualquer código que fale com a API da Binance. Também ao responder "vale a pena comprar X", "esse robô dá lucro", "quanto colocar por operação" ou ao ver menção a minNotional, tickSize, spread, slippage, Alpha, dust/poeira, API key.
---

# Binance — regras de mercado, custo e risco

Projeto **pessoal** do Samuel, capital pequeno (~US$ 34 em 08/2026). Ele é engenheiro civil, forte em Node.js, **iniciante em trading** — explique o conceito junto com o código, não assuma jargão.

**Princípio central:** nesta escala, o que decide o resultado não é a estratégia, é o **custo de entrada e saída** e o **tamanho mínimo de ordem**. Calcule os dois antes de discutir qualquer ideia.

## Segurança de chave — inegociável

- Chave de leitura para monitoramento. **Nunca** habilitar saque (withdrawal) em nenhuma chave usada por código, em nenhuma fase.
- Trade só em chave separada, com IP whitelist, e só depois de a Fase 2 medir edge positivo.
- **Não escreva função de execução de ordem** enquanto o projeto estiver nas Fases 0–2. Ausência de código é a garantia; disciplina não é.
- Chave só em `.env` fora do git. Nenhuma lib de terceiros entre o segredo e a API — `node:crypto` assina em 5 linhas.

## Números verificados em 2026-08-03

Revalide com os comandos em "Como reverificar" antes de usar em cálculo — mudam.

| Fato | Valor |
|---|---|
| Pares USDT em TRADING no Spot | 479 |
| `minNotional` | **varia por par** — BTC/ETH: 5 USDT; SHIB: 1 USDT. Consulte sempre, nunca assuma 5. |
| Taxa Spot | 0,1% por lado (0,075% pagando com BNB) |
| Custo de ida e volta (só taxa) | 0,2% (0,15% com BNB) |
| Pares com spread > 0,20% | 135 |
| Pares com spread ≤ 0,05% | 100 |

## O erro do "moeda barata"

Preço unitário **não** indica potencial. O que importa é capitalização, liquidez e volatilidade. Pior: preço baixo cobra pedágio, porque o `tickSize` vira fração enorme do preço.

| Par | Preço | Tick como % | Spread |
|---|---|---|---|
| BTTC | 0,000000265 | **3,774%** | 3,774% |
| BONK | 0,000002845 | 0,351% | 0,351% |
| SHIB | 0,000004925 | 0,203% | 0,203% |
| DOGE | 0,070535 | 0,014% | 0,014% |
| BTC | 63.872 | ~0,00002% | 0,000% |

Comprando BTTC a mercado você entra **3,77% negativo antes de o preço se mexer**. Filtro correto para o scanner: **spread ≤ 0,5% e tick ≤ 0,1% do preço** — não "preço baixo".

Nuance: o spread só é pago por quem cruza o livro (ordem a mercado / taker). Ordem limite passiva não paga, mas pode não executar.

## Limites com capital pequeno

Com US$ 33. O mínimo por ordem varia por par (`node ficha.mjs <MOEDA>` mostra) — em pares
com mínimo de 1 USDT cabem mais posições que os 3 abaixo, mas o teto de exposição continua.

| Regra | Valor |
|---|---|
| Posição | US$ 5 = 15% do capital |
| Máx. simultâneas | 3 (US$ 15 expostos, US$ 18 em caixa) |
| Stop por posição | −10% = −1,5% do capital |
| Limite diário | 3 stops seguidos → para o dia |
| Kill switch | −20% do capital → para tudo |

## Antes de arriscar dinheiro: meça

Nunca aprove uma ideia de trade por plausibilidade. O caminho custa R$ 0:

1. Scanner ao vivo dos 479 pares (WebSocket `!ticker@arr`, público, sem chave).
2. Gravar cada sinal **e o que aconteceu 15min / 1h / 4h depois**.
3. Somar: "se eu tivesse comprado todo sinal, qual o líquido depois de taxa e spread?"
4. Executar só se o passo 3 der positivo.

Backtest em candle de 1 minuto **mente sobre spread e slippage** justamente nas moedas pequenas. Sinal gravado ao vivo, com o livro real, não mente.

## Armadilhas conhecidas

| Sintoma | Causa / saída |
|---|---|
| Saldo do código ≠ saldo do app | `/api/v3/account` traz **só o Spot**. Há dinheiro em Funding e Alpha. Use `/sapi/v1/asset/wallet/balance` e reconcilie sempre. |
| Erro `-1021` | Relógio do Windows fora de sincronia. Busque `/api/v3/time` e aplique offset. |
| Erro `-2015` | Permissão faltando ou IP não autorizado — não é bug de código. |
| Token não vende | Abaixo de 5 USDT (poeira). Só sai via "converter poeira em BNB". |
| Tokens Alpha | API oficial só tem Market Data. **Não há endpoint de execução.** Fora de qualquer automação. |
| USDT "não sobe" | É dólar, não investimento. Parado rende zero. |
| Fundamentos da moeda errados | A busca do CoinGecko é **difusa**: `/search?query=FF` devolve `official-trump` em 1º. Case por **símbolo exato** e desempate por melhor rank (`escolherMoeda` em `src/fundamentos.mjs`), nunca pelo primeiro resultado. |
| Data civil volta um dia | `new Date('2026-08-03')` é meia-noite **UTC** e vira 02/08 em UTC−3. Use `src/datas.mjs`. |
| WebSocket conecta mas não chega mensagem | `!ticker@arr` gera frames de centenas de KB e é descartado no caminho de rede (medido: 0 msg em 20s). Use **`!miniTicker@arr`** — mesmo mercado, frames de 10 KB, e traz `s`/`c`/`q`, que é tudo que o scanner lê. |

## Fontes de dados (testadas em 2026-08-03)

| Fonte | Acesso | Traz |
|---|---|---|
| Binance | aberta | preço, livro, volume, candles |
| CoinGecko | aberta | capitalização, supply, ATH, categorias |
| CoinPaprika | aberta | **segunda opinião** de capitalização — discordou 21,5% da CoinGecko na FF |
| DefiLlama `/protocols` | aberta | TVL (dinheiro depositado) — o fundamento mais forte para token DeFi |
| Alternative.me | aberta | índice Medo/Ganância do mercado |
| CoinMarketCap | chave em `COIN_MARKET_API_KEY` | 3ª capitalização + **FDV pronto**. Grátis ~10k créditos/mês → cache de 24h. `ohlcv/historical` é **403** no plano grátis (candles vêm da Binance). |
| CryptoCompare | **401** | exige chave |
| DefiLlama `/emissions` | **402** | calendário de desbloqueio é pago |

Capitalização é **estimativa**, não medida: as fontes divergem porque estimam supply
circulante de formas diferentes. Use `consensoDeFontes` (mediana de três, não média —
a média é arrastada pelo extremo) e nomeie a fonte discordante. Na FF: CMC 191,5 mi e
CoinGecko 193,6 mi concordam, CoinPaprika 150,8 mi desvia 21%.

## Como reverificar

```bash
# filtros do par (minNotional, tickSize, stepSize)
curl -s "https://api.binance.com/api/v3/exchangeInfo?symbols=\[\"BTCUSDT\"\]"
# spread de todos os pares de uma vez
curl -s "https://api.binance.com/api/v3/ticker/bookTicker"
```

## Fora de escopo

Esta skill traz **restrições e custos verificáveis**, não previsão de preço. Não recomende comprar ou vender um ativo específico, e não afirme retorno esperado sem o número da etapa 3 acima.
