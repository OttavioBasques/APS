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

  // ===== Notificacoes push (FCM via @capacitor/push-notifications) =====
  var PUSH_KEY = 'respira:push';
  var TOKEN_KEY = 'respira:pushToken';
  var DEFAULT_PREFS = { enabled: false, minLevel: 'media', scope: 'all' };

  function pushPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem(PUSH_KEY) || 'null');
      return {
        enabled: Boolean(p && p.enabled),
        minLevel: p && p.minLevel === 'alta' ? 'alta' : 'media',
        scope: p && p.scope === 'near' ? 'near' : 'all'
      };
    } catch (e) { return { enabled: DEFAULT_PREFS.enabled, minLevel: DEFAULT_PREFS.minLevel, scope: DEFAULT_PREFS.scope }; }
  }
  function savePushPrefs(p) { try { localStorage.setItem(PUSH_KEY, JSON.stringify(p)); } catch (e) { /* sem storage */ } }

  // Corpo do cadastro no servidor. "near" envia a posicao (o servidor arredonda para ~1 km).
  function buildRegistration(prefs, token, pos) {
    var body = { token: token, platform: 'android', minLevel: prefs.minLevel };
    if (prefs.scope === 'near' && pos && isFinite(pos.lat) && isFinite(pos.lon)) {
      body.lat = pos.lat; body.lon = pos.lon; body.radiusKm = 100;
    }
    return body;
  }

  async function postJson(path, body) {
    var g = stored();
    if (!g) throw new Error('sem servidor');
    var res = await root.fetch(g + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    var data = null;
    try { data = await res.json(); } catch (e) { /* sem corpo */ }
    return { ok: res.ok, status: res.status, data: data };
  }

  function getPosition() {
    return new Promise(function (resolve) {
      try {
        var G = root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.Geolocation;
        if (G && G.getCurrentPosition) {
          G.getCurrentPosition({ timeout: 8000 }).then(function (p) { resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); }, function () { resolve(null); });
          return;
        }
        if (root.navigator && root.navigator.geolocation) {
          root.navigator.geolocation.getCurrentPosition(function (p) { resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); }, function () { resolve(null); }, { timeout: 8000 });
          return;
        }
      } catch (e) { /* cai para null */ }
      resolve(null);
    });
  }

  var pushStatusCb = function () {};
  var listening = false;

  function plugin() { return root.Capacitor && root.Capacitor.Plugins && root.Capacitor.Plugins.PushNotifications; }

  function banner(title, body, data) {
    var d = root.document;
    if (!d || !d.createElement || !d.body) return;
    var el = d.createElement('div');
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 12px);z-index:3000;background:var(--panel,#fff);color:var(--ink,#10262A);' +
      'border-left:5px solid var(--coral,#B5473F);border-radius:12px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.35);font-family:Inter,sans-serif;font-size:13px;cursor:pointer';
    el.textContent = '';
    var b = d.createElement('b'); b.textContent = title || 'Alerta'; b.style.display = 'block';
    var t = d.createElement('span'); t.textContent = body || '';
    el.appendChild(b); el.appendChild(t);
    el.addEventListener('click', function () { openFromNotification(data); if (el.remove) el.remove(); });
    d.body.appendChild(el);
    setTimeout(function () { if (el.remove) el.remove(); }, 8000);
  }

  // Tocar na notificacao abre o local do alerta no mapa
  function openFromNotification(data) {
    var lat = Number(data && data.lat); var lon = Number(data && data.lon);
    if (data && data.lat !== '' && data.lon !== '' && isFinite(lat) && isFinite(lon) && typeof root.respiraGo === 'function') {
      root.respiraGo(lat, lon, (data && data.place) || 'Local do alerta');
    }
  }

  async function sendRegistration(token) {
    var prefs = pushPrefs();
    var pos = prefs.scope === 'near' ? await getPosition() : null;
    if (prefs.scope === 'near' && !pos) { pushStatusCb('Não consegui sua localização; recebendo alertas de todas as cidades.', false); }
    var r = await postJson('/api/push/register', buildRegistration(prefs, token, pos));
    if (r.status === 503) { pushStatusCb('O servidor ainda não tem as notificações configuradas (FCM).', false); return false; }
    if (!r.ok) { pushStatusCb('O servidor recusou o cadastro (' + r.status + ').', false); return false; }
    pushStatusCb('Notificações ativas neste aparelho.', true);
    return true;
  }

  function attachListeners(P) {
    if (listening) return;
    listening = true;
    P.addListener('registration', function (t) {
      try { localStorage.setItem(TOKEN_KEY, t.value); } catch (e) { /* ignora */ }
      sendRegistration(t.value).catch(function () { pushStatusCb('Não consegui falar com o servidor.', false); });
    });
    P.addListener('registrationError', function (e) {
      pushStatusCb('Falha ao registrar no Firebase: ' + ((e && (e.error || e.message)) || 'erro desconhecido') + '. Confira o google-services.json.', false);
    });
    P.addListener('pushNotificationReceived', function (n) { banner(n.title, n.body, n.data); });
    P.addListener('pushNotificationActionPerformed', function (a) { openFromNotification(a && a.notification && a.notification.data); });
  }

  // Liga as notificacoes: pede permissao, cria o canal, registra no Firebase e no servidor.
  async function enablePush() {
    var P = plugin();
    if (!P) return { ok: false, message: 'Notificações não estão disponíveis neste aparelho.' };
    if (!stored()) return { ok: false, message: 'Salve primeiro o endereço do servidor.' };
    var perm = await P.requestPermissions();
    if (!perm || perm.receive !== 'granted') return { ok: false, message: 'Permissão negada. Ative as notificações do app nas configurações do Android.' };
    try { await P.createChannel({ id: 'alerts', name: 'Alertas ambientais', description: 'Poluição, alagamento, inversão térmica e trânsito', importance: 4, visibility: 1 }); } catch (e) { /* canal ja existe */ }
    attachListeners(P);
    await P.register();   // dispara o evento "registration" com o token
    return { ok: true, message: 'Registrando…' };
  }

  async function disablePush() {
    var P = plugin();
    var token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* ignora */ }
    if (token && stored()) { try { await postJson('/api/push/unregister', { token: token }); } catch (e) { /* servidor fora: o token morre sozinho depois */ } }
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignora */ }
    if (P && P.unregister) { try { await P.unregister(); } catch (e) { /* ignora */ } }
    return { ok: true, message: 'Notificações desativadas.' };
  }

  api.pushPrefs = pushPrefs;
  api.savePushPrefs = savePushPrefs;
  api.buildRegistration = buildRegistration;
  api.enablePush = enablePush;
  api.disablePush = disablePush;
  api.openFromNotification = openFromNotification;
  api.onPushStatus = function (cb) { pushStatusCb = cb; };

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
    '.rm-hr{border:0;border-top:1px solid var(--line,#D3E2DC);margin:14px 0 10px}' +
    '.rm-check{display:flex;align-items:center;gap:8px;font-size:14px}.rm-check input{width:auto}' +
    '.rm-sel{flex:1;min-width:130px;font-size:12px;color:var(--ink-soft,#4C6660);display:flex;flex-direction:column;gap:3px}' +
    '.rm-sel select{padding:9px;border-radius:10px;border:1px solid var(--line,#D3E2DC);background:var(--bg,#F2F7F5);color:var(--ink,#10262A);font-size:14px}' +
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
      '<hr class="rm-hr">' +
      '<h2 style="font-size:15px;margin-top:4px">Notificações</h2>' +
      '<label class="rm-check"><input type="checkbox" id="rmPushOn"> Receber alertas no celular</label>' +
      '<div class="rm-row"><label class="rm-sel">Nível<select id="rmPushLevel"><option value="media">Todos</option><option value="alta">Só os graves</option></select></label>' +
      '<label class="rm-sel">Área<select id="rmPushScope"><option value="all">Todas as cidades monitoradas</option><option value="near">Perto de mim (100 km)</option></select></label></div>' +
      '<div class="rm-msg" id="rmPushMsg" role="status"></div>' +
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
      loadPushUi();
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
    var pushOn = d.getElementById('rmPushOn');
    var pushLevel = d.getElementById('rmPushLevel');
    var pushScope = d.getElementById('rmPushScope');
    var pushMsg = d.getElementById('rmPushMsg');
    function pushSay(text, ok) { pushMsg.textContent = text; pushMsg.className = 'rm-msg ' + (ok ? 'ok' : 'err'); }
    api.onPushStatus(pushSay);
    function loadPushUi() {
      var p = pushPrefs();
      pushOn.checked = p.enabled; pushLevel.value = p.minLevel; pushScope.value = p.scope;
    }
    async function applyPush() {
      var p = { enabled: pushOn.checked, minLevel: pushLevel.value, scope: pushScope.value };
      savePushPrefs(p);
      try {
        var r = p.enabled ? await enablePush() : await disablePush();
        pushSay(r.message, r.ok);
        if (!r.ok && p.enabled) { p.enabled = false; savePushPrefs(p); pushOn.checked = false; }
      } catch (e) { pushSay('Não foi possível alterar as notificações: ' + (e && e.message ? e.message : e), false); }
    }
    pushOn.addEventListener('change', applyPush);
    pushLevel.addEventListener('change', function () { if (pushOn.checked) applyPush(); else savePushPrefs({ enabled: false, minLevel: pushLevel.value, scope: pushScope.value }); });
    pushScope.addEventListener('change', function () { if (pushOn.checked) applyPush(); else savePushPrefs({ enabled: false, minLevel: pushLevel.value, scope: pushScope.value }); });

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
    // reenvia o cadastro a cada abertura: o token pode mudar e o servidor remove aparelhos inativos
    else if (pushPrefs().enabled) enablePush().catch(function () { /* silencioso */ });
  }

  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', build);
  else build();
})(typeof window !== 'undefined' ? window : globalThis);
