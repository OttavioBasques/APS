import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransitQuery, buildWaterQuery, parseTransit, parseWater, classifyStop, decimate, queryOverpass, ENDPOINTS } from '../services/geodata-service/src/overpass.js';

const bbox = { south: -22.9, west: -48.5, north: -22.8, east: -48.4 };

test('consultas Overpass: bbox na ordem S,W,N,E e escopo', () => {
  const stations = buildTransitQuery(bbox, 'stations');
  assert.match(stations, /\(-22\.9,-48\.5,-22\.8,-48\.4\)/);
  assert.doesNotMatch(stations, /bus_stop/);
  assert.match(buildTransitQuery(bbox, 'all'), /node\["highway"="bus_stop"\]/);
  const water = buildWaterQuery(bbox);
  assert.match(water, /protected_area/);
  assert.match(water, /reservoir/);
  assert.match(water, /out geom/);
});

test('classifyStop', () => {
  assert.equal(classifyStop({ highway: 'bus_stop' }), 'bus');
  assert.equal(classifyStop({ amenity: 'bus_station' }), 'bus_station');
  assert.equal(classifyStop({ railway: 'station', station: 'subway' }), 'metro');
  assert.equal(classifyStop({ railway: 'tram_stop' }), 'tram');
  assert.equal(classifyStop({ railway: 'station' }), 'train');
});

test('parseTransit: no, via com centro, sem coordenadas e duplicado', () => {
  const json = { elements: [
    { type: 'node', id: 1, lat: -22.88, lon: -48.44, tags: { highway: 'bus_stop', name: 'Ponto A', wheelchair: 'yes', operator: 'Prefeitura' } },
    { type: 'way', id: 2, center: { lat: -22.87, lon: -48.43 }, tags: { railway: 'station', station: 'subway', 'name:pt': 'Estação B' } },
    { type: 'relation', id: 3, tags: { railway: 'station' } },
    { type: 'node', id: 1, lat: -22.88, lon: -48.44, tags: { highway: 'bus_stop' } }
  ] };
  const stops = parseTransit(json);
  assert.equal(stops.length, 2);
  assert.deepEqual(stops[0], { id: 'node/1', lat: -22.88, lon: -48.44, name: 'Ponto A', kind: 'bus', operator: 'Prefeitura', network: '', wheelchair: 'yes' });
  assert.equal(stops[1].kind, 'metro');
  assert.equal(stops[1].name, 'Estação B');
  assert.deepEqual(parseTransit(undefined), []);
});

test('parseWater: poligono fechado, relacao com bordas externas e itens sem geometria', () => {
  const g = (pts) => pts.map(([lat, lon]) => ({ lat, lon }));
  const json = { elements: [
    { type: 'way', id: 10, tags: { natural: 'water', water: 'reservoir', name: 'Represa X' }, geometry: g([[0, 0], [0, 1], [1, 1], [0, 0]]) },
    { type: 'relation', id: 11, tags: { boundary: 'protected_area', name: 'APA Y', protect_class: '6' }, members: [
      { type: 'way', role: 'outer', geometry: g([[2, 2], [2, 3], [3, 3]]) },
      { type: 'way', role: 'inner', geometry: g([[2.1, 2.1], [2.2, 2.2]]) },
      { type: 'node', role: 'label' }
    ] },
    { type: 'way', id: 12, tags: { leisure: 'nature_reserve' } },
    { type: 'relation', id: 13, tags: { landuse: 'reservoir' }, members: [] }
  ] };
  const f = parseWater(json);
  assert.equal(f.length, 2);
  assert.equal(f[0].kind, 'water'); assert.equal(f[0].subtype, 'reservoir'); assert.equal(f[0].name, 'Represa X');
  assert.equal(f[0].rings[0].closed, true);
  assert.equal(f[1].kind, 'protected'); assert.equal(f[1].protectClass, '6');
  assert.equal(f[1].rings.length, 1);          // so a borda "outer"
  assert.equal(f[1].rings[0].closed, false);
});

test('decimate preserva ultimo ponto e respeita o limite', () => {
  const pts = Array.from({ length: 1000 }, (_, i) => [i, i]);
  const d = decimate(pts, 150);
  assert.ok(d.length <= 151);
  assert.deepEqual(d[d.length - 1], [999, 999]);
  assert.equal(decimate(pts.slice(0, 10), 150).length, 10);
});

test('queryOverpass: tenta o segundo servidor quando o primeiro falha', async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({ url, body: opts.body, ua: opts.headers['user-agent'] });
    if (url === ENDPOINTS[0]) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ elements: [1] }) };
  };
  const out = await queryOverpass('[out:json];out;', fake);
  assert.deepEqual(out, { elements: [1] });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, ENDPOINTS[1]);
  assert.match(calls[0].body, /^data=/);
  assert.match(calls[0].ua, /RespiraUrbana/);
  await assert.rejects(queryOverpass('x', async () => ({ ok: false, status: 500, json: async () => ({}) })));
});
