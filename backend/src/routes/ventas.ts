import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireSuscripcionActiva } from '../middleware/auth';
import { calcularTermometro, rangoMesActualUTC } from '../utils/rus';

export const ventasRouter = Router();
ventasRouter.use(requireAuth, requireSuscripcionActiva);

function categoriaDe(negocioId: number): number {
  const n = db.prepare(`SELECT categoria_rus FROM negocios WHERE id = ?`).get(negocioId) as { categoria_rus: number };
  return n?.categoria_rus ?? 1;
}

// Registrar venta (el flujo de "3 segundos").
const ventaSchema = z.object({ monto: z.number().positive().max(999999) });

ventasRouter.post('/', (req, res) => {
  const parsed = ventaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Monto invalido' });
  const negocioId = req.auth!.negocioId;
  const info = db.prepare(`INSERT INTO ventas (negocio_id, monto) VALUES (?, ?)`)
    .run(negocioId, parsed.data.monto);
  const termometro = calcularTermometro(negocioId, categoriaDe(negocioId));
  res.status(201).json({ id: info.lastInsertRowid, monto: parsed.data.monto, termometro });
});

// Resumen del dia (ventas de hoy en hora Lima) + termometro mensual.
ventasRouter.get('/resumen', (req, res) => {
  const negocioId = req.auth!.negocioId;
  // Hoy en Lima = desde 05:00 UTC de hoy hasta 05:00 UTC de manana.
  const now = new Date();
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const inicioHoy = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate(), 5, 0, 0));
  const finHoy = new Date(inicioHoy.getTime() + 24 * 60 * 60 * 1000);

  const hoy = db.prepare(
    `SELECT COALESCE(SUM(monto),0) AS total, COUNT(*) AS operaciones
       FROM ventas WHERE negocio_id = ? AND anulada = 0 AND fecha >= ? AND fecha < ?`
  ).get(negocioId, inicioHoy.toISOString(), finHoy.toISOString()) as { total: number; operaciones: number };

  res.json({
    dia: { total: Number(hoy.total.toFixed(2)), operaciones: hoy.operaciones },
    termometro: calcularTermometro(negocioId, categoriaDe(negocioId)),
  });
});

// Historial simple del mes.
ventasRouter.get('/', (req, res) => {
  const negocioId = req.auth!.negocioId;
  const { inicio, fin } = rangoMesActualUTC();
  const rows = db.prepare(
    `SELECT id, monto, fecha FROM ventas
      WHERE negocio_id = ? AND anulada = 0 AND fecha >= ? AND fecha < ?
      ORDER BY fecha DESC`
  ).all(negocioId, inicio, fin);
  res.json(rows);
});

// Eliminar (anular) una venta creada por error. Solo del propio negocio.
ventasRouter.delete('/:id', (req, res) => {
  const negocioId = req.auth!.negocioId;
  const id = Number(req.params.id);
  const info = db.prepare(`UPDATE ventas SET anulada = 1 WHERE id = ? AND negocio_id = ?`)
    .run(id, negocioId);
  if (info.changes === 0) return res.status(404).json({ error: 'Venta no encontrada' });
  res.json({ ok: true, termometro: calcularTermometro(negocioId, categoriaDe(negocioId)) });
});
