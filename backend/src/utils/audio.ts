function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Audio invalido');
  return { buffer: Buffer.from(match[2], 'base64'), mime: match[1] };
}

export async function transcribirAudio(audioDataUrl: string): Promise<{ proveedor: string; texto: string }> {
  const key = (process.env.GROQ_API_KEY || '').trim();
  if (!key) throw new Error('Groq no disponible: sin GROQ_API_KEY');

  const { buffer, mime } = dataUrlToBuffer(audioDataUrl);
  const form = new FormData();
  form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  form.append('language', 'es');
  form.append('temperature', '0');
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mime }), mime.includes('mp4') ? 'audio.mp4' : 'audio.webm');

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Groq STT HTTP ${r.status}`);
  return { proveedor: 'groq', texto: String(data.text || '').trim() };
}
