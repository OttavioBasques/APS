// Teste de ponta a ponta do backend: gateway + microsservicos + Redis em memoria, todos no mesmo processo, com as APIs externas simuladas.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';

await import('./shims/register.mjs');
const { installUpstreamMock, upstreamCalls, fcmSent, gfwCalls } = await import('./helpers/upstream.mjs');
const { generateKeyPairSync } = await import('node:crypto');
installUpstreamMock();

// conta de servico FCM de mentira, com chave RSA real (o push-service assina o JWT de verdade)
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
process.env.FCM_SERVICE_ACCOUNT_B64 = Buffer.from(JSON.stringify({
  type: 'service_account', project_id: 'teste', client_email: 'push@teste.iam.gserviceaccount.com', private_key: privateKey,
  token_uri: 'https://oauth2.googleapis.com/token' })).toString('base64');

const GW = 'http://localhost:4000';

const start = async (dir, env) => {
  Object.assign(process.env, env);
  await import(`../services/${dir}/src/index.js`);
};

before(async () => {
  Object.assign(process.env, {
    OPENWEATHER_API_KEY: 'owm-key', TOMTOM_API_KEY: 'tt-key',
    MONITOR_LOCATIONS: 'Botucatu:-22.88:-48.44;Santiago:-33.5:-70.6', MONITOR_STARTUP_DELAY_MS: '50', MONITOR_INTERVAL_SECONDS: '3600',
    RISK_SERVICE_URL: 'http://localhost:4005', AIR_QUALITY_SERVICE_URL: 'http://localhost:4003', TRAFFIC_SERVICE_URL: 'http://localhost:4008',
    GEOCODING_SERVICE_URL: 'http://localhost:4001', WEATHER_SERVICE_URL: 'http://localhost:4002',
    AIR_QUALITY_SERVICE_URL: 'http://localhost:4003', ALERT_SERVICE_URL: 'http://localhost:4004',
    RISK_SERVICE_URL: 'http://localhost:4005', GEODATA_SERVICE_URL: 'http://localhost:4006',
    TRAFFIC_SERVICE_URL: 'http://localhost:4008', PUSH_SERVICE_URL: 'http://localhost:4009'
  });
  await start('geocoding-service', { PORT: '4001' });
  await start('weather-service', { PORT: '4002' });
  await start('air-quality-service', { PORT: '4003' });
  await start('alert-service', { PORT: '4004' });
  await start('risk-service', { PORT: '4005' });
  await start('geodata-service', { PORT: '4006', GFW_API_KEY: 'gfw-teste', GFW_ORIGIN: 'http://localhost' });
  await start('traffic-service', { PORT: '4008' });
  await start('push-service', { PORT: '4009' });
  await start('api-gateway', { PORT: '4000' });
  await new Promise((r) => setTimeout(r, 300));
});

const call = async (method, path, body) => {
  const res = await fetch(GW + path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  return { status: res.status, data, headers: res.headers };
};
const waitFor = async (fn, ms = 1500) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return v;
    await new Promise((r) => setTimeout(r, 40));
  }
};

test('health de todos os servicos', async () => {
  for (const [port, name] of [[4000, 'api-gateway'], [4001, 'geocoding-service'], [4002, 'weather-service'], [4003, 'air-quality-service'],
    [4004, 'alert-service'], [4005, 'risk-service'], [4006, 'geodata-service'], [4008, 'traffic-service'], [4009, 'push-service']]) {
    const r = await fetch(`http://localhost:${port}/health`);
    assert.equal(r.status, 200, name);
    assert.equal((await r.json()).service, name);
  }
});

test('config entrega chaves e URL de desmatamento padrao', async () => {
  const { data } = await call('GET', '/api/config');
  assert.equal(data.openWeatherApiKey, 'owm-key');
  assert.equal(data.trafficEnabled, true);
  assert.equal(data.tomtomApiKey, undefined);   // a chave da TomTom nunca sai do servidor
  assert.match(data.deforestationTilesUrl, /\{z\}\/\{x\}\/\{y\}/);
});

test('environment: clima, ar e riscos em uma unica chamada', async () => {
  const { status, data } = await call('GET', '/api/environment?lat=-22.88&lon=-48.44&place=Botucatu');
  assert.equal(status, 200);
  assert.equal(data.weather.current.cloud_cover, 80);
  assert.equal(data.weather.current.pressure_msl, 1012.6);
  assert.equal(data.weather.precipitationProbability, 40);
  assert.equal(data.airQuality.current.european_aqi, 32);
  assert.equal(data.risks.flood.level, 'muito_alto');            // chuva 62 mm (alto) + vazao 3,5x
  assert.equal(data.risks.flood.river.available, true);
  assert.equal(data.risks.flood.rain.next24hMm, 62.4);
  assert.equal(data.risks.inversion.available, true);
  assert.equal(data.risks.inversion.next24h.level, 'forte');
  assert.equal(data.risks.inversion.next24h.maxStrength, 3.4);
  assert.equal(data.risks.inversion.next24h.windows.length, 1);
  assert.deepEqual(data.status, { weather: 'live', airQuality: 'live', flood: 'live', inversion: 'live', traffic: 'live', risks: 'live' });
  assert.equal(data.traffic.level, 'moderado');                  // 24 km/h de 40 km/h = 0,6
});

test('environment: valida entrada e tolera falha parcial', async () => {
  assert.equal((await call('GET', '/api/environment?lat=abc&lon=1')).status, 400);
  assert.equal((await call('GET', '/api/environment?lat=99&lon=1')).status, 400);
  assert.equal((await call('GET', '/api/environment')).status, 400);
  // latitude 1.23: previsao do tempo "cai"; qualidade do ar segue funcionando
  const { status, data } = await call('GET', '/api/environment?lat=1.23&lon=2.34');
  assert.equal(status, 200);
  assert.equal(data.weather, null);
  assert.equal(data.status.weather, 'unavailable');
  assert.equal(data.status.airQuality, 'live');
  assert.equal(data.status.risks, 'unavailable');
});

test('point: so busca as partes pedidas e usa cache', async () => {
  const before = upstreamCalls.length;
  const a = await call('GET', '/api/point?lat=-10.5&lon=-50.5&include=air,flood');
  assert.equal(a.status, 200);
  assert.equal(a.data.air.current.european_aqi, 32);
  assert.equal(a.data.flood.level, 'muito_alto');
  assert.equal(a.data.weather, null);
  assert.equal(a.data.source, 'live');
  const b = await call('GET', '/api/point?lat=-10.52&lon=-50.49&include=flood,air'); // mesma celula de 0,1 grau, mesma ordem canonica
  assert.equal(b.data.source, 'cache');
  assert.ok(upstreamCalls.length - before <= 3);
  const c = await call('GET', '/api/point?lat=-10.5&lon=-50.5');                    // padrao = weather
  assert.equal(c.data.weather.current.wind_gusts_10m, 30);
  assert.equal((await call('GET', '/api/point?lat=x&lon=1')).status, 400);
  assert.equal((await call('GET', '/api/point?lat=1.23&lon=2.34&include=weather')).status, 502);
});

test('grades: ar, chuva e inversao (alinhadas e em cache)', async () => {
  const q = 'south=-23.1&west=-48.7&north=-22.7&east=-48.2';
  const air = await call('GET', `/api/grid/air?${q}`);
  assert.equal(air.status, 200);
  assert.ok(air.data.cells.length >= 4 && air.data.cells.length <= 100);
  assert.equal(air.data.cells[0].aqi, 32);
  assert.equal(air.data.source, 'live');
  const again = await call('GET', '/api/grid/air?south=-23.09&west=-48.69&north=-22.71&east=-48.21'); // mesma grade alinhada
  assert.equal(again.data.source, 'cache');

  const rain = await call('GET', `/api/grid/rain?${q}`);
  assert.equal(rain.data.cells[0].mm24, 62.4);
  assert.equal(rain.data.cells[0].maxHourly, 2.6);

  const inv = await call('GET', `/api/grid/inversion?${q}`);
  assert.equal(inv.data.cells[0].maxStrength, 3.4);   // 13,4 C (180 m) - 10 C (2 m)

  const world = await call('GET', '/api/grid/air?south=-90&west=-200&north=90&east=200');
  assert.equal(world.status, 200);
  assert.ok(world.data.cells.length <= 100);
  assert.equal((await call('GET', '/api/grid/air?south=1&west=1&north=0&east=2')).status, 400);
});

test('transporte publico e mananciais (OpenStreetMap)', async () => {
  const t = await call('GET', '/api/transit?south=-22.9&west=-48.5&north=-22.8&east=-48.4&scope=all');
  assert.equal(t.status, 200);
  assert.equal(t.data.stops.length, 2);
  assert.equal(t.data.stops[0].kind, 'bus');
  assert.equal(t.data.stops[1].kind, 'metro');
  const t2 = await call('GET', '/api/transit?south=-22.9&west=-48.5&north=-22.8&east=-48.4&scope=all');
  assert.equal(t2.data.source, 'cache');
  assert.equal((await call('GET', '/api/transit?south=-24&west=-50&north=-22&east=-48&scope=all')).status, 422); // area grande
  const w = await call('GET', '/api/watersheds?south=0&west=0&north=1&east=1');
  assert.equal(w.status, 200);
  assert.deepEqual(w.data.features.map((f) => f.kind), ['water', 'protected']);
  assert.equal((await call('GET', '/api/watersheds?south=0&west=0')).status, 400);
});

test('alertas de qualidade do ar: 1 por local (deduplicacao)', async () => {
  await call('GET', '/api/environment?lat=-33.5&lon=-70.6&place=Santiago');   // IQA 95 -> alerta
  await call('GET', '/api/environment?lat=-33.5&lon=-70.6&place=Santiago');   // repetido -> sem novo alerta
  await call('GET', '/api/point?lat=-33.5&lon=-70.6&include=air');            // clique (quiet=1) -> sem alerta
  const feed = await waitFor(async () => {
    const r = await call('GET', '/api/alerts');
    return r.data.alerts.some((a) => a.kind === 'air-quality') ? r.data.alerts : null;
  });
  await new Promise((r) => setTimeout(r, 150));
  const air = (await call('GET', '/api/alerts')).data.alerts.filter((a) => a.kind === 'air-quality');
  assert.ok(feed);
  assert.equal(air.length, 1);
  assert.match(air[0].title, /IQA 95/);
  assert.equal(air[0].detail, 'Santiago');
});

test('CORS liberado para o navegador', async () => {
  const pre = await fetch(`${GW}/api/config`, { method: 'OPTIONS', headers: {
    origin: 'http://localhost:8080', 'access-control-request-method': 'GET' } });
  assert.ok([200, 204].includes(pre.status));
});

test('transito: tiles pelo gateway (chave nunca exposta), cache e validacao', async () => {
  const before = upstreamCalls.filter((u) => u.includes('api.tomtom.com')).length;
  const t1 = await fetch(`${GW}/api/traffic/tiles/flow/10/380/570.png`);
  assert.equal(t1.status, 200);
  assert.equal(t1.headers.get('content-type'), 'image/png');
  assert.equal((await t1.arrayBuffer()).byteLength, 8);
  const t2 = await fetch(`${GW}/api/traffic/tiles/flow/10/380/570.png`);
  assert.equal(t2.status, 200);
  assert.equal(upstreamCalls.filter((u) => u.includes('api.tomtom.com')).length - before, 1);   // 2o veio do cache
  const inc = await fetch(`${GW}/api/traffic/tiles/incidents/10/380/570.png`);
  assert.equal(inc.status, 200);
  assert.equal((await fetch(`${GW}/api/traffic/tiles/outro/10/380/570.png`)).status, 400);
  assert.equal((await fetch(`${GW}/api/traffic/tiles/flow/3/99/1.png`)).status, 400);
  const st = await call('GET', '/api/traffic/status');
  assert.equal(st.data.enabled, true);
});

test('transito: incidentes e fluxo', async () => {
  const q = 'south=-23.0&west=-48.6&north=-22.8&east=-48.3';
  const inc = await call('GET', `/api/traffic/incidents?${q}`);
  assert.equal(inc.status, 200);
  assert.equal(inc.data.total, 3);
  assert.equal(inc.data.major, 1);
  assert.equal(inc.data.roadClosures, 1);
  assert.equal(inc.data.items[0].severityLabel, 'grave');
  assert.equal(inc.data.items[0].lat, -22.88);
  assert.equal((await call('GET', `/api/traffic/incidents?${q}`)).data.source, 'cache');
  assert.equal((await call('GET', '/api/traffic/incidents?south=-24&west=-50&north=-22&east=-48')).status, 422);
  assert.equal((await call('GET', '/api/traffic/incidents?south=1')).status, 400);
  const flow = await call('GET', '/api/traffic/flow?lat=-22.88&lon=-48.44');
  assert.equal(flow.data.currentSpeedKmh, 24);
  assert.equal(flow.data.level, 'moderado');
  assert.equal((await call('GET', '/api/traffic/flow?lat=x&lon=1')).status, 400);
  const none = await call('GET', '/api/traffic/flow?lat=0.5&lon=0.5');   // sem via mapeada
  assert.equal(none.data.available, false);
});

test('monitoramento ativo: alertas de alagamento e inversao + situacao dos locais', async () => {
  const monitor = await waitFor(async () => {
    const r = await call('GET', '/api/monitor');
    return r.data.locations?.length === 2 ? r.data : null;
  }, 4000);
  assert.ok(monitor, 'monitor nao rodou');
  const botucatu = monitor.locations.find((l) => l.name === 'Botucatu');
  assert.equal(botucatu.flood.level, 'muito_alto');
  assert.equal(botucatu.inversion.level, 'forte');
  assert.equal(botucatu.aqi, 32);
  assert.equal(botucatu.traffic.major, 1);
  assert.equal(monitor.locations.find((l) => l.name === 'Santiago').aqi, 95);

  const feed = (await call('GET', '/api/alerts')).data.alerts;
  const kinds = feed.filter((a) => a.detail === 'Botucatu').map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['flood', 'thermal-inversion']);
  const flood = feed.find((a) => a.kind === 'flood');
  assert.equal(flood.level, 'alta');
  assert.ok(flood.reasons.length > 0);
  assert.ok(feed.some((a) => a.kind === 'air-quality' && a.detail === 'Santiago' && a.level === 'media'));
});

const TOK = (n) => `${n}-`.padEnd(40, 'x');

test('push: cadastro validado, status e descadastro', async () => {
  const st = await call('GET', '/api/push/status');
  assert.equal(st.data.enabled, true);
  assert.equal(st.data.devices, 0);
  const bad = await call('POST', '/api/push/register', { token: 'curto', minLevel: 'urgente', lat: 99, lon: 0 });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /token/); assert.match(bad.data.error, /minLevel/); assert.match(bad.data.error, /lat/);
  assert.equal((await call('POST', '/api/push/register', '{nao e json')).status, 400);
  assert.equal((await call('POST', '/api/push/register', { token: 'x'.repeat(9000) })).status, 413);

  const ok = await call('POST', '/api/push/register', { token: TOK('aparelho-descartavel'), minLevel: 'alta' });
  assert.equal(ok.status, 201);
  assert.equal((await call('GET', '/api/push/status')).data.devices, 1);
  assert.equal((await call('POST', '/api/push/unregister', { token: TOK('aparelho-descartavel') })).status, 200);
  assert.equal((await call('GET', '/api/push/status')).data.devices, 0);
  assert.equal((await call('POST', '/api/push/unregister', { token: 'curto' })).status, 400);
});

test('push: alerta chega so a quem esta na area e no nivel escolhidos; token morto e removido', async () => {
  const perto = { token: TOK('perto'), lat: -33.9, lon: -70.9, radiusKm: 100, minLevel: 'media', platform: 'android' };
  const longe = { token: TOK('longe'), lat: -22.88, lon: -48.44, minLevel: 'media' };                 // Botucatu
  const soAlta = { token: TOK('so-alta-perto'), lat: -33.9, lon: -70.9, minLevel: 'alta' };
  const semPosicao = { token: TOK('todas-as-cidades'), minLevel: 'media' };
  const outroTipo = { token: TOK('so-transito'), lat: -33.9, lon: -70.9, kinds: ['traffic'] };
  const morto = { token: TOK('MORTO'), lat: -33.9, lon: -70.9 };
  for (const d of [perto, longe, soAlta, semPosicao, outroTipo, morto]) assert.equal((await call('POST', '/api/push/register', d)).status, 201, d.token);
  assert.equal((await call('GET', '/api/push/status')).data.devices, 6);
  fcmSent.length = 0;

  await call('GET', '/api/environment?lat=-34&lon=-71&place=Valparaiso');   // IQA 95 -> alerta de nivel "media"
  const got = await waitFor(async () => (fcmSent.length >= 2 ? fcmSent : null), 3000);
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(got, 'nenhuma notificacao enviada');
  const tokens = fcmSent.map((m) => m.token).sort();
  assert.deepEqual(tokens, [TOK('perto'), TOK('todas-as-cidades')].sort());
  const msg = fcmSent.find((m) => m.token === TOK('perto'));
  assert.match(msg.notification.title, /IQA 95/);
  assert.match(msg.notification.body, /Valparaiso/);
  assert.equal(msg.data.kind, 'air-quality');
  assert.equal(msg.data.lat, '-34');
  assert.equal(msg.android.notification.channel_id, 'alerts');
  assert.ok(Object.values(msg.data).every((v) => typeof v === 'string'));

  // o token que o FCM disse nao existir mais foi removido da base
  const st = await waitFor(async () => { const r = await call('GET', '/api/push/status'); return r.data.devices === 5 ? r.data : null; }, 2000);
  assert.ok(st, 'token morto nao foi removido');
});

test('manancial: o ponto esta dentro, perto ou fora de uma represa/area protegida', async () => {
  // a "Represa Teste" do mock e o triangulo (0,0)-(0,1)-(1,1)
  const inside = await call('GET', '/api/manancial?lat=0.3&lon=0.9');
  assert.equal(inside.status, 200);
  assert.equal(inside.data.status, 'inside');
  assert.equal(inside.data.areas[0].name, 'Represa Teste');
  assert.equal(inside.data.areas[0].kind, 'water');

  const outside = await call('GET', '/api/manancial?lat=0.9&lon=0.1');
  assert.equal(outside.data.status, 'outside');
  assert.deepEqual(outside.data.areas, []);
  assert.ok(outside.data.nearest && outside.data.nearest.distanceKm > 1);

  // repetir a consulta usa o cache (nao chama o Overpass de novo)
  const before = upstreamCalls.length;
  const again = await call('GET', '/api/manancial?lat=0.3&lon=0.9');
  assert.equal(again.data.source, 'cache');
  assert.equal(upstreamCalls.length, before);

  assert.equal((await call('GET', '/api/manancial?lat=abc&lon=1')).status, 400);
  assert.equal((await call('GET', '/api/manancial')).status, 400);
});

test('desmatamento: alertas do GFW em volta de um ponto e no retangulo do mapa', async () => {
  const p = await call('GET', '/api/forest/alerts?lat=0.5&lon=0.8&radiusKm=5&days=30');
  assert.equal(p.status, 200);
  assert.equal(p.data.available, true);
  assert.equal(p.data.total, 10);        // 6 high + 4 nominal; os 3 "low" ficam de fora
  assert.equal(p.data.confirmed, 6);
  assert.equal(p.data.days, 30);
  assert.ok(p.data.cells.length >= 1 && p.data.cells[0].count >= 1);

  // a chave e o Origin chegam ao GFW; a consulta e um poligono com a data inicial na SQL
  const call0 = gfwCalls.at(-1);
  assert.equal(call0.headers['x-api-key'], 'gfw-teste');
  assert.equal(call0.headers.origin, 'http://localhost');
  assert.equal(call0.body.geometry.type, 'Polygon');
  assert.match(call0.body.sql, /gfw_integrated_alerts__date >= '\d{4}-\d{2}-\d{2}'/);

  const n = gfwCalls.length;
  const cached = await call('GET', '/api/forest/alerts?lat=0.5&lon=0.8&radiusKm=5&days=30');
  assert.equal(cached.data.source, 'cache');
  assert.equal(gfwCalls.length, n);

  const bbox = await call('GET', '/api/forest/alerts?south=0.4&west=0.7&north=0.6&east=0.9&days=7');
  assert.equal(bbox.data.available, true);
  assert.equal((await call('GET', '/api/forest/alerts?south=0&west=0&north=5&east=5')).status, 422);   // mapa muito aberto
  assert.equal((await call('GET', '/api/forest/alerts')).status, 400);
});

test('desmatamento em manancial: as areas vigiadas perto do ponto sao consultadas no GFW', async () => {
  const w = await (await fetch('http://localhost:4006/manancial/watch?lat=0.5&lon=0.8&radiusKm=15&days=30')).json();
  assert.equal(w.available, true);
  assert.ok(w.areasChecked >= 1);
  const rep = w.areas.find((a) => a.name === 'Represa Teste');
  assert.ok(rep, 'a represa de teste deve ser vigiada');
  assert.equal(rep.kind, 'water');
  assert.equal(rep.confirmed, 6);
  assert.ok(w.totalConfirmed >= 6);
});

test('/api/point inclui manancial e desmatamento quando pedidos', async () => {
  const r = await call('GET', '/api/point?lat=0.3&lon=0.9&include=manancial,forest');
  assert.equal(r.status, 200);
  assert.equal(r.data.manancial.status, 'inside');
  assert.equal(r.data.forest.available, true);
  assert.equal(r.data.status.manancial, 'live');
  assert.equal(r.data.weather, null);
});

test('transporte publico: estacoes mais proximas de um ponto (sem ponto de onibus), via /api/point', async () => {
  // o mock do Overpass tem a "Estacao Se" (metro) em -22.87,-48.43
  const r = await call('GET', '/api/point?lat=-22.872&lon=-48.432&include=transit');
  assert.equal(r.status, 200);
  assert.equal(r.data.status.transit, 'live');
  assert.equal(r.data.transit.count, 1);
  assert.equal(r.data.transit.stops[0].name, 'Estação Sé');
  assert.equal(r.data.transit.stops[0].kind, 'metro');
  assert.ok(r.data.transit.stops[0].distanceKm < 0.5);

  const far = await (await fetch('http://localhost:4006/transit/around?lat=-10&lon=-40')).json();
  assert.equal(far.count, 0);          // o mock devolve as mesmas estacoes; o filtro de 1 km as descarta
  assert.equal((await fetch('http://localhost:4006/transit/around?lat=x&lon=1')).status, 400);
});

test('/api/manancial/watch passa pelo gateway', async () => {
  const r = await call('GET', '/api/manancial/watch?lat=0.5&lon=0.8&radiusKm=10&days=30');
  assert.equal(r.status, 200);
  assert.equal(r.data.available, true);
  assert.ok(r.data.areas.some((a) => a.name === 'Represa Teste' && a.confirmed === 6 && a.cells.length >= 1));
});

test('incidentes de transito: o monitor pode pedir mais itens (max)', async () => {
  const bb = 'south=-23&west=-48.7&north=-22.7&east=-48.3';
  const a = await call('GET', `/api/traffic/incidents?${bb}`);
  assert.equal(a.status, 200);
  const b = await (await fetch(`http://localhost:4008/incidents?${bb}&max=300`)).json();
  assert.equal(b.enabled, true);
  assert.ok(b.items.length >= 1);
});
