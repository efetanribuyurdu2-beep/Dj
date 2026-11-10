// Local track library in IndexedDB. Files never leave this browser.
import type { TrackAnalysis } from './analysis';
import { STEMS, type StemName } from './mixer';

export interface TrackMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  addedAt: number;
  analysis?: TrackAnalysis;
  analysisError?: string;
  stems?: { model: string; fake: boolean; createdAt: number };
}

const DB = 'floor-deck';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

let dbp: Promise<IDBDatabase> | null = null;
const db = () => (dbp ??= open());

function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(stores, mode);
        const req = fn(t);
        t.oncomplete = () => res(req ? req.result : (undefined as T));
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error ?? new Error('İşlem iptal edildi (depolama dolu olabilir).'));
      }),
  );
}

export const ACCEPT = '.mp3,.wav,.aif,.aiff,.flac,.m4a,.ogg,audio/*';

export function isAudioFile(f: File): boolean {
  return f.type.startsWith('audio/') || /\.(mp3|wav|aiff?|flac|m4a|ogg)$/i.test(f.name);
}

export async function listTracks(): Promise<TrackMeta[]> {
  const all = await tx<TrackMeta[]>(['tracks'], 'readonly', (t) => t.objectStore('tracks').getAll());
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function addTrack(file: File): Promise<TrackMeta> {
  const meta: TrackMeta = {
    id: `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: file.name.replace(/\.[^.]+$/, ''),
    size: file.size,
    type: file.type || 'audio',
    addedAt: Date.now(),
  };
  await tx(['tracks', 'blobs'], 'readwrite', (t) => {
    t.objectStore('blobs').put(file, meta.id);
    t.objectStore('tracks').put(meta);
  });
  return meta;
}

export async function updateTrack(meta: TrackMeta): Promise<void> {
  await tx(['tracks'], 'readwrite', (t) => void t.objectStore('tracks').put(meta));
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>(['blobs'], 'readonly', (t) => t.objectStore('blobs').get(key));
}

export const stemKey = (id: string, s: StemName) => `${id}:${s}`;

export async function saveStems(meta: TrackMeta, blobs: Record<StemName, Blob>, model: string, fake: boolean): Promise<TrackMeta> {
  const next = { ...meta, stems: { model, fake, createdAt: Date.now() } };
  await tx(['tracks', 'blobs'], 'readwrite', (t) => {
    for (const s of STEMS) t.objectStore('blobs').put(blobs[s], stemKey(meta.id, s));
    t.objectStore('tracks').put(next);
  });
  return next;
}

export async function deleteStems(meta: TrackMeta): Promise<TrackMeta> {
  const next = { ...meta, stems: undefined };
  await tx(['tracks', 'blobs'], 'readwrite', (t) => {
    for (const s of STEMS) t.objectStore('blobs').delete(stemKey(meta.id, s));
    t.objectStore('tracks').put(next);
  });
  return next;
}

export async function deleteTrack(id: string): Promise<void> {
  await tx(['tracks', 'blobs'], 'readwrite', (t) => {
    t.objectStore('tracks').delete(id);
    t.objectStore('blobs').delete(id);
    for (const s of STEMS) t.objectStore('blobs').delete(stemKey(id, s));
  });
}

export async function storageInfo(): Promise<{ used: number; quota: number; persisted: boolean } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return { used: e.usage ?? 0, quota: e.quota ?? 0, persisted };
  } catch {
    return null;
  }
}

export async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
