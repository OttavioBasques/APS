import { Router } from 'express';
import { callService, forward } from './serviceClients.js';
import { getCached, setCached } from './cache.js';
import { snapGrid } from './grid.js';
import { WEATHER_URL, AIR_QUALITY_URL, RISK_URL, GEODATA_URL } from './routes.js';
const GRID_TTL_SECONDS = Number(process.env.GRID_CACHE_TTL_SECONDS || 1800);

export const geoRouter = Router();

// Mapas de calor por area (poluicao, chuva prevista/alagamento, inversao).
// O gateway alinha o retangulo visivel a uma grade "redonda", consulta o
// servico responsavel (uma chamada em lote) e guarda o resultado no Redis.
function gridHandler(kind, baseUrl, path) {
  return async (req, res) => {
    const g = snapGrid(req.query);
    if (g.error) return res.status(400).json({ error: g.error });

    const key = `grid:${kind}:${g.south},${g.west},${g.north},${g.east},${g.step}`;
    const cached = await getCached(key);
    if (cached) return res.json({ ...cached, source: 'cache' });

    try {
      const data = await callService(
        baseUrl,
        `${path}?south=${g.south}&west=${g.west}&north=${g.north}&east=${g.east}&step=${g.step}`
      );
      await setCached(key, data, GRID_TTL_SECONDS);
      res.json({ ...data, source: 'live' });
    } catch (err) {
      console.error(`[api-gateway] grade ${kind} falhou:`, err.message);
      res.status(502).json({ error: 'servico indisponivel' });
    }
  };
}

geoRouter.get('/grid/air', gridHandler('air', AIR_QUALITY_URL, '/air-grid'));
geoRouter.get('/grid/rain', gridHandler('rain', WEATHER_URL, '/rain-grid'));
geoRouter.get('/grid/inversion', gridHandler('inversion', RISK_URL, '/inversion-grid'));

// Transporte publico e reservatorios/areas protegidas (OpenStreetMap).
geoRouter.get('/transit', (req, res) => forward(req, res, GEODATA_URL, '/transit', { timeoutMs: 40000 }));
geoRouter.get('/watersheds', (req, res) => forward(req, res, GEODATA_URL, '/watersheds', { timeoutMs: 40000 }));

// Mananciais: este ponto esta em area de manancial? E desmatamento (alertas do GFW) no mapa.
geoRouter.get('/manancial', (req, res) => forward(req, res, GEODATA_URL, '/manancial', { timeoutMs: 40000 }));
geoRouter.get('/forest/alerts', (req, res) => forward(req, res, GEODATA_URL, '/forest/alerts', { timeoutMs: 40000 }));
geoRouter.get('/manancial/watch', (req, res) => forward(req, res, GEODATA_URL, '/manancial/watch', { timeoutMs: 60000 }));
