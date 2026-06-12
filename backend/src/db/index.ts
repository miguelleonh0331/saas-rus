import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

// Asegura que la carpeta de datos exista (volumen Docker).
fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');   // mejor concurrencia
db.pragma('foreign_keys = ON');

// ── Migracion / esquema ───────────────────────────────────────
// Diseno pensado para migrar a PostgreSQL despues:
//  - sin tipos exclusivos de SQLite
//  - claves foraneas explicitas
//  - timestamps en texto ISO-8601 (UTC)
export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS negocios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre        TEXT NOT NULL,
      telefono      TEXT NOT NULL UNIQUE,
      categoria_rus INTEGER NOT NULL DEFAULT 1,   -- 1 o 2
      wa_negocio    TEXT,                          -- WhatsApp del negocio para notas
      creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id    INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      celular       TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol           TEXT NOT NULL DEFAULT 'comerciante',  -- comerciante | admin
      creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suscripciones (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id       INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      fecha_inicio     TEXT NOT NULL DEFAULT (datetime('now')),
      fecha_vencimiento TEXT NOT NULL,
      activo           INTEGER NOT NULL DEFAULT 1   -- 1 activo, 0 inactivo
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id  INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      monto       REAL NOT NULL CHECK (monto > 0),
      fecha       TEXT NOT NULL DEFAULT (datetime('now')),  -- UTC ISO
      anulada     INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ventas_negocio_fecha ON ventas(negocio_id, fecha);

    CREATE TABLE IF NOT EXISTS productos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_id  INTEGER NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
      nombre      TEXT NOT NULL,
      marca       TEXT,
      precio      REAL NOT NULL DEFAULT 0,
      color       TEXT,                          -- atributo para el pre-filtro
      tags        TEXT,                          -- etiquetas libres separadas por coma
      foto        TEXT,                          -- imagen en base64 (data URL)
      atributos   TEXT NOT NULL DEFAULT '{}',    -- JSON con lo que detecto la IA
      creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_productos_negocio ON productos(negocio_id);
    CREATE INDEX IF NOT EXISTS idx_productos_color ON productos(negocio_id, color);

    CREATE TABLE IF NOT EXISTS configuraciones (
      negocio_id  INTEGER PRIMARY KEY REFERENCES negocios(id) ON DELETE CASCADE,
      clave_valor TEXT NOT NULL DEFAULT '{}'   -- JSON libre por negocio
    );

    CREATE TABLE IF NOT EXISTS auditoria_admin (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id    INTEGER REFERENCES usuarios(id),
      accion      TEXT NOT NULL,
      objetivo    TEXT,
      detalle     TEXT,
      fecha       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
