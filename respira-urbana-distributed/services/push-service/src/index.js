import crypto from 'node:crypto';
import express from 'express';
import Redis from 'ioredis';
import { validateRegistration, shouldReceive, buildMessage } from './targeting.js';
import { loadServiceAccount, createFcm } from './fcm.js';

const PORT = process.env.PORT || 3009;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MAX_DEVICES = Number(process.env.PUSH_MAX_DEVICES || 10000);
const STALE_MS = Number(process.env.PUSH_STALE_DAYS || 90) * 86400000;
const DEVICES_KEY = 'push:devices';

const sa = loadServiceAccount();
const fcm = sa ? createFcm(sa) : null;

// Dispositivos ficam num unico documento no Redis (token -> preferencias). Para o porte do
// projeto (uma instancia deste servico, milhares de aparelhos) basta e evita depender de
// comandos de colecao; as escritas passam por uma fila para nao se atropelarem.
const store = new Redis(REDIS_URL, { retryStrategy: () => 2000 });
const subscriber = new Redis(REDIS_URL, { retryStrategy: () => 2000 });
store.on('error', (e) => console.error('[push-service] redis (store):', e.message));
subscriber.on('error', (e) => console.error('[push-service] redis (sub):', e.message));

let queue = Promise.resolve();
const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

const id = (token) => crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);

async function loadDevices() {
  try {
    const raw = await store.get(DEVICES_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    for (const k of Object.keys(all)) if (now - (all[k].lastSeen || 0) > STALE_MS) delete all[k];
    return all;
  } catch { return {}; }
}
const saveDevices = (all) => store.set(DEVICES_KEY, JSON.stringify(all));

const app = express();
app.use(express.json({ limit: '8kb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'push-service', enabled: Boolean(fcm) }));

app.get('/status', async (req, res) => {
  const all = await loadDevices();
  res.json({ enabled: Boolean(fcm), devices: Object.keys(all).length });
});

app.post('/register', async (req, res) => {
  if (!fcm) return res.status(503).json({ error: 'notificacoes desativadas no servidor (FCM nao configurado)', enabled: false });
  const v = validateRegistration(req.body);
  if (!v.ok) return res.status(400).json({ error: v.errors.join('; ') });
  try {
    const result = await serial(async () => {
      const all = await loadDevices();
      const key = id(v.value.token);
      if (!all[key] && Object.keys(all).length >= MAX_DEVICES) return { full: true };
      all[key] = { ...v.value, createdAt: all[key]?.createdAt || Date.now(), lastSeen: Date.now() };
      await saveDevices(all);
      return { full: false };
    });
    if (result.full) return res.status(507).json({ error: 'limite de dispositivos atingido' });
    res.status(201).json({ ok: true, enabled: true });
  } catch (err) {
    console.error('[push-service] registro falhou:', err.message);
    res.status(500).json({ error: 'erro ao registrar' });
  }
});

app.post('/unregister', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (token.length < 20) return res.status(400).json({ error: 'token invalido' });
  try {
    await serial(async () => { const all = await loadDevices(); delete all[id(token)]; await saveDevices(all); });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'erro ao remover' }); }
});

// ---------- envio ----------
async function removeDead(keys) {
  if (!keys.length) return;
  await serial(async () => { const all = await loadDevices(); keys.forEach((k) => delete all[k]); await saveDevices(all); });
}

export async function dispatch(alert) {
  if (!fcm) return { sent: 0 };
  const all = await loadDevices();
  const targets = Object.entries(all).filter(([, d]) => shouldReceive(d, alert));
  const dead = []; let sent = 0;
  for (let i = 0; i < targets.length; i += 5) {          // 5 envios em paralelo
    await Promise.all(targets.slice(i, i + 5).map(async ([key, d]) => {
      const r = await fcm.send(buildMessage(d.token, alert));
      if (r.ok) sent++; else if (r.dead) dead.push(key); else console.error('[push-service] envio falhou:', r.error);
    }));
  }
  await removeDead(dead);
  if (targets.length) console.log(`[push-service] "${alert.title}": ${sent}/${targets.length} enviados, ${dead.length} removidos`);
  return { sent, removed: dead.length };
}

// O alert-service publica cada alerta novo em "alerts-new"; este servico so escuta.
subscriber.subscribe('alerts-new', (err) => {
  if (err) console.error('[push-service] falha ao assinar:', err.message);
  else console.log('[push-service] inscrito em "alerts-new"');
});
subscriber.on('message', (channel, message) => {
  if (channel !== 'alerts-new') return;
  let alert;
  try { alert = JSON.parse(message); } catch { return; }
  dispatch(alert).catch((e) => console.error('[push-service] dispatch:', e.message));
});

app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) return res.status(400).json({ error: 'JSON invalido' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'corpo muito grande' });
  res.status(500).json({ error: 'erro interno' });
});

app.listen(PORT, () => console.log(`[push-service] ouvindo na porta ${PORT}${fcm ? '' : ' (sem credenciais do FCM: push desativado)'}`));
