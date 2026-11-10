import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GenreId, PracticeEntry, SavedSet, Track } from './types';
import { db, exportBackup, importBackup, type Backup } from './storage/db';
import { AUDIO_RE, analyzeFile, trackFromFile, tracksFromRekordbox } from './analysis/importer';
import { normalizeEnergies } from './engine/order';
import { Library } from './ui/Library';
import { Planner } from './ui/Planner';
import { Practice } from './ui/Practice';
import { Learn } from './ui/Learn';

type Tab = 'library' | 'planner' | 'practice' | 'learn';
export interface RbPlaylistRef { name: string; trackIds: string[] }
export interface CurrentSet { trackIds: string[]; arc: string; name?: string }

export default function App() {
  const [tab, setTab] = useState<Tab>('library');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [practice, setPractice] = useState<PracticeEntry[]>([]);
  const [playlists, setPlaylists] = useState<RbPlaylistRef[]>([]);
  const [current, setCurrent] = useState<CurrentSet>({ trackIds: [], arc: 'party' });
  const [queue, setQueue] = useState<{ total: number; done: number; name?: string }>({ total: 0, done: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const files = useRef(new Map<string, File>());
  const pending = useRef<string[]>([]);
  const running = useRef(false);
  const tracksRef = useRef<Track[]>([]);
  tracksRef.current = tracks;

  useEffect(() => {
    (async () => {
      try {
        const [t, s, p, pl, cur, lastTab] = await Promise.all([
          db.all<Track>('tracks'), db.all<SavedSet>('sets'), db.all<PracticeEntry>('practice'),
          db.get<RbPlaylistRef[]>('playlists'), db.get<CurrentSet>('current'), db.get<Tab>('tab'),
        ]);
        // yarıda kalmış analizler: dosya bu oturumda yok
        setTracks(t.map((x) => (x.status === 'analyzing' || x.status === 'pending' ? { ...x, status: x.analysis ? 'done' : 'error', error: x.analysis ? undefined : 'Analiz yarıda kaldı – dosyayı tekrar ekle.' } : x)));
        setSets(s.sort((a, b) => b.updatedAt - a.updatedAt));
        setPractice(p);
        if (pl) setPlaylists(pl);
        if (cur) setCurrent(cur);
        if (lastTab) setTab(lastTab);
      } catch (e) {
        setToast('Veritabanı açılamadı: ' + e);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) db.set('current', current).catch(() => {}); }, [current, loaded]);
  useEffect(() => { if (loaded) db.set('tab', tab).catch(() => {}); }, [tab, loaded]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); } }, [toast]);

  const saveTracks = useCallback(async (next: Track[], changed?: Track[]) => {
    const norm = normalizeEnergies(next);
    setTracks(norm);
    const ids = changed ? new Set(changed.map((c) => c.id)) : null;
    await db.putMany('tracks', ids ? norm.filter((t) => ids.has(t.id)) : norm);
  }, []);

  const updateOne = useCallback((t: Track) => {
    const next = tracksRef.current.map((x) => (x.id === t.id ? t : x));
    if (!next.find((x) => x.id === t.id)) next.push(t);
    tracksRef.current = next;
    return saveTracks(next, t.status === 'done' ? next : [t]);
  }, [saveTracks]);

  const runQueue = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (pending.current.length) {
      const id = pending.current.shift()!;
      const file = files.current.get(id);
      const t = tracksRef.current.find((x) => x.id === id);
      if (!file || !t) continue;
      setQueue((q) => ({ ...q, name: t.title }));
      await updateOne({ ...t, status: 'analyzing' });
      try {
        const done = await analyzeFile(t, file);
        await updateOne(done);
      } catch (e) {
        await updateOne({ ...t, status: 'error', error: 'Bu dosya çözülemedi (format desteklenmiyor olabilir). ' + String(e).slice(0, 80) });
      }
      setQueue((q) => ({ ...q, done: q.done + 1 }));
    }
    running.current = false;
    setQueue({ total: 0, done: 0 });
  }, [updateOne]);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const arr = Array.from(list);
    const xmls = arr.filter((f) => /\.xml$/i.test(f.name));
    const audio = arr.filter((f) => AUDIO_RE.test(f.name) || f.type.startsWith('audio/'));
    let next = [...tracksRef.current];
    const byId = new Map(next.map((t) => [t.id, t]));
    for (const x of xmls) {
      try {
        const { tracks: rb, playlists: pls } = tracksFromRekordbox(await x.text());
        for (const r of rb) {
          const ex = byId.get(r.id);
          const merged: Track = ex ? { ...ex, metaBpm: r.metaBpm, metaKey: r.metaKey, genreTag: r.genreTag ?? ex.genreTag, genre: r.genreTag ? r.genre : ex.genre, genreSource: r.genreTag ? 'tag' : ex.genreSource, durationSec: ex.durationSec || r.durationSec } : r;
          byId.set(r.id, merged);
        }
        setPlaylists((old) => {
          const m = new Map(old.map((p) => [p.name, p]));
          pls.forEach((p) => m.set(p.name, p));
          const v = [...m.values()];
          db.set('playlists', v).catch(() => {});
          return v;
        });
        setToast(`rekordbox: ${rb.length} parça, ${pls.length} playlist içe aktarıldı.`);
      } catch (e) {
        setToast('rekordbox XML okunamadı: ' + e);
      }
    }
    const newIds: string[] = [];
    for (const f of audio) {
      const t = await trackFromFile(f, byId);
      byId.set(t.id, t);
      files.current.set(t.id, f);
      newIds.push(t.id);
    }
    next = [...byId.values()];
    tracksRef.current = next;
    await saveTracks(next);
    if (newIds.length) {
      pending.current.push(...newIds);
      setQueue((q) => ({ total: q.total + newIds.length, done: q.done }));
      runQueue();
    }
  }, [runQueue, saveTracks]);

  const removeTrack = useCallback(async (id: string) => {
    const next = tracksRef.current.filter((t) => t.id !== id);
    tracksRef.current = next;
    await db.del('tracks', id);
    await saveTracks(next);
    setCurrent((c) => ({ ...c, trackIds: c.trackIds.filter((x) => x !== id) }));
  }, [saveTracks]);

  const setGenre = useCallback((id: string, g: GenreId) => {
    const t = tracksRef.current.find((x) => x.id === id);
    if (t) updateOne({ ...t, genre: g, genreSource: 'tag' });
  }, [updateOne]);

  const clearAll = useCallback(async () => {
    if (!confirm('Kütüphanedeki tüm parçalar ve analizler silinsin mi? (Kayıtlı setler ve pratik geçmişi kalır)')) return;
    await db.clear('tracks');
    tracksRef.current = [];
    setTracks([]);
    setCurrent((c) => ({ ...c, trackIds: [] }));
  }, []);

  const doExport = useCallback(async () => {
    const b = await exportBackup();
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `set-kocu-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, []);

  const doImport = useCallback(async (f: File) => {
    try {
      const b = JSON.parse(await f.text()) as Backup;
      await importBackup(b);
      const [t, s, p] = await Promise.all([db.all<Track>('tracks'), db.all<SavedSet>('sets'), db.all<PracticeEntry>('practice')]);
      tracksRef.current = t;
      setTracks(normalizeEnergies(t)); setSets(s); setPractice(p);
      setToast(`Yedek yüklendi: ${b.tracks.length} parça, ${b.sets.length} set.`);
    } catch (e) { setToast('Yedek yüklenemedi: ' + e); }
  }, []);

  const saveSet = useCallback(async (name: string) => {
    const now = Date.now();
    const s: SavedSet = { id: 's' + now, name, trackIds: current.trackIds, arc: current.arc, createdAt: now, updatedAt: now };
    await db.put('sets', s);
    setSets((x) => [s, ...x]);
    setCurrent((c) => ({ ...c, name }));
    setToast(`“${name}” kaydedildi.`);
  }, [current]);

  const deleteSet = useCallback(async (id: string) => {
    await db.del('sets', id);
    setSets((x) => x.filter((s) => s.id !== id));
  }, []);

  const logPractice = useCallback(async (techniqueId: string, ok: boolean) => {
    const e: PracticeEntry = { id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), techniqueId, ok, at: Date.now() };
    await db.put('practice', e);
    setPractice((x) => [...x, e]);
  }, []);

  const byId = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><img src="./icon.svg" alt="" />Set Koçu</div>
        <nav className="tabs">
          {([['library', 'Kütüphane'], ['planner', 'Set Planla'], ['practice', 'Pratik'], ['learn', 'Öğren']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} className={'tab' + (tab === id ? ' active' : '')} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      </div>

      {tab === 'library' && (
        <Library tracks={tracks} onFiles={addFiles} onRemove={removeTrack} onGenre={setGenre} onClear={clearAll} onExport={doExport} onImport={doImport}
          onPlan={(ids) => { setCurrent((c) => ({ ...c, trackIds: ids })); setTab('planner'); }} />
      )}
      {tab === 'planner' && (
        <Planner tracks={tracks} byId={byId} current={current} setCurrent={setCurrent} playlists={playlists} sets={sets}
          onSave={saveSet} onDeleteSet={deleteSet} onPractice={() => setTab('practice')} />
      )}
      {tab === 'practice' && <Practice tracks={tracks} byId={byId} current={current} practice={practice} onLog={logPractice} />}
      {tab === 'learn' && <Learn />}

      {(queue.total > 0 || toast) && (
        <div className="statusbar">
          <div className="inner">
            {queue.total > 0 && (
              <>
                <div className="small" style={{ whiteSpace: 'nowrap' }}>Analiz: {queue.done}/{queue.total}</div>
                <div className="grow"><div className="bar"><div style={{ width: `${(queue.done / queue.total) * 100}%` }} /></div></div>
                <div className="small muted ellipsis hide-sm" style={{ maxWidth: 320 }}>{queue.name}</div>
              </>
            )}
            {toast && <div className="small">{toast}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
