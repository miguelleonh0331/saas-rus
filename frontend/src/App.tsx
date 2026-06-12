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
  return logged ? <Caja onLogout={() => { setToken(null); setLogged(false); }} /> : <Login onOk={() => setLogged(true)} />;
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
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<number | null>(null);

  async function cargar() {
    try { setResumen(await api.resumen()); }
    catch (e: any) { if (e.status === 402) alert('Tu acceso ha vencido. Yapea o Plinea para continuar.'); }
  }
  useEffect(() => { cargar(); }, []);

  function tecla(t: string) {
    if (t === '←') return setMonto(m => m.slice(0, -1));
    if (t === '.' && monto.includes('.')) return;
    setMonto(m => (m + t).slice(0, 9));
  }
  async function registrar() {
    const v = parseFloat(monto);
    if (!v || v <= 0) return;
    const r = await api.registrarVenta(v);
    setResumen(s => s ? { ...s, termometro: r.termometro } : s);
    setUltimaVenta(v); setMonto(''); cargar();
  }

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
