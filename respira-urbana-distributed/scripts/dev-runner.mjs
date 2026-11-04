#!/usr/bin/env node
// Recarrega um servico Node quando os arquivos mudam, SEM depender de eventos do sistema de arquivos.
//
// Por que existe: "node --watch" usa inotify. No Docker Desktop (Windows/macOS), alteracoes feitas no
// host nao geram esses eventos dentro do contêiner, entao o servico nunca recarregava. Aqui os arquivos
// sao verificados por polling (data de modificacao + tamanho), que funciona em qualquer pasta montada.
//
// Uso (docker-compose de desenvolvimento): node /dev-runner.mjs src/index.js
// Variaveis: DEV_POLL_MS (padrao 1000) = intervalo da verificacao.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const entry = path.resolve(process.argv[2] || 'src/index.js');
const root = path.dirname(entry);
const POLL_MS = Math.max(50, Number(process.env.DEV_POLL_MS) || 1000);
const tag = '[dev]';

function snapshot(dir, out = new Map()) {
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    if (it.name === 'node_modules' || it.name.startsWith('.')) continue;
    const p = path.join(dir, it.name);
    if (it.isDirectory()) snapshot(p, out);
    else {
      try { const s = fs.statSync(p); out.set(p, `${s.mtimeMs}:${s.size}`); } catch { /* arquivo sumiu no meio da leitura */ }
    }
  }
  return out;
}
const sameSnapshot = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child = null;
let stopping = false;

function start() {
  child = spawn(process.execPath, [entry], { stdio: 'inherit', env: process.env });
  const me = child;
  me.on('exit', (code, signal) => {
    if (child === me) child = null;
    if (!stopping && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      console.log(`${tag} o servico encerrou (codigo ${code}). Aguardando uma alteracao nos arquivos para tentar de novo...`);
    }
  });
}

async function stopChild() {
  const me = child;
  if (!me) return;
  await new Promise((resolve) => {
    const t = setTimeout(() => { try { me.kill('SIGKILL'); } catch { /* ja saiu */ } }, 3000);
    me.once('exit', () => { clearTimeout(t); resolve(); });
    try { me.kill('SIGTERM'); } catch { clearTimeout(t); resolve(); }
  });
}

async function restart(reason) {
  console.log(`${tag} ${reason}: reiniciando...`);
  await stopChild();
  start();
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => { stopping = true; await stopChild(); process.exit(0); });
}

console.log(`${tag} vigiando ${root} (verificacao a cada ${POLL_MS} ms)`);
let last = snapshot(root);
start();

for (;;) {
  await sleep(POLL_MS);
  const now = snapshot(root);
  if (sameSnapshot(last, now)) continue;
  // espera a gravacao terminar (editores salvam em varias etapas) antes de reiniciar
  let settled = now;
  for (let i = 0; i < 10; i++) {
    await sleep(Math.min(POLL_MS, 200));
    const again = snapshot(root);
    if (sameSnapshot(settled, again)) break;
    settled = again;
  }
  const changed = [...settled].filter(([k, v]) => last.get(k) !== v).map(([k]) => path.relative(root, k));
  const removed = [...last.keys()].filter((k) => !settled.has(k)).map((k) => path.relative(root, k));
  last = settled;
  await restart(`alteracao em ${[...changed, ...removed].slice(0, 3).join(', ') || 'arquivos'}`);
}
