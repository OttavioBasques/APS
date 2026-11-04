// Alertas de desmatamento: Global Forest Watch Data API (alertas integrados
// GLAD-L / GLAD-S2 / RADD). Precisa de GFW_API_KEY; sem ela o servico informa
// "indisponivel" em vez de falhar. Funcoes puras + uma chamada HTTP.
const GFW_URL = process.env.GFW_API_URL || 'https://data-api.globalforestwatch.org';
const DATASET = 'gfw_integrated_alerts';
const MAX_ROWS = 60000;

export function sinceDate(days, now = Date.now()) {
  return new Date(now - days * 86400000).toISOString().slice(0, 10);
}

export function circlePolygon(lat, lon, radiusKm, n = 24) {
  const ring = [];
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    ring.push([Number((lon + dLon * Math.cos(a)).toFixed(5)), Number((lat + dLat * Math.sin(a)).toFixed(5))]);
  }
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

export function bboxPolygon(b) {
  return { type: 'Polygon', coordinates: [[[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]] };
}

export function buildAlertsSql(since) {
  return 'SELECT longitude, latitude, gfw_integrated_alerts__date, gfw_integrated_alerts__confidence ' +
    `FROM results WHERE gfw_integrated_alerts__date >= '${since}'`;
}

// Resume os pixels de alerta em celulas de ~1 km (0,01 grau). Alertas de confianca
// "low" ficam de fora: sao os que mais geram falso positivo (nuvem, sombra).
export function aggregateAlerts(rows, { cellDeg = 0.01, maxCells = 40 } = {}) {
  const cells = new Map();
  let total = 0; let confirmed = 0; let latest = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    const conf = r.gfw_integrated_alerts__confidence;
    if (conf !== 'high' && conf !== 'nominal') continue;
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') continue;
    total++;
    if (conf === 'high') confirmed++;
    const date = r.gfw_integrated_alerts__date || null;
    if (date && (!latest || date > latest)) latest = date;
    const la = Math.floor(r.latitude / cellDeg) * cellDeg + cellDeg / 2;
    const lo = Math.floor(r.longitude / cellDeg) * cellDeg + cellDeg / 2;
    const key = `${la.toFixed(3)},${lo.toFixed(3)}`;
    const c = cells.get(key) || { lat: Number(la.toFixed(4)), lon: Number(lo.toFixed(4)), count: 0, confirmed: 0, latest: null };
    c.count++;
    if (conf === 'high') c.confirmed++;
    if (date && (!c.latest || date > c.latest)) c.latest = date;
    cells.set(key, c);
  }
  const list = [...cells.values()].sort((a, b) => b.count - a.count);
  return { total, confirmed, latest, cells: list.slice(0, maxCells), moreCells: Math.max(0, list.length - maxCells) };
}

export class GfwError extends Error {}

// Consulta os alertas dentro de um poligono GeoJSON.
export async function queryAlerts({ apiKey, geometry, days, origin, fetchImpl = fetch, now = Date.now() }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetchImpl(`${GFW_URL}/dataset/${DATASET}/latest/query/json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, origin },
      body: JSON.stringify({ sql: buildAlertsSql(sinceDate(days, now)), geometry }),
      signal: controller.signal
    });
    if (res.status === 401 || res.status === 403) throw new GfwError('chave do GFW recusada (confira GFW_API_KEY e os dominios cadastrados)');
    if (res.status === 429) throw new GfwError('limite de consultas do GFW atingido; tente de novo mais tarde');
    if (!res.ok) throw new GfwError(`GFW respondeu ${res.status}`);
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data.slice(0, MAX_ROWS) : [];
    return { ...aggregateAlerts(rows), days, sampled: Array.isArray(json?.data) && json.data.length > MAX_ROWS };
  } finally { clearTimeout(timer); }
}
