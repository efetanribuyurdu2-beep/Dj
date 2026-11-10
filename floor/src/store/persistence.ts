import { EXPORT_APP, exportSchema, sessionSchema, settingsSchema, STORE_VERSION, type Session, type StoreData } from './schema';

export const STORAGE_KEY = 'floor.store';
export const BACKUP_KEY = 'floor.store.backup';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const DEFAULT_SETTINGS: StoreData['settings'] = { sound: false, speed: 1 };

export function emptyStore(): StoreData {
  return { version: STORE_VERSION, sessions: [], activeId: null, settings: { ...DEFAULT_SETTINGS } };
}

export interface LoadResult {
  data: StoreData;
  /** human readable note when something had to be repaired */
  notice?: string;
}

function safeStorage(kv?: KV): KV | null {
  try {
    if (kv) return kv;
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Load and repair saved data. Never throws: unreadable data is backed up and
 * the app starts with whatever could be salvaged.
 */
export function loadStore(kv?: KV): LoadResult {
  const store = safeStorage(kv);
  if (!store) return { data: emptyStore() };
  let raw: string | null = null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { data: emptyStore(), notice: 'Tarayıcı depolamasına erişilemiyor; oturumlar bu sekme kapanınca kaybolur.' };
  }
  if (!raw) return { data: emptyStore() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    backup(store, raw);
    return { data: emptyStore(), notice: 'Kayıtlı veri okunamadı. Eski hâli yedeklendi, temiz bir başlangıç yapıldı.' };
  }
  return migrate(parsed, store, raw);
}

function backup(store: KV, raw: string) {
  try {
    store.setItem(BACKUP_KEY, raw);
  } catch {
    /* ignore */
  }
}

function migrate(input: unknown, store: KV, raw: string): LoadResult {
  if (!input || typeof input !== 'object') {
    backup(store, raw);
    return { data: emptyStore(), notice: 'Kayıtlı veri tanınmadı; yedeklendi.' };
  }
  const obj = input as Record<string, unknown>;
  const version = typeof obj.version === 'number' ? obj.version : 0;
  if (version > STORE_VERSION) {
    backup(store, raw);
    return { data: emptyStore(), notice: 'Kayıt, uygulamanın daha yeni bir sürümüyle yapılmış. Veri yedeklendi; bu sürümde açılamıyor.' };
  }
  // v0 (pre-release) had no settings and no version – sessions are salvaged one by one.
  const rawSessions = Array.isArray(obj.sessions) ? obj.sessions : [];
  const sessions: Session[] = [];
  let dropped = 0;
  for (const s of rawSessions) {
    const r = sessionSchema.safeParse(s);
    if (r.success) sessions.push(r.data as Session);
    else dropped++;
  }
  const settings = settingsSchema.safeParse(obj.settings);
  const activeId = typeof obj.activeId === 'string' && sessions.some((s) => s.id === obj.activeId) ? obj.activeId : null;
  const data: StoreData = {
    version: STORE_VERSION,
    sessions,
    activeId,
    settings: settings.success ? settings.data : { ...DEFAULT_SETTINGS },
  };
  if (dropped > 0) {
    backup(store, raw);
    return { data, notice: `${dropped} bozuk oturum kaydı açılamadı ve atlandı. Ham veri yedeklendi.` };
  }
  return { data };
}

export function saveStore(data: StoreData, kv?: KV): boolean {
  const store = safeStorage(kv);
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function exportSessions(sessions: Session[]): string {
  return JSON.stringify(
    { app: EXPORT_APP, version: STORE_VERSION, exportedAt: new Date().toISOString(), sessions },
    null,
    2,
  );
}

export type ImportResult = { ok: true; sessions: Session[] } | { ok: false; error: string };

export function parseImport(text: string): ImportResult {
  if (text.length > 5_000_000) return { ok: false, error: 'Dosya çok büyük (5 MB sınırı).' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Dosya geçerli bir JSON değil.' };
  }
  if (!json || typeof json !== 'object' || (json as { app?: unknown }).app !== EXPORT_APP) {
    return { ok: false, error: 'Bu dosya bir FLOOR dışa aktarımı değil.' };
  }
  const r = exportSchema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    return { ok: false, error: `Dosya doğrulanamadı: ${first ? first.path.join('.') || 'kök' : 'bilinmeyen alan'} hatalı.` };
  }
  return { ok: true, sessions: r.data.sessions as Session[] };
}

/** Merge imported sessions: same id → keep the more recently updated one. */
export function mergeSessions(existing: Session[], incoming: Session[]): { sessions: Session[]; added: number; updated: number } {
  const map = new Map(existing.map((s) => [s.id, s]));
  let added = 0;
  let updated = 0;
  for (const s of incoming) {
    const cur = map.get(s.id);
    if (!cur) {
      map.set(s.id, s);
      added++;
    } else if (s.updatedAt > cur.updatedAt) {
      map.set(s.id, s);
      updated++;
    }
  }
  return { sessions: [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt), added, updated };
}
