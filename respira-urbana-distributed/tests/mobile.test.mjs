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
  assert.match(html, /params\.get\('gateway'\) \|\| window\.RESPIRA_GATEWAY \|\| SAME_ORIGIN \|\| 'http:\/\/localhost:3000'/);
  assert.match(html, /window\.location\.port === '' && !window\.Capacitor/);    // app Android nunca usa a origem http://localhost
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

function pushEnv({ permission = 'granted', gateway = 'http://srv:3000', registerStatus = 201, position } = {}) {
  const store = { 'respira:gateway': gateway };
  const localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const listeners = {}; const calls = []; const fetched = [];
  const P = {
    requestPermissions: async () => ({ receive: permission }),
    createChannel: async (c) => { calls.push(['channel', c]); },
    addListener: (ev, fn) => { listeners[ev] = fn; },
    register: async () => { setImmediate(() => listeners.registration({ value: 'TOKEN-' + 'x'.repeat(30) })); },
    unregister: async () => { calls.push(['unregister']); }
  };
  const went = [];
  const win = loadMobile({
    localStorage,
    fetch: async (url, init) => { fetched.push([url, JSON.parse(init.body)]); return { ok: registerStatus < 400, status: registerStatus, json: async () => ({ ok: true }) }; },
    respiraGo: (...a) => went.push(a),
    Capacitor: { isNativePlatform: () => true, Plugins: { PushNotifications: P, ...(position ? { Geolocation: { getCurrentPosition: async () => ({ coords: position }) } } : {}) } }
  });
  const status = [];
  win.RespiraMobile.onPushStatus((m, ok) => status.push([m, ok]));
  return { win, api: win.RespiraMobile, store, listeners, calls, fetched, went, status };
}
const plain = (o) => JSON.parse(JSON.stringify(o));   // objetos criados no vm tem outro prototipo
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test('mobile push: preferencias com padroes e corpo do cadastro', () => {
  const { api, store } = pushEnv();
  assert.deepEqual(plain(api.pushPrefs()), { enabled: false, minLevel: 'media', scope: 'all' });
  api.savePushPrefs({ enabled: true, minLevel: 'alta', scope: 'near' });
  assert.deepEqual(plain(api.pushPrefs()), { enabled: true, minLevel: 'alta', scope: 'near' });
  store['respira:push'] = '{lixo';
  assert.equal(api.pushPrefs().enabled, false);
  const tok = 'T'.repeat(30);
  assert.deepEqual(plain(api.buildRegistration({ minLevel: 'alta', scope: 'all' }, tok, { lat: 1, lon: 2 })), { token: tok, platform: 'android', minLevel: 'alta' });
  assert.deepEqual(plain(api.buildRegistration({ minLevel: 'media', scope: 'near' }, tok, { lat: -22.9, lon: -48.4 })),
    { token: tok, platform: 'android', minLevel: 'media', lat: -22.9, lon: -48.4, radiusKm: 100 });
  assert.equal(api.buildRegistration({ minLevel: 'media', scope: 'near' }, tok, null).lat, undefined);   // sem GPS: todas as cidades
});

test('mobile push: ligar pede permissao, cria canal e cadastra o token no servidor', async () => {
  const e = pushEnv({ position: { latitude: -22.88, longitude: -48.44 } });
  e.api.savePushPrefs({ enabled: true, minLevel: 'alta', scope: 'near' });
  const r = await e.api.enablePush();
  assert.equal(r.ok, true);
  await tick();
  assert.equal(e.calls[0][1].id, 'alerts');
  assert.equal(e.fetched.length, 1);
  assert.equal(e.fetched[0][0], 'http://srv:3000/api/push/register');
  assert.deepEqual(e.fetched[0][1], { token: 'TOKEN-' + 'x'.repeat(30), platform: 'android', minLevel: 'alta', lat: -22.88, lon: -48.44, radiusKm: 100 });
  assert.equal(e.store['respira:pushToken'], 'TOKEN-' + 'x'.repeat(30));
  assert.deepEqual(plain(e.status.at(-1)), ['Notificações ativas neste aparelho.', true]);

  // tocar na notificacao abre o local do alerta
  e.listeners.pushNotificationActionPerformed({ notification: { data: { lat: '-34', lon: '-71', place: 'Valparaiso' } } });
  assert.deepEqual(plain(e.went[0]), [-34, -71, 'Valparaiso']);
  e.listeners.pushNotificationActionPerformed({ notification: { data: { lat: '', lon: '' } } });   // alerta sem posicao
  assert.equal(e.went.length, 1);

  // desligar descadastra no servidor e esquece o token
  const off = await e.api.disablePush();
  assert.equal(off.ok, true);
  assert.equal(e.fetched.at(-1)[0], 'http://srv:3000/api/push/unregister');
  assert.equal(e.store['respira:pushToken'], undefined);
  assert.ok(e.calls.some((c) => c[0] === 'unregister'));
});

test('mobile push: permissao negada, sem servidor e FCM nao configurado no servidor', async () => {
  const denied = pushEnv({ permission: 'denied' });
  const d = await denied.api.enablePush();
  assert.equal(d.ok, false); assert.match(d.message, /Permissão negada/);
  assert.equal(denied.fetched.length, 0);

  const noServer = pushEnv({ gateway: '' });
  noServer.store['respira:gateway'] = '';
  assert.match((await noServer.api.enablePush()).message, /servidor/);

  const off = pushEnv({ registerStatus: 503 });
  await off.api.enablePush(); await tick();
  assert.equal(off.status.at(-1)[1], false);
  assert.match(off.status.at(-1)[0], /FCM/);

  const failed = pushEnv();
  await failed.api.enablePush();
  failed.listeners.registrationError({ error: 'SERVICE_NOT_AVAILABLE' });
  assert.match(failed.status.at(-1)[0], /google-services\.json/);
});
