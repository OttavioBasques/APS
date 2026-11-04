import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherAlerts, transitImpacts, buildMonitorAlerts, WEATHER_LIMITS } from '../services/alert-service/src/alerts.js';
import { shouldReceive, validateRegistration } from '../services/push-service/src/targeting.js';

const w = (c) => ({ current: c });

test('clima: limites de calor, frio, vento e tempestade (nos limites e fora deles)', () => {
  assert.deepEqual(weatherAlerts(w({ apparent_temperature: 37.9, temperature_2m: 30, wind_gusts_10m: 59, weather_code: 63 })), []);
  const heat = weatherAlerts(w({ apparent_temperature: 38 }));
  assert.deepEqual(heat.map((a) => [a.kind, a.level]), [['heat', 'media']]);
  assert.match(heat[0].title, /Calor extremo: sensação de 38 °C/);
  assert.equal(weatherAlerts(w({ apparent_temperature: 42 }))[0].level, 'alta');

  assert.deepEqual(weatherAlerts(w({ temperature_2m: 3 })).map((a) => [a.kind, a.level]), [['cold', 'media']]);
  assert.equal(weatherAlerts(w({ temperature_2m: 3.1 })).length, 0);
  assert.equal(weatherAlerts(w({ temperature_2m: 0 }))[0].level, 'alta');
  assert.equal(weatherAlerts(w({ temperature_2m: -2 }))[0].title, 'Frio intenso: -2 °C');

  assert.deepEqual(weatherAlerts(w({ wind_gusts_10m: 60 })).map((a) => [a.kind, a.level]), [['wind', 'media']]);
  assert.equal(weatherAlerts(w({ wind_gusts_10m: 90 }))[0].level, 'alta');
  assert.match(weatherAlerts(w({ wind_gusts_10m: 72.4 }))[0].title, /rajadas de 72 km\/h/);

  assert.deepEqual(weatherAlerts(w({ weather_code: 95 })).map((a) => [a.kind, a.level, a.title]), [['storm', 'media', 'Tempestade com raios']]);
  assert.deepEqual(weatherAlerts(w({ weather_code: 96 })).map((a) => [a.level, a.title]), [['alta', 'Tempestade com granizo']]);
  assert.equal(weatherAlerts(w({ weather_code: 82 })).length, 0);                 // pancada de chuva forte nao e tempestade

  // varias condicoes ao mesmo tempo viram varios alertas
  assert.deepEqual(weatherAlerts(w({ apparent_temperature: 40, wind_gusts_10m: 70, weather_code: 95 })).map((a) => a.kind), ['heat', 'wind', 'storm']);
  // limites ajustaveis; dados ausentes ou invalidos nao quebram
  assert.equal(weatherAlerts(w({ apparent_temperature: 33 }), { heatApparent: 32 }).length, 1);
  assert.deepEqual(weatherAlerts(null), []);
  assert.deepEqual(weatherAlerts({}), []);
  assert.deepEqual(weatherAlerts(w({ apparent_temperature: null, wind_gusts_10m: 'x' })), []);
  assert.equal(WEATHER_LIMITS.gust, 60);
});

const se = { name: 'Estação Sé', kind: 'metro', lat: -23.5503, lon: -46.6333 };
const term = { name: 'Terminal Bandeira', kind: 'bus_station', lat: -23.5600, lon: -46.6400 };
const ponto = { name: 'Ponto', kind: 'bus', lat: -23.5503, lon: -46.6334 };
const inc = (o) => ({ category: 1, severity: 1, categoryLabel: 'Acidente', lat: -23.5503, lon: -46.6350, from: 'Av. A', to: 'Av. B', ...o });

test('transporte publico: so estacoes/terminais perto de interdicao, alagamento ou incidente grave', () => {
  // ~180 m a leste da Se
  const closure = inc({ category: 8, categoryLabel: 'Via interditada' });
  const r = transitImpacts([se, term, ponto], [closure, inc({ severity: 1 })]);
  assert.equal(r.length, 1);                                         // terminal longe; ponto de onibus ignorado; acidente leve ignorado
  assert.equal(r[0].stop.name, 'Estação Sé');
  assert.ok(r[0].distanceKm > 0.1 && r[0].distanceKm < 0.25);

  assert.equal(transitImpacts([se], [inc({ severity: 3 })]).length, 1);             // incidente grave conta
  assert.equal(transitImpacts([se], [inc({ category: 11, categoryLabel: 'Alagamento' })]).length, 1);
  assert.equal(transitImpacts([se], [inc({ severity: 2 })]).length, 0);
  assert.equal(transitImpacts([se], [inc({ category: 8, lat: -23.56, lon: -46.64 })]).length, 0);     // ~1,3 km: fora do raio
  assert.equal(transitImpacts([se], [inc({ category: 8, lat: -23.5503, lon: -46.6360 })], 0.5).length, 1);   // raio ajustavel
  assert.equal(transitImpacts([se], [inc({ category: 8, lat: null, lon: null })]).length, 0);
  assert.deepEqual(transitImpacts(undefined, undefined), []);

  // interdicao vem antes de incidente grave
  const both = transitImpacts([se, term], [inc({ severity: 3 }), inc({ category: 8, categoryLabel: 'Via interditada', lat: -23.5601, lon: -46.6401 })]);
  assert.equal(both[0].stop.name, 'Terminal Bandeira');
});

test('monitor: alertas de clima e de transporte publico', () => {
  const loc = { name: 'São Paulo', lat: -23.55, lon: -46.63 };
  const traffic = { enabled: true, items: [inc({ category: 8, categoryLabel: 'Via interditada' })] };
  const transit = { stops: [se, term] };
  const alerts = buildMonitorAlerts(loc, { weather: w({ wind_gusts_10m: 95, weather_code: 63 }), traffic, transit });
  const kinds = alerts.map((a) => a.kind).sort();
  assert.ok(kinds.includes('wind') && kinds.includes('transit'));
  assert.equal(alerts.find((a) => a.kind === 'wind').level, 'alta');
  const t = alerts.find((a) => a.kind === 'transit');
  assert.equal(t.level, 'alta');                                     // interdicao
  assert.match(t.title, /Estação de metrô Estação Sé com via interditada por perto/);
  assert.equal(t.lat, se.lat);                                       // o pino fica na estacao, nao no centro da cidade
  assert.equal(t.detail, 'São Paulo');
  assert.match(t.reasons[0], /Av\. A → Av\. B\), a \d+ m/);

  // varias estacoes viram um unico alerta resumido
  const many = buildMonitorAlerts(loc, { traffic: { enabled: true, items: [inc({ category: 8, categoryLabel: 'Via interditada' }), inc({ category: 8, categoryLabel: 'Via interditada', lat: -23.5601, lon: -46.6401 })] }, transit });
  const m = many.filter((a) => a.kind === 'transit');
  assert.equal(m.length, 1);
  assert.match(m[0].title, /2 estações\/terminais/);

  // sem trafego (chave TomTom ausente), sem estacoes ou sem clima: nada, e sem erro
  assert.deepEqual(buildMonitorAlerts(loc, { traffic: { enabled: false }, transit }), []);
  assert.deepEqual(buildMonitorAlerts(loc, { traffic, transit: { stops: [] } }), []);
  assert.deepEqual(buildMonitorAlerts(loc, { traffic, transit: null, weather: null }), []);
});

test('push: os novos tipos de alerta de clima e transporte', () => {
  for (const kind of ['heat', 'cold', 'wind', 'storm', 'transit']) {
    assert.equal(validateRegistration({ token: 'x'.repeat(30), kinds: [kind] }).ok, true, kind);
  }
  const dev = { minLevel: 'alta', kinds: ['storm', 'transit'] };
  assert.equal(shouldReceive(dev, { kind: 'storm', level: 'alta' }), true);
  assert.equal(shouldReceive(dev, { kind: 'storm', level: 'media' }), false);
  assert.equal(shouldReceive(dev, { kind: 'wind', level: 'alta' }), false);
});
