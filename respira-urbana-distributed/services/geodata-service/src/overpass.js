// Consultas e interpretacao da Overpass API (OpenStreetMap). As funcoes de
// montar consulta e de interpretar a resposta sao puras (testaveis sem rede).
// Dados (c) colaboradores do OpenStreetMap, licenca ODbL.
export const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const bboxStr = (b) => `${b.south},${b.west},${b.north},${b.east}`;

// ---------- transporte publico ----------
export function buildTransitQuery(bbox, scope) {
  const b = bboxStr(bbox);
  const stationSelectors = [
    '["railway"="station"]',
    '["station"="subway"]',
    '["railway"="tram_stop"]',
    '["amenity"="bus_station"]',
    '["public_transport"="station"]'
  ];
  const parts = stationSelectors.flatMap((s) => [`node${s}(${b});`, `way${s}(${b});`]);
  if (scope === 'all') parts.push(`node["highway"="bus_stop"](${b});`);
  return `[out:json][timeout:25];(${parts.join('')});out body center 400;`;
}

export function classifyStop(t) {
  if (t.highway === 'bus_stop') return 'bus';
  if (t.amenity === 'bus_station') return 'bus_station';
  if (t.station === 'subway' || t.subway === 'yes') return 'metro';
  if (t.railway === 'tram_stop' || t.station === 'light_rail' || t.light_rail === 'yes' || t.tram === 'yes') return 'tram';
  return 'train';
}

export function parseTransit(json) {
  const seen = new Set();
  const stops = [];
  for (const el of json?.elements || []) {
    const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
    const lon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = el.tags || {};
    stops.push({
      id, lat, lon,
      name: t.name || t['name:pt'] || '',
      kind: classifyStop(t),
      operator: t.operator || '',
      network: t.network || '',
      wheelchair: t.wheelchair || ''
    });
  }
  return stops;
}

// ---------- reservatorios e areas protegidas ----------
export function buildWaterQuery(bbox) {
  const b = bboxStr(bbox);
  const selectors = [
    '["natural"="water"]["water"~"^(reservoir|lake)$"]',
    '["landuse"="reservoir"]',
    '["boundary"="protected_area"]',
    '["leisure"="nature_reserve"]'
  ];
  const parts = selectors.flatMap((s) => [`way${s}(${b});`, `relation${s}(${b});`]);
  return `[out:json][timeout:30];(${parts.join('')});out geom 120;`;
}

export function decimate(points, max) {
  if (points.length <= max) return points;
  const stepN = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % stepN === 0);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const toPoints = (geom) => geom.filter((g) => typeof g.lat === 'number' && typeof g.lon === 'number').map((g) => [g.lat, g.lon]);

export function parseWater(json, pointBudget = 6000) {
  const raw = [];
  for (const el of json?.elements || []) {
    const t = el.tags || {};
    let rings = [];
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      rings = [toPoints(el.geometry)];
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      rings = el.members
        .filter((m) => m.type === 'way' && m.role === 'outer' && Array.isArray(m.geometry))
        .map((m) => toPoints(m.geometry));
    }
    rings = rings.filter((r) => r.length >= 2);
    if (rings.length === 0) continue;

    const protectedArea = t.boundary === 'protected_area' || t.leisure === 'nature_reserve';
    raw.push({
      id: `${el.type}/${el.id}`,
      kind: protectedArea ? 'protected' : 'water',
      subtype: protectedArea ? (t.protection_title || '') : (t.water || (t.landuse === 'reservoir' ? 'reservoir' : '')),
      name: t.name || t['name:pt'] || '',
      operator: t.operator || '',
      protectClass: t.protect_class || '',
      rings
    });
  }

  const ringCount = raw.reduce((n, f) => n + f.rings.length, 0) || 1;
  const perRing = Math.max(12, Math.min(150, Math.floor(pointBudget / ringCount)));
  return raw.map((f) => ({
    ...f,
    rings: f.rings.map((r) => {
      const pts = decimate(r, perRing);
      const closed = r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
      return { closed, points: pts };
    })
  }));
}

// ---------- chamada HTTP (com alternancia de servidores) ----------
let lastCall = 0;
async function politeDelay() {
  const wait = lastCall + 700 - Date.now();
  lastCall = Math.max(Date.now(), lastCall + 700);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function queryOverpass(ql, fetchImpl = fetch) {
  let lastErr = null;
  for (const url of ENDPOINTS) {
    try {
      await politeDelay();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'RespiraUrbana/1.0 (projeto academico; monitoramento ambiental urbano)'
        },
        body: 'data=' + encodeURIComponent(ql),
        signal: controller.signal
      }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`overpass ${url} respondeu ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('overpass indisponivel');
}
