// Funcoes puras: validacao do cadastro de dispositivos e escolha de quem recebe cada alerta.
export const KINDS = ['air-quality', 'flood', 'thermal-inversion', 'traffic', 'deforestation', 'manancial', 'heat', 'cold', 'wind', 'storm', 'transit'];
export const LEVELS = ['media', 'alta'];
const DEFAULT_RADIUS_KM = 100;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function validateRegistration(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = [];
  const token = typeof b.token === 'string' ? b.token.trim() : '';
  if (token.length < 20 || token.length > 4096 || /\s/.test(token)) errors.push('token invalido');

  const minLevel = b.minLevel === undefined ? 'media' : b.minLevel;
  if (!LEVELS.includes(minLevel)) errors.push('minLevel deve ser "media" ou "alta"');

  let kinds = null;
  if (b.kinds !== undefined) {
    if (!Array.isArray(b.kinds) || b.kinds.length === 0 || !b.kinds.every((k) => KINDS.includes(k))) {
      errors.push(`kinds deve ser uma lista de: ${KINDS.join(', ')}`);
    } else kinds = [...new Set(b.kinds)];
  }

  let lat = null; let lon = null; let radiusKm = null;
  const hasLat = b.lat !== undefined && b.lat !== null;
  const hasLon = b.lon !== undefined && b.lon !== null;
  if (hasLat || hasLon) {
    if (!isNum(b.lat) || !isNum(b.lon) || Math.abs(b.lat) > 90 || Math.abs(b.lon) > 180) errors.push('lat/lon invalidos');
    else {
      lat = Math.round(b.lat * 100) / 100; lon = Math.round(b.lon * 100) / 100;   // ~1 km: nao guardamos a posicao exata
      radiusKm = b.radiusKm === undefined ? DEFAULT_RADIUS_KM : b.radiusKm;
      if (!isNum(radiusKm) || radiusKm < 5 || radiusKm > 2000) errors.push('radiusKm deve estar entre 5 e 2000');
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { token, minLevel, kinds, lat, lon, radiusKm, platform: b.platform === 'android' ? 'android' : 'outro' } };
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad; const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Dispositivo sem posicao recebe os alertas de todos os locais monitorados.
export function shouldReceive(device, alert) {
  if (!device || !alert) return false;
  const rank = (l) => LEVELS.indexOf(l);
  if (rank(alert.level) < rank(device.minLevel || 'media')) return false;
  if (Array.isArray(device.kinds) && !device.kinds.includes(alert.kind)) return false;
  if (device.lat != null && device.lon != null) {
    if (!isNum(alert.lat) || !isNum(alert.lon)) return false;
    if (distanceKm(device.lat, device.lon, alert.lat, alert.lon) > (device.radiusKm ?? DEFAULT_RADIUS_KM)) return false;
  }
  return true;
}

export const LEVEL_LABEL = { alta: 'Alerta alto', media: 'Alerta' };

// Mensagem FCM (HTTP v1). Os valores de "data" precisam ser texto.
export function buildMessage(token, alert) {
  const place = alert.detail || alert.place || '';
  return {
    message: {
      token,
      notification: {
        title: alert.title,
        body: [place, LEVEL_LABEL[alert.level] || 'Alerta'].filter(Boolean).join(' · ')
      },
      data: {
        kind: String(alert.kind || ''), level: String(alert.level || ''), place: String(place),
        lat: String(alert.lat ?? ''), lon: String(alert.lon ?? ''), alertId: String(alert.id || '')
      },
      android: {
        priority: alert.level === 'alta' ? 'HIGH' : 'NORMAL',
        notification: { channel_id: 'alerts', tag: `${alert.kind}:${place}` }
      }
    }
  };
}
