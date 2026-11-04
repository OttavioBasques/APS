import express from 'express';
import { parseGridParams, cellCenters, asArray } from './grid.js';

const app = express();
const PORT = process.env.PORT || 3002;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'weather-service' });
});

// Clima completo de um ponto: tudo o que o app mostra no resumo e nos pop-ups
// das camadas do mapa (temperatura, chuva, vento, nuvens, pressao, umidade).
// A probabilidade de chuva so existe na serie horaria do Open-Meteo, por isso
// pedimos a hora atual (forecast_hours=1) junto com os dados "current".
app.get('/weather', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos ou ausentes' });
  }

  try {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,' +
      'cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
      '&hourly=precipitation_probability&forecast_hours=1&timezone=auto';
    const upstream = await fetchWithTimeout(url, 5000);
    if (!upstream.ok) throw new Error(`upstream respondeu ${upstream.status}`);
    const data = await upstream.json();
    res.json({
      current: data.current,
      precipitationProbability: data.hourly?.precipitation_probability?.[0] ?? null,
      timezone: data.timezone
    });
  } catch (err) {
    console.error('[weather-service] erro:', err.message);
    res.status(502).json({ error: 'servico de clima upstream indisponivel', detail: err.message });
  }
});

// Mapa de alagamento: chuva prevista para as proximas 24 h em cada celula de
// uma grade (uma unica chamada em lote ao Open-Meteo para todas as celulas).
app.get('/rain-grid', async (req, res) => {
  const g = parseGridParams(req.query);
  if (g.error) return res.status(400).json({ error: g.error });
  const centers = cellCenters(g);

  try {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${centers.map((c) => c.lat).join(',')}&longitude=${centers.map((c) => c.lon).join(',')}` +
      '&hourly=precipitation&forecast_hours=24&timezone=auto';
    const upstream = await fetchWithTimeout(url, 12000);
    if (!upstream.ok) throw new Error(`upstream respondeu ${upstream.status}`);
    const data = await upstream.json();

    const round1 = (v) => Math.round(v * 10) / 10;
    const cells = asArray(data).map((item, idx) => {
      const arr = (item.hourly?.precipitation || []).filter((v) => typeof v === 'number');
      return {
        lat: centers[idx].lat,
        lon: centers[idx].lon,
        mm24: arr.length ? round1(arr.reduce((a, b) => a + b, 0)) : null,
        maxHourly: arr.length ? round1(Math.max(...arr)) : null
      };
    });
    res.json({ cells, step: g.step, rows: g.rows, cols: g.cols });
  } catch (err) {
    console.error('[weather-service] erro na grade de chuva:', err.message);
    res.status(502).json({ error: 'servico de clima upstream indisponivel', detail: err.message });
  }
});

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

app.listen(PORT, () => console.log(`[weather-service] ouvindo na porta ${PORT}`));
