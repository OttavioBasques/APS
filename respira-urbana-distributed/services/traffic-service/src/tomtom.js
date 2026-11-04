// Funcoes puras para a API da TomTom (montar URL e interpretar resposta),
// testaveis sem rede. Documentacao: https://developer.tomtom.com/traffic-api
export const BASE = 'https://api.tomtom.com';

export const FLOW_STYLES = ['absolute', 'relative', 'relative0', 'relative-delay', 'reduced-sensitivity'];
export const INCIDENT_STYLES = ['s0', 's0-dark', 's1', 's2', 's3', 'night'];

export function isTileCoord(z, x, y) {
  if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22) return false;
  const n = 2 ** z;
  return x >= 0 && x < n && y >= 0 && y < n;
}

export function tileUrl(kind, style, z, x, y, key) {
  return `${BASE}/traffic/map/4/tile/${kind}/${style}/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`;
}

export function flowUrl(lat, lon, key) {
  return `${BASE}/traffic/services/4/flowSegmentData/absolute/10/json?key=${encodeURIComponent(key)}&point=${lat},${lon}`;
}

const INCIDENT_FIELDS =
  '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,' +
  'events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}';

export function incidentsUrl(b, key) {
  return `${BASE}/traffic/services/5/incidentDetails?key=${encodeURIComponent(key)}` +
    `&bbox=${b.west},${b.south},${b.east},${b.north}` +
    `&fields=${encodeURIComponent(INCIDENT_FIELDS)}&timeValidityFilter=present`;
}

// iconCategory da TomTom -> rotulo
export const CATEGORIES = {
  0: 'Incidente', 1: 'Acidente', 2: 'Neblina', 3: 'Condição perigosa', 4: 'Chuva', 5: 'Gelo',
  6: 'Congestionamento', 7: 'Faixa interditada', 8: 'Via interditada', 9: 'Obras', 10: 'Vento',
  11: 'Alagamento', 14: 'Veículo parado'
};
export const DELAY_LEVELS = { 0: 'desconhecido', 1: 'leve', 2: 'moderado', 3: 'grave', 4: 'indefinido' };

const firstPoint = (geom) => {
  if (!geom || !Array.isArray(geom.coordinates)) return null;
  let c = geom.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return typeof c[0] === 'number' && typeof c[1] === 'number' ? { lat: c[1], lon: c[0] } : null;
};

export function parseIncidents(json, max = 40) {
  const raw = Array.isArray(json?.incidents) ? json.incidents : [];
  const items = raw.map((inc, i) => {
    const p = inc.properties || {};
    const pt = firstPoint(inc.geometry);
    const cat = Number.isInteger(p.iconCategory) ? p.iconCategory : 0;
    return {
      id: p.id || `inc-${i}`,
      category: cat,
      categoryLabel: CATEGORIES[cat] || 'Incidente',
      severity: Number.isInteger(p.magnitudeOfDelay) ? p.magnitudeOfDelay : 0,
      severityLabel: DELAY_LEVELS[p.magnitudeOfDelay] || 'desconhecido',
      description: p.events?.[0]?.description || '',
      from: p.from || '', to: p.to || '',
      roads: Array.isArray(p.roadNumbers) ? p.roadNumbers : [],
      lengthM: typeof p.length === 'number' ? Math.round(p.length) : null,
      delaySec: typeof p.delay === 'number' ? Math.round(p.delay) : null,
      lat: pt ? pt.lat : null, lon: pt ? pt.lon : null
    };
  });
  const byCategory = {};
  for (const it of items) byCategory[it.categoryLabel] = (byCategory[it.categoryLabel] || 0) + 1;
  const sorted = [...items].sort((a, b) => (b.severity === 4 ? 0 : b.severity) - (a.severity === 4 ? 0 : a.severity));
  return {
    total: items.length,
    major: items.filter((i) => i.severity === 3).length,
    roadClosures: items.filter((i) => i.category === 8).length,
    totalDelaySec: items.reduce((s, i) => s + (i.delaySec || 0), 0),
    byCategory,
    items: sorted.slice(0, max)
  };
}

export function classifyFlow(ratio, closed) {
  if (closed) return { level: 'interditada', score: 3 };
  if (ratio == null) return { level: null, score: null };
  if (ratio >= 0.8) return { level: 'livre', score: 0 };
  if (ratio >= 0.5) return { level: 'moderado', score: 1 };
  if (ratio >= 0.25) return { level: 'intenso', score: 2 };
  return { level: 'parado', score: 3 };
}

export function parseFlow(json) {
  const f = json?.flowSegmentData;
  if (!f || typeof f.currentSpeed !== 'number' || typeof f.freeFlowSpeed !== 'number') return { available: false };
  const ratio = f.freeFlowSpeed > 0 ? Number((f.currentSpeed / f.freeFlowSpeed).toFixed(2)) : null;
  const { level, score } = classifyFlow(ratio, Boolean(f.roadClosure));
  return {
    available: true,
    currentSpeedKmh: f.currentSpeed,
    freeFlowSpeedKmh: f.freeFlowSpeed,
    currentTravelTimeSec: f.currentTravelTime ?? null,
    freeFlowTravelTimeSec: f.freeFlowTravelTime ?? null,
    confidence: f.confidence ?? null,
    roadClosure: Boolean(f.roadClosure),
    ratio, level, score
  };
}
