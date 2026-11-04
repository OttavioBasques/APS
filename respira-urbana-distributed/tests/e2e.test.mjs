// Teste de ponta a ponta do backend: gateway + microsservicos + Redis em memoria, todos no mesmo processo, com as APIs externas simuladas.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';

await import('./shims/register.mjs');
const { installUpstreamMock, upstreamCalls } = await import('./helpers/upstream.mjs');
installUpstreamMock();

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
    TRAFFIC_SERVICE_URL: 'http://localhost:4008'
  });
  await start('geocoding-service', { PORT: '4001' });
  await start('weather-service', { PORT: '4002' });
  await start('air-quality-service', { PORT: '4003' });
  await start('alert-service', { PORT: '4004' });
  await start('risk-service', { PORT: '4005' });
  await start('geodata-service', { PORT: '4006' });
  await start('traffic-service', { PORT: '4008' });
  await start('api-gateway', { PORT: '4000' });
  await new Promise((r) => setTimeout(r, 300));
});

const call = async (method, path) => {
  const res = await fetch(GW + path, { method });
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
    [4004, 'alert-service'], [4005, 'risk-service'], [4006, 'geodata-service'], [4008, 'traffic-service']]) {
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
