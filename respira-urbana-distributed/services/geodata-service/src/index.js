import express from 'express';
import Redis from 'ioredis';
import { buildTransitQuery, parseTransit, buildWaterQuery, parseWater, queryOverpass } from './overpass.js';

const app = express();
const PORT = process.env.PORT || 3006;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL = Number(process.env.GEO_CACHE_TTL_SECONDS || 1800);

// Cache: o Overpass e um servico gratuito e compartilhado; repetir a mesma
// consulta so sobrecarrega os servidores. Se o Redis cair, segue sem cache.
const redis = new Redis(REDIS_URL, { retryStrategy: () => 2000, lazyConnect: true });
redis.on('error', (err) => console.error('[geodata-service] erro no redis:', err.message));
redis.connect().catch(() => {});

async function cacheGet(key) {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function cacheSet(key, value) {
  try { await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL); } catch { /* sem cache */ }
}

function parseBBox(q, maxSpan) {
  const b = { south: Number(q.south), west: Number(q.west), north: Number(q.north), east: Number(q.east) };
  if (!Object.values(b).every(Number.isFinite)) return { error: 'parametros south, west, north e east sao obrigatorios' };
  if (b.south >= b.north || b.west >= b.east) return { error: 'limites invalidos' };
  if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return { error: 'limites fora do intervalo valido' };
  if (b.north - b.south > maxSpan || b.east - b.west > maxSpan) {
    return { error: 'area muito grande: aproxime o mapa', status: 422 };
  }
  const r = (v) => Number(v.toFixed(3));
  return { bbox: { south: r(b.south), west: r(b.west), north: r(b.north), east: r(b.east) } };
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'geodata-service', redis: redis.status });
});

// Pontos e estacoes de transporte publico no retangulo informado.
// scope=stations (estacoes de metro/trem/onibus/bonde) ou all (inclui pontos de onibus).
app.get('/transit', async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'stations';
  const parsed = parseBBox(req.query, scope === 'all' ? 0.2 : 2);
  if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error });
  const { bbox } = parsed;

  const key = `geo:transit:${scope}:${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });

  try {
    const json = await queryOverpass(buildTransitQuery(bbox, scope));
    const stops = parseTransit(json);
    const payload = { scope, stops, truncated: (json.elements || []).length >= 400 };
    await cacheSet(key, payload);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] transit falhou:', err.message);
    res.status(502).json({ error: 'servico de dados geograficos indisponivel' });
  }
});

// Reservatorios/lagos e areas protegidas (referencia para areas de mananciais).
app.get('/watersheds', async (req, res) => {
  const parsed = parseBBox(req.query, 1.5);
  if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error });
  const { bbox } = parsed;

  const key = `geo:water:${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const cached = await cacheGet(key);
  if (cached) return res.json({ ...cached, source: 'cache' });

  try {
    const json = await queryOverpass(buildWaterQuery(bbox));
    const features = parseWater(json);
    const payload = { features, truncated: (json.elements || []).length >= 120 };
    await cacheSet(key, payload);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[geodata-service] watersheds falhou:', err.message);
    res.status(502).json({ error: 'servico de dados geograficos indisponivel' });
  }
});

app.listen(PORT, () => console.log(`[geodata-service] ouvindo na porta ${PORT}`));
