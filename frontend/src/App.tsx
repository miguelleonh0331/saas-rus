import { useEffect, useState } from 'react';
import { api, setToken, getToken } from './api';

type Termometro = {
  limite: number; vendido: number; restante: number; porcentaje: number;
  nivel: 'verde' | 'amarillo' | 'naranja' | 'rojo'; alerta: string | null;
};
type Resumen = { dia: { total: number; operaciones: number }; termometro: Termometro };

const COLOR: Record<string, string> = {
  verde: '#22c55e', amarillo: '#eab308', naranja: '#f97316', rojo: '#ef4444',
};

export default function App() {
  const [logged, setLogged] = useState(!!getToken());
  const [tab, setTab] = useState<'caja' | 'inventario'>('caja');
  if (!logged) return <Login onOk={() => setLogged(true)} />;

  return (
    <div className="pb-20">
      {tab === 'caja'
        ? <Caja onLogout={() => { setToken(null); setLogged(false); }} />
        : <Inventario />}

      {/* Navegacion inferior */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-900 border-t border-slate-700 flex">
        <button onClick={() => setTab('caja')}
          className={`flex-1 py-4 text-lg font-bold ${tab === 'caja' ? 'text-sky-400' : 'text-slate-400'}`}>
          🧮 Caja
        </button>
        <button onClick={() => setTab('inventario')}
          className={`flex-1 py-4 text-lg font-bold ${tab === 'inventario' ? 'text-sky-400' : 'text-slate-400'}`}>
          📦 Inventario
        </button>
      </nav>
    </div>
  );
}

function Login({ onOk }: { onOk: () => void }) {
  const [celular, setCelular] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function entrar() {
    setError('');
    try { const r = await api.login(celular, password); setToken(r.token); onOk(); }
    catch (e: any) { setError(e.message); }
  }
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-3xl font-bold text-center">Mi Caja RUS</h1>
        <input className="w-full rounded-xl bg-slate-800 p-4 text-xl" placeholder="Celular"
          inputMode="numeric" value={celular} onChange={e => setCelular(e.target.value)} />
        <input className="w-full rounded-xl bg-slate-800 p-4 text-xl" placeholder="Contrasena"
          type="password" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="text-red-400 text-center">{error}</p>}
        <button onClick={entrar} className="w-full rounded-xl bg-sky-500 p-4 text-xl font-bold active:bg-sky-600">
          Ingresar
        </button>
      </div>
    </div>
  );
}

function Caja({ onLogout }: { onLogout: () => void }) {
  const [monto, setMonto] = useState('');
  const [pagaCon, setPagaCon] = useState<number | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<number | null>(null);

  async function cargar() {
    try { setResumen(await api.resumen()); }
    catch (e: any) { if (e.status === 402) alert('Tu acceso ha vencido. Yapea o Plinea para continuar.'); }
  }
  useEffect(() => { cargar(); }, []);

  function tecla(t: string) {
    setPagaCon(null);   // si editas el monto, se reinicia el vuelto
    if (t === '←') return setMonto(m => m.slice(0, -1));
    if (t === '.' && monto.includes('.')) return;
    setMonto(m => (m + t).slice(0, 9));
  }
  async function registrar() {
    const v = parseFloat(monto);
    if (!v || v <= 0) return;
    const r = await api.registrarVenta(v);
    setResumen(s => s ? { ...s, termometro: r.termometro } : s);
    setUltimaVenta(v); setMonto(''); setPagaCon(null); cargar();
  }

  const montoNum = parseFloat(monto) || 0;
  const vuelto = pagaCon !== null ? pagaCon - montoNum : null;

  const t = resumen?.termometro;
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Mi Caja</h2>
        <button onClick={onLogout} className="text-slate-400 text-sm">Salir</button>
      </div>

      {/* Termometro mensual */}
      {t && (
        <div className="rounded-2xl bg-slate-800 p-4">
          <div className="flex justify-between text-sm text-slate-300">
            <span>Vendido este mes</span><span>S/. {t.vendido.toFixed(2)} / {t.limite}</span>
          </div>
          <div className="mt-2 h-4 w-full rounded-full bg-slate-700 overflow-hidden">
            <div style={{ width: `${Math.min(t.porcentaje, 100)}%`, background: COLOR[t.nivel] }}
              className="h-full transition-all" />
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span style={{ color: COLOR[t.nivel] }}>{t.porcentaje}%</span>
            <span className="text-slate-300">Te falta S/. {t.restante.toFixed(2)}</span>
          </div>
          {t.alerta && <p className="mt-2 text-center font-semibold" style={{ color: COLOR[t.nivel] }}>{t.alerta}</p>}
        </div>
      )}

      {/* Resumen del dia */}
      {resumen && (
        <div className="flex gap-3">
          <div className="flex-1 rounded-2xl bg-slate-800 p-3 text-center">
            <div className="text-2xl font-bold">S/. {resumen.dia.total.toFixed(2)}</div>
            <div className="text-xs text-slate-400">Ventas de hoy</div>
          </div>
          <div className="flex-1 rounded-2xl bg-slate-800 p-3 text-center">
            <div className="text-2xl font-bold">{resumen.dia.operaciones}</div>
            <div className="text-xs text-slate-400">Operaciones</div>
          </div>
        </div>
      )}

      {/* Monto */}
      <div className="rounded-2xl bg-slate-800 p-4 text-right text-4xl font-bold min-h-[64px]">
        {monto || '0'}
      </div>

      {/* Vuelto: con cuanto paga el cliente */}
      {montoNum > 0 && (
        <div className="rounded-2xl bg-slate-800 p-3 space-y-2">
          <div className="text-sm text-slate-400">Paga con:</div>
          <div className="grid grid-cols-4 gap-2">
            {[10, 20, 50, 100, 200].map(b => (
              <button key={b} onClick={() => setPagaCon(b)}
                className={`rounded-lg py-3 text-lg font-bold ${pagaCon === b ? 'bg-sky-500' : 'bg-slate-700 active:bg-slate-600'}`}>
                {b}
              </button>
            ))}
            <button onClick={() => setPagaCon(montoNum)}
              className={`rounded-lg py-3 text-sm font-bold ${pagaCon === montoNum ? 'bg-sky-500' : 'bg-slate-700 active:bg-slate-600'}`}>
              Exacto
            </button>
          </div>
          {vuelto !== null && (
            <div className={`rounded-xl p-3 text-center text-2xl font-bold ${vuelto < 0 ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}`}>
              {vuelto < 0
                ? `Falta S/. ${Math.abs(vuelto).toFixed(2)}`
                : `Vuelto: S/. ${vuelto.toFixed(2)}`}
            </div>
          )}
        </div>
      )}

      {/* Teclado gigante */}
      <div className="grid grid-cols-3 gap-2">
        {['1','2','3','4','5','6','7','8','9','00','0','.'].map(k => (
          <button key={k} onClick={() => tecla(k)}
            className="rounded-xl bg-slate-700 py-5 text-2xl font-bold active:bg-slate-600">{k}</button>
        ))}
        <button onClick={() => tecla('←')} className="rounded-xl bg-slate-700 py-5 text-2xl active:bg-slate-600">←</button>
        <button onClick={registrar} className="col-span-2 rounded-xl bg-sky-500 py-5 text-2xl font-bold active:bg-sky-600">
          Registrar Venta
        </button>
      </div>

      {/* Nota WhatsApp tras registrar */}
      {ultimaVenta !== null && <NotaWhatsApp monto={ultimaVenta} onClose={() => setUltimaVenta(null)} />}
    </div>
  );
}

type Producto = { id: number; nombre: string; marca: string; precio: number; color: string; tags: string; foto: string };

function Inventario() {
  const [lista, setLista] = useState<Producto[]>([]);
  const [form, setForm] = useState({ nombre: '', marca: '', precio: '', color: '', tags: '', foto: '' });
  const [analizando, setAnalizando] = useState(false);
  const [msg, setMsg] = useState('');

  async function cargar() { try { setLista(await api.productos()); } catch { /* ignore */ } }
  useEffect(() => { cargar(); }, []);

  function leerFoto(file: File) {
    const r = new FileReader();
    r.onload = () => setForm(f => ({ ...f, foto: String(r.result) }));
    r.readAsDataURL(file);
  }

  async function analizar() {
    if (!form.foto) { setMsg('Primero toma o sube una foto'); return; }
    setAnalizando(true); setMsg('');
    try {
      const r = await api.analizarFoto([form.foto]);
      const s = r.sugerencia;
      if (s) {
        setForm(f => ({
          ...f,
          nombre: f.nombre || s.nombre || '',
          marca: f.marca || s.marca || '',
          color: f.color || s.color || '',
          tags: f.tags || (Array.isArray(s.caracteristicas) ? s.caracteristicas.join(', ') : (s.tipo || '')),
        }));
        setMsg(`IA (${r.proveedor}) detecto: ${s.color || '?'} · ${s.tipo || ''}. Revisa y corrige.`);
      } else setMsg('La IA no pudo interpretar la foto. Llena a mano.');
    } catch (e: any) { setMsg('Error IA: ' + e.message); }
    finally { setAnalizando(false); }
  }

  async function guardar() {
    const precio = parseFloat(form.precio);
    if (!form.nombre || !precio) { setMsg('Falta nombre y precio'); return; }
    await api.crearProducto({ ...form, precio });
    setForm({ nombre: '', marca: '', precio: '', color: '', tags: '', foto: '' });
    setMsg('Producto guardado'); cargar();
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar este producto?')) return;
    await api.eliminarProducto(id); cargar();
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h2 className="text-xl font-bold">📦 Inventario</h2>

      {/* Formulario nuevo producto */}
      <div className="rounded-2xl bg-slate-800 p-4 space-y-3">
        <label className="block h-44 rounded-xl border-2 border-dashed border-slate-600 flex items-center justify-center overflow-hidden cursor-pointer">
          {form.foto
            ? <img src={form.foto} className="max-h-full" />
            : <span className="text-slate-400 text-center px-3">📷 Toca para tomar foto del producto</span>}
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => e.target.files?.[0] && leerFoto(e.target.files[0])} />
        </label>

        <button onClick={analizar} disabled={analizando || !form.foto}
          className="w-full rounded-xl bg-violet-600 py-3 font-bold disabled:opacity-40 active:bg-violet-700">
          {analizando ? 'Analizando...' : '✨ Analizar con IA'}
        </button>

        <input className="w-full rounded-xl bg-slate-700 p-3" placeholder="Nombre"
          value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
        <input className="w-full rounded-xl bg-slate-700 p-3" placeholder="Marca"
          value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} />
        <div className="flex gap-2">
          <input className="flex-1 rounded-xl bg-slate-700 p-3" placeholder="Precio S/." inputMode="decimal"
            value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} />
          <input className="flex-1 rounded-xl bg-slate-700 p-3" placeholder="Color"
            value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
        </div>
        <input className="w-full rounded-xl bg-slate-700 p-3" placeholder="Etiquetas (ej: golosina, morado)"
          value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />

        {msg && <p className="text-sm text-sky-300">{msg}</p>}
        <button onClick={guardar} className="w-full rounded-xl bg-sky-500 py-3 text-lg font-bold active:bg-sky-600">
          Guardar producto
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {lista.length === 0 && <p className="text-slate-400 text-center">Aun no hay productos.</p>}
        {lista.map(p => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl bg-slate-800 p-2">
            {p.foto
              ? <img src={p.foto} className="h-12 w-12 rounded-lg object-cover" />
              : <div className="h-12 w-12 rounded-lg bg-slate-700 flex items-center justify-center">📦</div>}
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{p.nombre} {p.marca && <span className="text-slate-400 font-normal">· {p.marca}</span>}</div>
              <div className="text-xs text-slate-400">{p.color} {p.tags && '· ' + p.tags}</div>
            </div>
            <div className="font-bold text-green-400">S/. {Number(p.precio).toFixed(2)}</div>
            <button onClick={() => eliminar(p.id)} className="text-red-400 px-2">🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotaWhatsApp({ monto, onClose }: { monto: number; onClose: () => void }) {
  const [tel, setTel] = useState('');
  function enviar() {
    const msg = `*NEGOCIO*\nFecha: ${new Date().toLocaleDateString('es-PE')}\nMonto: S/. ${monto.toFixed(2)}\n\nGracias por su compra.`;
    const num = tel.replace(/\D/g, '');
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
    onClose();
  }
  return (
    <div className="rounded-2xl border border-sky-500 bg-slate-800 p-4 space-y-3">
      <p className="font-semibold">Venta S/. {monto.toFixed(2)} registrada</p>
      <input className="w-full rounded-xl bg-slate-700 p-3" placeholder="Celular del cliente"
        inputMode="numeric" value={tel} onChange={e => setTel(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={enviar} className="flex-1 rounded-xl bg-green-600 p-3 font-bold active:bg-green-700">
          Enviar nota por WhatsApp
        </button>
        <button onClick={onClose} className="rounded-xl bg-slate-600 px-4">Cerrar</button>
      </div>
    </div>
  );
}
