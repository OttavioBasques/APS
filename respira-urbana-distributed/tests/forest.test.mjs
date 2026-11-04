import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleRings, elementRings, pointInRing, distanceToRingKm, classifyPoint, clipRing, thin, watchPolygons, buildAreasAroundQuery, toGeoJson } from '../services/geodata-service/src/areas.js';
import { circlePolygon, bboxPolygon, sinceDate, buildAlertsSql, aggregateAlerts, queryAlerts, GfwError } from '../services/geodata-service/src/forest.js';
import { buildMonitorAlerts, summarizeLocation } from '../services/alert-service/src/alerts.js';
import { validateRegistration, shouldReceive } from '../services/push-service/src/targeting.js';

const g = (pts) => pts.map(([lat, lon]) => ({ lat, lon }));
// quadrado de 0,02 grau (~2,2 km) centrado em (-23, -46)
const SQUARE = [[-23.01, -46.01], [-23.01, -45.99], [-22.99, -45.99], [-22.99, -46.01], [-23.01, -46.01]];

test('Overpass: consulta por raio pede geometria completa', () => {
  const q = buildAreasAroundQuery(-23, -46, 1500);
  assert.match(q, /around:1500,-23,-46/);
  assert.match(q, /protected_area/);
  assert.match(q, /reservoir/);
  assert.match(q, /out geom/);
});

test('ponto em poligono e distancia ate a borda', () => {
  assert.equal(pointInRing(-23, -46, SQUARE), true);
  assert.equal(pointInRing(-23, -45.9, SQUARE), false);
  assert.equal(pointInRing(-22.5, -46, SQUARE), false);
  // 0,01 grau de longitude em -23 graus ~ 1,02 km ate a borda leste a partir do centro
  assert.ok(Math.abs(distanceToRingKm(-23, -46, SQUARE) - 1.02) < 0.05);
  // ponto ~110 m a leste da borda leste
  assert.ok(Math.abs(distanceToRingKm(-23, -45.989, SQUARE) - 0.11) < 0.03);
});

test('relacao com trechos soltos vira um anel fechado; trecho que nao fecha e descartado', () => {
  const a = g([[0, 0], [0, 1], [1, 1]]);
  const b = g([[0, 0], [1, 0], [1, 1]]);          // liga a ponta final de "a" pela outra volta (invertido)
  const rings = assembleRings([a.map((p) => [p.lat, p.lon]), b.map((p) => [p.lat, p.lon])]);
  assert.equal(rings.length, 1);
  assert.deepEqual(rings[0][0], rings[0][rings[0].length - 1]);
  assert.equal(pointInRing(0.2, 0.5, rings[0]), true);
  assert.deepEqual(assembleRings([[[0, 0], [0, 1], [1, 1]]]), []);

  const rel = { type: 'relation', id: 1, tags: {}, members: [
    { type: 'way', role: 'outer', geometry: a }, { type: 'way', role: 'outer', geometry: b }, { type: 'way', role: 'inner', geometry: g([[0.4, 0.4], [0.4, 0.5]]) }] };
  assert.equal(elementRings(rel).length, 1);
  assert.deepEqual(elementRings({ type: 'way', id: 2, geometry: g([[0, 0], [0, 1]]) }), []);   // via aberta
  assert.deepEqual(elementRings({ type: 'node', id: 3 }), []);
});

test('classifyPoint: dentro, perto (ate 500 m) e fora', () => {
  const json = { elements: [
    { type: 'way', id: 1, tags: { natural: 'water', water: 'reservoir', name: 'Represa A' }, geometry: g(SQUARE) },
    { type: 'way', id: 2, tags: { leisure: 'nature_reserve', name: 'Reserva B', operator: 'Estado' },
      geometry: g([[-23.1, -46.1], [-23.1, -46.05], [-23.05, -46.05], [-23.05, -46.1], [-23.1, -46.1]]) }
  ] };
  const inside = classifyPoint(json, -23, -46);
  assert.equal(inside.status, 'inside');
  assert.equal(inside.areas[0].name, 'Represa A');
  assert.equal(inside.areas[0].inside, true);
  assert.equal(inside.areas[0].kind, 'water');

  const near = classifyPoint(json, -23, -45.9889);       // ~120 m fora da borda leste
  assert.equal(near.status, 'near');
  assert.equal(near.areas[0].name, 'Represa A');
  assert.ok(near.areas[0].distanceKm < 0.5);

  const out = classifyPoint(json, -22.5, -46);
  assert.equal(out.status, 'outside');
  assert.deepEqual(out.areas, []);
  assert.ok(out.nearest.distanceKm > 10);

  const protectedPoint = classifyPoint(json, -23.075, -46.075);
  assert.equal(protectedPoint.status, 'inside');
  assert.equal(protectedPoint.areas[0].kind, 'protected');
  assert.equal(protectedPoint.areas[0].operator, 'Estado');

  assert.equal(classifyPoint({ elements: [] }, 0, 0).status, 'outside');
  assert.equal(classifyPoint(undefined, 0, 0).status, 'outside');
});

test('recorte de anel na janela de busca e geometria para o GFW', () => {
  const win = { south: -23.005, north: -22.995, west: -46.005, east: -45.995 };
  const clipped = clipRing(SQUARE, win);
  assert.ok(clipped && clipped.length >= 5);
  assert.ok(clipped.every(([la, lo]) => la >= win.south - 1e-9 && la <= win.north + 1e-9 && lo >= win.west - 1e-9 && lo <= win.east + 1e-9));
  assert.deepEqual(clipped[0], clipped[clipped.length - 1]);
  assert.equal(clipRing(SQUARE, { south: 10, north: 11, west: 10, east: 11 }), null);   // sem sobreposicao

  const big = Array.from({ length: 400 }, (_, i) => [Math.sin(i / 63), Math.cos(i / 63)]);
  big.push(big[0]);
  const t = thin(big, 80);
  assert.ok(t.length <= 83);
  assert.deepEqual(t[0], t[t.length - 1]);

  const gj = toGeoJson(SQUARE);
  assert.equal(gj.type, 'Polygon');
  assert.deepEqual(gj.coordinates[0][0], [-46.01, -23.01]);   // GeoJSON e [lon, lat]
});

test('watchPolygons: reserva usa o proprio contorno, represa usa o retangulo com margem; as maiores primeiro', () => {
  const window = { south: -23.5, north: -22.5, west: -46.5, east: -45.5 };
  const json = { elements: [
    { type: 'way', id: 1, tags: { natural: 'water', water: 'reservoir', name: 'Represa A' }, geometry: g(SQUARE) },
    { type: 'way', id: 2, tags: { boundary: 'protected_area', name: 'Parque C' },
      geometry: g([[-23.3, -46.3], [-23.3, -46.0], [-23.0, -46.0], [-23.0, -46.3], [-23.3, -46.3]]) },
    { type: 'way', id: 3, tags: { leisure: 'nature_reserve', name: 'Longe' }, geometry: g([[5, 5], [5, 6], [6, 6], [6, 5], [5, 5]]) }
  ] };
  const w = watchPolygons(json, window);
  assert.deepEqual(w.map((a) => a.name), ['Parque C', 'Represa A']);   // "Longe" fica fora da janela
  const rep = w.find((a) => a.name === 'Represa A');
  const lats = rep.ring.map((p) => p[0]);
  assert.ok(Math.min(...lats) < -23.01 && Math.max(...lats) > -22.99);   // margem de ~1 km em volta do espelho d'agua
  assert.equal(watchPolygons(json, window, { maxAreas: 1 }).length, 1);
  assert.deepEqual(watchPolygons(undefined, window), []);
});

test('GFW: poligonos, data inicial e SQL', () => {
  const c = circlePolygon(-23, -46, 10, 8);
  assert.equal(c.type, 'Polygon');
  assert.equal(c.coordinates[0].length, 9);
  assert.deepEqual(c.coordinates[0][0], c.coordinates[0][8]);
  const lons = c.coordinates[0].map((p) => p[0]);
  assert.ok(Math.abs((Math.max(...lons) - Math.min(...lons)) * 111.32 * Math.cos((23 * Math.PI) / 180) - 20) < 0.5);   // diametro ~20 km
  assert.deepEqual(bboxPolygon({ south: 1, west: 2, north: 3, east: 4 }).coordinates[0][2], [4, 3]);
  assert.equal(sinceDate(30, Date.parse('2026-11-04T12:00:00Z')), '2026-10-05');
  const sql = buildAlertsSql('2026-10-05');
  assert.match(sql, /FROM results WHERE gfw_integrated_alerts__date >= '2026-10-05'$/);
  assert.match(sql, /latitude/);
});

test('aggregateAlerts: ignora "low", agrupa em celulas de ~1 km e conta os confirmados', () => {
  const row = (lat, lon, conf, date) => ({ latitude: lat, longitude: lon, gfw_integrated_alerts__confidence: conf, gfw_integrated_alerts__date: date });
  const r = aggregateAlerts([
    row(-23.0012, -46.0011, 'high', '2026-10-20'),
    row(-23.0013, -46.0012, 'nominal', '2026-10-25'),
    row(-23.0014, -46.0013, 'low', '2026-10-30'),            // ignorado
    row(-23.0500, -46.0500, 'high', '2026-10-10'),           // outra celula
    { latitude: 'x', longitude: 1, gfw_integrated_alerts__confidence: 'high' },   // linha invalida
    null
  ].filter(Boolean));
  assert.equal(r.total, 3);
  assert.equal(r.confirmed, 2);
  assert.equal(r.latest, '2026-10-25');
  assert.equal(r.cells.length, 2);
  assert.equal(r.cells[0].count, 2);
  assert.equal(r.cells[0].confirmed, 1);
  assert.equal(r.cells[0].latest, '2026-10-25');
  assert.deepEqual(aggregateAlerts(undefined), { total: 0, confirmed: 0, latest: null, cells: [], moreCells: 0 });
  const many = Array.from({ length: 60 }, (_, i) => row(i * 0.1, 0, 'high', '2026-10-01'));
  const capped = aggregateAlerts(many, { maxCells: 40 });
  assert.equal(capped.cells.length, 40);
  assert.equal(capped.moreCells, 20);
});

test('queryAlerts: envia chave e Origin, monta o corpo e traduz os erros', async () => {
  const seen = [];
  const ok = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ data: [
    { latitude: 1, longitude: 2, gfw_integrated_alerts__confidence: 'high', gfw_integrated_alerts__date: '2026-10-20' }], status: 'success' }), { status: 200 }); };
  const geometry = bboxPolygon({ south: 0, west: 0, north: 1, east: 1 });
  const r = await queryAlerts({ apiKey: 'K', geometry, days: 30, origin: 'http://localhost', fetchImpl: ok, now: Date.parse('2026-11-04T00:00:00Z') });
  assert.equal(r.total, 1);
  assert.equal(r.confirmed, 1);
  assert.equal(r.days, 30);
  assert.match(seen[0].url, /\/dataset\/gfw_integrated_alerts\/latest\/query\/json$/);
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['x-api-key'], 'K');
  assert.equal(seen[0].init.headers.origin, 'http://localhost');
  const body = JSON.parse(seen[0].init.body);
  assert.match(body.sql, /'2026-10-05'/);
  assert.deepEqual(body.geometry, geometry);

  const fail = (status) => async () => new Response('{}', { status });
  await assert.rejects(queryAlerts({ apiKey: 'K', geometry, days: 1, origin: 'o', fetchImpl: fail(403) }), (e) => e instanceof GfwError && /chave/.test(e.message));
  await assert.rejects(queryAlerts({ apiKey: 'K', geometry, days: 1, origin: 'o', fetchImpl: fail(429) }), (e) => e instanceof GfwError && /limite/.test(e.message));
  await assert.rejects(queryAlerts({ apiKey: 'K', geometry, days: 1, origin: 'o', fetchImpl: fail(500) }), /500/);
  const weird = async () => new Response(JSON.stringify({ status: 'success' }), { status: 200 });
  assert.equal((await queryAlerts({ apiKey: 'K', geometry, days: 1, origin: 'o', fetchImpl: weird })).total, 0);   // resposta sem "data" nao quebra
});

test('alertas do monitor: manancial e desmatamento, com limites configuraveis', () => {
  const loc = { name: 'Guarapiranga', lat: -23.7, lon: -46.75 };
  const watch = { available: true, days: 30, areas: [
    { name: 'APA Capivari-Monos', kind: 'protected', alerts: 70, confirmed: 41 },
    { name: 'Represa X', kind: 'water', alerts: 9, confirmed: 7 },
    { name: 'Reserva Y', kind: 'protected', alerts: 2, confirmed: 2 }] };
  const forest = { available: true, days: 30, total: 300, confirmed: 120 };
  const alerts = buildMonitorAlerts(loc, { watch, forest });
  const m = alerts.find((a) => a.kind === 'manancial');
  assert.equal(m.level, 'alta');                                  // 41 confirmados >= 30
  assert.match(m.title, /APA Capivari-Monos/);
  assert.ok(m.reasons.some((r) => /41 alertas confirmados nos últimos 30 dias/.test(r)));
  assert.ok(m.reasons.some((r) => /Mais 1 área/.test(r)));        // Represa X tambem passa de 5; Reserva Y nao
  const d = alerts.find((a) => a.kind === 'deforestation');
  assert.equal(d.level, 'media');                                 // 120 < 200
  assert.equal(d.lat, -23.7);

  // abaixo dos limites: nada; limites ajustaveis
  assert.deepEqual(buildMonitorAlerts(loc, { watch: { available: true, days: 30, areas: [{ name: 'Z', kind: 'water', confirmed: 4 }] }, forest: { available: true, days: 30, confirmed: 49 } }), []);
  assert.equal(buildMonitorAlerts(loc, { forest: { available: true, days: 30, confirmed: 49 } }, 80, { forestMin: 10 }).length, 1);
  // sem chave do GFW ou servico fora do ar: sem alerta e sem erro
  assert.deepEqual(buildMonitorAlerts(loc, { watch: { available: false }, forest: null }), []);
  assert.deepEqual(buildMonitorAlerts(loc, {}), []);

  const s = summarizeLocation(loc, { watch: { available: true, days: 30, areasChecked: 3, totalConfirmed: 50 }, forest });
  assert.deepEqual(s.forest, { alerts: 300, confirmed: 120, days: 30 });
  assert.deepEqual(s.manancial, { areas: 3, confirmed: 50, days: 30 });
  assert.equal(summarizeLocation(loc, {}).forest, null);
});

test('push: os novos tipos de alerta podem ser escolhidos e chegam ao dispositivo certo', () => {
  const ok = validateRegistration({ token: 'x'.repeat(30), kinds: ['deforestation', 'manancial'], minLevel: 'media' });
  assert.equal(ok.ok, true);
  assert.equal(validateRegistration({ token: 'x'.repeat(30), kinds: ['queimada'] }).ok, false);
  const dev = { minLevel: 'media', kinds: ['manancial'], lat: -23.7, lon: -46.75, radiusKm: 50 };
  assert.equal(shouldReceive(dev, { kind: 'manancial', level: 'alta', lat: -23.7, lon: -46.75 }), true);
  assert.equal(shouldReceive(dev, { kind: 'deforestation', level: 'alta', lat: -23.7, lon: -46.75 }), false);
});
