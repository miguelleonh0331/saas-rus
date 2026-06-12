import { Capacitor } from '@capacitor/core';

const PROD_API = 'https://tiendas.prosegin.com/api';
const BASE = import.meta.env.VITE_API_URL || (Capacitor.isNativePlatform() ? PROD_API : '/api');

let token: string | null = localStorage.getItem('token');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('token', t);
  else localStorage.removeItem('token');
}
export function getToken() { return token; }

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error'), { status: res.status, data });
  return data;
}

export const api = {
  login: (celular: string, password: string) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify({ celular: celular.replace(/\D/g, ''), password }) }),
  registrarVenta: (monto: number) =>
    req('/ventas', { method: 'POST', body: JSON.stringify({ monto }) }),
  resumen: () => req('/ventas/resumen'),
  historial: () => req('/ventas'),
  eliminarVenta: (id: number) => req(`/ventas/${id}`, { method: 'DELETE' }),
  suscripcion: () => req('/suscripcion'),

  // Inventario
  productos: () => req('/productos'),
  crearProducto: (p: any) => req('/productos', { method: 'POST', body: JSON.stringify(p) }),
  eliminarProducto: (id: number) => req(`/productos/${id}`, { method: 'DELETE' }),
  analizarFoto: (fotos: string[]) =>
    req('/productos/analizar', { method: 'POST', body: JSON.stringify({ fotos }) }),
  reconocerProducto: (foto: string) =>
    req('/productos/reconocer', { method: 'POST', body: JSON.stringify({ foto }) }),
  interpretarVoz: (audio: string) =>
    req('/productos/voz', { method: 'POST', body: JSON.stringify({ audio }) }),
};
