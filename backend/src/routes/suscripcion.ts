import { Router } from 'express';
import { db } from '../db';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

export const suscripcionRouter = Router();
suscripcionRouter.use(requireAuth);

// Estado de la suscripcion del negocio (sirve para mostrar el bloqueo).
suscripcionRouter.get('/', (req, res) => {
  const negocioId = req.auth!.negocioId;
  const sub = db.prepare(
    `SELECT fecha_inicio, fecha_vencimiento, activo FROM suscripciones
      WHERE negocio_id = ? ORDER BY id DESC LIMIT 1`
  ).get(negocioId) as { fecha_inicio: string; fecha_vencimiento: string; activo: number } | undefined;

  const vigente = sub && sub.activo === 1 && new Date(sub.fecha_vencimiento) > new Date();
  res.json({
    vigente: !!vigente,
    fecha_vencimiento: sub?.fecha_vencimiento ?? null,
    precio: config.precioSuscripcion,
    admin_whatsapp: config.adminWhatsapp,
  });
});
