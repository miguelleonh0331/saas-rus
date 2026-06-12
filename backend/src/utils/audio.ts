function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Audio invalido');
  return { buffer: Buffer.from(match[2], 'base64'), mime: match[1] };
}

function audioFilename(mime: string): string {
  if (mime.includes('webm')) return 'audio.webm';
  if (mime.includes('mp4')) return 'audio.mp4';
  if (mime.includes('mpeg')) return 'audio.mp3';
  if (mime.includes('mp3')) return 'audio.mp3';
  if (mime.includes('ogg')) return 'audio.ogg';
  if (mime.includes('wav')) return 'audio.wav';
  return 'audio.webm';
}

export async function transcribirAudio(audioDataUrl: string): Promise<{ proveedor: string; texto: string }> {
  const key = (process.env.GROQ_API_KEY || '').trim();
  if (!key) throw new Error('Groq no disponible: sin GROQ_API_KEY');

  const { buffer, mime } = dataUrlToBuffer(audioDataUrl);
  const form = new FormData();
  form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  form.append('language', 'es');
  form.append('temperature', '0');
  const safeMime = mime === 'application/octet-stream' ? 'audio/webm' : mime;
  form.append('file', new Blob([new Uint8Array(buffer)], { type: safeMime }), audioFilename(safeMime));

  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || `Groq STT HTTP ${r.status}`);
  return { proveedor: 'groq', texto: String(data.text || '').trim() };
}
