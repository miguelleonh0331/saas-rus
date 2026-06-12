// Crea el primer usuario administrador.
// Uso:  npm run create-admin -- <celular> <password> [nombreNegocio]
import bcrypt from 'bcryptjs';
import { db, migrate } from '../db';

migrate();

const [, , celular, password, nombre = 'Administracion'] = process.argv;
if (!celular || !password) {
  console.error('Uso: npm run create-admin -- <celular> <password> [nombreNegocio]');
  process.exit(1);
}

const tx = db.transaction(() => {
  const neg = db.prepare(`INSERT INTO negocios (nombre, telefono, categoria_rus) VALUES (?,?,1)`)
    .run(nombre, celular);
  const negocioId = Number(neg.lastInsertRowid);
  // El admin tiene suscripcion lejana (no se bloquea).
  db.prepare(`INSERT INTO suscripciones (negocio_id, fecha_vencimiento, activo) VALUES (?, '2099-01-01T00:00:00Z', 1)`)
    .run(negocioId);
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(`INSERT INTO usuarios (negocio_id, celular, password_hash, rol) VALUES (?,?,?,'admin')`)
    .run(negocioId, celular, hash);
});

try {
  tx();
  console.log(`Admin creado. Celular: ${celular}`);
} catch (e) {
  console.error('No se pudo crear el admin:', (e as Error).message);
  process.exit(1);
}
