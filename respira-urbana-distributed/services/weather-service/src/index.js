import express from 'express';

const app = express();
const PORT = process.env.PORT || 3002;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'weather-service' });
});

app.get('/weather', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'parametros "lat" e "lon" sao obrigatorios' });
  }

  try {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m' +
      '&timezone=auto';
    const upstream = await fetchWithTimeout(url, 5000);
    if (!upstream.ok) throw new Error(`upstream respondeu ${upstream.status}`);
    const data = await upstream.json();
    res.json({ current: data.current, timezone: data.timezone });
  } catch (err) {
    console.error('[weather-service] erro:', err.message);
    res.status(502).json({ error: 'servico de clima upstream indisponivel', detail: err.message });
  }
});

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

app.listen(PORT, () => console.log(`[weather-service] ouvindo na porta ${PORT}`));
