import test from 'node:test';
import assert from 'node:assert/strict';
import { snapGrid } from '../services/api-gateway/src/grid.js';
import { parseGridParams } from '../services/risk-service/src/grid.js';
import { buildAlert, buildMonitorAlerts, parseLocations, summarizeLocation, DEFAULT_LOCATIONS } from '../services/alert-service/src/alerts.js';
import { validateRegistration, shouldReceive, distanceKm, buildMessage } from '../services/push-service/src/targeting.js';
import { loadServiceAccount, signJwt, createFcm, isDeadToken } from '../services/push-service/src/fcm.js';
import crypto from 'node:crypto';
import { parseIncidents, parseFlow, classifyFlow, isTileCoord, tileUrl, incidentsUrl } from '../services/traffic-service/src/tomtom.js';

test('snapGrid: alinha a grade e limita o numero de celulas', () => {
  const v = snapGrid({ south: -22.95, west: -48.5, north: -22.8, east: -48.4 });
  assert.deepEqual(v, { step: 0.05, south: -22.95, north: -22.8, west: -48.5, east: -48.4 });
  // pequeno deslocamento do mapa cai na mesma grade (reaproveita o cache)
  const moved = snapGrid({ south: -22.94, west: -48.49, north: -22.81, east: -48.41 });
  assert.deepEqual(moved, v);

  const world = snapGrid({ south: -60, west: -180, north: 80, east: 180 });
  assert.equal(world.step, 90);
  assert.deepEqual([world.south, world.north, world.west, world.east], [-90, 90, -180, 180]);

  // todo retangulo possivel gera grade aceita pelos servicos (<= 100 celulas)
  for (const span of [0.07, 0.3, 1.2, 4, 9, 20, 60, 150, 340]) {
    const g = snapGrid({ south: -10, west: -20, north: -10 + span / 1.5, east: -20 + span });
    const ok = parseGridParams({ ...g });
    assert.ok(!ok.error, `span ${span}: ${ok.error}`);
    assert.ok(ok.rows * ok.cols <= 64, `span ${span}: ${ok.rows}x${ok.cols}`);
  }
  assert.ok(snapGrid({ south: 5, west: 0, north: 1, east: 2 }).error);
  assert.ok(snapGrid({ south: 'a', west: 0, north: 1, east: 2 }).error);
  // visao que ultrapassa -180/180 (copias do mundo) e recortada
  const wide = snapGrid({ south: -10, west: -400, north: 10, east: 400 });
  assert.deepEqual([wide.west, wide.east], [-180, 180]);
});

test('parseLocations: formato, entradas invalidas e padrao', () => {
  assert.equal(parseLocations(''), DEFAULT_LOCATIONS);
  assert.deepEqual(parseLocations('A:1:2; B : -3.5 : 4 ;ruim:x:1;C:99:0;:1:1'), [
    { name: 'A', lat: 1, lon: 2 }, { name: 'B', lat: -3.5, lon: 4 }]);
});

test('buildAlert (ar) e buildMonitorAlerts', () => {
  const air = buildAlert('air-quality-alerts', { aqi: 104.2, place: 'Cidade', lat: '-1', lon: '2' });
  assert.equal(air.kind, 'air-quality'); assert.equal(air.level, 'alta'); assert.match(air.title, /IQA 104/);
  assert.equal(buildAlert('air-quality-alerts', { aqi: 85, lat: 1, lon: 2 }).level, 'media');
  assert.equal(buildAlert('occurrence-events', {}), null);

  const loc = { name: 'X', lat: 1, lon: 2 };
  const none = buildMonitorAlerts(loc, {
    air: { current: { european_aqi: 30 } }, flood: { level: 'atencao' },
    inversion: { available: true, next24h: { level: 'fraca', trapsPollutants: false } },
    traffic: { enabled: true, major: 1, roadClosures: 0 } });
  assert.deepEqual(none, []);                       // nada relevante -> sem ruido
  assert.deepEqual(buildMonitorAlerts(loc, {}), []);  // servicos fora do ar -> sem alertas

  const all = buildMonitorAlerts(loc, {
    air: { current: { european_aqi: 120 } }, flood: { level: 'alto', reasons: ['r'] },
    inversion: { available: true, next24h: { level: 'moderada', trapsPollutants: true, maxStrength: 2 } },
    traffic: { enabled: true, major: 3, roadClosures: 0 } });
  assert.deepEqual(all.map((a) => [a.kind, a.level]), [
    ['air-quality', 'alta'], ['flood', 'media'], ['thermal-inversion', 'media'], ['traffic', 'media']]);
  // inversao moderada SEM vento fraco nao alerta
  assert.equal(buildMonitorAlerts(loc, { inversion: { available: true, next24h: { level: 'moderada', trapsPollutants: false } } }).length, 0);
  const s = summarizeLocation(loc, { air: { current: { european_aqi: 41.6 } }, flood: { level: 'baixo', rain: { next24hMm: 3 } } });
  assert.equal(s.aqi, 42); assert.equal(s.flood.next24hMm, 3); assert.equal(s.inversion, null); assert.equal(s.traffic, null);
});

test('TomTom: URLs, tiles, incidentes e fluxo', () => {
  assert.ok(isTileCoord(10, 380, 570)); assert.ok(!isTileCoord(3, 8, 0)); assert.ok(!isTileCoord(23, 0, 0)); assert.ok(!isTileCoord(1, 0.5, 0));
  assert.match(tileUrl('flow', 'relative', 10, 1, 2, 'k&y'), /\/tile\/flow\/relative\/10\/1\/2\.png\?key=k%26y$/);
  assert.match(incidentsUrl({ south: 1, west: 2, north: 3, east: 4 }, 'K'), /bbox=2,1,4,3/);

  const r = parseIncidents({ incidents: [
    { geometry: { type: 'LineString', coordinates: [[-48.1, -22.1], [-48.2, -22.2]] }, properties: { iconCategory: 1, magnitudeOfDelay: 2, delay: 120, roadNumbers: ['SP-300'] } },
    { geometry: { type: 'Point', coordinates: [-48, -22] }, properties: { iconCategory: 8, magnitudeOfDelay: 4 } },
    { properties: { iconCategory: 999 } }] });
  assert.equal(r.total, 3); assert.equal(r.roadClosures, 1); assert.equal(r.totalDelaySec, 120);
  assert.equal(r.items[0].categoryLabel, 'Acidente');           // moderado vem antes de "indefinido"
  assert.deepEqual([r.items[0].lat, r.items[0].lon], [-22.1, -48.1]);
  assert.equal(r.items[2].lat, null);
  assert.deepEqual(parseIncidents(null).items, []);

  assert.equal(parseFlow({}).available, false);
  assert.equal(classifyFlow(0.9).level, 'livre'); assert.equal(classifyFlow(0.6).level, 'moderado');
  assert.equal(classifyFlow(0.3).level, 'intenso'); assert.equal(classifyFlow(0.1).level, 'parado');
  assert.equal(classifyFlow(0.9, true).level, 'interditada');
  const f = parseFlow({ flowSegmentData: { currentSpeed: 10, freeFlowSpeed: 40 } });
  assert.equal(f.ratio, 0.25); assert.equal(f.level, 'intenso');
});

test('push: validateRegistration valida, arredonda a posicao e aplica padroes', () => {
  const t = 'a'.repeat(30);
  const r = validateRegistration({ token: t, lat: -22.8849, lon: -48.4412, platform: 'android' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.value.lat, r.value.lon, r.value.radiusKm, r.value.minLevel, r.value.kinds], [-22.88, -48.44, 100, 'media', null]);
  assert.equal(validateRegistration({ token: t }).value.lat, null);
  for (const bad of [null, {}, { token: 'a b '.repeat(10) }, { token: t, minLevel: 'x' }, { token: t, lat: 1 }, { token: t, lat: 1, lon: 1, radiusKm: 1 },
    { token: t, kinds: [] }, { token: t, kinds: ['foo'] }]) assert.equal(validateRegistration(bad).ok, false, JSON.stringify(bad));
});

test('push: shouldReceive combina nivel, tipo e distancia', () => {
  assert.ok(Math.abs(distanceKm(-23.55, -46.63, -22.91, -43.17) - 360) < 15);   // Sao Paulo - Rio
  const alert = { kind: 'flood', level: 'media', lat: -23.55, lon: -46.63 };
  assert.equal(shouldReceive({ minLevel: 'media' }, alert), true);                       // sem posicao: tudo
  assert.equal(shouldReceive({ minLevel: 'alta' }, alert), false);
  assert.equal(shouldReceive({ minLevel: 'media', kinds: ['traffic'] }, alert), false);
  assert.equal(shouldReceive({ minLevel: 'media', lat: -23.5, lon: -46.6, radiusKm: 50 }, alert), true);
  assert.equal(shouldReceive({ minLevel: 'media', lat: -22.91, lon: -43.17, radiusKm: 100 }, alert), false);
  assert.equal(shouldReceive({ minLevel: 'media', lat: 0, lon: 0 }, { kind: 'flood', level: 'alta' }), false);   // alerta sem posicao nao cabe em area
  const m = buildMessage('tok', { ...alert, title: 'T', detail: 'Cidade', id: 7 });
  assert.equal(m.message.data.alertId, '7'); assert.equal(m.message.android.priority, 'NORMAL');
  assert.equal(buildMessage('tok', { ...alert, level: 'alta', title: 'T' }).message.android.priority, 'HIGH');
});

test('push: FCM — conta de servico, JWT RS256 assinado e envio', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const json = JSON.stringify({ project_id: 'p', client_email: 'e@p.iam', private_key: privateKey });
  const sa = loadServiceAccount({ FCM_SERVICE_ACCOUNT_B64: Buffer.from(json).toString('base64') });
  assert.equal(sa.projectId, 'p');
  assert.equal(loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: json }).clientEmail, 'e@p.iam');
  assert.equal(loadServiceAccount({}), null);
  assert.equal(loadServiceAccount({ FCM_SERVICE_ACCOUNT_JSON: '{}' }), null);
  assert.equal(loadServiceAccount({ FCM_SERVICE_ACCOUNT_B64: 'lixo' }), null);

  const jwt = signJwt(sa, 1000);
  const [h, c, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.deepEqual([claims.iss, claims.iat, claims.exp, claims.scope], ['e@p.iam', 1000, 4600, 'https://www.googleapis.com/auth/firebase.messaging']);
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')));

  // o token OAuth e reaproveitado; 404 UNREGISTERED marca o token como morto; erro de rede nao
  let oauth = 0;
  const f = async (url, opts) => {
    if (String(url).includes('oauth2')) { oauth++; return { ok: true, json: async () => ({ access_token: 'T', expires_in: 3600 }) }; }
    const tok = JSON.parse(opts.body).message.token;
    if (tok === 'rede') throw new Error('timeout');
    if (tok === 'morto') return { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }) };
    return { ok: true, json: async () => ({}) };
  };
  const fcm = createFcm(sa, f);
  assert.deepEqual(await fcm.send({ message: { token: 'ok' } }), { ok: true });
  assert.equal((await fcm.send({ message: { token: 'morto' } })).dead, true);
  const net = await fcm.send({ message: { token: 'rede' } });
  assert.equal(net.ok, false); assert.equal(net.dead, false);
  assert.equal(oauth, 1);
  assert.equal(isDeadToken(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }), true);
  assert.equal(isDeadToken(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } }), false);
  assert.equal(isDeadToken(500, {}), false);
});
