import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db } from '../db';

export interface AuthPayload {
  usuarioId: number;
  negocioId: number;
  rol: 'comerciante' | 'admin';
}

// Extiende Request con el usuario autenticado.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { auth?: AuthPayload; }
  }
}

export function firmarToken(payload: AuthPayload): string {
  const opts: jwt.SignOptions = { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, config.jwtSecret, opts);
}

// Exige un JWT valido. Bloquea si falta o es invalido.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    req.auth = jwt.verify(token, config.jwtSecret) as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesion invalida o expirada' });
  }
}

// Solo administradores.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// Bloquea al comerciante si su suscripcion vencio (excepto admins).
export function requireSuscripcionActiva(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.rol === 'admin') return next();
  const sub = db.prepare(
    `SELECT activo, fecha_vencimiento FROM suscripciones WHERE negocio_id = ? ORDER BY id DESC LIMIT 1`
  ).get(req.auth!.negocioId) as { activo: number; fecha_vencimiento: string } | undefined;

  const vigente = sub && sub.activo === 1 && new Date(sub.fecha_vencimiento) > new Date();
  if (!vigente) {
    return res.status(402).json({ error: 'suscripcion_vencida', mensaje: 'Tu acceso ha vencido.' });
  }
  next();
}
