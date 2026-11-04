import { Router } from 'express';
import { callService } from './serviceClients.js';
import { envKey, getCached, setCached } from './cache.js';

export const GEOCODING_URL = process.env.GEOCODING_SERVICE_URL || 'http://localhost:3001';
export const WEATHER_URL = process.env.WEATHER_SERVICE_URL || 'http://localhost:3002';
export const AIR_QUALITY_URL = process.env.AIR_QUALITY_SERVICE_URL || 'http://localhost:3003';
export const RISK_URL = process.env.RISK_SERVICE_URL || 'http://localhost:3005';
export const TRAFFIC_URL = process.env.TRAFFIC_SERVICE_URL || 'http://localhost:3008';

const DEFAULT_DEFORESTATION_TILES =
  'https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.8/tcd_30/{z}/{x}/{y}.png';

export const router = Router();

// As chaves ficam so no .env do servidor (nunca commitadas). A chave da
// OpenWeatherMap vai ao navegador porque os tiles sao carregados direto de la
// (e assim que o plano gratuito funciona no front-end). A da TomTom NAO sai do
// servidor: os tiles de transito passam pelo gateway/traffic-service.
router.get('/config', (req, res) => {
  res.json({
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY || null,
    trafficEnabled: Boolean(process.env.TOMTOM_API_KEY),
    deforestationTilesUrl: process.env.DEFORESTATION_TILES_URL || DEFAULT_DEFORESTATION_TILES
  });
});

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

export function parseLatLon(query) {
  const lat = Number(query.lat);
  const lon = Number(query.lon);
  const valid = query.lat !== undefined && query.lon !== undefined && query.lat !== '' && query.lon !== '' &&
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return valid ? { lat, lon } : null;
}

// Clique no mapa: dados de um ponto qualquer, so das partes pedidas em
// "include" (weather, air, flood, inversion, traffic). Cada parte e uma chamada
// independente a um microsservico; o resultado fica no cache do Redis por
// alguns minutos. A chave arredonda para 0,1 grau (~11 km), mais ou menos a
// resolucao dos modelos, entao cliques vizinhos reaproveitam a resposta.
const POINT_PARTS = {
  weather: (p) => callService(WEATHER_URL, `/weather?lat=${p.lat}&lon=${p.lon}`),
  air: (p) => callService(AIR_QUALITY_URL, `/air-quality?lat=${p.lat}&lon=${p.lon}&quiet=1`),
  flood: (p) => callService(RISK_URL, `/flood?lat=${p.lat}&lon=${p.lon}`),
  inversion: (p) => callService(RISK_URL, `/inversion?lat=${p.lat}&lon=${p.lon}`),
  traffic: (p) => callService(TRAFFIC_URL, `/flow?lat=${p.lat}&lon=${p.lon}`)
};

router.get('/point', async (req, res) => {
  const p = parseLatLon(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos' });

  const wanted = String(req.query.include || 'weather').split(',').map((s) => s.trim())
    .filter((s) => POINT_PARTS[s]);
  const include = [...new Set(wanted.length ? wanted : ['weather'])].sort();

  const key = `point:${p.lat.toFixed(1)},${p.lon.toFixed(1)}:${include.join('+')}`;
  const cached = await getCached(key);
  if (cached) return res.json({ ...cached, source: 'cache' });

  const results = await Promise.allSettled(include.map((name) => POINT_PARTS[name](p)));
  const out = { weather: null, air: null, flood: null, inversion: null, traffic: null, status: {} };
  include.forEach((name, i) => {
    if (results[i].status === 'fulfilled') { out[name] = results[i].value; out.status[name] = 'live'; }
    else {
      console.error(`[api-gateway] ${name} do ponto falhou:`, results[i].reason.message);
      out.status[name] = 'unavailable';
    }
  });

  if (include.every((name) => out[name] === null)) {
    return res.status(502).json({ error: 'servicos indisponiveis', status: out.status });
  }
  // so guarda no cache respostas completas
  if (include.every((name) => out[name] !== null)) await setCached(key, out);
  res.json({ ...out, source: 'live' });
});

// Resumo de um local: clima, qualidade do ar e riscos (alagamento, inversao
// termica). As chamadas saem ao mesmo tempo e sao resolvidas de forma
// independente: uma pode falhar sem derrubar as outras (Promise.allSettled,
// nao Promise.all). Isso e o coracao da tolerancia a falha do sistema.
router.get('/environment', async (req, res) => {
  const p = parseLatLon(req.query);
  if (!p) return res.status(400).json({ error: 'parametros "lat" e "lon" sao obrigatorios e devem ser validos' });
  const place = req.query.place || '';

  const key = envKey(p.lat, p.lon);
  const cached = await getCached(key);

  const [weatherResult, airResult, floodResult, inversionResult, trafficResult] = await Promise.allSettled([
    POINT_PARTS.weather(p),
    callService(AIR_QUALITY_URL, `/air-quality?lat=${p.lat}&lon=${p.lon}&place=${encodeURIComponent(place)}`),
    POINT_PARTS.flood(p),
    POINT_PARTS.inversion(p),
    POINT_PARTS.traffic(p)
  ]);

  const pick = (result, fallback, name) => {
    if (result.status === 'fulfilled') return { value: result.value, state: 'live' };
    console.error(`[api-gateway] ${name} falhou:`, result.reason.message);
    return { value: fallback ?? null, state: fallback ? 'cache' : 'unavailable' };
  };

  const weather = pick(weatherResult, cached?.weather, 'weather-service');
  const air = pick(airResult, cached?.airQuality, 'air-quality-service');
  const flood = pick(floodResult, cached?.risks?.flood, 'risk-service (alagamento)');
  const inversion = pick(inversionResult, cached?.risks?.inversion, 'risk-service (inversao)');
  const traffic = pick(trafficResult, cached?.traffic, 'traffic-service');

  const status = {
    weather: weather.state,
    airQuality: air.state,
    flood: flood.state,
    inversion: inversion.state,
    traffic: traffic.value && traffic.value.enabled === false ? 'disabled' : traffic.state,
    risks: flood.state === 'live' || inversion.state === 'live' ? 'live'
      : flood.state === 'cache' || inversion.state === 'cache' ? 'cache' : 'unavailable'
  };

  if (!weather.value && !air.value) {
    return res.status(502).json({
      error: 'nenhum servico respondeu e nao ha cache disponivel para este local',
      status
    });
  }

  const risks = { flood: flood.value, inversion: inversion.value };
  await setCached(key, { weather: weather.value, airQuality: air.value, risks, traffic: traffic.value });

  res.json({
    place: place || null,
    weather: weather.value,
    airQuality: air.value,
    risks,
    traffic: traffic.value,
    status,
    servedAt: Date.now()
  });
});
