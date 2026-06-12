import rateLimit from 'express-rate-limit';
import { config } from '../config';

// Limite general: protege toda la API de abuso.
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,                 // 120 req/min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta mas tarde.' },
});

// Limite estricto SOLO para el login: frena la fuerza bruta.
export const loginLimiter = rateLimit({
  windowMs: config.login.windowMin * 60 * 1000,
  max: config.login.max,    // p.ej. 5 intentos por 15 min
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,  // solo cuentan los intentos fallidos
  message: { error: 'Demasiados intentos de inicio de sesion. Espera unos minutos.' },
});
