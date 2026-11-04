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

// Limites dos alertas (ajustaveis por "limits"). Valores inspirados nas faixas de aviso do INMET;
// sao avisos de apoio, nao substituem os alertas oficiais.
export const WEATHER_LIMITS = {
  heatApparent: 38, heatHigh: 42,     // sensacao termica (°C)
  coldMax: 3, coldHigh: 0,            // temperatura (°C)
  gust: 60, gustHigh: 90              // rajadas (km/h)
};
export const TRANSIT_RADIUS_KM = 0.4;

// Condicao atual de um local -> alertas de calor, frio, vento e tempestade.
export function weatherAlerts(weather, limits = {}) {
  const L = { ...WEATHER_LIMITS, ...limits };
  const c = weather?.current;
  if (!c) return [];
  const out = [];
  if (isNum(c.apparent_temperature) && c.apparent_temperature >= L.heatApparent) {
    out.push({ kind: 'heat', level: c.apparent_temperature >= L.heatHigh ? 'alta' : 'media',
      title: `Calor extremo: sensação de ${Math.round(c.apparent_temperature)} °C`,
      reasons: ['Hidrate-se e evite o sol entre 10 h e 16 h'] });
  }
  if (isNum(c.temperature_2m) && c.temperature_2m <= L.coldMax) {
    out.push({ kind: 'cold', level: c.temperature_2m <= L.coldHigh ? 'alta' : 'media',
      title: `Frio intenso: ${Math.round(c.temperature_2m)} °C`, reasons: ['Atenção a crianças, idosos e pessoas em situação de rua'] });
  }
  if (isNum(c.wind_gusts_10m) && c.wind_gusts_10m >= L.gust) {
    out.push({ kind: 'wind', level: c.wind_gusts_10m >= L.gustHigh ? 'alta' : 'media',
      title: `Ventos fortes: rajadas de ${Math.round(c.wind_gusts_10m)} km/h`, reasons: ['Risco de queda de árvores e galhos'] });
  }
  if (isNum(c.weather_code) && c.weather_code >= 95) {
    const hail = c.weather_code >= 96;
    out.push({ kind: 'storm', level: hail ? 'alta' : 'media',
      title: hail ? 'Tempestade com granizo' : 'Tempestade com raios', reasons: ['Evite áreas abertas e árvores isoladas'] });
  }
  return out;
}

const distKm = (la1, lo1, la2, lo2) => {
  const rad = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
};

// Estacoes e terminais com via interditada, alagamento ou incidente grave por perto
// (TomTom x OpenStreetMap). Nao e dado de operacao das linhas: e um indicio de impacto.
export function transitImpacts(stops, incidents, radiusKm = TRANSIT_RADIUS_KM) {
  const hot = (incidents || []).filter((i) => isNum(i.lat) && isNum(i.lon) && (i.category === 8 || i.category === 11 || i.severity === 3));
  const out = [];
  for (const s of (stops || [])) {
    if (!isNum(s.lat) || !isNum(s.lon) || s.kind === 'bus') continue;        // so estacoes e terminais
    let best = null;
    for (const i of hot) {
      const d = distKm(s.lat, s.lon, i.lat, i.lon);
      if (d <= radiusKm && (!best || d < best.distanceKm)) best = { stop: s, incident: i, distanceKm: Number(d.toFixed(2)) };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => (b.incident.category === 8) - (a.incident.category === 8) || a.distanceKm - b.distanceKm);
}

const STOP_LABEL = { metro: 'Estação de metrô', train: 'Estação de trem', tram: 'Parada de bonde/VLT', bus_station: 'Terminal de ônibus' };

// Leituras de um local monitorado -> alertas. So gera alerta para situacoes
// relevantes (nao para "atencao"/"fraca"), para o feed nao virar ruido.
export function buildMonitorAlerts(loc, { air, flood, inversion, traffic, watch, forest, weather, transit }, aqiThreshold = 80, limits = {}) {
  const manancialMin = limits.manancialMin ?? 5;    // alertas confirmados dentro de manancial/area protegida
  const forestMin = limits.forestMin ?? 50;         // alertas confirmados num raio de 10 km
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

  // Desmatamento dentro de mananciais e areas protegidas (possivel invasao): o mais grave
  const top = watch?.available ? (watch.areas || []).find((a) => a.confirmed >= manancialMin) : null;
  if (top) {
    const others = (watch.areas || []).filter((a) => a !== top && a.confirmed >= manancialMin).length;
    alerts.push(mk(where, { kind: 'manancial', level: top.confirmed >= 30 ? 'alta' : 'media',
      title: `Desmatamento em área de manancial: ${top.name || (top.kind === 'water' ? 'represa/lago sem nome' : 'área protegida sem nome')}`,
      reasons: [`${top.confirmed} alertas confirmados nos últimos ${watch.days} dias`,
        ...(others ? [`Mais ${others} área(s) de manancial com alertas na região`] : [])] }));
  }
  if (forest?.available && forest.confirmed >= forestMin) {
    alerts.push(mk(where, { kind: 'deforestation', level: forest.confirmed >= 200 ? 'alta' : 'media',
      title: `Desmatamento recente: ${forest.confirmed} alertas confirmados em ${forest.days} dias`,
      reasons: ['Alertas de desmatamento do Global Forest Watch num raio de 10 km'] }));
  }

  for (const w of weatherAlerts(weather, limits)) alerts.push(mk(where, w));

  // Transporte publico: estacoes/terminais perto de interdicoes e incidentes graves
  const impacts = traffic?.enabled ? transitImpacts(transit?.stops, traffic.items, limits.transitRadiusKm) : [];
  if (impacts.length) {
    const top = impacts[0];
    const what = (stop) => `${STOP_LABEL[stop.kind] || 'Estação'}${stop.name ? ' ' + stop.name : ''}`;
    alerts.push(mk({ ...where, lat: top.stop.lat, lon: top.stop.lon }, { kind: 'transit', level: impacts.length >= 3 || top.incident.category === 8 ? 'alta' : 'media',
      title: impacts.length === 1 ? `Transporte público: ${what(top.stop)} com ${top.incident.categoryLabel.toLowerCase()} por perto`
        : `Transporte público: ${impacts.length} estações/terminais com via interditada ou incidente grave por perto`,
      reasons: impacts.slice(0, 3).map((x) => `${what(x.stop)}: ${x.incident.categoryLabel}${x.incident.from ? ' (' + x.incident.from + (x.incident.to ? ' → ' + x.incident.to : '') + ')' : ''}, a ${Math.round(x.distanceKm * 1000)} m`) }));
  }
  return alerts;
}

// Resumo de um local para o painel (/monitor).
export function summarizeLocation(loc, { air, flood, inversion, traffic, watch, forest }) {
  const inv = inversion?.available ? inversion.next24h : null;
  return {
    name: loc.name, lat: loc.lat, lon: loc.lon,
    aqi: isNum(air?.current?.european_aqi) ? Math.round(air.current.european_aqi) : null,
    flood: flood ? { level: flood.level, next24hMm: flood.rain?.next24hMm ?? null } : null,
    inversion: inv ? { level: inv.level, maxStrength: inv.maxStrength, trapsPollutants: inv.trapsPollutants } : null,
    traffic: traffic && traffic.enabled ? { incidents: traffic.total, major: traffic.major, roadClosures: traffic.roadClosures } : null,
    forest: forest?.available ? { alerts: forest.total, confirmed: forest.confirmed, days: forest.days } : null,
    manancial: watch?.available ? { areas: watch.areasChecked, confirmed: watch.totalConfirmed, days: watch.days } : null,
    checkedAt: Date.now()
  };
}
