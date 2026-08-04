# Beinance

Monitor e análise da minha conta na Binance. **Somente leitura** — não executa ordens.

Projeto pessoal, Node.js puro, **zero dependências**.

## Segurança

- A chave da Binance usa **apenas a permissão de leitura**. Sem negociação, sem saque.
- O cliente ([src/binance/client.mjs](src/binance/client.mjs)) tem uma **lista branca** de três
  endpoints de leitura e recusa qualquer outro. Não existe função de ordem no código — e
  [test/client.test.mjs](test/client.test.mjs) falha se alguém adicionar uma.
- `.env` e `data/` nunca vão para o git.

## Comandos

```bash
npm test                    # 77 testes, sem rede
npm run monitor             # posição por carteira e por moeda
node ficha.mjs ROBO         # dossiê de um par
npm run scanner             # observa ao vivo os pares elegíveis
npm run desfechos           # julga os sinais coletados
npm run painel              # tudo junto em http://localhost:4300
```

Copie `.env.example` para `.env` e preencha antes de rodar o que precisa de chave.

## Como funciona

| Etapa | O quê |
|---|---|
| **Filtro** | dos ~479 pares USDT, ficam os com custo de ida e volta ≤ 0,5%, tick ≤ 0,1% do preço e volume ≥ 100k |
| **Scanner** | WebSocket `!miniTicker@arr`, janelas ancoradas no relógio, grava o sinal com o livro real do instante |
| **Desfechos** | busca nos candles o que o preço fez 15min / 1h / 4h depois e desconta o custo |
| **Decisão** | só opera a regra cuja média líquida for positiva |

Ganho absoluto não é o objetivo desta fase. O objetivo é descobrir, gastando R$ 0, se
alguma regra tem retorno positivo **depois dos custos** — antes de arriscar dinheiro.

## Fontes

Binance (preço, livro, candles) · CoinGecko · CoinMarketCap · CoinPaprika (capitalização,
supply — as três divergem, então o consenso é por mediana) · DefiLlama (TVL) ·
Alternative.me (Medo/Ganância).

Detalhes de custo, cotas e armadilhas em
[.claude/skills/binance-trader/SKILL.md](.claude/skills/binance-trader/SKILL.md).
O desenho está em [docs/superpowers/specs/](docs/superpowers/specs/).

## Aviso

Isto mede custo, liquidez e histórico. **Não prevê preço** e não é recomendação de
investimento.
