import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const TTL = Number(process.env.CACHE_TTL_SECONDS || 300);

// Cache compartilhado entre requisicoes e (potencialmente) entre varias
// instancias do gateway rodando atras de um load balancer - por isso
// vive no Redis, e nao em memoria do processo Node.
export const redis = new Redis(REDIS_URL, { retryStrategy: () => 2000 });

redis.on('error', (err) => console.error('[api-gateway] erro no redis:', err.message));

export function envKey(lat, lon) {
  return `env:${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

export async function getCached(key) {
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[api-gateway] falha ao ler cache:', err.message);
    return null;
  }
}

export async function setCached(key, value) {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', TTL);
  } catch (err) {
    console.error('[api-gateway] falha ao gravar cache:', err.message);
  }
}
