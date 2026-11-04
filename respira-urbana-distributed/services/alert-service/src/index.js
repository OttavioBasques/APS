import express from 'express';
import Redis from 'ioredis';
import { buildAlert, buildMonitorAlerts, summarizeLocation, parseLocations } from './alerts.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PORT = process.env.PORT || 3004;
const MAX_ALERTS = 100;
const AIR_DEDUP_SECONDS = 1800;
const MONITOR_DEDUP_SECONDS = Number(process.env.MONITOR_DEDUP_SECONDS || 10800);
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_SECONDS || 900) * 1000;
const MONITOR_STARTUP_MS = Number(process.env.MONITOR_STARTUP_DELAY_MS || 5000);
const MONITOR_ENABLED = process.env.MONITOR_ENABLED !== '0';
const AQI_THRESHOLD = Number(process.env.AQI_ALERT_THRESHOLD || 80);
const LOCATIONS = parseLocations(process.env.MONITOR_LOCATIONS);

const RISK_URL = process.env.RISK_SERVICE_URL || 'http://localhost:3005';
const AIR_URL = process.env.AIR_QUALITY_SERVICE_URL || 'http://localhost:3003';
const TRAFFIC_URL = process.env.TRAFFIC_SERVICE_URL || 'http://localhost:3008';

// Duas fontes de alertas, sem acoplamento com quem produz os dados:
//  1) eventos do Redis Pub/Sub (air-quality-service publica quando um usuario consulta um local com IQA alto);
//  2) monitoramento ativo: a cada MONITOR_INTERVAL_SECONDS consulta os locais configurados
//     (risk-service, air-quality-service, traffic-service) e gera alertas por conta propria.
// O historico fica no Redis (conexao separada da de "subscribe"), entao sobrevive a reinicios.
const subscriber = new Redis(REDIS_URL, { retryStrategy: () => 2000 });
const store = new Redis(REDIS_URL, { retryStrategy: () => 2000 });
subscriber.on('error', (err) => console.error('[alert-service] erro no redis (sub):', err.message));
store.on('error', (err) => console.error('[alert-service] erro no redis (store):', err.message));

const app = express();

async function remember(alert) {
  await store.lpush('alerts:recent', JSON.stringify(alert));
  await store.ltrim('alerts:recent', 0, MAX_ALERTS - 1);
}

subscriber.subscribe('air-quality-alerts', (err) => {
  if (err) console.error('[alert-service] falha ao assinar canais:', err.message);
  else console.log('[alert-service] inscrito em "air-quality-alerts"');
});

subscriber.on('message', async (channel, message) => {
  try {
    const data = JSON.parse(message);
    if (channel === 'air-quality-alerts') {
      const key = `alerts:air:${Number(data.lat).toFixed(2)},${Number(data.lon).toFixed(2)}`;
      const first = await store.set(key, '1', 'EX', AIR_DEDUP_SECONDS, 'NX');
      if (!first) return;
    }
    const alert = buildAlert(channel, data);
    if (!alert) return;
    await remember(alert);
    console.log(`[alert-service] ${alert.kind} (${alert.level}): ${alert.title}`);
    // Em producao: push, e-mail, webhook... sem tocar nos servicos produtores.
  } catch (err) {
    console.error('[alert-service] payload invalido:', err.message);
  }
});

// ---------- monitoramento ativo ----------
async function getJson(url, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

const settled = (r) => (r.status === 'fulfilled' ? r.value : null);

export async function checkLocation(loc) {
  const d = 0.15;   // ~16 km em volta do ponto, dentro do limite de area da TomTom
  const bbox = `south=${loc.lat - d}&west=${loc.lon - d}&north=${loc.lat + d}&east=${loc.lon + d}`;
  const [air, flood, inversion, traffic] = (await Promise.allSettled([
    getJson(`${AIR_URL}/air-quality?lat=${loc.lat}&lon=${loc.lon}&quiet=1`),
    getJson(`${RISK_URL}/flood?lat=${loc.lat}&lon=${loc.lon}`),
    getJson(`${RISK_URL}/inversion?lat=${loc.lat}&lon=${loc.lon}`),
    getJson(`${TRAFFIC_URL}/incidents?${bbox}`)
  ])).map(settled);
  return { air, flood, inversion, traffic };
}

export async function runMonitor() {
  const summaries = [];
  let created = 0;
  for (const loc of LOCATIONS) {
    try {
      const readings = await checkLocation(loc);
      summaries.push(summarizeLocation(loc, readings));
      for (const alert of buildMonitorAlerts(loc, readings, AQI_THRESHOLD)) {
        // IQA ruim usa a mesma chave do caminho Pub/Sub: um alerta por local, venha de onde vier
        const isAir = alert.kind === 'air-quality';
        const key = isAir ? `alerts:air:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}` : `alerts:mon:${alert.kind}:${loc.name}:${alert.level}`;
        const first = await store.set(key, '1', 'EX', isAir ? AIR_DEDUP_SECONDS : MONITOR_DEDUP_SECONDS, 'NX');
        if (!first) continue;
        await remember(alert);
        created++;
        console.log(`[alert-service] ${alert.kind} (${alert.level}) em ${loc.name}: ${alert.title}`);
      }
    } catch (err) {
      console.error(`[alert-service] monitor de ${loc.name} falhou:`, err.message);
    }
  }
  if (summaries.length) await store.set('monitor:status', JSON.stringify({ locations: summaries, updatedAt: Date.now() }));
  return { checked: summaries.length, created };
}

if (MONITOR_ENABLED) {
  setTimeout(() => {
    runMonitor().catch((e) => console.error('[alert-service] monitor:', e.message));
    setInterval(() => runMonitor().catch((e) => console.error('[alert-service] monitor:', e.message)), MONITOR_INTERVAL_MS).unref?.();
  }, MONITOR_STARTUP_MS).unref?.();
  console.log(`[alert-service] monitorando ${LOCATIONS.length} locais a cada ${MONITOR_INTERVAL_MS / 1000}s`);
}

// ---------- API ----------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'alert-service', redis: subscriber.status, monitoring: MONITOR_ENABLED, locations: LOCATIONS.length });
});

app.get('/alerts', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 30, 1), MAX_ALERTS);
  try {
    const raw = await store.lrange('alerts:recent', 0, limit - 1);
    const alerts = raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
    res.json({ alerts });
  } catch (err) {
    console.error('[alert-service] falha ao ler alertas:', err.message);
    res.status(500).json({ error: 'erro ao consultar alertas' });
  }
});

app.get('/monitor', async (req, res) => {
  try {
    const raw = await store.get('monitor:status');
    res.json(raw ? JSON.parse(raw) : { locations: [], updatedAt: null, pending: MONITOR_ENABLED });
  } catch (err) {
    res.status(500).json({ error: 'erro ao consultar monitoramento' });
  }
});

app.listen(PORT, () => console.log(`[alert-service] ouvindo na porta ${PORT}`));
