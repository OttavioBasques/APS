import express from 'express';
import { classifyFlood, summarizeRiver } from './flood.js';
import { analyzeInversion, gridStrength } from './inversion.js';
import { parseGridParams, cellCenters, asArray } from './grid.js';

const app = express();
const PORT = process.env.PORT || 3005;

function parsePoint(q) {
  const lat = Number(q.lat);
  const lon = Number(q.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function getJson(url, ms = 8000) {
  const res = await fetchWithTimeout(url, ms);
  if (!res.ok) throw new Error(`upstream respondeu ${res.status}`);
  return res.json();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'risk-service' });
});

// Risco de alagamento/inundacao: chuva prevista (Open-Meteo Forecast) +
// tendencia da vazao do rio mais proximo (Open-Meteo Flood / GloFAS, 5 km).
app.get('/flood', async (req, res) => {
  const p = parsePoint(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos ou ausentes' });

  const forecastUrl =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${p.lat}&longitude=${p.lon}` +
    '&hourly=precipitation&forecast_hours=24' +
    '&daily=precipitation_sum,precipitation_probability_max&forecast_days=2&timezone=auto';
  const floodUrl =
    'https://flood-api.open-meteo.com/v1/flood' +
    `?latitude=${p.lat}&longitude=${p.lon}&daily=river_discharge&past_days=30&forecast_days=7`;

  // A chuva e essencial; a vazao e um complemento (pode nao haver rio proximo).
  const [fc, fl] = await Promise.allSettled([getJson(forecastUrl), getJson(floodUrl)]);
  if (fc.status !== 'fulfilled') {
    console.error('[risk-service] previsao de chuva falhou:', fc.reason.message);
    return res.status(502).json({ error: 'previsao de chuva indisponivel', detail: fc.reason.message });
  }

  const hourly = (fc.value.hourly?.precipitation || []).filter((v) => typeof v === 'number');
  const daily = fc.value.daily || {};
  const round1 = (v) => Math.round(v * 10) / 10;
  const rain = {
    next24hMm: hourly.length ? round1(hourly.reduce((a, b) => a + b, 0)) : null,
    maxHourlyMm: hourly.length ? round1(Math.max(...hourly)) : null,
    todayMm: daily.precipitation_sum?.[0] ?? null,
    tomorrowMm: daily.precipitation_sum?.[1] ?? null,
    probabilityMax: daily.precipitation_probability_max?.[0] ?? null
  };

  let river = { available: false };
  if (fl.status === 'fulfilled') river = summarizeRiver(fl.value.daily?.river_discharge, 30);
  else console.error('[risk-service] vazao indisponivel:', fl.reason.message);

  const { score, level, reasons } = classifyFlood({ rain, river });
  res.json({ level, score, rain, river, reasons });
});

// Inversao termica de um ponto: perfil vertical previsto para as proximas 24 h.
app.get('/inversion', async (req, res) => {
  const p = parsePoint(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos ou ausentes' });

  const vars = [
    'temperature_2m', 'temperature_180m',
    'temperature_1000hPa', 'temperature_975hPa', 'temperature_950hPa',
    'temperature_925hPa', 'temperature_900hPa', 'temperature_850hPa',
    'surface_pressure', 'wind_speed_10m', 'cloud_cover'
  ].join(',');
  try {
    const data = await getJson(
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${p.lat}&longitude=${p.lon}&hourly=${vars}&forecast_hours=24&timezone=auto`
    );
    res.json(analyzeInversion(data.hourly));
  } catch (err) {
    console.error('[risk-service] erro na inversao:', err.message);
    res.status(502).json({ error: 'servico de clima upstream indisponivel', detail: err.message });
  }
});

// Mapa: intensidade de inversao (180 m - 2 m) por celula, para as proximas 24 h.
app.get('/inversion-grid', async (req, res) => {
  const g = parseGridParams(req.query);
  if (g.error) return res.status(400).json({ error: g.error });
  const centers = cellCenters(g);
  try {
    const data = await getJson(
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${centers.map((c) => c.lat).join(',')}&longitude=${centers.map((c) => c.lon).join(',')}` +
      '&hourly=temperature_2m,temperature_180m&forecast_hours=24&timezone=auto',
      12000
    );
    const cells = asArray(data).map((item, idx) => {
      const s = gridStrength(item.hourly);
      return { lat: centers[idx].lat, lon: centers[idx].lon, now: s.now, maxStrength: s.max };
    });
    res.json({ cells, step: g.step, rows: g.rows, cols: g.cols });
  } catch (err) {
    console.error('[risk-service] erro na grade de inversao:', err.message);
    res.status(502).json({ error: 'servico de clima upstream indisponivel', detail: err.message });
  }
});

app.listen(PORT, () => console.log(`[risk-service] ouvindo na porta ${PORT}`));
