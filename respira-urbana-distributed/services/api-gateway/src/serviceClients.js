const DEFAULT_TIMEOUT_MS = 5000;

function fetchWithTimeout(url, init = {}, ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// Cliente HTTP fino e generico para chamar qualquer microsservico interno.
// Cada chamada e independente: timeout proprio, sem estado compartilhado,
// sem suposicao sobre a ordem em que os servicos respondem.
export async function callService(baseUrl, path) {
  const res = await fetchWithTimeout(`${baseUrl}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${baseUrl}${path} respondeu ${res.status}: ${body}`);
  }
  return res.json();
}

// Proxy: repassa a requisicao do cliente (metodo, query, corpo JSON e token de
// gestor) para um microsservico e devolve o status e o JSON que ele respondeu.
export async function forward(req, res, baseUrl, path, { timeoutMs = 8000 } = {}) {
  const qs = new URLSearchParams(req.query || {}).toString();
  const url = `${baseUrl}${path}${qs ? '?' + qs : ''}`;
  const init = { method: req.method, headers: {} };
  if (req.headers['x-admin-token']) init.headers['x-admin-token'] = req.headers['x-admin-token'];
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(req.body ?? {});
  }
  try {
    const upstream = await fetchWithTimeout(url, init, timeoutMs);
    const text = await upstream.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* resposta nao-JSON */ }
    res.status(upstream.status).json(data ?? { error: 'resposta invalida do servico' });
  } catch (err) {
    console.error(`[api-gateway] ${req.method} ${baseUrl}${path} falhou:`, err.message);
    res.status(502).json({ error: 'servico indisponivel' });
  }
}
