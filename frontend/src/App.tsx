import { useEffect, useRef, useState } from 'react';
import { api, setToken, getToken } from './api';

type Termometro = {
  limite: number; vendido: number; restante: number; porcentaje: number;
  nivel: 'verde' | 'amarillo' | 'naranja' | 'rojo'; alerta: string | null;
};
type Resumen = { dia: { total: number; operaciones: number }; termometro: Termometro };

const COLOR: Record<string, string> = {
  verde: '#22c55e', amarillo: '#eab308', naranja: '#f97316', rojo: '#ef4444',
};

// Reduce una foto (max 1024px, JPEG 0.8) y devuelve data URL. Liviana para IA y BD.
function reducirFoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1024;
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala), h = Math.round(img.height * escala);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(r.result);
    };
    r.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(blob);
  });
}

function preferredAudioMime(): string | undefined {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return options.find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type));
}

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

type ItemVenta = {
  key: string;
  nombre: string;
  precio: number;
  manual?: boolean;
};

function beepScanner() {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.13);
}

function Caja({ onLogout }: { onLogout: () => void }) {
  const [items, setItems] = useState<ItemVenta[]>([]);
  const [recibido, setRecibido] = useState('');
  const [manualPrecio, setManualPrecio] = useState('');
  const [modoEntrada, setModoEntrada] = useState<'recibido' | 'manual'>('recibido');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const [ultimaVenta, setUltimaVenta] = useState<number | null>(null);
  const [reco, setReco] = useState<{ estado: 'analizando' | 'ok' | 'fail'; texto: string } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  async function cargar() {
    try { await api.resumen(); }
    catch (e: any) { if (e.status === 402) alert('Tu acceso ha vencido. Yapea o Plinea para continuar.'); }
  }
  useEffect(() => { cargar(); }, []);

  const total = items.reduce((sum, item) => sum + item.precio, 0);
  const recibidoNum = parseFloat(recibido) || 0;
  const vuelto = recibido ? recibidoNum - total : null;
  const mostrarTeclado = modoEntrada === 'manual' || total > 0;

  async function reconocerDataUrl(foto: string) {
    setProcesando(true);
    setReco({ estado: 'analizando', texto: 'Reconociendo producto...' });
    try {
      const r = await api.reconocerProducto(foto);
      if (r.encontrado) {
        const producto = r.producto;
        setItems(actual => [...actual, {
          key: `${producto.id}-${Date.now()}`,
          nombre: producto.marca ? `${producto.nombre} · ${producto.marca}` : producto.nombre,
          precio: Number(producto.precio),
        }]);
        setReco({ estado: 'ok', texto: `${producto.nombre} · S/. ${Number(producto.precio).toFixed(2)} (${r.confianza}%)` });
        setModoEntrada('recibido');
        beepScanner();
      } else {
        setReco({ estado: 'fail', texto: 'No reconocido. Ingresa precio manual.' });
        setManualPrecio('');
        setModoEntrada('manual');
      }
    } catch (e: any) {
      const m = e?.data?.error === 'sin_productos' ? 'No tienes productos en inventario aun.' : ('Error: ' + e.message);
      setReco({ estado: 'fail', texto: m });
      setManualPrecio('');
      setModoEntrada('manual');
    } finally {
      setProcesando(false);
    }
  }

  function tecla(t: string) {
    const setValor = modoEntrada === 'manual' ? setManualPrecio : setRecibido;
    const valor = modoEntrada === 'manual' ? manualPrecio : recibido;
    if (t === '←') return setValor(v => v.slice(0, -1));
    if (t === '.' && valor.includes('.')) return;
    setValor(v => (v + t).slice(0, 9));
  }

  function agregarManual() {
    const precio = parseFloat(manualPrecio);
    if (!precio || precio <= 0) return;
    setItems(actual => [...actual, { key: `manual-${Date.now()}`, nombre: 'Producto manual', precio, manual: true }]);
    setManualPrecio('');
    setModoEntrada('recibido');
    setReco(null);
    beepScanner();
  }

  function quitarItem(key: string) {
    setItems(actual => actual.filter(item => item.key !== key));
  }

  async function procesarAudio(blob: Blob) {
    setProcesando(true);
    setReco({ estado: 'analizando', texto: 'Escuchando pedido...' });
    try {
      const audio = await blobToDataUrl(blob);
      const r = await api.interpretarVoz(audio);
      let agregados = 0;
      const nuevos: ItemVenta[] = [];
      for (const item of r.items || []) {
        if (!item.encontrado || !item.producto) continue;
        const cantidad = Math.max(1, Math.min(99, Number(item.cantidad) || 1));
        for (let i = 0; i < cantidad; i++) {
          nuevos.push({
            key: `voz-${item.producto.id}-${Date.now()}-${agregados}`,
            nombre: item.producto.marca ? `${item.producto.nombre} · ${item.producto.marca}` : item.producto.nombre,
            precio: Number(item.producto.precio),
          });
          agregados++;
        }
      }
      if (nuevos.length) {
        setItems(actual => [...actual, ...nuevos]);
        setReco({ estado: 'ok', texto: `${agregados} producto(s) por voz: "${r.texto}"` });
        setModoEntrada('recibido');
        beepScanner();
      } else {
        setReco({ estado: 'fail', texto: `No encontre productos en: "${r.texto || 'audio'}"` });
      }
    } catch (e: any) {
      setReco({ estado: 'fail', texto: 'Error voz: ' + e.message });
    } finally {
      setProcesando(false);
    }
  }

  async function toggleMicrofono() {
    if (grabando) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioChunksRef.current = [];
      const mimeType = preferredAudioMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        setGrabando(false);
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        void procesarAudio(blob);
      };
      recorder.start();
      setGrabando(true);
      setReco({ estado: 'analizando', texto: 'Grabando pedido...' });
    } catch (e: any) {
      setReco({ estado: 'fail', texto: 'No se pudo abrir microfono: ' + (e?.message || 'permiso denegado') });
    }
  }

  async function registrar() {
    if (total <= 0) return;
    await api.registrarVenta(total);
    setUltimaVenta(total);
    setItems([]);
    setRecibido('');
    setManualPrecio('');
    setModoEntrada('recibido');
    setReco(null);
    cargar();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Registro</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCameraOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold active:bg-emerald-700"
            aria-label="Abrir camara"
          >
            📷
          </button>
          <button
            onClick={toggleMicrofono}
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold ${grabando ? 'bg-red-500 text-white' : 'bg-sky-600 active:bg-sky-700'}`}
            aria-label="Microfono"
          >
            🎙
          </button>
          <button onClick={onLogout} className="h-10 rounded-lg bg-slate-800 px-3 text-sm text-slate-300 active:bg-slate-700">Salir</button>
        </div>
      </div>

      {cameraOpen && (
        <CamaraCaja
          procesando={procesando}
          onClose={() => setCameraOpen(false)}
          onCapture={reconocerDataUrl}
        />
      )}

      {reco && (
        <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
          reco.estado === 'ok' ? 'bg-green-900/40 text-green-300'
          : reco.estado === 'fail' ? 'bg-red-900/40 text-red-300'
          : 'bg-slate-700 text-slate-200'}`}>
          {reco.texto}
        </div>
      )}

      <div className="min-h-24 flex-1 overflow-y-auto rounded-xl bg-slate-800 p-2">
        {items.length === 0 ? (
          <div className="flex h-full min-h-20 items-center justify-center text-sm text-slate-400">
            Escanea productos
          </div>
        ) : items.map(item => (
          <div key={item.key} className="flex items-center gap-2 border-b border-slate-700/70 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{item.nombre}</div>
              {item.manual && <div className="text-xs text-amber-300">manual</div>}
            </div>
            <div className="text-sm font-bold text-green-300">S/. {item.precio.toFixed(2)}</div>
            <button onClick={() => quitarItem(item.key)} className="h-8 w-8 rounded-lg bg-slate-700 text-sm active:bg-slate-600">×</button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setModoEntrada('recibido')}
          className={`rounded-xl p-3 text-left ${modoEntrada === 'recibido' ? 'bg-sky-600' : 'bg-slate-800'}`}
        >
          <div className="text-xs text-slate-200/80">Recibido</div>
          <div className="text-2xl font-bold">S/. {recibido || '0'}</div>
        </button>
        <div className="rounded-xl bg-slate-800 p-3 text-right">
          <div className="text-xs text-slate-400">Total</div>
          <div className="text-2xl font-bold">S/. {total.toFixed(2)}</div>
        </div>
      </div>

      {vuelto !== null && total > 0 && (
        <div className={`rounded-xl p-3 text-center text-2xl font-bold ${vuelto < 0 ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}`}>
          {vuelto < 0 ? `Falta S/. ${Math.abs(vuelto).toFixed(2)}` : `Vuelto: S/. ${vuelto.toFixed(2)}`}
        </div>
      )}

      {modoEntrada === 'manual' && (
        <div className="rounded-xl border border-amber-500/60 bg-amber-950/30 p-3">
          <div className="mb-2 text-xs font-semibold text-amber-200">Precio manual</div>
          <div className="mb-3 rounded-lg bg-slate-900 px-3 py-2 text-right text-3xl font-bold">S/. {manualPrecio || '0'}</div>
          <button onClick={agregarManual} className="w-full rounded-lg bg-amber-500 py-3 font-bold text-slate-950 active:bg-amber-400">
            Agregar manual
          </button>
        </div>
      )}

      {mostrarTeclado && (
        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9','00','0','.'].map(k => (
            <button key={k} onClick={() => tecla(k)}
              className="min-h-12 rounded-lg bg-slate-700 py-3 text-2xl font-bold active:bg-slate-600">{k}</button>
          ))}
          <button onClick={() => tecla('←')} className="min-h-12 rounded-lg bg-slate-700 py-3 text-2xl active:bg-slate-600">←</button>
          <button onClick={registrar} disabled={total <= 0}
            className="col-span-2 min-h-12 rounded-lg bg-sky-500 py-3 text-xl font-bold disabled:opacity-40 active:bg-sky-600">
            Cobrar
          </button>
        </div>
      )}

      {!mostrarTeclado && (
        <button onClick={() => setCameraOpen(true)} className="rounded-xl bg-emerald-600 py-4 text-lg font-bold active:bg-emerald-700">
          Abrir camara
        </button>
      )}

      {ultimaVenta !== null && <NotaWhatsApp monto={ultimaVenta} onClose={() => setUltimaVenta(null)} />}
    </div>
  );
}

function CamaraCaja({ procesando, onClose, onCapture }: {
  procesando: boolean;
  onClose: () => void;
  onCapture: (foto: string) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!activo) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e: any) {
        setError(e?.message || 'No se pudo abrir la camara');
      }
    }
    iniciar();
    return () => {
      activo = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function capturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    const max = 1024;
    const escala = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    await onCapture(canvas.toDataURL('image/jpeg', 0.8));
  }

  return (
    <div className="rounded-xl border border-emerald-700 bg-slate-950 p-2">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full object-cover" />
        {procesando && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold">Analizando...</div>}
        {error && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-red-300">{error}</div>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={capturar} disabled={procesando || !!error} className="rounded-lg bg-emerald-600 py-3 font-bold disabled:opacity-40 active:bg-emerald-700">
          Capturar
        </button>
        <button onClick={onClose} className="rounded-lg bg-slate-700 py-3 font-bold active:bg-slate-600">
          Cerrar
        </button>
      </div>
    </div>
  );
}

function CajaOld({ onLogout }: { onLogout: () => void }) {
  const [monto, setMonto] = useState('');
  const [pagaCon, setPagaCon] = useState<number | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<number | null>(null);
  const [reco, setReco] = useState<{ estado: 'analizando' | 'ok' | 'fail'; texto: string } | null>(null);
  const [productoDetectado, setProductoDetectado] = useState<{ id: number; nombre: string; marca: string; precio: number } | null>(null);

  async function reconocer(file: File) {
    setReco({ estado: 'analizando', texto: 'Reconociendo producto...' });
    try {
      const foto = await reducirFoto(file);
      const r = await api.reconocerProducto(foto);
      if (r.encontrado) {
        setMonto(String(r.producto.precio));
        setPagaCon(null);
        setProductoDetectado(r.producto);
        setReco({ estado: 'ok', texto: `${r.producto.nombre} — S/. ${Number(r.producto.precio).toFixed(2)} (${r.confianza}%)` });
      } else {
        setProductoDetectado(null);
        setReco({ estado: 'fail', texto: 'No reconocido. Ingresa el monto a mano.' });
      }
    } catch (e: any) {
      const m = e?.data?.error === 'sin_productos' ? 'No tienes productos en inventario aun.' : ('Error: ' + e.message);
      setProductoDetectado(null);
      setReco({ estado: 'fail', texto: m });
    }
  }

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
    setUltimaVenta(v); setMonto(''); setPagaCon(null); setReco(null); cargar();
  }

  const montoNum = parseFloat(monto) || 0;
  const vuelto = pagaCon !== null ? pagaCon - montoNum : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Registro</h2>
        <div className="flex items-center gap-2">
          <label className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-lg font-bold active:bg-emerald-700">
            📷
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                if (e.target.files?.[0]) reconocer(e.target.files[0]);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <button onClick={onLogout} className="h-10 rounded-lg bg-slate-800 px-3 text-sm text-slate-300 active:bg-slate-700">Salir</button>
        </div>
      </div>

      {reco && (
        <div className={`rounded-lg px-3 py-2 text-center text-sm font-semibold ${
          reco.estado === 'ok' ? 'bg-green-900/40 text-green-300'
          : reco.estado === 'fail' ? 'bg-red-900/40 text-red-300'
          : 'bg-slate-700 text-slate-200'}`}>
          {reco.texto}
        </div>
      )}

      {/* Monto */}
      <div className="rounded-xl bg-slate-800 px-4 py-4 text-right text-5xl font-bold min-h-[76px]">
        {monto || '0'}
      </div>

      {productoDetectado && (
        <div className="rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-100">
          {productoDetectado.nombre}
          {productoDetectado.marca ? ` · ${productoDetectado.marca}` : ''}
          {' '}— S/. {Number(productoDetectado.precio).toFixed(2)}
        </div>
      )}

      {/* Vuelto: con cuanto paga el cliente */}
      {montoNum > 0 && (
        <div className="rounded-xl bg-slate-800 p-3 space-y-2">
          <div className="text-xs text-slate-400">Paga con:</div>
          <div className="grid grid-cols-4 gap-2">
            {[10, 20, 50, 100, 200].map(b => (
              <button key={b} onClick={() => setPagaCon(b)}
                className={`rounded-lg py-2 text-base font-bold ${pagaCon === b ? 'bg-sky-500' : 'bg-slate-700 active:bg-slate-600'}`}>
                {b}
              </button>
            ))}
            <button onClick={() => setPagaCon(montoNum)}
              className={`rounded-lg py-2 text-xs font-bold ${pagaCon === montoNum ? 'bg-sky-500' : 'bg-slate-700 active:bg-slate-600'}`}>
              Exacto
            </button>
          </div>
          {vuelto !== null && (
            <div className={`rounded-lg p-2 text-center text-xl font-bold ${vuelto < 0 ? 'bg-red-900/40 text-red-300' : 'bg-green-900/40 text-green-300'}`}>
              {vuelto < 0
                ? `Falta S/. ${Math.abs(vuelto).toFixed(2)}`
                : `Vuelto: S/. ${vuelto.toFixed(2)}`}
            </div>
          )}
        </div>
      )}

      {/* Teclado gigante */}
      <div className="grid flex-1 grid-cols-3 gap-2">
        {['1','2','3','4','5','6','7','8','9','00','0','.'].map(k => (
          <button key={k} onClick={() => tecla(k)}
            className="min-h-14 rounded-lg bg-slate-700 py-4 text-2xl font-bold active:bg-slate-600">{k}</button>
        ))}
        <button onClick={() => tecla('←')} className="min-h-14 rounded-lg bg-slate-700 py-4 text-2xl active:bg-slate-600">←</button>
        <button onClick={registrar} className="col-span-2 min-h-14 rounded-lg bg-sky-500 py-4 text-xl font-bold active:bg-sky-600">
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

  async function cargar() {
    try {
      setLista(await api.productos());
    } catch (e: any) {
      setMsg('Error inventario: ' + (e?.message || 'No se pudo conectar'));
    }
  }
  useEffect(() => { cargar(); }, []);

  async function leerFoto(file: File) {
    const foto = await reducirFoto(file);
    setForm(f => ({ ...f, foto }));
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
    try {
      await api.crearProducto({ ...form, precio });
      setForm({ nombre: '', marca: '', precio: '', color: '', tags: '', foto: '' });
      setMsg('Producto guardado'); cargar();
    } catch (e: any) {
      setMsg('Error al guardar: ' + (e?.message || 'No se pudo conectar'));
    }
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
