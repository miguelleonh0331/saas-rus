import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { rangoMesActualUTC } from '../utils/rus';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

function auditar(adminId: number, accion: string, objetivo: string, detalle: string) {
  db.prepare(`INSERT INTO auditoria_admin (admin_id, accion, objetivo, detalle) VALUES (?,?,?,?)`)
    .run(adminId, accion, objetivo, detalle);
}

// Listado / busqueda de clientes con su estado y venta del mes.
adminRouter.get('/clientes', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const { inicio, fin } = rangoMesActualUTC();
  const like = `%${q}%`;
  const rows = db.prepare(
    `SELECT n.id, n.nombre, n.telefono, n.categoria_rus,
            s.fecha_vencimiento, s.activo,
            (SELECT COALESCE(SUM(monto),0) FROM ventas v
               WHERE v.negocio_id = n.id AND v.anulada = 0 AND v.fecha >= ? AND v.fecha < ?) AS vendido_mes
       FROM negocios n
       LEFT JOIN suscripciones s ON s.id = (
         SELECT id FROM suscripciones WHERE negocio_id = n.id ORDER BY id DESC LIMIT 1)
      WHERE (? = '' OR n.nombre LIKE ? OR n.telefono LIKE ?)
      ORDER BY s.fecha_vencimiento ASC`
  ).all(inicio, fin, q, like, like);
  res.json(rows);
});

const diasSchema = z.object({ dias: z.number().int().refine(d => d === 30 || d === 60, 'Solo 30 o 60') });

// Sumar dias y reactivar (botones +30 / +60).
adminRouter.post('/clientes/:id/extender', (req, res) => {
  const negocioId = Number(req.params.id);
  const parsed = diasSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Dias invalidos (30 o 60)' });

  const sub = db.prepare(`SELECT id, fecha_vencimiento FROM suscripciones WHERE negocio_id = ? ORDER BY id DESC LIMIT 1`)
    .get(negocioId) as { id: number; fecha_vencimiento: string } | undefined;
  if (!sub) return res.status(404).json({ error: 'Negocio sin suscripcion' });

  // Si ya vencio, contar desde hoy; si esta vigente, sumar al vencimiento.
  const base = new Date(sub.fecha_vencimiento) > new Date() ? new Date(sub.fecha_vencimiento) : new Date();
  base.setDate(base.getDate() + parsed.data.dias);

  db.prepare(`UPDATE suscripciones SET fecha_vencimiento = ?, activo = 1 WHERE id = ?`)
    .run(base.toISOString(), sub.id);
  auditar(req.auth!.usuarioId, 'extender', String(negocioId), `+${parsed.data.dias} dias`);
  res.json({ ok: true, fecha_vencimiento: base.toISOString() });
});

// Activar / desactivar manualmente.
adminRouter.post('/clientes/:id/estado', (req, res) => {
  const negocioId = Number(req.params.id);
  const activo = req.body?.activo ? 1 : 0;
  const sub = db.prepare(`SELECT id FROM suscripciones WHERE negocio_id = ? ORDER BY id DESC LIMIT 1`)
    .get(negocioId) as { id: number } | undefined;
  if (!sub) return res.status(404).json({ error: 'Negocio sin suscripcion' });
  db.prepare(`UPDATE suscripciones SET activo = ? WHERE id = ?`).run(activo, sub.id);
  auditar(req.auth!.usuarioId, activo ? 'reactivar' : 'desactivar', String(negocioId), '');
  res.json({ ok: true, activo: !!activo });
});
