import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

// Health check - usado pelo docker-compose e pelo API Gateway para saber
// se este no esta de pe, sem depender de estado compartilhado com ele.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'geocoding-service' });
});

app.get('/geocode', async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'parametro "q" e obrigatorio' });
  }

  try {
    const url =
      'https://geocoding-api.open-meteo.com/v1/search' +
      `?name=${encodeURIComponent(q)}&count=5&language=pt&format=json`;
    const upstream = await fetchWithTimeout(url, 5000);
    if (!upstream.ok) throw new Error(`upstream respondeu ${upstream.status}`);
    const data = await upstream.json();
    res.json({ results: data.results || [] });
  } catch (err) {
    console.error('[geocoding-service] erro:', err.message);
    res.status(502).json({ error: 'servico de geocodificacao upstream indisponivel', detail: err.message });
  }
});

function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

app.listen(PORT, () => console.log(`[geocoding-service] ouvindo na porta ${PORT}`));
