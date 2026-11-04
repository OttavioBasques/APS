import { Router } from 'express';
import { forward } from './serviceClients.js';
import { TRAFFIC_URL } from './routes.js';

const ALERT_URL = process.env.ALERT_SERVICE_URL || 'http://localhost:3004';

export const trafficRouter = Router();

// Transito (TomTom). A chave fica no traffic-service; o navegador so fala com o gateway.
trafficRouter.get('/traffic/status', (req, res) => forward(req, res, TRAFFIC_URL, '/status'));
trafficRouter.get('/traffic/incidents', (req, res) => forward(req, res, TRAFFIC_URL, '/incidents', { timeoutMs: 12000 }));
trafficRouter.get('/traffic/flow', (req, res) => forward(req, res, TRAFFIC_URL, '/flow'));

// Tiles PNG (binario): repassados sem reinterpretar o corpo.
trafficRouter.get('/traffic/tiles/:kind/:z/:x/:y', async (req, res) => {
  const { kind, z, x, y } = req.params;
  const path = `/tiles/${encodeURIComponent(kind)}/${encodeURIComponent(z)}/${encodeURIComponent(x)}/${encodeURIComponent(y)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const up = await fetch(`${TRAFFIC_URL}${path}`, { signal: controller.signal });
    const body = Buffer.from(await up.arrayBuffer());
    res.status(up.status);
    res.set('content-type', up.headers.get('content-type') || 'application/octet-stream');
    if (up.ok) res.set('cache-control', 'public, max-age=60');
    res.end(body);
  } catch (err) {
    console.error('[api-gateway] tile de transito falhou:', err.message);
    res.status(502).json({ error: 'servico de transito indisponivel' });
  } finally {
    clearTimeout(timer);
  }
});

// Alertas ambientais (feed) e situacao dos locais monitorados.
trafficRouter.get('/alerts', (req, res) => forward(req, res, ALERT_URL, '/alerts'));
trafficRouter.get('/monitor', (req, res) => forward(req, res, ALERT_URL, '/monitor'));
