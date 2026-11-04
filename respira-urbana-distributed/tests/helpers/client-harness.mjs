import fs from 'node:fs';
import assert from 'node:assert/strict';
// Teste do cliente sem navegador: roda o <script> de client/index.html contra um DOM/Leaflet
// minimos e um gateway simulado. Executado como processo separado por client.test.mjs.
const html = fs.readFileSync(process.argv[2], 'utf8');
const code = [...html.matchAll(/<script>\n([\s\S]*?)<\/script>/g)].pop()[1];

const els = {};
const mkEl = (id) => ({
  id, style: {}, dataset: {}, _html: '', _listeners: {}, classList: { add() {}, remove() {} },
  set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
  set textContent(v) { this._html = String(v); }, get textContent() { return this._html; },
  addEventListener(ev, fn) { (this._listeners[ev] ||= []).push(fn); },
  setAttribute() {}, removeAttribute() {}, appendChild() {},
  fire(ev, e) { (this._listeners[ev] || []).forEach((f) => f(e)); }
});
globalThis.document = {
  getElementById: (id) => (els[id] ||= mkEl(id)),
  documentElement: { setAttribute() {}, removeAttribute() {} }
};
globalThis.window = { addEventListener() {}, location: { search: '' } };
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

// ---- Leaflet minimal ----
const log = { tiles: [], rects: 0, circles: 0, polys: 0, markers: 0, added: new Set() };
class Layer {
  constructor() { this._on = false; this.items = []; }
  addTo(m) { this._on = true; (m._layers ||= new Set()).add(this); if (m.items) m.items.push(this); log.added.add(this); return this; }
  clearLayers() { this.items = []; return this; }
  bindPopup() { return this; } setPopupContent() { return this; } openPopup() { return this; }
  setLatLng() { return this; } setIcon() { return this; }
}
const L = {
  map() { const m = log.map = { _layers: new Set(), _h: {}, setView() { return m; }, on(ev, fn) { m._h[ev] = fn; return m; }, invalidateSize() {},
    getBounds: () => ({ getSouth: () => -23.1, getNorth: () => -22.7, getWest: () => -48.7, getEast: () => -48.2 }),
    getZoom: () => 12, hasLayer: (l) => m._layers.has(l), removeLayer(l) { m._layers.delete(l); l._on = false; },
    closePopup() {}, flyTo() {} }; return m; },
  control: { zoom: () => ({ addTo() {} }) },
  tileLayer(url, o) { const l = new Layer(); l.url = url; log.tiles.push(url); return l; },
  layerGroup(arr) { const l = new Layer(); l.members = arr; return l; },
  rectangle(b, o) { log.rects++; return new Layer(); },
  circleMarker() { log.circles++; return new Layer(); },
  polygon() { log.polys++; return new Layer(); }, polyline() { log.polys++; return new Layer(); },
  divIcon: () => ({}), marker() { log.markers++; const l = new Layer(); l.isMarker = true; return l; },
  popup() { const p = log.popup = { _open: false, c: '', setLatLng() { return p; }, setContent(c) { p.c = c; return p; }, openOn() { p._open = true; return p; }, isOpen: () => p._open }; return p; }
};
globalThis.L = L;
globalThis.setInterval = () => 0;

// ---- gateway simulado ----
const calls = [];
const J = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
globalThis.fetch = async (url) => {
  calls.push(url);
  const u = new URL(url); const p = u.pathname;
  if (p === '/api/config') return J({ openWeatherApiKey: 'K', trafficEnabled: true, deforestationTilesUrl: 'https://t/{z}/{x}/{y}.png' });
  if (p.startsWith('/api/grid/')) return J({ step: 0.2, cells: [
    { lat: -22.9, lon: -48.5, aqi: 45, mm24: 62, maxHourly: 5, maxStrength: 3.2 },
    { lat: -22.8, lon: -48.3, aqi: 15, mm24: 2, maxHourly: 0.1, maxStrength: 0.1 }] });
  if (p === '/api/transit') return J({ stops: [{ lat: -22.8, lon: -48.4, kind: 'metro', name: 'Sé' }, { lat: -22.81, lon: -48.41, kind: 'bus' }], truncated: false });
  if (p === '/api/watersheds') return J({ features: [{ kind: 'water', name: 'Represa', rings: [{ closed: true, points: [[0, 0], [1, 1], [0, 1]] }] }] });
  if (p === '/api/traffic/incidents') return J({ total: 2, major: 1, roadClosures: 0, totalDelaySec: 600, byCategory: { Acidente: 1, Obras: 1 },
    items: [{ categoryLabel: 'Acidente', category: 1, severity: 3, severityLabel: 'grave', from: 'A', to: 'B', description: 'Colisão', lat: -22.85, lon: -48.4 }] });
  if (p === '/api/alerts') return J({ alerts: [{ kind: 'flood', level: 'alta', lat: -22.88, lon: -48.44, title: 'Risco muito alto de alagamento', detail: 'Botucatu', ts: Date.now() - 600000 }] });
  if (p === '/api/monitor') return J({ updatedAt: Date.now(), locations: [{ name: 'Botucatu', lat: -22.88, lon: -48.44, aqi: 32, flood: { level: 'muito_alto' }, inversion: { level: 'forte' } }] });
  if (p === '/api/point') return J({
    weather: { current: { temperature_2m: 23, weather_code: 3 }, precipitationProbability: 40 },
    air: { current: { european_aqi: 45 } }, flood: { level: 'alto', rain: { next24hMm: 62.4 } },
    inversion: { available: true, next24h: { level: 'forte', maxStrength: 3.4 } },
    traffic: { available: true, level: 'moderado', currentSpeedKmh: 24 }, status: {}, source: 'live' });
  if (p === '/api/environment') return J({
    weather: { current: { temperature_2m: 23.4, weather_code: 63, apparent_temperature: 25 }, precipitationProbability: 40 },
    airQuality: { current: { european_aqi: 32, pm2_5: 6, pm10: 12, ozone: 60, nitrogen_dioxide: 9, uv_index: 4 } },
    risks: { flood: { level: 'muito_alto', score: 3, reasons: ['Chuva prevista de 62 mm nas próximas 24 h'], rain: { next24hMm: 62.4, maxHourlyMm: 2.6 }, river: { available: true, ratio: 3.5 } },
      inversion: { available: true, next24h: { level: 'forte', score: 3, maxStrength: 3.4, peakTime: '2026-07-11T02:00', trapsPollutants: true } } },
    traffic: { enabled: true, available: true, level: 'moderado', score: 1, currentSpeedKmh: 24, freeFlowSpeedKmh: 40 },
    status: { weather: 'live', airQuality: 'live', flood: 'live', inversion: 'live', traffic: 'live', risks: 'live' } });
  return J({ error: 'nao simulado: ' + p }, 404);
};

(0, eval)(code);
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
await tick(100);

const filters = els.heroFilters;
assert.match(filters.innerHTML, /data-theme="traffic"/);
assert.doesNotMatch(filters.innerHTML, /data-theme="traffic"[^>]*disabled/);   // trafficEnabled=true
assert.match(els.alertsList.innerHTML, /Risco muito alto de alagamento/);
assert.match(els.monitorList.innerHTML, /Botucatu/);
assert.equal(els.dotAlerts.className, 'dot ok');

// ligar os temas um a um
const click = (sel) => filters.fire('click', { target: { closest: (q) => (q.includes('data-theme') ? { dataset: { theme: sel }, disabled: false } : null) } });
for (const k of ['air', 'flood', 'inversion']) click(k);
await tick(900);
assert.equal(log.rects, 4);   // ar: 2 celulas; chuva: 1 (a outra e fraca demais); inversao: 1
click('transit'); click('water'); click('traffic'); click('forest');
await tick(900);
assert.equal(log.circles, 2);
assert.equal(log.polys, 1);
assert.ok(log.tiles.some((u) => u.includes('/api/traffic/tiles/flow/')));
assert.ok(log.tiles.some((u) => u.includes('/api/traffic/tiles/incidents/')));
assert.ok(log.tiles.some((u) => u === 'https://t/{z}/{x}/{y}.png'));
assert.ok(!log.tiles.some((u) => /tomtom/i.test(u) && u.includes('key=')));   // chave nunca no cliente
assert.match(els.trafficList.innerHTML, /Acidente/);
assert.equal(els.trafficCard.style.display, 'block');
assert.match(els.mapLegend.innerHTML, /Poluição do ar/);
assert.match(els.mapLegend.innerHTML, /Inversão térmica/);
assert.match(els.mapLegend.innerHTML, /Mananciais/);
assert.match(els.mapLegend.innerHTML, /Desmatamento/);
assert.equal(els.mapLegend.style.display, 'block');
assert.equal(JSON.parse(localStorage._d['respira:themes']).length, 7);

// focos: chuva (1) + inversao (1) + incidente grave (1) + alerta de alagamento (1)
const liveMarkers = [...log.added].filter((g) => g._on && g.items).reduce((n, g) => n + g.items.filter((i) => i.isMarker).length, 0);
assert.equal(liveMarkers, 4);

// clique no mapa: o pop-up mostra o clima E os temas ligados (regressao: aparecia vazio)
log.map._h.click({ latlng: { wrap: () => ({ lat: -22.9, lng: -48.4 }), lat: -22.9, lng: -48.4 } });
await tick(60);
assert.match(log.popup.c, /Temperatura/);
assert.match(log.popup.c, /23°C/);
assert.match(log.popup.c, /Qualidade do ar/);
assert.match(log.popup.c, /IQA 45 · Moderada/);
assert.match(log.popup.c, /Alagamento/);
assert.match(log.popup.c, /Inversão térmica/);
assert.match(log.popup.c, /Trânsito/);
assert.doesNotMatch(log.popup.c, /—<\/dd>.*—<\/dd>.*—<\/dd>/s);
assert.ok(calls.some((u) => u.includes('/api/point') && u.includes('include=weather,air,flood,inversion,traffic')));

// consultas incluem so os temas ativos
const gridCalls = calls.filter((u) => u.includes('/api/grid/'));
assert.ok(gridCalls.length >= 3);
assert.ok(calls.some((u) => u.includes('/api/transit') && u.includes('scope=stations')));

// buscar uma cidade -> cartao de riscos
const city = els.monitorList;
city.fire('click', { target: { closest: () => ({ dataset: { lat: '-22.88', lon: '-48.44', name: 'Botucatu' } }) } });
await tick(100);
assert.match(els.main.innerHTML, /Alagamento e inundação/);
assert.match(els.main.innerHTML, /Muito alto/);
assert.match(els.main.innerHTML, /Pico às 02:00/);
assert.match(els.main.innerHTML, /reter poluentes/);
assert.match(els.main.innerHTML, /24 km\/h agora/);
assert.equal(els.dotRisks.className, 'dot ok');
assert.equal(els.dotTraffic.className, 'dot ok');
assert.ok(calls.some((u) => u.includes('/api/environment') && u.includes('lat=-22.88')));

// desligar tema remove camada e esconde painel
click('traffic'); click('air');
await tick(50);
assert.equal(els.trafficCard.style.display, 'none');
assert.doesNotMatch(els.mapLegend.innerHTML, /Poluição do ar/);
console.log('CLIENT HARNESS OK');
process.exit(0);
