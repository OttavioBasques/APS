#!/usr/bin/env node
// Verifica, de verdade e pela sua rede, se cada API externa usada pelo projeto responde
// como o codigo espera. Nao depende de nenhum servico do projeto estar no ar.
//
//   node scripts/check-apis.mjs                 (Node 18+)
//   docker run --rm -v "$PWD":/w -w /w node:22-alpine node scripts/check-apis.mjs     (sem Node instalado)
//
// Le as chaves de .env (OPENWEATHER_API_KEY, TOMTOM_API_KEY, DEFORESTATION_TILES_URL).
// Codigo de saida 0 = tudo certo; 1 = alguma verificacao falhou (ou foi pulada por falta de chave).
import fs from 'node:fs';

const env = {};
try {
  for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2];
  }
} catch { /* sem .env: so as APIs sem chave serao testadas */ }
for (const k of ['OPENWEATHER_API_KEY', 'TOMTOM_API_KEY', 'DEFORESTATION_TILES_URL']) if (process.env[k]) env[k] = process.env[k];

const LAT = -22.88; const LON = -48.44;          // Botucatu-SP
const DEFAULT_GFW = 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.8/tcd_30/{z}/{x}/{y}.png';
const OWM = env.OPENWEATHER_API_KEY && !env.OPENWEATHER_API_KEY.startsWith('cole_');
const TT = env.TOMTOM_API_KEY;

async function get(url, init = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 20000);
  try { return await fetch(url, { signal: c.signal, ...init }); } finally { clearTimeout(t); }
}
const isPng = async (r) => { const b = Buffer.from(await r.arrayBuffer()); return b.length > 8 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47; };

const checks = [
  ['Open-Meteo previsao (clima atual)', async () => {
    const r = await get(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,cloud_cover,pressure_msl,wind_gusts_10m&timezone=auto`);
    const j = await r.json(); return r.ok && typeof j.current?.temperature_2m === 'number' ? `${j.current.temperature_2m} °C` : `HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`;
  }],
  ['Open-Meteo qualidade do ar', async () => {
    const r = await get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=european_aqi,pm2_5`);
    const j = await r.json(); return r.ok && j.current?.european_aqi !== undefined ? `IQA ${j.current.european_aqi}` : `HTTP ${r.status}`;
  }],
  ['Open-Meteo vazao de rios (alagamento)', async () => {
    const r = await get(`https://flood-api.open-meteo.com/v1/flood?latitude=${LAT}&longitude=${LON}&daily=river_discharge&past_days=30&forecast_days=7`);
    const j = await r.json(); const n = j.daily?.river_discharge?.length;
    return r.ok && n === 37 ? `${n} dias` : `HTTP ${r.status}, ${n ?? 'sem'} valores (esperado 37)`;
  }],
  ['Open-Meteo perfil vertical (inversao termica)', async () => {
    const v = 'temperature_2m,temperature_180m,temperature_925hPa,temperature_850hPa,surface_pressure';
    const r = await get(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=${v}&forecast_hours=24&timezone=auto`);
    const j = await r.json(); const ok = r.ok && j.hourly?.temperature_180m?.some((x) => typeof x === 'number');
    return ok ? `T(180 m) = ${j.hourly.temperature_180m[0]} °C` : `HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`;
  }],
  ['Open-Meteo geocodificacao', async () => {
    const r = await get('https://geocoding-api.open-meteo.com/v1/search?name=Botucatu&count=1&language=pt');
    const j = await r.json(); return r.ok && j.results?.[0] ? j.results[0].name : `HTTP ${r.status}`;
  }],
  ['Overpass/OSM (transporte publico e mananciais)', async () => {
    const q = '[out:json][timeout:25];(node["railway"="station"](-23.6,-46.7,-23.5,-46.6););out body 5;';
    const r = await get('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'RespiraUrbana/1.0 (check-apis)' }, body: 'data=' + encodeURIComponent(q) });
    const j = await r.json(); return r.ok && Array.isArray(j.elements) ? `${j.elements.length} estacoes` : `HTTP ${r.status}`;
  }],
  ['OpenWeatherMap tiles (camadas de clima)', async () => {
    if (!OWM) return 'PULADO: OPENWEATHER_API_KEY ausente';
    const r = await get(`https://tile.openweathermap.org/map/temp_new/3/2/3.png?appid=${env.OPENWEATHER_API_KEY}`);
    return r.ok && await isPng(r) ? 'PNG ok' : `HTTP ${r.status} (chave nova pode levar horas para ativar)`;
  }],
  ['TomTom tiles de fluxo', async () => {
    if (!TT) return 'PULADO: TOMTOM_API_KEY ausente';
    const r = await get(`https://api.tomtom.com/traffic/map/4/tile/flow/relative/10/380/570.png?key=${TT}`);
    return r.ok && await isPng(r) ? 'PNG ok' : `HTTP ${r.status}`;
  }],
  ['TomTom tiles de incidentes', async () => {
    if (!TT) return 'PULADO: TOMTOM_API_KEY ausente';
    const r = await get(`https://api.tomtom.com/traffic/map/4/tile/incidents/s1/10/380/570.png?key=${TT}`);
    return r.ok && await isPng(r) ? 'PNG ok' : `HTTP ${r.status}`;
  }],
  ['TomTom detalhes de incidentes', async () => {
    if (!TT) return 'PULADO: TOMTOM_API_KEY ausente';
    const f = encodeURIComponent('{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},from,to,length,delay,roadNumbers}}}');
    const r = await get(`https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TT}&bbox=-46.75,-23.65,-46.5,-23.45&fields=${f}&language=pt-BR&timeValidityFilter=present`);
    const j = await r.json(); return r.ok && Array.isArray(j.incidents) ? `${j.incidents.length} incidentes (Sao Paulo)` : `HTTP ${r.status} ${JSON.stringify(j).slice(0, 140)}`;
  }],
  ['TomTom fluxo em um ponto', async () => {
    if (!TT) return 'PULADO: TOMTOM_API_KEY ausente';
    const r = await get(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${TT}&point=-23.5505,-46.6333`);
    const j = await r.json(); return r.ok && j.flowSegmentData ? `${j.flowSegmentData.currentSpeed} km/h` : `HTTP ${r.status}`;
  }],
  ['Global Forest Watch tiles (desmatamento)', async () => {
    const url = (env.DEFORESTATION_TILES_URL || DEFAULT_GFW).replace('{z}', '6').replace('{x}', '23').replace('{y}', '34');
    const r = await get(url);
    return r.ok && await isPng(r) ? 'PNG ok' : `HTTP ${r.status} (se 404, ajuste a versao em DEFORESTATION_TILES_URL)`;
  }],
  ['Seu gateway local (http://localhost:3000)', async () => {
    const r = await get('http://localhost:3000/api/config').catch(() => null);
    if (!r) return 'PULADO: gateway nao esta rodando (docker-compose up)';
    const j = await r.json(); return r.ok ? `owm=${Boolean(j.openWeatherApiKey)} trafego=${j.trafficEnabled}` : `HTTP ${r.status}`;
  }]
];

let bad = 0;
for (const [name, fn] of checks) {
  let line;
  try {
    const res = await fn();
    const ok = !/^(HTTP|PULADO)/.test(res);
    if (!ok) bad++;
    line = `${ok ? '✔' : res.startsWith('PULADO') ? '–' : '✘'} ${name}: ${res}`;
  } catch (e) { bad++; line = `✘ ${name}: ${e.cause?.code || e.message}`; }
  console.log(line);
}
console.log(bad ? `\n${bad} verificacao(oes) sem sucesso. Veja as linhas marcadas.` : '\nTudo certo.');
process.exit(bad ? 1 : 0);
