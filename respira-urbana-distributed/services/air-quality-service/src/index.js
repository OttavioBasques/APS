import express from 'express';
import Redis from 'ioredis';

const app = express();
const PORT = process.env.PORT || 3003;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ALERT_THRESHOLD = Number(process.env.AQI_ALERT_THRESHOLD || 80);

// Este servico e "produtor" de eventos: quando encontra um AQI ruim,
// publica no canal "air-quality-alerts" e segue seu fluxo normal,
// sem esperar (nem saber) quem vai consumir o evento. E comunicacao
// assincrona, o segundo estilo (alem do REST sincrono) usado neste sistema.
const publisher = new Redis(REDIS_URL, { retryStrategy: () => 2000, lazyConnect: true });
publisher.connect().catch((err) => {
  console.error('[air-quality-service] falha ao conectar no Redis:', err.message);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'air-quality-service', redis: publisher.status });
});

app.get('/air-quality', async (req, res) => {
  const { lat, lon, place } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'parametros "lat" e "lon" sao obrigatorios' });
  }

  try {
    const url =
      'https://air-quality-api.open-meteo.com/v1/air-quality' +
      `?latitude=${lat}&longitude=${lon}` +
      '&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,uv_index,european_aqi' +
      '&timezone=auto';
    const upstream = await fetchWithTimeout(url, 5000);
    if (!upstream.ok) throw new Error(`upstream respondeu ${upstream.status}`);
    const data = await upstream.json();

    const aqi = data.current?.european_aqi;
    if (typeof aqi === 'number' && aqi >= ALERT_THRESHOLD) {
      publishAlert({ lat, lon, place: place || null, aqi }).catch((err) => {
        console.error('[air-quality-service] falha ao publicar alerta:', err.message);
      });
    }

    res.json({ current: data.current });
  } catch (err) {
    console.error('[air-quality-service] erro:', err.message);
    res.status(502).json({ error: 'servico de qualidade do ar upstream indisponivel', detail: err.message });
  }
});

async function publishAlert(payload) {
  if (publisher.status !== 'ready') return;
  await publisher.publish('air-quality-alerts', JSON.stringify({ ...payload, ts: Date.now() }));
}

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

app.listen(PORT, () => console.log(`[air-quality-service] ouvindo na porta ${PORT}`));
