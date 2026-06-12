import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { migrate } from './db';
import { apiLimiter } from './middleware/security';
import { authRouter } from './routes/auth';
import { ventasRouter } from './routes/ventas';
import { suscripcionRouter } from './routes/suscripcion';
import { adminRouter } from './routes/admin';
import { productosRouter } from './routes/productos';

migrate();

const app = express();

app.disable('x-powered-by');
app.use(helmet());                       // cabeceras HTTP seguras
app.use(cors());                          // Nginx hace proxy same-origin; ajustar origin en prod si hace falta
app.use(express.json({ limit: '12mb' })); // las fotos de inventario van en base64
app.use(apiLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use('/api/auth', authRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/suscripcion', suscripcionRouter);
app.use('/api/admin', adminRouter);
app.use('/api/productos', productosRouter);

// Manejo de error generico: nunca filtra stack al cliente.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(config.port, () => {
  console.log(`API Nuevo RUS escuchando en puerto ${config.port}`);
});
