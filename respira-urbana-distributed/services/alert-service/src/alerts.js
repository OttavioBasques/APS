import crypto from 'node:crypto';

// Funcoes puras: transformam eventos e leituras em alertas para o feed do app.

export const DEFAULT_LOCATIONS = [
  { name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { name: 'Rio de Janeiro', lat: -22.91, lon: -43.17 },
  { name: 'Belo Horizonte', lat: -19.92, lon: -43.94 },
  { name: 'Porto Alegre', lat: -30.03, lon: -51.23 },
  { name: 'Recife', lat: -8.05, lon: -34.88 },
  { name: 'Manaus', lat: -3.12, lon: -60.02 }
];

// "Nome:lat:lon;Nome:lat:lon" (variavel MONITOR_LOCATIONS). Entradas invalidas sao ignoradas.
export function parseLocations(text) {
  if (!text || !String(text).trim()) return DEFAULT_LOCATIONS;
  const out = [];
  for (const part of String(text).split(';')) {
    const [name, lat, lon] = part.split(':').map((s) => s.trim());
    const la = Number(lat); const lo = Number(lon);
    if (name && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
      out.push({ name, lat: la, lon: lo });
    }
  }
  return out;
}

const mk = (base, extra) => ({ id: crypto.randomUUID(), ts: Date.now(), ...base, ...extra });

// Evento publicado no Redis pelo air-quality-service (consulta com IQA alto).
export function buildAlert(channel, data) {
  const base = { ts: data.ts || Date.now(), lat: Number(data.lat), lon: Number(data.lon) };
  if (channel === 'air-quality-alerts') {
    return mk(base, {
      kind: 'air-quality', level: data.aqi >= 100 ? 'alta' : 'media',
      title: `Qualidade do ar ruim (IQA ${Math.round(data.aqi)})`,
      detail: data.place || `${base.lat.toFixed?.(2)}, ${base.lon.toFixed?.(2)}`
    });
  }
  return null;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Leituras de um local monitorado -> alertas. So gera alerta para situacoes
// relevantes (nao para "atencao"/"fraca"), para o feed nao virar ruido.
export function buildMonitorAlerts(loc, { air, flood, inversion, traffic }, aqiThreshold = 80) {
  const where = { lat: loc.lat, lon: loc.lon, detail: loc.name, place: loc.name };
  const alerts = [];

  const aqi = air?.current?.european_aqi;
  if (isNum(aqi) && aqi >= aqiThreshold) {
    alerts.push(mk(where, { kind: 'air-quality', level: aqi >= 100 ? 'alta' : 'media',
      title: `Qualidade do ar ruim (IQA ${Math.round(aqi)})` }));
  }
  if (flood && (flood.level === 'alto' || flood.level === 'muito_alto')) {
    alerts.push(mk(where, { kind: 'flood', level: flood.level === 'muito_alto' ? 'alta' : 'media',
      title: flood.level === 'muito_alto' ? 'Risco muito alto de alagamento' : 'Risco alto de alagamento',
      reasons: flood.reasons || [] }));
  }
  const inv = inversion?.available ? inversion.next24h : null;
  if (inv && (inv.level === 'forte' || (inv.level === 'moderada' && inv.trapsPollutants))) {
    alerts.push(mk(where, { kind: 'thermal-inversion', level: inv.level === 'forte' ? 'alta' : 'media',
      title: `Inversão térmica ${inv.level} prevista${inv.trapsPollutants ? ' (vento fraco: poluentes retidos)' : ''}`,
      reasons: [`Intensidade máxima ${inv.maxStrength} °C nas próximas 24 h`] }));
  }
  if (traffic && traffic.enabled && (traffic.major >= 3 || traffic.roadClosures >= 2)) {
    alerts.push(mk(where, { kind: 'traffic', level: 'media',
      title: `Trânsito: ${traffic.major} incidentes graves, ${traffic.roadClosures} vias interditadas`,
      reasons: [] }));
  }
  return alerts;
}

// Resumo de um local para o painel (/monitor).
export function summarizeLocation(loc, { air, flood, inversion, traffic }) {
  const inv = inversion?.available ? inversion.next24h : null;
  return {
    name: loc.name, lat: loc.lat, lon: loc.lon,
    aqi: isNum(air?.current?.european_aqi) ? Math.round(air.current.european_aqi) : null,
    flood: flood ? { level: flood.level, next24hMm: flood.rain?.next24hMm ?? null } : null,
    inversion: inv ? { level: inv.level, maxStrength: inv.maxStrength, trapsPollutants: inv.trapsPollutants } : null,
    traffic: traffic && traffic.enabled ? { incidents: traffic.total, major: traffic.major, roadClosures: traffic.roadClosures } : null,
    checkedAt: Date.now()
  };
}
