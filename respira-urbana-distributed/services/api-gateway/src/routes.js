import { Router } from 'express';
import { callService } from './serviceClients.js';
import { envKey, getCached, setCached } from './cache.js';

const GEOCODING_URL = process.env.GEOCODING_SERVICE_URL || 'http://localhost:3001';
const WEATHER_URL = process.env.WEATHER_SERVICE_URL || 'http://localhost:3002';
const AIR_QUALITY_URL = process.env.AIR_QUALITY_SERVICE_URL || 'http://localhost:3003';

export const router = Router();

router.get('/geocode', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'parametro "q" e obrigatorio' });

  try {
    const data = await callService(GEOCODING_URL, `/geocode?q=${encodeURIComponent(q)}`);
    res.json(data);
  } catch (err) {
    console.error('[api-gateway] geocoding-service falhou:', err.message);
    res.status(502).json({ error: 'servico de geocodificacao indisponivel' });
  }
});

router.get('/environment', async (req, res) => {
  const { lat, lon, place } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'parametros "lat" e "lon" sao obrigatorios' });
  }

  const key = envKey(lat, lon);
  const cached = await getCached(key);

  // As duas chamadas saem ao mesmo tempo e sao resolvidas de forma
  // independente: uma pode falhar sem derrubar a outra (Promise.allSettled,
  // nao Promise.all). Isso e o coracao da tolerancia a falha do sistema.
  const [weatherResult, airResult] = await Promise.allSettled([
    callService(WEATHER_URL, `/weather?lat=${lat}&lon=${lon}`),
    callService(AIR_QUALITY_URL, `/air-quality?lat=${lat}&lon=${lon}&place=${encodeURIComponent(place || '')}`)
  ]);

  const status = {};
  let weather = null;
  let airQuality = null;

  if (weatherResult.status === 'fulfilled') {
    weather = weatherResult.value;
    status.weather = 'live';
  } else {
    console.error('[api-gateway] weather-service falhou:', weatherResult.reason.message);
    weather = cached?.weather || null;
    status.weather = weather ? 'cache' : 'unavailable';
  }

  if (airResult.status === 'fulfilled') {
    airQuality = airResult.value;
    status.airQuality = 'live';
  } else {
    console.error('[api-gateway] air-quality-service falhou:', airResult.reason.message);
    airQuality = cached?.airQuality || null;
    status.airQuality = airQuality ? 'cache' : 'unavailable';
  }

  if (!weather && !airQuality) {
    return res.status(502).json({
      error: 'nenhum servico respondeu e nao ha cache disponivel para este local',
      status
    });
  }

  await setCached(key, { weather, airQuality });

  res.json({
    place: place || null,
    weather,
    airQuality,
    status,
    servedAt: Date.now()
  });
});
