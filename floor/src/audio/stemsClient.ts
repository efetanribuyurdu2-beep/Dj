// Talks to the local stem-separation helper (floor/stems-helper/server.py).
import { STEMS, type StemName } from './mixer';

export const HELPER_KEY = 'floor.stems.url';
export const DEFAULT_HELPER = 'http://127.0.0.1:7777';

export function helperUrl(): string {
  try {
    return localStorage.getItem(HELPER_KEY) || DEFAULT_HELPER;
  } catch {
    return DEFAULT_HELPER;
  }
}
export function setHelperUrl(u: string) {
  try {
    localStorage.setItem(HELPER_KEY, u);
  } catch {
    /* ignore */
  }
}

export interface Health {
  ok: boolean;
  model: string;
  device: string;
  fake: boolean;
  version: string;
}

export async function health(base = helperUrl()): Promise<Health> {
  const r = await fetch(`${base}/health`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Yardımcı yanıt vermedi (${r.status})`);
  return (await r.json()) as Health;
}

export interface Job {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number; // 0–100
  error?: string;
  stems?: string[];
}

export async function separate(
  file: Blob,
  name: string,
  onProgress: (j: Job) => void,
  signal?: AbortSignal,
  base = helperUrl(),
): Promise<{ blobs: Record<StemName, Blob>; model: string; fake: boolean }> {
  const h = await health(base);
  const r = await fetch(`${base}/separate`, {
    method: 'POST',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(name) },
    signal,
  });
  if (!r.ok) throw new Error((await r.text()) || `Yükleme başarısız (${r.status})`);
  let job = (await r.json()) as Job;
  onProgress(job);
  while (job.status === 'queued' || job.status === 'running') {
    await new Promise((res) => setTimeout(res, 1000));
    if (signal?.aborted) {
      await fetch(`${base}/jobs/${job.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw new DOMException('İptal edildi', 'AbortError');
    }
    const s = await fetch(`${base}/jobs/${job.id}`, { cache: 'no-store', signal });
    if (!s.ok) throw new Error(`İş durumu alınamadı (${s.status})`);
    job = (await s.json()) as Job;
    onProgress(job);
  }
  if (job.status === 'error') throw new Error(job.error || 'Ayırma başarısız');
  const blobs = {} as Record<StemName, Blob>;
  for (const s of STEMS) {
    const d = await fetch(`${base}/jobs/${job.id}/${s}.wav`, { signal });
    if (!d.ok) throw new Error(`${s} stem'i indirilemedi`);
    blobs[s] = await d.blob();
  }
  await fetch(`${base}/jobs/${job.id}`, { method: 'DELETE' }).catch(() => undefined);
  return { blobs, model: h.model, fake: h.fake };
}
