// Mananciais e areas protegidas: "este ponto esta dentro de uma area de
// manancial?" e geometrias recortadas para consultar o desmatamento dentro delas.
// Tudo aqui e funcao pura (testavel sem rede). Dados (c) colaboradores do
// OpenStreetMap (ODbL): referencia, nao o limite legal.

const KM_PER_DEG = 111.32;

// Consulta Overpass com geometria completa das areas num raio ao redor do ponto.
export function buildAreasAroundQuery(lat, lon, radiusM) {
  const around = `(around:${Math.round(radiusM)},${lat},${lon})`;
  const selectors = [
    '["natural"="water"]["water"~"^(reservoir|lake)$"]',
    '["landuse"="reservoir"]',
    '["boundary"="protected_area"]',
    '["leisure"="nature_reserve"]'
  ];
  const parts = selectors.flatMap((s) => [`way${s}${around};`, `relation${s}${around};`]);
  return `[out:json][timeout:30];(${parts.join('')});out geom 80;`;
}

const pts = (geom) => (Array.isArray(geom) ? geom : [])
  .filter((g) => g && typeof g.lat === 'number' && typeof g.lon === 'number')
  .map((g) => [g.lat, g.lon]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];

// Junta os trechos ("ways") de uma relacao em aneis fechados, ligando pontas iguais.
// Trechos que nao fecham um anel sao descartados (dado incompleto no recorte).
export function assembleRings(ways) {
  const open = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  const rings = [];
  while (open.length) {
    let cur = open.shift();
    let grew = true;
    while (grew && !same(cur[0], cur[cur.length - 1])) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const w = open[i];
        const end = cur[cur.length - 1];
        if (same(end, w[0])) cur = cur.concat(w.slice(1));
        else if (same(end, w[w.length - 1])) cur = cur.concat(w.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (cur.length >= 4 && same(cur[0], cur[cur.length - 1])) rings.push(cur);
  }
  return rings;
}

// Aneis externos fechados de um elemento do Overpass.
export function elementRings(el) {
  if (el.type === 'way') {
    const p = pts(el.geometry);
    return p.length >= 4 && same(p[0], p[p.length - 1]) ? [p] : [];
  }
  if (el.type === 'relation' && Array.isArray(el.members)) {
    const ways = el.members.filter((m) => m.type === 'way' && m.role === 'outer').map((m) => pts(m.geometry));
    return assembleRings(ways);
  }
  return [];
}

// Ponto em poligono (raio horizontal). Anel como [[lat, lon], ...].
export function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Distancia (km) do ponto ate a borda do anel, em projecao plana local (boa para poucos km).
export function distanceToRingKm(lat, lon, ring) {
  const kx = KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
  const ky = KM_PER_DEG;
  let best = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const ax = (ring[i][1] - lon) * kx; const ay = (ring[i][0] - lat) * ky;
    const bx = (ring[i + 1][1] - lon) * kx; const by = (ring[i + 1][0] - lat) * ky;
    const dx = bx - ax; const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

export function describeElement(el) {
  const t = el.tags || {};
  const isProtected = t.boundary === 'protected_area' || t.leisure === 'nature_reserve';
  return {
    id: `${el.type}/${el.id}`,
    kind: isProtected ? 'protected' : 'water',
    subtype: isProtected ? (t.protection_title || '') : (t.water || (t.landuse === 'reservoir' ? 'reservoir' : '')),
    name: t.name || t['name:pt'] || '',
    operator: t.operator || ''
  };
}

// Resposta de "o que ha neste ponto": dentro, perto (ate nearKm da borda) ou fora.
export function classifyPoint(json, lat, lon, nearKm = 0.5) {
  const areas = [];
  for (const el of json?.elements || []) {
    const rings = elementRings(el);
    if (!rings.length) continue;
    let inside = false;
    let dist = Infinity;
    for (const r of rings) {
      if (pointInRing(lat, lon, r)) inside = true;
      dist = Math.min(dist, distanceToRingKm(lat, lon, r));
    }
    areas.push({ ...describeElement(el), inside, distanceKm: inside ? 0 : Math.round(dist * 100) / 100 });
  }
  areas.sort((a, b) => Number(b.inside) - Number(a.inside) || a.distanceKm - b.distanceKm);
  const status = areas.some((a) => a.inside) ? 'inside'
    : areas.some((a) => a.distanceKm <= nearKm) ? 'near' : 'outside';
  const relevant = areas.filter((a) => a.inside || a.distanceKm <= nearKm);
  return { status, areas: relevant.slice(0, 5), nearest: areas.find((a) => !a.inside) || null };
}

// ----- recorte de aneis para consultar so a regiao de interesse -----

// Sutherland-Hodgman contra um retangulo (anel como [[lat, lon], ...]).
export function clipRing(ring, b) {
  const edges = [
    { inside: (p) => p[1] >= b.west, cut: (a, c) => [a[0] + ((c[0] - a[0]) * (b.west - a[1])) / (c[1] - a[1]), b.west] },
    { inside: (p) => p[1] <= b.east, cut: (a, c) => [a[0] + ((c[0] - a[0]) * (b.east - a[1])) / (c[1] - a[1]), b.east] },
    { inside: (p) => p[0] >= b.south, cut: (a, c) => [b.south, a[1] + ((c[1] - a[1]) * (b.south - a[0])) / (c[0] - a[0])] },
    { inside: (p) => p[0] <= b.north, cut: (a, c) => [b.north, a[1] + ((c[1] - a[1]) * (b.north - a[0])) / (c[0] - a[0])] }
  ];
  let out = ring.slice(0, -1);
  for (const e of edges) {
    const input = out;
    out = [];
    if (!input.length) break;
    let prev = input[input.length - 1];
    for (const cur of input) {
      if (e.inside(cur)) {
        if (!e.inside(prev)) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (e.inside(prev)) out.push(e.cut(prev, cur));
      prev = cur;
    }
  }
  return out.length >= 3 ? out.concat([out[0]]) : null;
}

export function thin(ring, max) {
  if (ring.length <= max) return ring;
  const step = Math.ceil(ring.length / max);
  const out = ring.filter((_, i) => i % step === 0);
  if (!same(out[out.length - 1], ring[ring.length - 1])) out.push(ring[ring.length - 1]);
  if (!same(out[0], out[out.length - 1])) out.push(out[0]);
  return out;
}

export const toGeoJson = (ring) => ({ type: 'Polygon', coordinates: [ring.map(([lat, lon]) => [lon, lat])] });

const bounds = (ring) => ring.reduce((b, [la, lo]) => ({
  south: Math.min(b.south, la), north: Math.max(b.north, la), west: Math.min(b.west, lo), east: Math.max(b.east, lo)
}), { south: 90, north: -90, west: 180, east: -180 });

// Areas a vigiar perto de um ponto: cada uma vira um poligono (recortado na janela de
// busca) para o GFW. Represas/lagos usam o retangulo do espelho d'agua + ~1 km de margem,
// porque o desmatamento que importa para o manancial e o do entorno, nao o da agua.
export function watchPolygons(json, window, { maxAreas = 4, maxPoints = 80, margin = 0.01 } = {}) {
  const found = [];
  for (const el of json?.elements || []) {
    const info = describeElement(el);
    for (const ring of elementRings(el)) {
      const shape = info.kind === 'water'
        ? (() => { const b = bounds(ring); return [[b.south - margin, b.west - margin], [b.south - margin, b.east + margin],
          [b.north + margin, b.east + margin], [b.north + margin, b.west - margin], [b.south - margin, b.west - margin]]; })()
        : ring;
      const clipped = clipRing(shape, window);
      if (!clipped) continue;
      const b = bounds(clipped);
      found.push({ ...info, ring: thin(clipped, maxPoints), size: (b.north - b.south) * (b.east - b.west) });
    }
  }
  // varias partes da mesma area (relacao com varios aneis) viram entradas separadas; as maiores primeiro
  return found.sort((a, b) => b.size - a.size).slice(0, maxAreas);
}
