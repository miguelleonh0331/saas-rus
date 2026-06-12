import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { requireAuth, requireSuscripcionActiva } from '../middleware/auth';
import { visionChat, extraerJSON } from '../utils/vision';
import { transcribirAudio } from '../utils/audio';

export const productosRouter = Router();
productosRouter.use(requireAuth, requireSuscripcionActiva);

// Listar productos del negocio. Opcional: filtrar por color (pre-filtro).
productosRouter.get('/', (req, res) => {
  const negocioId = req.auth!.negocioId;
  const color = String(req.query.color ?? '').trim();
  const rows = color
    ? db.prepare(`SELECT id, nombre, marca, precio, color, tags, foto FROM productos WHERE negocio_id = ? AND color = ? ORDER BY nombre`).all(negocioId, color)
    : db.prepare(`SELECT id, nombre, marca, precio, color, tags, foto FROM productos WHERE negocio_id = ? ORDER BY nombre`).all(negocioId);
  res.json(rows);
});

const productoSchema = z.object({
  nombre: z.string().min(1).max(80),
  marca: z.string().max(80).optional().default(''),
  precio: z.number().min(0).max(999999),
  color: z.string().max(40).optional().default(''),
  tags: z.string().max(200).optional().default(''),
  foto: z.string().max(4_000_000).optional().default(''),   // data URL base64
  atributos: z.record(z.any()).optional().default({}),
});

// Crear producto.
productosRouter.post('/', (req, res) => {
  const parsed = productoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos invalidos', detalle: parsed.error.issues });
  const p = parsed.data;
  const info = db.prepare(
    `INSERT INTO productos (negocio_id, nombre, marca, precio, color, tags, foto, atributos)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(req.auth!.negocioId, p.nombre, p.marca, p.precio, p.color, p.tags, p.foto, JSON.stringify(p.atributos));
  res.status(201).json({ id: info.lastInsertRowid });
});

// Editar producto.
productosRouter.put('/:id', (req, res) => {
  const parsed = productoSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Datos invalidos' });
  const id = Number(req.params.id);
  const existe = db.prepare(`SELECT id FROM productos WHERE id = ? AND negocio_id = ?`).get(id, req.auth!.negocioId);
  if (!existe) return res.status(404).json({ error: 'Producto no encontrado' });
  const campos: string[] = []; const valores: any[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    campos.push(`${k} = ?`);
    valores.push(k === 'atributos' ? JSON.stringify(v) : v);
  }
  if (campos.length) {
    db.prepare(`UPDATE productos SET ${campos.join(', ')} WHERE id = ? AND negocio_id = ?`)
      .run(...valores, id, req.auth!.negocioId);
  }
  res.json({ ok: true });
});

// Eliminar producto.
productosRouter.delete('/:id', (req, res) => {
  const info = db.prepare(`DELETE FROM productos WHERE id = ? AND negocio_id = ?`)
    .run(Number(req.params.id), req.auth!.negocioId);
  if (info.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json({ ok: true });
});

// Reconocer un producto del inventario a partir de una foto (para la caja).
productosRouter.post('/reconocer', async (req, res) => {
  const foto = req.body?.foto;
  if (!foto) return res.status(400).json({ error: 'Falta la foto' });

  const negocioId = req.auth!.negocioId;
  const catalogo = db.prepare(
    `SELECT id, nombre, marca, precio, color, tags FROM productos WHERE negocio_id = ?`
  ).all(negocioId) as { id: number; nombre: string; marca: string; precio: number; color: string; tags: string }[];

  if (!catalogo.length) return res.status(404).json({ error: 'sin_productos', mensaje: 'No hay productos en el inventario.' });

  // Catalogo en texto: la IA elige cual de ESTOS es (no inventa).
  const listado = catalogo.map(p =>
    `id ${p.id}: ${p.nombre}${p.marca ? ' marca ' + p.marca : ''}${p.color ? ' color ' + p.color : ''}${p.tags ? ' (' + p.tags + ')' : ''}`
  ).join('\n');

  const prompt =
    `Foto de un producto en la caja de una bodega. Abajo esta el inventario. ` +
    `Indica cual de ESTOS productos es el de la foto (no inventes uno que no este en la lista). ` +
    `Inventario:\n${listado}\n\n` +
    `Responde SOLO JSON: {"id": <id del producto o null si ninguno coincide>, "confianza": 0-100, "motivo": "breve"}`;

  try {
    const { proveedor, texto } = await visionChat(prompt, [foto]);
    const r = extraerJSON(texto) || {};
    const prod = catalogo.find(p => p.id === Number(r.id));
    if (!prod) return res.json({ proveedor, encontrado: false, confianza: r.confianza ?? 0, motivo: r.motivo ?? 'Sin coincidencia' });
    res.json({
      proveedor, encontrado: true, confianza: r.confianza ?? 0,
      producto: { id: prod.id, nombre: prod.nombre, marca: prod.marca, precio: prod.precio },
    });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Analizar una foto con IA y sugerir atributos para llenar el formulario.
productosRouter.post('/analizar', async (req, res) => {
  const fotos: string[] = Array.isArray(req.body?.fotos) ? req.body.fotos : [req.body?.foto].filter(Boolean);
  if (!fotos.length) return res.status(400).json({ error: 'Falta la foto' });

  const prompt =
    `Eres asistente de inventario de una bodega. Observa la(s) foto(s) del producto y devuelve SOLO un JSON ` +
    `valido, sin texto extra, con esta forma: ` +
    `{"nombre":"...","marca":"...","color":"color principal en una palabra","tipo":"categoria (bebida, snack, golosina, limpieza, abarrote, otro)","caracteristicas":["rasgo1","rasgo2"]}. ` +
    `Usa colores simples y consistentes (rojo, azul, verde, morado, amarillo, etc). Si no sabes un dato, deja "".`;

  try {
    const { proveedor, texto } = await visionChat(prompt, fotos);
    const sugerencia = extraerJSON(texto);
    res.json({ proveedor, sugerencia, textoCrudo: sugerencia ? undefined : texto });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// Dictado de caja: transcribe audio y lo cruza contra el inventario del negocio.
productosRouter.post('/voz', async (req, res) => {
  const audio = String(req.body?.audio ?? '');
  if (!audio) return res.status(400).json({ error: 'Falta el audio' });

  const negocioId = req.auth!.negocioId;
  const catalogo = db.prepare(
    `SELECT id, nombre, marca, precio, color, tags FROM productos WHERE negocio_id = ? ORDER BY nombre`
  ).all(negocioId) as { id: number; nombre: string; marca: string; precio: number; color: string; tags: string }[];

  if (!catalogo.length) return res.status(404).json({ error: 'sin_productos', mensaje: 'No hay productos en el inventario.' });

  let etapa = 'transcripcion';
  try {
    const transcripcion = await transcribirAudio(audio);
    const listado = catalogo.map(p =>
      `id ${p.id}: ${p.nombre}${p.marca ? ' marca ' + p.marca : ''}${p.color ? ' color ' + p.color : ''}${p.tags ? ' (' + p.tags + ')' : ''}`
    ).join('\n');

    const prompt =
      `Texto dictado por un cajero: "${transcripcion.texto}".\n` +
      `Inventario disponible:\n${listado}\n\n` +
      `Extrae productos y cantidades. Usa solo IDs del inventario. ` +
      `Si una linea no coincide, usa id null y deja el nombre escuchado. ` +
      `Responde SOLO JSON valido con esta forma: ` +
      `{"items":[{"id":1,"cantidad":2,"nombre":"texto escuchado","confianza":0-100}]}`;

    etapa = 'interpretacion';
    const { proveedor, texto } = await visionChat(prompt, []);
    const parsed = extraerJSON(texto) || {};
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const resueltos = items.map((item: any) => {
      const prod = catalogo.find(p => p.id === Number(item.id));
      const cantidad = Math.max(1, Math.min(99, Number(item.cantidad) || 1));
      if (!prod) {
        return {
          encontrado: false,
          cantidad,
          nombre: String(item.nombre || 'Producto no reconocido'),
          confianza: Number(item.confianza) || 0,
        };
      }
      return {
        encontrado: true,
        cantidad,
        confianza: Number(item.confianza) || 0,
        producto: { id: prod.id, nombre: prod.nombre, marca: prod.marca, precio: prod.precio },
      };
    });

    res.json({ proveedorTranscripcion: transcripcion.proveedor, proveedorParser: proveedor, texto: transcripcion.texto, items: resueltos });
  } catch (e) {
    console.error('[productos/voz]', etapa, (e as Error).message);
    res.status(502).json({ error: `${etapa}: ${(e as Error).message}` });
  }
});
