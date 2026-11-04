import express from 'express';
import Redis from 'ioredis';
import { buildTransitQuery, parseTransit, buildWaterQuery, parseWater, queryOverpass } from './overpass.js';
import { buildAreasAroundQuery, classifyPoint, watchPolygons, toGeoJson } from './areas.js';
import { circlePolygon, bboxPolygon, queryAlerts, GfwError } from './forest.js';

const app = express();
const PORT = process.env.PORT || 3006;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = Number(process.env.GEO_CACHE_TTL_SECONDS || 1800);
const FOREST_TTL = Number(process.env.FOREST_CACHE_TTL_SECONDS || 10800);   // os alertas do GFW mudam no maximo 1x por dia
const GFW_API_KEY = (process.env.GFW_API_KEY || '').trim();
const GFW_ORIGIN = process.env.GFW_ORIGIN || 'http://localhost';             // o GFW exige um Origin igual a um dos dominios da chave

// Cache: o Overpass e um servico gratuito e compartilhado; repetir a mesma
// consulta so sobrecarrega os servidores. Se o Redis cair, segue sem cache.
const redis = new Redis(REDIS_URL, { retryStrategy: () => 2000, lazyConnect: true });
redis.on('error', (err) => console.error('[geodata-service] erro no redis:', err.message));
redis.connect().catch(() => {});

async function cacheGet(key) {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function cacheSet(key, value, ttl = CACHE_TTL) {
  try { await redis.set(key, JSON.stringify(value), 'EX', ttl); } catch { /* sem cache */ }
}

function parseBBox(q, maxSpan) {
  const b = { south: Number(q.south), west: Number(q.west), north: Number(q.north), east: Number(q.east) };
  if (!Object.values(b).every(Number.isFinite)) return { error: 'parametros south, west, north e east sao obrigatorios' };
  if (b.south >= b.north || b.west >= b.east) return { error: 'limites invalidos' };
  if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return { error: 'limites fora do intervalo valido' };
  if (b.north - b.south > maxSpan || b.east - b.west > maxSpan) {
    return { error: 'area muito grande: aproxime o mapa', status: 422 };
  }
  const r = (v) => Number(v.toFixed(3));
  return { bbox: { south: r(b.south), west: r(b.west), north: r(b.north), east: r(b.east) } };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'geodata-service', redis: redis.status, forestAlerts: Boolean(GFW_API_KEY) });
});

function parsePoint(q) {
  const lat = Number(q.lat); const lon = Number(q.lon);
  if (q.lat === undefined || q.lon === undefined || q.lat === '' || q.lon === '' ||
      !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
const clampInt = (v, def, min, max) => Math.min(max, Math.max(min, Math.round(Number(v)) || def));
const clampNum = (v, def, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : def));

const FOREST_OFF = { available: false, reason: 'no-key',
  message: 'Alertas de desmatamento desativados: falta a chave do Global Forest Watch (GFW_API_KEY).' };

// Estacoes de transporte publico mais proximas de um ponto (ate 1 km).
const haversineKm = (la1, lo1, la2, lo2) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
};
app.get('/transit/around', async (req, res) => {
  const p = parsePoint(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos ou ausentes' });
  const key = `geo:transitaround:${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });
  try {
    const d = 0.011;      // ~1,2 km
    const bbox = { south: p.lat - d, west: p.lon - d, north: p.lat + d, east: p.lon + d };
    const stops = parseTransit(await queryOverpass(buildTransitQuery(bbox, 'stations')))
      .map((s) => ({ name: s.name, kind: s.kind, operator: s.operator, lat: s.lat, lon: s.lon, distanceKm: Number(haversineKm(p.lat, p.lon, s.lat, s.lon).toFixed(2)) }))
      .filter((s) => s.kind !== 'bus' && s.distanceKm <= 1).sort((a, b) => a.distanceKm - b.distanceKm);
    const payload = { lat: p.lat, lon: p.lon, count: stops.length, stops: stops.slice(0, 3) };
    await cacheSet(key, payload);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] transit/around falhou:', err.message);
    res.status(502).json({ error: 'servico de dados geograficos indisponivel' });
  }
});

// Este ponto esta em area de manancial (represa, lago, reserva ou area protegida)?
// Responde "inside" (dentro), "near" (a menos de 500 m da borda) ou "outside".
app.get('/manancial', async (req, res) => {
  const p = parsePoint(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos ou ausentes' });
  const key = `geo:mancpoint:${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });
  try {
    const json = await queryOverpass(buildAreasAroundQuery(p.lat, p.lon, 1500));
    const payload = { lat: p.lat, lon: p.lon, ...classifyPoint(json, p.lat, p.lon) };
    await cacheSet(key, payload);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] manancial falhou:', err.message);
    res.status(502).json({ error: 'servico de dados geograficos indisponivel' });
  }
});

// Alertas de desmatamento recentes: em volta de um ponto (lat, lon, radiusKm) ou no retangulo do mapa.
app.get('/forest/alerts', async (req, res) => {
  const days = clampInt(req.query.days, 30, 1, 90);
  let geometry; let key;
  if (req.query.south !== undefined) {
    const parsed = parseBBox(req.query, 0.6);
    if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error });
    const b = parsed.bbox;
    geometry = bboxPolygon(b);
    key = `geo:forest:b:${b.south},${b.west},${b.north},${b.east}:${days}`;
  } else {
    const p = parsePoint(req.query);
    if (!p) return res.status(400).json({ error: 'informe lat/lon ou south/west/north/east' });
    const radiusKm = clampNum(req.query.radiusKm, 10, 1, 30);
    geometry = circlePolygon(p.lat, p.lon, radiusKm);
    key = `geo:forest:p:${p.lat.toFixed(2)},${p.lon.toFixed(2)}:${radiusKm}:${days}`;
  }
  if (!GFW_API_KEY) return res.json(FOREST_OFF);
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });
  try {
    const result = await queryAlerts({ apiKey: GFW_API_KEY, geometry, days, origin: GFW_ORIGIN });
    const payload = { available: true, ...result };
    await cacheSet(key, payload, FOREST_TTL);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] alertas de desmatamento falharam:', err.message);
    res.status(502).json({ error: err instanceof GfwError ? err.message : 'servico do GFW indisponivel' });
  }
});

// Desmatamento DENTRO de mananciais e areas protegidas perto de um ponto: o sinal de
// possivel invasao/supressao de vegetacao. Cada area vigiada vira uma consulta ao GFW.
app.get('/manancial/watch', async (req, res) => {
  const p = parsePoint(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos ou ausentes' });
  const days = clampInt(req.query.days, 30, 1, 90);
  const radiusKm = clampNum(req.query.radiusKm, 15, 2, 30);
  if (!GFW_API_KEY) return res.json(FOREST_OFF);

  const key = `geo:mancwatch:${p.lat.toFixed(2)},${p.lon.toFixed(2)}:${radiusKm}:${days}`;
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });
  try {
    const dLat = radiusKm / 111.32;
    const dLon = radiusKm / (111.32 * Math.cos((p.lat * Math.PI) / 180));
    const window = { south: p.lat - dLat, north: p.lat + dLat, west: p.lon - dLon, east: p.lon + dLon };
    const json = await queryOverpass(buildAreasAroundQuery(p.lat, p.lon, radiusKm * 1000));
    const watch = watchPolygons(json, window);
    // uma area com problema nao derruba as outras
    const settled = await Promise.allSettled(watch.map((a) =>
      queryAlerts({ apiKey: GFW_API_KEY, geometry: toGeoJson(a.ring), days, origin: GFW_ORIGIN })));
    const failed = settled.filter((r) => r.status === 'rejected');
    if (watch.length && failed.length === watch.length) throw failed[0].reason;
    const areas = watch.map((a, i) => (settled[i].status === 'fulfilled'
      ? { id: a.id, name: a.name, kind: a.kind, subtype: a.subtype, alerts: settled[i].value.total, confirmed: settled[i].value.confirmed,
          latest: settled[i].value.latest, cells: settled[i].value.cells.slice(0, 10) }
      : null)).filter(Boolean).sort((x, y) => y.confirmed - x.confirmed || y.alerts - x.alerts);
    const payload = { available: true, days, radiusKm, areasChecked: areas.length, areas,
      totalAlerts: areas.reduce((n, a) => n + a.alerts, 0), totalConfirmed: areas.reduce((n, a) => n + a.confirmed, 0) };
    await cacheSet(key, payload, FOREST_TTL);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] vigilancia de manancial falhou:', err.message);
    res.status(502).json({ error: err instanceof GfwError ? err.message : 'servico indisponivel' });
  }
});

// Pontos e estacoes de transporte publico no retangulo informado.
// scope=stations (estacoes de metro/trem/onibus/bonde) ou all (inclui pontos de onibus).
app.get('/transit', async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'stations';
  const parsed = parseBBox(req.query, scope === 'all' ? 0.2 : 2);
  if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error });
  const { bbox } = parsed;

  const key = `geo:transit:${scope}:${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });

  try {
    const json = await queryOverpass(buildTransitQuery(bbox, scope));
    const stops = parseTransit(json);
    const payload = { scope, stops, truncated: (json.elements || []).length >= 400 };
    await cacheSet(key, payload);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] transit falhou:', err.message);
    res.status(502).json({ error: 'servico de dados geograficos indisponivel' });
  }
});

// Reservatorios/lagos e areas protegidas (referencia para areas de mananciais).
app.get('/watersheds', async (req, res) => {
  const parsed = parseBBox(req.query, 1.5);
  if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error });
  const { bbox } = parsed;

  const key = `geo:water:${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });

  try {
    const json = await queryOverpass(buildWaterQuery(bbox));
    const features = parseWater(json);
    const payload = { features, truncated: (json.elements || []).length >= 120 };
    await cacheSet(key, payload);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] watersheds falhou:', err.message);
    res.status(502).json({ error: 'servico de dados geograficos indisponivel' });
  }
});

app.listen(PORT, () => console.log(`[geodata-service] ouvindo na porta ${PORT}`));
