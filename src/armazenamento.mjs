/**
 * Persistencia em arquivo texto. Interface estreita de proposito: se um dia o
 * projeto precisar de banco, so este arquivo muda.
 */

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

const CAMINHOS = {
  snapshots: 'data/snapshots.jsonl',
  aportes: 'data/aportes.json',
  alphaManual: 'data/alpha-manual.json',
  sinais: 'data/sinais.jsonl',
  operacoes: 'data/operacoes.jsonl',
  estadoRobo: 'data/robo-estado.json',
}

async function garantirPasta(caminho) {
  const pasta = dirname(caminho)
  if (!existsSync(pasta)) await mkdir(pasta, { recursive: true })
}

async function lerJson(caminho, padrao) {
  if (!existsSync(caminho)) return padrao
  try {
    // O PowerShell do Windows grava UTF-8 com BOM; JSON.parse nao aceita o BOM.
    const texto = (await readFile(caminho, 'utf8')).replace(/^﻿/, '')
    return JSON.parse(texto)
  } catch {
    console.warn(`Aviso: ${caminho} esta corrompido — usando valor padrao.`)
    return padrao
  }
}

export async function salvarSnapshot(snapshot) {
  await garantirPasta(CAMINHOS.snapshots)
  await appendFile(CAMINHOS.snapshots, JSON.stringify(snapshot) + '\n', 'utf8')
}

export async function lerSnapshots() {
  if (!existsSync(CAMINHOS.snapshots)) return []
  const texto = await readFile(CAMINHOS.snapshots, 'utf8')
  return texto
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

export async function gravarSinal(sinal) {
  await garantirPasta(CAMINHOS.sinais)
  await appendFile(CAMINHOS.sinais, JSON.stringify(sinal) + '\n', 'utf8')
}

export async function lerSinais() {
  if (!existsSync(CAMINHOS.sinais)) return []
  const texto = await readFile(CAMINHOS.sinais, 'utf8')
  return texto.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
}

/** Reescreve o arquivo inteiro — usado ao preencher desfechos. */
export async function regravarSinais(sinais) {
  await garantirPasta(CAMINHOS.sinais)
  await writeFile(CAMINHOS.sinais, sinais.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8')
}

// --- robo (modo simulado) ------------------------------------------------

export async function gravarOperacao(operacao) {
  await garantirPasta(CAMINHOS.operacoes)
  await appendFile(CAMINHOS.operacoes, JSON.stringify(operacao) + '\n', 'utf8')
}

export async function lerOperacoes() {
  if (!existsSync(CAMINHOS.operacoes)) return []
  const texto = await readFile(CAMINHOS.operacoes, 'utf8')
  return texto.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
}

/** Estado sobrevive a reinicio: posicoes abertas nao podem sumir num Ctrl+C. */
export async function lerEstadoRobo(capitalInicialUsdt) {
  const padrao = {
    capitalUsdt: capitalInicialUsdt,
    capitalInicioDoDia: capitalInicialUsdt,
    posicoes: [],
    stopsSeguidos: 0,
  }
  return lerJson(CAMINHOS.estadoRobo, padrao)
}

export async function salvarEstadoRobo(estado) {
  await garantirPasta(CAMINHOS.estadoRobo)
  await writeFile(CAMINHOS.estadoRobo, JSON.stringify(estado, null, 2), 'utf8')
}

/** [{ data: '2026-08-01', valorBRL: 100 }] */
export const lerAportes = () => lerJson(CAMINHOS.aportes, [])

/** { dataLeitura: '2026-08-03', valorUsdt: 0.83 } — preenchido a mao pelo app. */
export const lerAlphaManual = () => lerJson(CAMINHOS.alphaManual, null)
