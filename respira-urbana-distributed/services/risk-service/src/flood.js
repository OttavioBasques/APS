// Classificacao de risco de alagamento/inundacao. Funcoes puras (sem rede),
// faceis de testar. Os limiares de chuva sao inspirados nos criterios de
// avisos de chuva intensa do INMET (valores aproximados): ate ~50 mm/dia =
// potencial, 50-100 mm/dia = perigo, acima disso = grande perigo. Servem como
// indicador de apoio e NAO substituem alertas oficiais (Defesa Civil/CEMADEN).
export const LEVELS = ['baixo', 'atencao', 'alto', 'muito_alto'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function rainLevel({ next24hMm, maxHourlyMm }) {
  const a = isNum(next24hMm) ? next24hMm : 0;
  const h = isNum(maxHourlyMm) ? maxHourlyMm : 0;
  if (a >= 100 || h >= 60) return 3;
  if (a >= 50 || h >= 30) return 2;
  if (a >= 30 || h >= 20) return 1;
  return 0;
}

// values: vazao diaria (m3/s) = [ultimos N dias..., hoje, previsao...]
export function summarizeRiver(values, pastDays = 30) {
  if (!Array.isArray(values)) return { available: false };
  const past = values.slice(0, pastDays).filter(isNum);
  const future = values.slice(pastDays).filter(isNum); // hoje + previsao
  if (past.length < 5 || future.length === 0) return { available: false };
  const sorted = [...past].sort((a, b) => a - b);
  const baseline = sorted[Math.floor(sorted.length / 2)]; // mediana dos ultimos dias
  const current = isNum(values[pastDays]) ? values[pastDays] : null;
  const forecastMax = Math.max(...future);
  return {
    available: true,
    currentM3s: current,
    baselineM3s: baseline,
    forecastMaxM3s: forecastMax,
    ratio: baseline > 0 ? Number((forecastMax / baseline).toFixed(2)) : null
  };
}

function fmt(v) {
  return Number(v).toFixed(v >= 10 ? 0 : 1).replace('.', ',');
}

export function classifyFlood({ rain, river }) {
  const reasons = [];
  const byRain = rainLevel(rain);
  let score = byRain;

  if (isNum(rain.next24hMm) && rain.next24hMm >= 30) {
    reasons.push(`Chuva prevista de ${fmt(rain.next24hMm)} mm nas próximas 24 h`);
  }
  if (isNum(rain.maxHourlyMm) && rain.maxHourlyMm >= 20) {
    reasons.push(`Intensidade máxima prevista de ${fmt(rain.maxHourlyMm)} mm/h`);
  }
  // A vazao so eleva o nivel (nao o define): sem limiares de cheia por rio,
  // comparamos a previsao com a mediana recente do proprio rio.
  if (river && river.available && isNum(river.ratio) && river.ratio >= 2) {
    reasons.push(`Vazão do rio prevista em até ${fmt(river.ratio)}× a mediana dos últimos 30 dias`);
    score = Math.max(score, 1);
    if (byRain >= 1 && river.ratio >= 3) score = Math.min(3, score + 1);
  }
  if (reasons.length === 0) reasons.push('Sem chuva intensa nem elevação relevante de vazão prevista');
  return { score, level: LEVELS[score], reasons };
}
