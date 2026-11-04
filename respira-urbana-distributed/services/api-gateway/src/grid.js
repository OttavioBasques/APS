// Ajusta o retangulo visivel do mapa a uma grade "alinhada": celulas de lado
// fixo (de uma lista de passos "redondos") e limites multiplos desse passo.
// Assim, mover o mapa um pouco reaproveita as mesmas celulas no cache do Redis
// e cada consulta tem no maximo ~8 x 8 pontos (cada ponto conta como uma
// chamada no limite diario gratuito do Open-Meteo).
const STEPS = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 45, 90];

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const round4 = (v) => Number(v.toFixed(4));

export function snapGrid(q, maxDivisions = 6) {
  const raw = { south: Number(q.south), west: Number(q.west), north: Number(q.north), east: Number(q.east) };
  if (!Object.values(raw).every(Number.isFinite)) return { error: 'parametros south, west, north e east sao obrigatorios' };

  const south = clamp(raw.south, -85, 85);
  const north = clamp(raw.north, -85, 85);
  const west = clamp(raw.west, -180, 180);
  const east = clamp(raw.east, -180, 180);
  if (south >= north || west >= east) return { error: 'limites invalidos' };

  const span = Math.max(north - south, east - west);
  const step = STEPS.find((s) => span / s <= maxDivisions) ?? STEPS[STEPS.length - 1];
  const eps = 1e-9;
  return {
    step,
    south: round4(clamp(Math.floor(south / step + eps) * step, -90, 90)),
    north: round4(clamp(Math.ceil(north / step - eps) * step, -90, 90)),
    west: round4(clamp(Math.floor(west / step + eps) * step, -180, 180)),
    east: round4(clamp(Math.ceil(east / step - eps) * step, -180, 180))
  };
}
