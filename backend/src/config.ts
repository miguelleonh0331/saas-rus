import dotenv from 'dotenv';
dotenv.config();

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: req('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  databasePath: process.env.DATABASE_PATH ?? './data/rus.db',
  adminWhatsapp: process.env.ADMIN_WHATSAPP ?? '',
  precioSuscripcion: Number(process.env.PRECIO_SUSCRIPCION ?? 15),
  login: {
    max: Number(process.env.LOGIN_RATE_MAX ?? 5),
    windowMin: Number(process.env.LOGIN_RATE_WINDOW_MIN ?? 15),
  },
};

// Limites mensuales del Nuevo RUS por categoria (Soles).
export const RUS_LIMITES: Record<number, number> = {
  1: 5000,
  2: 8000,
};
