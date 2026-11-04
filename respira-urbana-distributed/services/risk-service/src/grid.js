// Utilitarios de grade regular sobre um retangulo (south/west/north/east) com
// celulas quadradas de lado "step" graus. Cada servico mantem a propria copia
// para continuar independente (sem codigo compartilhado em tempo de execucao).
export function parseGridParams(q) {
  const south = Number(q.south);
  const west = Number(q.west);
  const north = Number(q.north);
  const east = Number(q.east);
  const step = Number(q.step);
  if (![south, west, north, east, step].every(Number.isFinite)) {
    return { error: 'parametros south, west, north, east e step sao obrigatorios' };
  }
  if (step <= 0 || south >= north || west >= east) return { error: 'limites invalidos' };
  if (south < -90 || north > 90 || west < -180 || east > 180) return { error: 'limites fora do intervalo valido' };
  const rows = Math.round((north - south) / step);
  const cols = Math.round((east - west) / step);
  if (rows < 1 || cols < 1 || rows * cols > 100) return { error: 'grade invalida (1 a 100 celulas)' };
  return { south, west, north, east, step, rows, cols };
}

export function cellCenters({ south, west, step, rows, cols }) {
  const cells = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      cells.push({
        lat: Number((south + (i + 0.5) * step).toFixed(4)),
        lon: Number((west + (j + 0.5) * step).toFixed(4))
      });
    }
  }
  return cells;
}

// O Open-Meteo aceita listas de coordenadas e devolve um array na mesma ordem
// (ou um objeto unico quando ha so uma coordenada).
export function asArray(data) {
  return Array.isArray(data) ? data : [data];
}
