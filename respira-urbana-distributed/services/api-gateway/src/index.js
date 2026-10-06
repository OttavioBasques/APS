import express from 'express';
import cors from 'cors';
import { router } from './routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS aberto de proposito: este e o unico ponto do sistema que fala
// diretamente com o navegador/app movel. Os microsservicos internos
// (portas 3001-3003) nunca sao expostos ao cliente.
app.use(cors());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway' });
});

app.use('/api', router);

app.listen(PORT, () => console.log(`[api-gateway] ouvindo na porta ${PORT}`));
