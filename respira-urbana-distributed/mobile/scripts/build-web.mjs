// Monta mobile/www a partir do client web (sem alterar o client): copia index.html,
// injeta mobile.js antes de tudo e copia mobile.js. Uso: node scripts/build-web.mjs [--out pasta]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outIdx = process.argv.indexOf('--out');
const out = outIdx > 0 ? path.resolve(process.argv[outIdx + 1]) : path.join(root, 'www');

const html = fs.readFileSync(path.resolve(root, '../client/index.html'), 'utf8');
if (!html.includes('<head>')) throw new Error('client/index.html sem <head>: nao foi possivel injetar mobile.js');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html.replace('<head>', '<head>\n<script src="mobile.js" charset="utf-8"></script>'));
fs.copyFileSync(path.join(root, 'src/mobile.js'), path.join(out, 'mobile.js'));
console.log(`[mobile] web empacotado em ${out}`);
