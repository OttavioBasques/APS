const DEFAULT_TIMEOUT_MS = 5000;

function fetchWithTimeout(url, ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
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
