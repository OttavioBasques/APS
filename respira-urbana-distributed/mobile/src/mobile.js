// Camada especifica do app Android (Capacitor). Roda ANTES do client/index.html e so adiciona:
//  - o endereco do servidor (api-gateway), salvo no aparelho e editavel numa tela de configuracao;
//  - a permissao de localizacao nativa.
// O restante do app e exatamente o client web.
(function (root) {
  'use strict';
  var KEY = 'respira:gateway';
  var EMULATOR = 'http://10.0.2.2:3000';   // o PC visto de dentro do emulador Android

  // "192.168.0.10" -> http://192.168.0.10:3000 ; "http://meu.host:3000/" -> sem barra final ; invalido -> null
  function normalizeUrl(input) {
    var t = String(input == null ? '' : input).trim();
    if (!t) return null;
    var hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t);
    if (!hasScheme) t = 'http://' + t;
    var u;
    try { u = new URL(t); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    if (!hasScheme && !u.port) u.port = '3000';
    var path = u.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
    return u.protocol + '//' + u.host + path;
  }

  function stored() {
    try { return localStorage.getItem(KEY) || null; } catch (e) { return null; }
  }
  function store(url) {
    try { localStorage.setItem(KEY, url); } catch (e) { /* sem storage */ }
  }

  // Confere se o endereco e mesmo um api-gateway do Respira Urbana.
  async function testGateway(url, fetchImpl) {
    var f = fetchImpl || root.fetch;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 6000) : null;
    try {
      var res = await f(url + '/health', ctrl ? { signal: ctrl.signal } : {});
      if (!res.ok) return { ok: false, message: 'O servidor respondeu ' + res.status + '.' };
      var body = await res.json();
      if (body && body.service === 'api-gateway') return { ok: true, message: 'Conectado ao servidor.' };
      return { ok: false, message: 'Esse endereço responde, mas não parece ser o servidor do Respira Urbana.' };
    } catch (e) {
      return { ok: false, message: 'Não foi possível conectar. Confira o IP, o Wi‑Fi e o firewall do computador.' };
    } finally { if (timer) clearTimeout(timer); }
  }

  function isNative() {
    var C = root.Capacitor;
    try { return Boolean(C && C.isNativePlatform && C.isNativePlatform()); } catch (e) { return false; }
  }

  var api = { normalizeUrl: normalizeUrl, testGateway: testGateway, stored: stored, EMULATOR: EMULATOR, isNative: isNative };
  root.RespiraMobile = api;

  // O client le window.RESPIRA_GATEWAY na inicializacao
  var saved = stored();
  if (saved) root.RESPIRA_GATEWAY = saved;

  if (!root.document || !root.document.addEventListener) return;   // ambiente de teste sem DOM

  var forced = /[?&]mobile=1\b/.test((root.location && root.location.search) || '');
  if (!isNative() && !forced) return;

  // Permissao de localizacao nativa (o navegador do app so a pede ao sistema se ela ja existir)
  try {
    var G = root.Capacitor.Plugins && root.Capacitor.Plugins.Geolocation;
    if (G && G.requestPermissions) G.requestPermissions().catch(function () {});
  } catch (e) { /* segue com navigator.geolocation */ }

  var CSS =
    '.rm-back{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;padding:16px}' +
    '.rm-back.open{display:flex}' +
    '.rm-box{background:var(--panel,#fff);color:var(--ink,#10262A);border-radius:16px;padding:20px;width:100%;max-width:420px;font-family:Inter,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)}' +
    '.rm-box h2{margin:0 0 6px;font-size:18px}.rm-box p{margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--ink-soft,#4C6660)}' +
    '.rm-box input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--line,#D3E2DC);background:var(--bg,#F2F7F5);color:inherit;font-size:15px}' +
    '.rm-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}' +
    '.rm-btn{flex:1;min-width:110px;padding:10px 12px;border:0;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;background:var(--sage-bg,#E4EFE7);color:var(--accent,#2E5C55)}' +
    '.rm-btn.primary{background:var(--accent,#2E5C55);color:var(--bg,#fff)}' +
    '.rm-msg{min-height:18px;margin-top:10px;font-size:13px}.rm-msg.ok{color:var(--sage,#5C8A76)}.rm-msg.err{color:var(--coral,#B5473F)}';

  function build() {
    var d = root.document;
    var style = d.createElement('style');
    style.textContent = CSS;
    d.head.appendChild(style);

    var back = d.createElement('div');
    back.className = 'rm-back';
    back.innerHTML =
      '<div class="rm-box" role="dialog" aria-modal="true" aria-labelledby="rmTitle">' +
      '<h2 id="rmTitle">Servidor do Respira Urbana</h2>' +
      '<p id="rmHelp">Informe o endereço do computador onde o Docker está rodando, com o celular na mesma rede Wi‑Fi. Ex.: <b>192.168.0.10</b> (a porta 3000 é assumida). No emulador use <b>10.0.2.2</b>.</p>' +
      '<input id="rmInput" type="text" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="192.168.0.10">' +
      '<div class="rm-msg" id="rmMsg" role="status"></div>' +
      '<div class="rm-row"><button type="button" class="rm-btn" id="rmEmu">Usar emulador</button>' +
      '<button type="button" class="rm-btn" id="rmTest">Testar</button></div>' +
      '<div class="rm-row"><button type="button" class="rm-btn" id="rmCancel">Fechar</button>' +
      '<button type="button" class="rm-btn primary" id="rmSave">Salvar</button></div></div>';
    d.body.appendChild(back);

    var input = d.getElementById('rmInput');
    var msg = d.getElementById('rmMsg');
    function say(text, cls) { msg.textContent = text; msg.className = 'rm-msg ' + (cls || ''); }
    function open(first) {
      input.value = stored() || '';
      say(first ? 'Falta só isso para começar.' : '', '');
      d.getElementById('rmCancel').style.display = stored() ? '' : 'none';
      back.className = 'rm-back open';
    }
    function close() { back.className = 'rm-back'; }

    async function check() {
      var url = normalizeUrl(input.value);
      if (!url) { say('Endereço inválido.', 'err'); return null; }
      say('Testando…', '');
      var r = await testGateway(url);
      say(r.message, r.ok ? 'ok' : 'err');
      return r.ok ? url : null;
    }
    d.getElementById('rmEmu').addEventListener('click', function () { input.value = EMULATOR; });
    d.getElementById('rmTest').addEventListener('click', check);
    d.getElementById('rmCancel').addEventListener('click', close);
    d.getElementById('rmSave').addEventListener('click', async function () {
      var url = normalizeUrl(input.value);
      if (!url) { say('Endereço inválido.', 'err'); return; }
      var r = await testGateway(url);
      if (!r.ok) { say(r.message + ' Toque em Salvar de novo para gravar mesmo assim.', 'err'); if (!input.dataset.force) { input.dataset.force = '1'; return; } }
      store(url);
      root.location.reload();
    });
    input.addEventListener('input', function () { delete input.dataset.force; });

    // botao de engrenagem ao lado do botao de tema
    var theme = d.getElementById('themeBtn');
    if (theme && theme.parentNode) {
      var gear = d.createElement('button');
      gear.type = 'button';
      gear.className = 'icon-btn ghost';
      gear.title = 'Servidor';
      gear.setAttribute('aria-label', 'Configurar servidor');
      gear.textContent = '⚙️';
      gear.addEventListener('click', function () { open(false); });
      theme.parentNode.insertBefore(gear, theme);
    }
    if (!stored()) open(true);
  }

  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', build);
  else build();
})(typeof window !== 'undefined' ? window : globalThis);
