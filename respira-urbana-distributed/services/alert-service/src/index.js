import express from 'express';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const PORT = process.env.PORT || 3004;

// Este servico nao conhece o api-gateway nem o air-quality-service:
// ele so sabe que existe um canal Redis chamado "air-quality-alerts".
// Pode cair e voltar sem que os outros servicos percebam - e o
// desacoplamento tipico de arquiteturas orientadas a eventos.
const subscriber = new Redis(REDIS_URL, { retryStrategy: () => 2000 });
const app = express();

let lastAlert = null;
let alertCount = 0;

subscriber.subscribe('air-quality-alerts', (err) => {
  if (err) console.error('[alert-service] falha ao assinar canal:', err.message);
  else console.log('[alert-service] inscrito no canal "air-quality-alerts"');
});

subscriber.on('message', (channel, message) => {
  try {
    const alert = JSON.parse(message);
    lastAlert = alert;
    alertCount += 1;
    console.log(
      `[alert-service] ALERTA DE QUALIDADE DO AR - AQI ${alert.aqi} em ` +
      `(${alert.lat}, ${alert.lon})${alert.place ? ' - ' + alert.place : ''}`
    );
    // Em producao: aqui entraria push notification, e-mail, webhook, etc.
    // A troca por um consumidor real nao exige tocar nos outros servicos.
  } catch (err) {
    console.error('[alert-service] payload invalido recebido:', err.message);
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'alert-service', redis: subscriber.status });
});

app.get('/last-alert', (req, res) => {
  res.json({ lastAlert, alertCount });
});

app.listen(PORT, () => console.log(`[alert-service] ouvindo na porta ${PORT}`));
