// Basit IndexedDB sarmalayıcı – tüm veriler cihazda kalır.
import type { PracticeEntry, SavedSet, Track } from '../types';

const DB_NAME = 'set-kocu';
const VERSION = 1;
type Store = 'tracks' | 'sets' | 'practice' | 'kv';

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of ['tracks', 'sets', 'practice']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve((r as IDBRequest | undefined)?.result as T);
    t.onerror = () => reject(t.error);
  }));
}

export const db = {
  all: <T>(store: 'tracks' | 'sets' | 'practice') => tx<T[]>(store, 'readonly', (s) => s.getAll()),
  put: (store: 'tracks' | 'sets' | 'practice', v: Track | SavedSet | PracticeEntry) => tx<void>(store, 'readwrite', (s) => { s.put(v); }),
  putMany: (store: 'tracks' | 'sets' | 'practice', vs: (Track | SavedSet | PracticeEntry)[]) => tx<void>(store, 'readwrite', (s) => { vs.forEach((v) => s.put(v)); }),
  del: (store: 'tracks' | 'sets' | 'practice', id: string) => tx<void>(store, 'readwrite', (s) => { s.delete(id); }),
  clear: (store: Store) => tx<void>(store, 'readwrite', (s) => { s.clear(); }),
  get: <T>(key: string) => tx<T | undefined>('kv', 'readonly', (s) => s.get(key)),
  set: (key: string, v: unknown) => tx<void>('kv', 'readwrite', (s) => { s.put(v, key); }),
};

export interface Backup { app: 'set-kocu'; version: 1; exportedAt: number; tracks: Track[]; sets: SavedSet[]; practice: PracticeEntry[] }

export async function exportBackup(): Promise<Backup> {
  const [tracks, sets, practice] = await Promise.all([db.all<Track>('tracks'), db.all<SavedSet>('sets'), db.all<PracticeEntry>('practice')]);
  return { app: 'set-kocu', version: 1, exportedAt: Date.now(), tracks, sets, practice };
}

/** Yedeği birleştirir: aynı id'li kayıtlarda yeni olan kazanır. */
export async function importBackup(b: Backup): Promise<void> {
  if (b.app !== 'set-kocu') throw new Error('Bu dosya Set Koçu yedeği değil.');
  await db.putMany('tracks', b.tracks ?? []);
  await db.putMany('sets', b.sets ?? []);
  await db.putMany('practice', b.practice ?? []);
}
