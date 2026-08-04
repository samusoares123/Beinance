/**
 * Padroes de candlestick — definicoes explicitas, em vez de "olho treinado".
 *
 * Cada padrao aqui vira um numero verificavel. Sem isso, "era um martelo" e
 * questao de opiniao depois do fato: com o preco ja subido, qualquer vela vira
 * martelo; com o preco caido, a mesma vela vira outra coisa.
 *
 * Vela: { abertura, maxima, minima, fechamento }
 */

const PROPORCAO_SOMBRA = 2 // sombra precisa ser N vezes o corpo
const CORPO_PEQUENO = 0.3 // fracao da amplitude que ainda conta como "corpo pequeno"

export function anatomia(vela) {
  const { abertura, maxima, minima, fechamento } = vela
  const topoCorpo = Math.max(abertura, fechamento)
  const baseCorpo = Math.min(abertura, fechamento)
  return {
    corpo: topoCorpo - baseCorpo,
    sombraSuperior: maxima - topoCorpo,
    sombraInferior: baseCorpo - minima,
    amplitude: maxima - minima,
    alta: fechamento > abertura,
  }
}

/**
 * Martelo: corpo pequeno no alto da vela, sombra inferior longa.
 * Leitura: vendedores empurraram o preco para baixo e foram rejeitados.
 */
export function martelo(vela) {
  const a = anatomia(vela)
  if (a.amplitude === 0 || a.corpo === 0) return false
  return a.sombraInferior >= a.corpo * PROPORCAO_SOMBRA && a.sombraSuperior <= a.corpo
}

/**
 * Engolfo de alta: vela de alta cujo corpo cobre inteiramente o corpo da vela
 * de baixa anterior.
 */
export function engolfoDeAlta(anterior, atual) {
  const ant = anatomia(anterior)
  const atu = anatomia(atual)
  if (ant.alta || !atu.alta) return false
  return atual.abertura <= anterior.fechamento && atual.fechamento >= anterior.abertura
}

/**
 * Estrela da manha: queda com corpo grande, indecisao, e retomada que fecha
 * acima do ponto medio da queda.
 */
export function estrelaDaManha(c1, c2, c3) {
  const a1 = anatomia(c1)
  const a2 = anatomia(c2)
  const a3 = anatomia(c3)

  if (a1.alta || !a3.alta) return false
  if (a1.amplitude === 0) return false
  if (a2.corpo > a2.amplitude * CORPO_PEQUENO && a2.corpo > a1.corpo * CORPO_PEQUENO) return false

  const meioDaQueda = (c1.abertura + c1.fechamento) / 2
  return c3.fechamento > meioDaQueda
}

/**
 * Tres soldados brancos: tres altas seguidas, cada uma fechando mais alto e
 * abrindo dentro do corpo da anterior — subida sustentada, nao gap.
 */
export function tresSoldadosBrancos(c1, c2, c3) {
  const velas = [c1, c2, c3]
  if (!velas.every((v) => anatomia(v).alta)) return false
  if (!(c2.fechamento > c1.fechamento && c3.fechamento > c2.fechamento)) return false
  // Abrir dentro do corpo anterior e o que separa continuidade de gap.
  if (c2.abertura > c1.fechamento || c2.abertura < c1.abertura) return false
  if (c3.abertura > c2.fechamento || c3.abertura < c2.abertura) return false
  return true
}

/** Padroes que se fecham exatamente na ultima vela da serie. */
export function padroesEm(velas) {
  const n = velas.length
  const achados = []
  if (n < 1) return achados

  const ultima = velas[n - 1]
  if (martelo(ultima)) achados.push('martelo')
  if (n >= 2 && engolfoDeAlta(velas[n - 2], ultima)) achados.push('engolfo-de-alta')
  if (n >= 3 && estrelaDaManha(velas[n - 3], velas[n - 2], ultima)) achados.push('estrela-da-manha')
  if (n >= 3 && tresSoldadosBrancos(velas[n - 3], velas[n - 2], ultima)) achados.push('tres-soldados-brancos')

  return achados
}
