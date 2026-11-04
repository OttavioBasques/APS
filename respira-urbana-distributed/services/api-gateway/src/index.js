import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { geoRouter } from './routesGeo.js';
import { trafficRouter } from './routesTraffic.js';
import { pushRouter } from './routesPush.js';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS aberto de proposito: este e o unico ponto do sistema que fala
// diretamente com o navegador/app movel. Os microsservicos internos nunca sao
// expostos ao cliente.
app.use(cors());
app.use(express.json({ limit: '8kb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.use('/api', router);
app.use('/api', geoRouter);
app.use('/api', trafficRouter);
app.use('/api', pushRouter);

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ error: 'JSON invalido' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'corpo da requisicao muito grande' });
  console.error('[api-gateway] erro nao tratado:', err);
  res.status(500).json({ error: 'erro interno' });
});

app.listen(PORT, () => console.log(`[api-gateway] ouvindo na porta ${PORT}`));
