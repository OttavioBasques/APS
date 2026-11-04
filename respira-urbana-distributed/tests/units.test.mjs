import test from 'node:test';
import assert from 'node:assert/strict';
import { snapGrid } from '../services/api-gateway/src/grid.js';
import { parseGridParams } from '../services/risk-service/src/grid.js';
import { buildAlert, buildMonitorAlerts, parseLocations, summarizeLocation, DEFAULT_LOCATIONS } from '../services/alert-service/src/alerts.js';
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
