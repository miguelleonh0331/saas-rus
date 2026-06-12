// Cliente de vision con respaldo: Groq primero, OpenRouter si falla.
// Las claves se leen del entorno (.env). Si no hay claves, la funcion avisa.

interface Provider {
  nombre: string;
  url: string;
  key: string;
  model: string;
  headers: Record<string, string>;
}

function providers(): Provider[] {
  return [
    {
      nombre: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: (process.env.GROQ_API_KEY || '').trim(),
      model: process.env.GROQ_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
      headers: {},
    },
    {
      nombre: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: (process.env.OPENROUTER_API_KEY || '').trim(),
      model: process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
      headers: { 'HTTP-Referer': 'https://tiendas.prosegin.com', 'X-Title': 'SaaS RUS' },
    },
  ];
}

// Envia un prompt + imagenes y devuelve el texto del modelo (con fallback).
export async function visionChat(prompt: string, imagenes: string[]): Promise<{ proveedor: string; texto: string }> {
  const content: any[] = [{ type: 'text', text: prompt }];
  for (const img of imagenes) content.push({ type: 'image_url', image_url: { url: img } });
  const messages = [{ role: 'user', content }];

  const errores: string[] = [];
  for (const p of providers()) {
    if (!p.key) { errores.push(`${p.nombre}: sin API key`); continue; }
    try {
      const r = await fetch(p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json', ...p.headers },
        body: JSON.stringify({ model: p.model, temperature: 0, messages }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
      return { proveedor: p.nombre, texto: data.choices?.[0]?.message?.content ?? '' };
    } catch (e) {
      errores.push(`${p.nombre}: ${(e as Error).message}`);
    }
  }
  throw new Error('Vision no disponible: ' + errores.join(' | '));
}

// Extrae el primer bloque JSON de un texto.
export function extraerJSON(texto: string): any | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
