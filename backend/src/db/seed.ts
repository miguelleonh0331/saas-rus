// Datos demo para pruebas. Uso: npm run seed
import bcrypt from 'bcryptjs';
import { db, migrate } from './index';

migrate();

const tx = db.transaction(() => {
  // Negocio demo: bodega categoria 1
  const neg = db.prepare(`INSERT INTO negocios (nombre, telefono, categoria_rus, wa_negocio) VALUES (?,?,?,?)`)
    .run('Bodega Don Pepe', '51987654321', 1, '51987654321');
  const negocioId = Number(neg.lastInsertRowid);

  // Suscripcion vigente 30 dias
  const venc = new Date(); venc.setDate(venc.getDate() + 30);
  db.prepare(`INSERT INTO suscripciones (negocio_id, fecha_vencimiento, activo) VALUES (?,?,1)`)
    .run(negocioId, venc.toISOString());

  // Usuario comerciante demo  (celular 987654321 / clave demo1234)
  const hash = bcrypt.hashSync('demo1234', 12);
  db.prepare(`INSERT INTO usuarios (negocio_id, celular, password_hash, rol) VALUES (?,?,?,'comerciante')`)
    .run(negocioId, '987654321', hash);

  // Algunas ventas del mes
  for (const monto of [25, 12.5, 40, 8, 150, 60]) {
    db.prepare(`INSERT INTO ventas (negocio_id, monto) VALUES (?,?)`).run(negocioId, monto);
  }
});

tx();
console.log('Seed listo. Login demo -> celular: 987654321  clave: demo1234');
