import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, emptyStore, exportSessions, loadStore, mergeSessions, parseImport, saveStore, STORAGE_KEY, type KV } from '../src/store/persistence';
import { sessionFromScenario } from '../src/store/store';
import type { Session } from '../src/store/schema';

function memKV(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

const session = (): Session => {
  const s = sessionFromScenario('sunset')!;
  s.events = [{ type: 'move', minute: 0, move: 'groove' }];
  s.cursor = 3;
  s.status = 'rehearsing';
  return s;
};

describe('local persistence', () => {
  it('round-trips through storage (survives a reload)', () => {
    const kv = memKV();
    const data: ReturnType<typeof emptyStore> = { ...emptyStore(), sessions: [session()] };
    data.activeId = data.sessions[0].id;
    expect(saveStore(data, kv)).toBe(true);
    const loaded = loadStore(kv);
    expect(loaded.notice).toBeUndefined();
    expect(loaded.data).toEqual(data);
  });

  it('corrupt JSON does not crash: empty store, notice, raw backup', () => {
    const kv = memKV({ [STORAGE_KEY]: '{not json' });
    const r = loadStore(kv);
    expect(r.data.sessions).toEqual([]);
    expect(r.notice).toBeTruthy();
    expect(kv.data[BACKUP_KEY]).toBe('{not json');
  });

  it('salvages valid sessions and drops broken ones', () => {
    const good = session();
    const bad = { ...session(), id: 'x', room: { venue: 'moon' } };
    const kv = memKV({ [STORAGE_KEY]: JSON.stringify({ version: 1, sessions: [good, bad], activeId: 'x', settings: { sound: true, speed: 9 } }) });
    const r = loadStore(kv);
    expect(r.data.sessions.map((s) => s.id)).toEqual([good.id]);
    expect(r.data.activeId).toBeNull();
    expect(r.data.settings).toEqual({ sound: false, speed: 1 });
    expect(r.notice).toContain('1 bozuk');
  });

  it('migrates an unversioned (v0) store', () => {
    const kv = memKV({ [STORAGE_KEY]: JSON.stringify({ sessions: [session()] }) });
    const r = loadStore(kv);
    expect(r.data.version).toBe(1);
    expect(r.data.sessions).toHaveLength(1);
  });

  it('refuses data from a newer app version without destroying it', () => {
    const raw = JSON.stringify({ version: 99, sessions: [] });
    const kv = memKV({ [STORAGE_KEY]: raw });
    const r = loadStore(kv);
    expect(r.notice).toContain('daha yeni');
    expect(kv.data[BACKUP_KEY]).toBe(raw);
  });
});

describe('JSON export / import', () => {
  it('exports and re-imports the same sessions', () => {
    const s = [session()];
    const r = parseImport(exportSessions(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.sessions).toEqual(s);
  });

  it('rejects invalid files with a readable reason', () => {
    expect(parseImport('hello')).toEqual({ ok: false, error: 'Dosya geçerli bir JSON değil.' });
    expect(parseImport('{"app":"other"}').ok).toBe(false);
    const broken = JSON.parse(exportSessions([session()]));
    broken.sessions[0].events[0].move = 'teleport';
    const r = parseImport(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('sessions.0.events.0');
  });

  it('merge keeps the most recently updated copy', () => {
    const a = session();
    const older = { ...a, name: 'old', updatedAt: a.updatedAt - 1000 };
    const newer = { ...a, name: 'new', updatedAt: a.updatedAt + 1000 };
    expect(mergeSessions([a], [older])).toMatchObject({ added: 0, updated: 0 });
    const m = mergeSessions([a], [newer, { ...session(), id: 'other' }]);
    expect(m.added).toBe(1);
    expect(m.updated).toBe(1);
    expect(m.sessions.find((s) => s.id === a.id)!.name).toBe('new');
  });
});
