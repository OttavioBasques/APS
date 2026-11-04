import express from 'express';
import Redis from 'ioredis';
import {
  FLOW_STYLES, INCIDENT_STYLES, isTileCoord, tileUrl, flowUrl, incidentsUrl, parseIncidents, parseFlow
} from './tomtom.js';

const app = express();
const PORT = process.env.PORT || 3008;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const KEY = process.env.TOMTOM_API_KEY || '';
const TILE_TTL = Number(process.env.TRAFFIC_TILE_TTL_SECONDS || 120);
const DATA_TTL = Number(process.env.TRAFFIC_DATA_TTL_SECONDS || 120);
const flowStyle = FLOW_STYLES.includes(process.env.TOMTOM_FLOW_STYLE) ? process.env.TOMTOM_FLOW_STYLE : 'relative';
const incidentStyle = INCIDENT_STYLES.includes(process.env.TOMTOM_INCIDENT_STYLE) ? process.env.TOMTOM_INCIDENT_STYLE : 's1';

// A chave da TomTom fica SOMENTE aqui: o navegador pede os tiles ao gateway,
// que os pede a este servico. O cache no Redis reduz o consumo da cota gratuita
// (varios usuarios olhando a mesma regiao geram uma unica chamada por tile).
const redis = new Redis(REDIS_URL, { retryStrategy: () => 2000, lazyConnect: true });
redis.on('error', (err) => console.error('[traffic-service] erro no redis:', err.message));
redis.connect().catch(() => {});

async function cacheGet(key) { try { return await redis.get(key); } catch { return null; } }
async function cacheSet(key, value, ttl) { try { await redis.set(key, value, 'EX', ttl); } catch { /* sem cache */ } }

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Mensagem de erro sem a chave (a URL contem "key=...").
const safe = (msg) => String(msg).replace(/key=[^&\s]+/g, 'key=***');

// Erro com o motivo que a TomTom devolveu (ex.: "Unsupported language parameter"), para o log dizer o que ajustar.
async function tomtomError(up) {
  let detail = '';
  try { detail = (await up.text()).replace(/\s+/g, ' ').slice(0, 300); } catch { /* sem corpo */ }
  return new Error(`tomtom respondeu ${up.status}${detail ? ': ' + detail : ''}`);
}

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'traffic-service', enabled: Boolean(KEY) }));

app.get('/status', (req, res) => res.json({ enabled: Boolean(KEY), flowStyle, incidentStyle }));

app.get('/tiles/:kind/:z/:x/:y', async (req, res) => {
  if (!KEY) return res.status(503).json({ error: 'transito desabilitado (TOMTOM_API_KEY ausente)' });
  const { kind } = req.params;
  const z = Number(req.params.z); const x = Number(req.params.x);
  const y = Number(String(req.params.y).replace(/\.png$/, ''));
  if (!['flow', 'incidents'].includes(kind) || !isTileCoord(z, x, y)) return res.status(400).json({ error: 'tile invalido' });

  const style = kind === 'flow' ? flowStyle : incidentStyle;
  const ck = `traffic:tile:${kind}:${style}:${z}/${x}/${y}`;
  const hit = await cacheGet(ck);
  res.set('cache-control', 'public, max-age=60');
  res.set('content-type', 'image/png');
  if (hit) { res.set('x-cache', 'HIT'); return res.status(200).end(Buffer.from(hit, 'base64')); }
  try {
    const up = await fetchWithTimeout(tileUrl(kind, style, z, x, y, KEY), 8000);
    if (!up.ok) throw await tomtomError(up);
    const buf = Buffer.from(await up.arrayBuffer());
    await cacheSet(ck, buf.toString('base64'), TILE_TTL);
    res.set('x-cache', 'MISS');
    res.status(200).end(buf);
  } catch (err) {
    console.error('[traffic-service] tile falhou:', safe(err.message));
    res.set('content-type', 'application/json');
    res.status(502).end(JSON.stringify({ error: 'tile de transito indisponivel' }));
  }
});

function parseBBox(q, maxSpan) {
  const b = { south: Number(q.south), west: Number(q.west), north: Number(q.north), east: Number(q.east) };
  if (!Object.values(b).every(Number.isFinite)) return { error: 'parametros south, west, north e east sao obrigatorios' };
  if (b.south >= b.north || b.west >= b.east) return { error: 'limites invalidos' };
  if (b.south < -90 || b.north > 90 || b.west < -180 || b.east > 180) return { error: 'limites fora do intervalo valido' };
  if (b.north - b.south > maxSpan || b.east - b.west > maxSpan) return { error: 'area muito grande: aproxime o mapa', status: 422 };
  const r = (v) => Number(v.toFixed(2));
  return { bbox: { south: r(b.south), west: r(b.west), north: r(b.north), east: r(b.east) } };
}

// Incidentes de transito (acidentes, obras, vias interditadas...) na area visivel.
app.get('/incidents', async (req, res) => {
  if (!KEY) return res.json({ enabled: false });
  const parsed = parseBBox(req.query, 0.8);   // a TomTom limita a area da consulta
  if (parsed.error) return res.status(parsed.status || 400).json({ error: parsed.error });
  const { bbox } = parsed;
  const max = Math.min(300, Math.max(10, Math.round(Number(req.query.max)) || 40));   // o alert-service pede mais, para nao perder interdicoes
  const ck = `traffic:inc:${bbox.south},${bbox.west},${bbox.north},${bbox.east}:${max}`;
  const hit = await cacheGet(ck);
  if (hit) return res.json({ ...JSON.parse(hit), source: 'cache' });
  try {
    const up = await fetchWithTimeout(incidentsUrl(bbox, KEY), 10000);
    if (!up.ok) throw await tomtomError(up);
    const payload = { enabled: true, ...parseIncidents(await up.json(), max) };
    await cacheSet(ck, JSON.stringify(payload), DATA_TTL);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[traffic-service] incidentes falhou:', safe(err.message));
    res.status(502).json({ error: 'servico de transito indisponivel' });
  }
});

// Fluxo na via mais proxima de um ponto: velocidade atual x velocidade livre.
app.get('/flow', async (req, res) => {
  if (!KEY) return res.json({ enabled: false });
  const lat = Number(req.query.lat); const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'parametros "lat" e "lon" invalidos ou ausentes' });
  }
  const ck = `traffic:flow:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = await cacheGet(ck);
  if (hit) return res.json({ ...JSON.parse(hit), source: 'cache' });
  try {
    const up = await fetchWithTimeout(flowUrl(lat.toFixed(5), lon.toFixed(5), KEY), 8000);
    // 400 = sem via mapeada perto do ponto (comum fora de cidades): nao e falha
    if (up.status === 400 || up.status === 404) return res.json({ enabled: true, available: false });
    if (!up.ok) throw await tomtomError(up);
    const payload = { enabled: true, ...parseFlow(await up.json()) };
    await cacheSet(ck, JSON.stringify(payload), DATA_TTL);
    res.json({ ...payload, source: 'live' });
  } catch (err) {
    console.error('[traffic-service] fluxo falhou:', safe(err.message));
    res.status(502).json({ error: 'servico de transito indisponivel' });
  }
});

app.listen(PORT, () => console.log(`[traffic-service] ouvindo na porta ${PORT}${KEY ? '' : ' (sem TOMTOM_API_KEY: transito desabilitado)'}`));
