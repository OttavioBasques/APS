// Respostas simuladas das APIs externas (Open-Meteo, Overpass e TomTom). Qualquer outra URL
// (por exemplo, localhost) passa para o fetch real.
const realFetch = globalThis.fetch;
const pad = (n) => String(n).padStart(2, '0');
const times = () => Array.from({ length: 24 }, (_, i) => `2026-07-${i < 4 ? '10' : '11'}T${pad((20 + i) % 24)}:00`);

const CURRENT = {
  temperature_2m: 23.4, apparent_temperature: 25.1, relative_humidity_2m: 70, precipitation: 0.2, weather_code: 63,
  cloud_cover: 80, pressure_msl: 1012.6, wind_speed_10m: 18, wind_direction_10m: 200, wind_gusts_10m: 30
};
const PRESSURE_PROFILE = { 1000: 11, 975: 10, 950: 9, 925: 8, 900: 7, 850: 5 };

function hourlyValue(name, i) {
  if (name === 'precipitation') return 2.6;                     // 62,4 mm em 24 h
  if (name === 'precipitation_probability') return 40;
  if (name === 'temperature_2m') return 10;
  if (name === 'temperature_180m') return i >= 2 && i <= 11 ? 13.4 : 9; // inversao forte de madrugada
  if (name === 'surface_pressure') return 1013;
  if (name === 'wind_speed_10m') return 4;
  if (name === 'cloud_cover') return 20;
  const m = /^temperature_(\d+)hPa$/.exec(name);
  if (m) return PRESSURE_PROFILE[m[1]] ?? null;
  return 1;
}

function forecastItem(p, lat) {
  const item = { latitude: Number(lat), timezone: 'America/Sao_Paulo' };
  if (p.get('current')) {
    item.current = {};
    for (const v of p.get('current').split(',')) item.current[v] = CURRENT[v] ?? 1;
  }
  if (p.get('hourly')) {
    item.hourly = { time: times() };
    for (const v of p.get('hourly').split(',')) item.hourly[v] = Array.from({ length: 24 }, (_, i) => hourlyValue(v, i));
  }
  if (p.get('daily')) {
    const days = Number(p.get('forecast_days') || 7);
    item.daily = {
      time: Array.from({ length: days }, (_, i) => `2026-07-${pad(10 + i)}`),
      precipitation_sum: [30, 12].slice(0, days),
      precipitation_probability_max: [80, 50].slice(0, days)
    };
  }
  return item;
}

const overpassTransit = { elements: [
  { type: 'node', id: 1, lat: -22.88, lon: -48.44, tags: { highway: 'bus_stop', name: 'Ponto Central', wheelchair: 'yes' } },
  { type: 'way', id: 2, center: { lat: -22.87, lon: -48.43 }, tags: { railway: 'station', station: 'subway', name: 'Estação Sé' } }
] };
const g = (pts) => pts.map(([lat, lon]) => ({ lat, lon }));
const overpassWater = { elements: [
  { type: 'way', id: 10, tags: { natural: 'water', water: 'reservoir', name: 'Represa Teste' }, geometry: g([[0, 0], [0, 1], [1, 1], [0, 0]]) },
  { type: 'relation', id: 11, tags: { boundary: 'protected_area', name: 'APA Teste' }, members: [{ type: 'way', role: 'outer', geometry: g([[2, 2], [2, 3], [3, 3]]) }] }
] };

export const upstreamCalls = [];

export function installUpstreamMock() {
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url));
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
    const lats = (u.searchParams.get('latitude') || '').split(',').filter(Boolean);

    if (u.hostname === 'api.open-meteo.com') {
      upstreamCalls.push(u.href);
      if (lats[0] && lats[0].startsWith('1.23')) return json({ error: true, reason: 'falha simulada' }, 500);
      const items = lats.map((lat) => forecastItem(u.searchParams, lat));
      return json(items.length === 1 ? items[0] : items);
    }
    if (u.hostname === 'air-quality-api.open-meteo.com') {
      upstreamCalls.push(u.href);
      const items = lats.map((lat) => ({
        latitude: Number(lat),
        current: { european_aqi: Number(lat) < -30 ? 95 : 32, pm10: 12, pm2_5: 6, ozone: 60, nitrogen_dioxide: 9, carbon_monoxide: 100, uv_index: 4 }
      }));
      return json(items.length === 1 ? items[0] : items);
    }
    if (u.hostname === 'flood-api.open-meteo.com') {
      upstreamCalls.push(u.href);
      const discharge = [...Array(30).fill(10), 12, 20, 35, 28, 15, 12, 11];
      return json({ daily: { time: discharge.map((_, i) => `d${i}`), river_discharge: discharge } });
    }
    if (u.hostname === 'geocoding-api.open-meteo.com') {
      return json({ results: [{ name: 'Botucatu', latitude: -22.88, longitude: -48.44, admin1: 'São Paulo', country: 'Brasil' }] });
    }
    if (u.hostname.includes('overpass')) {
      upstreamCalls.push(u.href);
      const ql = decodeURIComponent(String(opts.body).replace(/^data=/, ''));
      return json(ql.includes('protected_area') ? overpassWater : overpassTransit);
    }
    if (u.hostname === 'api.tomtom.com') {
      upstreamCalls.push(u.href);
      if (!u.searchParams.get('key')) return json({ error: 'sem chave' }, 403);
      if (u.pathname.includes('/traffic/map/')) {
        return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { status: 200, headers: { 'content-type': 'image/png' } });
      }
      if (u.pathname.includes('incidentDetails')) {
        return json({ incidents: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: [-48.44, -22.88] },
            properties: { iconCategory: 6, magnitudeOfDelay: 3, from: 'Av. A', to: 'Av. B', length: 1200, delay: 600, events: [{ description: 'Trânsito parado' }] } },
          { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-48.45, -22.89], [-48.46, -22.9]] },
            properties: { iconCategory: 8, magnitudeOfDelay: 4, events: [{ description: 'Via interditada' }] } },
          { type: 'Feature', geometry: { type: 'Point', coordinates: [-48.4, -22.85] },
            properties: { iconCategory: 9, magnitudeOfDelay: 1, events: [{ description: 'Obras' }] } }
        ] });
      }
      if (u.pathname.includes('flowSegmentData')) {
        if (u.searchParams.get('point').startsWith('0.5')) return json({ error: 'sem via' }, 400);
        return json({ flowSegmentData: { currentSpeed: 24, freeFlowSpeed: 40, currentTravelTime: 100, freeFlowTravelTime: 60, confidence: 0.9, roadClosure: false } });
      }
    }
    return realFetch(url, opts);
  };
}
