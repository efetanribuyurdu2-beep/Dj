import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultArc, defaultCurveballs, scenarioById } from '../sim/scenarios';
import { newSeed } from '../sim/rng';
import type { RoomConfig } from '../sim/types';
import { loadStore, mergeSessions, saveStore, type KV } from './persistence';
import type { Session, Settings, StoreData } from './schema';
import { VENUES } from '../sim/content';

function uid(): string {
  return `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function sessionFromScenario(id: string): Session | null {
  const sc = scenarioById(id);
  if (!sc) return null;
  const now = Date.now();
  return {
    id: uid(),
    name: sc.title,
    scenarioId: sc.id,
    room: structuredClone(sc.room),
    arc: structuredClone(sc.arc),
    curveballs: structuredClone(sc.curveballs),
    seed: sc.seed,
    events: [],
    cursor: 0,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

export function customSession(room: RoomConfig): Session {
  const now = Date.now();
  return {
    id: uid(),
    name: `${VENUES[room.venue].name} · ${room.people} kişi`,
    scenarioId: null,
    room,
    arc: defaultArc(room),
    curveballs: defaultCurveballs(room),
    seed: newSeed(),
    events: [],
    cursor: 0,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

interface StoreApi {
  data: StoreData;
  notice: string | null;
  dismissNotice(): void;
  persistent: boolean;
  get(id: string): Session | undefined;
  add(s: Session): void;
  update(id: string, patch: Partial<Session> | ((s: Session) => Partial<Session>)): void;
  remove(id: string): void;
  setActive(id: string | null): void;
  setSettings(p: Partial<Settings>): void;
  importSessions(list: Session[]): { added: number; updated: number };
}

const Ctx = createContext<StoreApi | null>(null);

export function StoreProvider({ children, kv }: { children: ReactNode; kv?: KV }) {
  const initial = useMemo(() => loadStore(kv), [kv]);
  const [data, setData] = useState<StoreData>(initial.data);
  const [notice, setNotice] = useState<string | null>(initial.notice ?? null);
  const [persistent, setPersistent] = useState(true);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const ok = saveStore(data, kv);
    setPersistent(ok);
  }, [data, kv]);

  const update = useCallback<StoreApi['update']>((id, patch) => {
    setData((d) => ({
      ...d,
      sessions: d.sessions.map((s) => {
        if (s.id !== id) return s;
        const p = typeof patch === 'function' ? patch(s) : patch;
        return { ...s, ...p, updatedAt: Date.now() };
      }),
    }));
  }, []);

  const api: StoreApi = {
    data,
    notice,
    dismissNotice: () => setNotice(null),
    persistent,
    get: (id) => data.sessions.find((s) => s.id === id),
    add: (s) => setData((d) => ({ ...d, sessions: [s, ...d.sessions], activeId: s.id })),
    update,
    remove: (id) =>
      setData((d) => ({
        ...d,
        sessions: d.sessions.filter((s) => s.id !== id),
        activeId: d.activeId === id ? null : d.activeId,
      })),
    setActive: (id) => setData((d) => (d.activeId === id ? d : { ...d, activeId: id })),
    setSettings: (p) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } })),
    importSessions: (list) => {
      const r = mergeSessions(data.sessions, list);
      setData((d) => ({ ...d, sessions: mergeSessions(d.sessions, list).sessions }));
      return { added: r.added, updated: r.updated };
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
