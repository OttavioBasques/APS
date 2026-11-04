import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { patchManifest, PERMISSIONS } from '../mobile/scripts/patch-android.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileSrc = fs.readFileSync(path.join(root, 'mobile/src/mobile.js'), 'utf8');

function loadMobile(sandbox = {}) {
  const win = { fetch: undefined, ...sandbox };
  win.window = win;
  vm.runInNewContext(mobileSrc, { ...win, window: win, globalThis: win, localStorage: sandbox.localStorage, URL, AbortController, setTimeout, clearTimeout });
  return win;
}

test('mobile: normalizeUrl aceita IP, porta, https e rejeita lixo', () => {
  const { normalizeUrl } = loadMobile().RespiraMobile;
  assert.equal(normalizeUrl('192.168.0.10'), 'http://192.168.0.10:3000');
  assert.equal(normalizeUrl('  192.168.0.10:3100/ '), 'http://192.168.0.10:3100');
  assert.equal(normalizeUrl('http://10.0.2.2:3000/api/'), 'http://10.0.2.2:3000');
  assert.equal(normalizeUrl('https://respira.exemplo.com'), 'https://respira.exemplo.com');
  assert.equal(normalizeUrl('meu-pc.local'), 'http://meu-pc.local:3000');
  for (const bad of ['', '   ', null, 'ftp://x', 'http://', 'a b c']) assert.equal(normalizeUrl(bad), null, String(bad));
});

test('mobile: endereco salvo vira window.RESPIRA_GATEWAY; sem endereco, nada e definido', () => {
  const mk = (v) => ({ getItem: (k) => (k === 'respira:gateway' ? v : null), setItem() {} });
  assert.equal(loadMobile({ localStorage: mk('http://192.168.0.5:3000') }).RESPIRA_GATEWAY, 'http://192.168.0.5:3000');
  assert.equal(loadMobile({ localStorage: mk(null) }).RESPIRA_GATEWAY, undefined);
  // storage que lanca erro (modo privado) nao derruba o app
  assert.equal(loadMobile({ localStorage: { getItem() { throw new Error('x'); } } }).RESPIRA_GATEWAY, undefined);
});

test('mobile: testGateway reconhece o gateway e explica as falhas', async () => {
  const { testGateway } = loadMobile().RespiraMobile;
  const resp = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });
  assert.equal((await testGateway('http://x', resp({ status: 'ok', service: 'api-gateway' }))).ok, true);
  const other = await testGateway('http://x', resp({ status: 'ok', service: 'outra-coisa' }));
  assert.equal(other.ok, false); assert.match(other.message, /não parece/);
  assert.match((await testGateway('http://x', resp({}, false, 502))).message, /502/);
  const down = await testGateway('http://x', async () => { throw new Error('rede'); });
  assert.equal(down.ok, false); assert.match(down.message, /Wi‑Fi|firewall/);
});

test('mobile: build-web injeta mobile.js sem alterar o client', () => {
  const clientBefore = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'respira-www-'));
  execFileSync(process.execPath, [path.join(root, 'mobile/scripts/build-web.mjs'), '--out', out]);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(html.indexOf('mobile.js') < html.indexOf('window.RESPIRA_GATEWAY'), 'mobile.js deve vir antes do script do app');
  assert.ok(fs.existsSync(path.join(out, 'mobile.js')));
  assert.equal(html.replace(/<head>\n<script src="mobile.js" charset="utf-8"><\/script>/, '<head>'), clientBefore);
  assert.equal(fs.readFileSync(path.join(root, 'client/index.html'), 'utf8'), clientBefore);
  fs.rmSync(out, { recursive: true });
});

test('mobile: o client web continua usando ?gateway= e o padrao local', () => {
  const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
  assert.match(html, /params\.get\('gateway'\) \|\| window\.RESPIRA_GATEWAY \|\| 'http:\/\/localhost:3000'/);
});

test('mobile: patchManifest libera http e garante permissoes (idempotente)', () => {
  const sample = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>`;
  const once = patchManifest(sample);
  assert.match(once, /android:usesCleartextTraffic="true"/);
  for (const p of PERMISSIONS) assert.equal(once.split(`android:name="${p}"`).length - 1, 1, p);
  assert.equal(patchManifest(once), once);
  assert.match(patchManifest(sample.replace('android:allowBackup', 'android:usesCleartextTraffic="false" android:allowBackup')), /usesCleartextTraffic="true"/);
  assert.throws(() => patchManifest('<manifest></manifest>'), /application/);
});

test('mobile: capacitor.config.json usa esquema http (gateway local sem HTTPS)', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, 'mobile/capacitor.config.json'), 'utf8'));
  assert.equal(cfg.webDir, 'www');
  assert.equal(cfg.server.androidScheme, 'http');
  assert.match(cfg.appId, /^[a-z]+(\.[a-z0-9]+)+$/);
});

test('mobile: no app nativo sem servidor salvo abre a configuracao e adiciona a engrenagem', () => {
  const els = {};
  const mkEl = () => ({ style: {}, dataset: {}, className: '', _l: {}, children: [],
    addEventListener(e, f) { this._l[e] = f; }, setAttribute() {}, appendChild(c) { this.children.push(c); },
    insertBefore(c) { this.children.push(c); }, set innerHTML(v) { this._h = v; const re = /id="(\w+)"/g; let m; while ((m = re.exec(v))) els[m[1]] = mkEl(); }, get innerHTML() { return this._h; } });
  const theme = Object.assign(mkEl(), { parentNode: mkEl() });
  els.themeBtn = theme;
  const body = mkEl(); const head = mkEl();
  const document = { readyState: 'complete', head, body, addEventListener() {}, createElement: () => mkEl(), getElementById: (id) => els[id] };
  const win = loadMobile({ document, location: { search: '', reload() {} }, localStorage: { getItem: () => null, setItem() {} },
    Capacitor: { isNativePlatform: () => true, Plugins: { Geolocation: { requestPermissions: () => Promise.resolve() } } } });
  assert.equal(win.RESPIRA_GATEWAY, undefined);
  const back = body.children[0];
  assert.match(back.className, /open/);                    // primeira execucao: pede o servidor
  assert.equal(theme.parentNode.children.length, 1);       // engrenagem ao lado do tema
  assert.equal(theme.parentNode.children[0].textContent, '⚙️');
  // no navegador comum (web) nada disso e ativado
  const web = loadMobile({ document: { ...document, body: mkEl() }, location: { search: '' }, localStorage: { getItem: () => null }, Capacitor: undefined });
  assert.equal(web.RespiraMobile.isNative(), false);
});
