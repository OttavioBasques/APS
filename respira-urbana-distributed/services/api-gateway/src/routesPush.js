import { Router } from 'express';
import { forward } from './serviceClients.js';
import { PUSH_URL } from './routes.js';

export const pushRouter = Router();

// Limite simples de cadastros por IP (em memoria, por instancia do gateway): evita enchimento da
// base de dispositivos. Em producao com varias instancias, mover para o Redis.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_POSTS = Number(process.env.PUSH_RATE_LIMIT || 20);
const hits = new Map();

export function rateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'desconhecido';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_POSTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - recent[0])) / 1000);
    res.set?.('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'muitas requisicoes; tente novamente mais tarde', retryAfter });
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  next();
}

pushRouter.get('/push/status', (req, res) => forward(req, res, PUSH_URL, '/status'));
pushRouter.post('/push/register', rateLimit, (req, res) => forward(req, res, PUSH_URL, '/register'));
pushRouter.post('/push/unregister', rateLimit, (req, res) => forward(req, res, PUSH_URL, '/unregister'));
