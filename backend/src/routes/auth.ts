import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db';
import { firmarToken } from '../middleware/auth';
import { loginLimiter } from '../middleware/security';

export const authRouter = Router();

const loginSchema = z.object({
  celular: z.string().min(6).max(20).regex(/^[0-9]+$/, 'Celular invalido'),
  password: z.string().min(4).max(100),
});

authRouter.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos invalidos' });
  const { celular, password } = parsed.data;

  const user = db.prepare(
    `SELECT u.id, u.negocio_id, u.password_hash, u.rol, n.nombre, n.categoria_rus
       FROM usuarios u JOIN negocios n ON n.id = u.negocio_id
      WHERE u.celular = ?`
  ).get(celular) as
    | { id: number; negocio_id: number; password_hash: string; rol: 'comerciante' | 'admin'; nombre: string; categoria_rus: number }
    | undefined;

  // Mensaje generico: no revela si el celular existe (anti-enumeracion).
  const credInvalida = () => res.status(401).json({ error: 'Celular o contrasena incorrectos' });
  if (!user) { bcrypt.compareSync(password, '$2a$10$invalidinvalidinvalidinvalidinv'); return credInvalida(); }
  if (!bcrypt.compareSync(password, user.password_hash)) return credInvalida();

  const token = firmarToken({ usuarioId: user.id, negocioId: user.negocio_id, rol: user.rol });
  res.json({
    token,
    usuario: { id: user.id, rol: user.rol, negocio: user.nombre, categoria: user.categoria_rus },
  });
});
