import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const harness = fileURLToPath(new URL('./helpers/client-harness.mjs', import.meta.url));
const html = fileURLToPath(new URL('../client/index.html', import.meta.url));

test('cliente: temas no mapa, legendas, riscos, alertas e monitoramento (DOM simulado)', async () => {
  const out = await new Promise((resolve, reject) => {
    execFile(process.execPath, [harness, html], { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || stdout || err.message)); else resolve(stdout);
    });
  });
  assert.match(out, /CLIENT HARNESS OK/);
});
