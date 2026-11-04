import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { geoRouter } from './routesGeo.js';
import { trafficRouter } from './routesTraffic.js';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS aberto de proposito: este e o unico ponto do sistema que fala
// diretamente com o navegador/app movel. Os microsservicos internos nunca sao
// expostos ao cliente.
app.use(cors());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.use('/api', router);
app.use('/api', geoRouter);
app.use('/api', trafficRouter);

app.use((err, req, res, next) => {
  console.error('[api-gateway] erro nao tratado:', err);
  res.status(500).json({ error: 'erro interno' });
});

app.listen(PORT, () => console.log(`[api-gateway] ouvindo na porta ${PORT}`));
