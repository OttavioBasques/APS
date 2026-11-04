import test from 'node:test';
import assert from 'node:assert/strict';
import { rainLevel, summarizeRiver, classifyFlood } from '../services/risk-service/src/flood.js';
import { hourStrength, classifyStrength, analyzeInversion, gridStrength } from '../services/risk-service/src/inversion.js';
import { parseGridParams, cellCenters } from '../services/risk-service/src/grid.js';

test('rainLevel: limiares de chuva', () => {
  assert.equal(rainLevel({ next24hMm: 0, maxHourlyMm: 0 }), 0);
  assert.equal(rainLevel({ next24hMm: 30, maxHourlyMm: 0 }), 1);
  assert.equal(rainLevel({ next24hMm: 0, maxHourlyMm: 20 }), 1);
  assert.equal(rainLevel({ next24hMm: 50, maxHourlyMm: 0 }), 2);
  assert.equal(rainLevel({ next24hMm: 0, maxHourlyMm: 30 }), 2);
  assert.equal(rainLevel({ next24hMm: 100, maxHourlyMm: 0 }), 3);
  assert.equal(rainLevel({ next24hMm: 0, maxHourlyMm: 60 }), 3);
  assert.equal(rainLevel({ next24hMm: null, maxHourlyMm: null }), 0);
});

test('summarizeRiver: mediana recente x pico previsto', () => {
  const past = Array(30).fill(10);
  const values = [...past, 12, 20, 35, 28, 15, 12, 11]; // hoje + 6 dias
  const r = summarizeRiver(values, 30);
  assert.equal(r.available, true);
  assert.equal(r.baselineM3s, 10);
  assert.equal(r.forecastMaxM3s, 35);
  assert.equal(r.ratio, 3.5);
  assert.equal(r.currentM3s, 12);
  assert.equal(summarizeRiver([1, 2, 3], 30).available, false);
  assert.equal(summarizeRiver(null).available, false);
  assert.equal(summarizeRiver([...Array(30).fill(null), 1, 2]).available, false); // sem rio
});

test('classifyFlood: combina chuva e vazao', () => {
  const calm = classifyFlood({ rain: { next24hMm: 2, maxHourlyMm: 1 }, river: { available: false } });
  assert.equal(calm.level, 'baixo');
  assert.equal(calm.reasons.length, 1);

  const rainy = classifyFlood({ rain: { next24hMm: 60, maxHourlyMm: 12 }, river: { available: false } });
  assert.equal(rainy.level, 'alto');
  assert.match(rainy.reasons[0], /60 mm/);

  const riverOnly = classifyFlood({ rain: { next24hMm: 0, maxHourlyMm: 0 }, river: { available: true, ratio: 2.5 } });
  assert.equal(riverOnly.level, 'atencao');

  const both = classifyFlood({ rain: { next24hMm: 60, maxHourlyMm: 12 }, river: { available: true, ratio: 3.5 } });
  assert.equal(both.level, 'muito_alto');
  assert.equal(both.score, 3);
});

test('inversao: intensidade na camada de superficie e niveis de pressao', () => {
  assert.equal(hourStrength({ temperature_2m: [10], temperature_180m: [12] }, 0), 2);
  assert.equal(hourStrength({ temperature_2m: [20], temperature_180m: [18.8] }, 0), -1.2); // normal
  // superficie a 1013 hPa: o par 1000/975 e ignorado (1000 > 1013-20); 975/950 conta
  const h = { surface_pressure: [1013], temperature_975hPa: [15], temperature_950hPa: [17.5], temperature_1000hPa: [20], temperature_925hPa: [10] };
  assert.equal(hourStrength(h, 0), 2.5);
  // cidade alta (~920 hPa): so pares acima do solo valem
  const hi = { surface_pressure: [920], temperature_900hPa: [14], temperature_850hPa: [16.2], temperature_925hPa: [30], temperature_950hPa: [1] };
  assert.equal(hourStrength(hi, 0), 2.2);
  assert.equal(hourStrength({}, 0), null);
  assert.deepEqual(classifyStrength(0.4), { score: 0, level: 'nenhuma' });
  assert.deepEqual(classifyStrength(0.5), { score: 1, level: 'fraca' });
  assert.deepEqual(classifyStrength(1.5), { score: 2, level: 'moderada' });
  assert.deepEqual(classifyStrength(3), { score: 3, level: 'forte' });
  assert.deepEqual(classifyStrength(null), { score: null, level: null });
});

test('analyzeInversion: janelas, pico e retencao de poluentes', () => {
  const time = [], t2 = [], t180 = [], wind = [], cloud = [];
  for (let i = 0; i < 24; i++) {
    const hour = (20 + i) % 24; // comeca as 20h
    time.push(`2026-07-${i < 4 ? '10' : '11'}T${String(hour).padStart(2, '0')}:00`);
    const night = hour >= 22 || hour <= 7;
    t2.push(10);
    t180.push(night ? 10 + (hour === 5 ? 3.4 : 1.8) : 8.9);
    wind.push(night ? 4 : 12);
    cloud.push(10);
  }
  const r = analyzeInversion({ time, temperature_2m: t2, temperature_180m: t180, wind_speed_10m: wind, cloud_cover: cloud });
  assert.equal(r.available, true);
  assert.equal(r.series.length, 24);
  assert.equal(r.now.level, 'nenhuma');           // 20h: ainda sem inversao
  assert.equal(r.next24h.level, 'forte');
  assert.equal(r.next24h.maxStrength, 3.4);
  assert.equal(r.next24h.peakTime, '2026-07-11T05:00');
  assert.equal(r.next24h.windows.length, 1);
  assert.equal(r.next24h.windows[0].from, '2026-07-10T22:00');
  assert.equal(r.next24h.windows[0].to, '2026-07-11T07:00');
  assert.equal(r.next24h.trapsPollutants, true);  // moderada/forte com vento fraco
  assert.equal(analyzeInversion({ time: ['2026-07-10T00:00'], temperature_2m: [null] }).available, false);
  assert.equal(analyzeInversion(undefined).available, false);
});

test('gridStrength e grade', () => {
  assert.deepEqual(gridStrength({ temperature_2m: [10, 10, 10], temperature_180m: [10.4, 12.3, 9] }), { now: 0.4, max: 2.3 });
  assert.deepEqual(gridStrength({}), { now: null, max: null });
  const g = parseGridParams({ south: '-23', west: '-49', north: '-22', east: '-48', step: '0.5' });
  assert.equal(g.rows, 2); assert.equal(g.cols, 2);
  const c = cellCenters(g);
  assert.equal(c.length, 4);
  assert.deepEqual(c[0], { lat: -22.75, lon: -48.75 });
  assert.ok(parseGridParams({ south: '-23', west: '-49', north: '-22', east: '-48' }).error);
  assert.ok(parseGridParams({ south: '-23', west: '-49', north: '-22', east: '-48', step: '0.01' }).error); // 100x100 celulas
  assert.ok(parseGridParams({ south: '5', west: '-49', north: '-22', east: '-48', step: '1' }).error);
});
