import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const RUNNER = new URL('../scripts/dev-runner.mjs', import.meta.url).pathname;
const wait = (cond, ms = 6000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const tick = () => (cond() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timeout esperando: ' + cond)) : setTimeout(tick, 30));
  tick();
});

test('dev-runner: reinicia ao mudar um arquivo (por polling), sobrevive a erro de sintaxe e encerra o filho com o SIGTERM', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devrunner-'));
  fs.mkdirSync(path.join(dir, 'src', 'sub'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'node_modules'), { recursive: true });
  const entry = path.join(dir, 'src', 'index.js');
  const write = (code) => fs.writeFileSync(entry, code);
  write("console.log('versao-1 pid=' + process.pid); setInterval(() => {}, 1000);");

  let out = '';
  const runner = spawn(process.execPath, [RUNNER, entry], { env: { ...process.env, DEV_POLL_MS: '100' }, stdio: ['ignore', 'pipe', 'pipe'] });
  runner.stdout.on('data', (d) => { out += d; });
  runner.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((r) => runner.on('exit', r));

  try {
    await wait(() => out.includes('versao-1'));
    const pid1 = Number(/versao-1 pid=(\d+)/.exec(out)[1]);

    // mudanca no arquivo principal
    await new Promise((r) => setTimeout(r, 30));
    write("console.log('versao-2 pid=' + process.pid); setInterval(() => {}, 1000);");
    await wait(() => out.includes('versao-2'));
    const pid2 = Number(/versao-2 pid=(\d+)/.exec(out)[1]);
    assert.notEqual(pid1, pid2);                                            // processo novo
    assert.throws(() => process.kill(pid1, 0), /ESRCH/);                    // o antigo morreu (nao fica orfao)
    assert.match(out, /alteracao em index\.js: reiniciando/);

    // arquivo novo em subpasta tambem dispara; node_modules e ignorado
    out = '';
    fs.writeFileSync(path.join(dir, 'src', 'node_modules', 'x.js'), 'x');
    await new Promise((r) => setTimeout(r, 500));
    assert.doesNotMatch(out, /reiniciando/);
    fs.writeFileSync(path.join(dir, 'src', 'sub', 'novo.js'), 'export const a = 1;');
    await wait(() => /reiniciando/.test(out) && /sub[\\/]novo\.js/.test(out));

    // erro de sintaxe: o runner avisa e espera; ao corrigir, volta a rodar
    out = '';
    write('const = ;');
    await wait(() => out.includes('Aguardando uma alteracao'));
    out = '';
    write("console.log('versao-3 pid=' + process.pid); setInterval(() => {}, 1000);");
    await wait(() => out.includes('versao-3'));
    const pid3 = Number(/versao-3 pid=(\d+)/.exec(out)[1]);

    // remover arquivo tambem conta
    out = '';
    fs.rmSync(path.join(dir, 'src', 'sub', 'novo.js'));
    await wait(() => /reiniciando/.test(out) && /novo\.js/.test(out));

    // SIGTERM (docker stop): o runner sai e leva o filho junto
    runner.kill('SIGTERM');
    assert.equal(await exited, 0);
    assert.throws(() => process.kill(pid3, 0), /ESRCH/);                    // o servico nao sobra rodando
  } finally {
    runner.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
