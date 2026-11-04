// Estimativa de inversao termica a partir do perfil vertical de temperatura
// previsto (Open-Meteo): ha inversao quando a temperatura AUMENTA com a altura
// perto do solo (o normal e cair ~6,5 C por km). Funcoes puras, sem rede.
//
// Intensidade (C) = maior valor entre:
//  - T(180 m) - T(2 m)                      (camada de superficie)
//  - T(nivel de cima) - T(nivel de baixo)   (pares de niveis de pressao
//    consecutivos que estejam acima do solo, ate ~1,5 km)
export const PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850];
export const LEVEL_NAMES = ['nenhuma', 'fraca', 'moderada', 'forte'];
const CALM_WIND_KMH = 10;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function classifyStrength(s) {
  if (!isNum(s)) return { score: null, level: null };
  const score = s >= 3 ? 3 : s >= 1.5 ? 2 : s >= 0.5 ? 1 : 0;
  return { score, level: LEVEL_NAMES[score] };
}

export function hourStrength(h, i) {
  const t2 = h.temperature_2m?.[i];
  const t180 = h.temperature_180m?.[i];
  let best = isNum(t2) && isNum(t180) ? t180 - t2 : null;

  const sp = h.surface_pressure?.[i];
  if (isNum(sp)) {
    for (let k = 0; k < PRESSURE_LEVELS.length - 1; k++) {
      const pa = PRESSURE_LEVELS[k];
      const pb = PRESSURE_LEVELS[k + 1];
      if (pa > sp - 20) continue; // camada de baixo abaixo/na superficie (dado extrapolado)
      const ta = h[`temperature_${pa}hPa`]?.[i];
      const tb = h[`temperature_${pb}hPa`]?.[i];
      if (isNum(ta) && isNum(tb)) {
        const d = tb - ta;
        best = best == null ? d : Math.max(best, d);
      }
    }
  }
  return best == null ? null : Math.round(best * 10) / 10;
}

export function analyzeInversion(hourly) {
  const times = hourly?.time || [];
  const series = times.map((time, i) => {
    const strength = hourStrength(hourly, i);
    const { score, level } = classifyStrength(strength);
    const wind = hourly.wind_speed_10m?.[i];
    const cloud = hourly.cloud_cover?.[i];
    return {
      time,
      strength,
      score,
      level,
      windKmh: isNum(wind) ? wind : null,
      cloudCover: isNum(cloud) ? cloud : null,
      trapsPollutants: score != null && score >= 2 && isNum(wind) && wind < CALM_WIND_KMH
    };
  });

  const valid = series.filter((s) => s.strength != null);
  if (valid.length === 0) return { available: false };

  // janelas contiguas com inversao (fraca ou mais)
  const windows = [];
  let cur = null;
  for (const s of series) {
    if (s.score != null && s.score >= 1) {
      if (!cur) cur = { from: s.time, to: s.time, maxStrength: s.strength };
      else { cur.to = s.time; cur.maxStrength = Math.max(cur.maxStrength, s.strength); }
    } else if (cur) { windows.push(cur); cur = null; }
  }
  if (cur) windows.push(cur);

  const peak = valid.reduce((a, b) => (b.strength > a.strength ? b : a));
  const peakClass = classifyStrength(peak.strength);

  return {
    available: true,
    now: series[0],
    next24h: {
      maxStrength: peak.strength,
      score: peakClass.score,
      level: peakClass.level,
      peakTime: peak.time,
      windows,
      trapsPollutants: series.some((s) => s.trapsPollutants)
    },
    series: series.map((s) => ({ time: s.time, strength: s.strength, score: s.score }))
  };
}

// Versao leve para o mapa (so 2 m e 180 m): agora e maximo das proximas horas.
export function gridStrength(hourly) {
  const t2 = hourly?.temperature_2m || [];
  const t180 = hourly?.temperature_180m || [];
  const diffs = t2.map((v, i) => (isNum(v) && isNum(t180[i]) ? t180[i] - v : null)).filter(isNum);
  if (diffs.length === 0) return { now: null, max: null };
  const first = isNum(t2[0]) && isNum(t180[0]) ? t180[0] - t2[0] : null;
  const round = (x) => Math.round(x * 10) / 10;
  return { now: first == null ? null : round(first), max: round(Math.max(...diffs)) };
}
