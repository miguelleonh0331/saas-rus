import { db } from '../db';
import { RUS_LIMITES } from '../config';

// Zona horaria de Peru. Se calcula el "mes actual" en hora local de Lima.
// Lima = UTC-5 todo el ano (sin horario de verano).
const OFFSET_LIMA_MIN = -5 * 60;

function ahoraLima(): Date {
  const now = new Date();
  return new Date(now.getTime() + OFFSET_LIMA_MIN * 60 * 1000);
}

// Rango [inicio, fin) del mes actual en UTC, calculado sobre hora de Lima.
export function rangoMesActualUTC(): { inicio: string; fin: string } {
  const lima = ahoraLima();
  const y = lima.getUTCFullYear();
  const m = lima.getUTCMonth();
  // medianoche Lima = 05:00 UTC del dia 1
  const inicio = new Date(Date.UTC(y, m, 1, 5, 0, 0));
  const fin = new Date(Date.UTC(y, m + 1, 1, 5, 0, 0));
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

export interface Termometro {
  categoria: number;
  limite: number;
  vendido: number;
  restante: number;
  porcentaje: number;          // 0-100+
  nivel: 'verde' | 'amarillo' | 'naranja' | 'rojo';
  alerta: string | null;
}

export function calcularTermometro(negocioId: number, categoria: number): Termometro {
  const limite = RUS_LIMITES[categoria] ?? RUS_LIMITES[1];
  const { inicio, fin } = rangoMesActualUTC();
  const row = db.prepare(
    `SELECT COALESCE(SUM(monto), 0) AS total
       FROM ventas
      WHERE negocio_id = ? AND anulada = 0 AND fecha >= ? AND fecha < ?`
  ).get(negocioId, inicio, fin) as { total: number };

  const vendido = Number(row.total.toFixed(2));
  const porcentaje = Math.round((vendido / limite) * 100);
  const restante = Number(Math.max(limite - vendido, 0).toFixed(2));

  let nivel: Termometro['nivel'] = 'verde';
  let alerta: string | null = null;
  if (porcentaje >= 100) { nivel = 'rojo'; alerta = 'Alcanzaste el limite del Nuevo RUS de este mes.'; }
  else if (porcentaje >= 90) { nivel = 'naranja'; alerta = 'Estas muy cerca del limite del Nuevo RUS.'; }
  else if (porcentaje >= 80) { nivel = 'amarillo'; alerta = 'Cuidado, te acercas al limite del Nuevo RUS.'; }

  return { categoria, limite, vendido, restante, porcentaje, nivel, alerta };
}
