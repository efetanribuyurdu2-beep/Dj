import { useMemo, useState } from 'react';
import type { SavedSet, Track } from '../types';
import type { CurrentSet, RbPlaylistRef } from '../App';
import { ARCS, ARC_BY_ID } from '../knowledge/playbook';
import { TECH_BY_ID } from '../knowledge/techniques';
import { autoOrder, reviewSet } from '../engine/order';
import { fmt, pairScore, view } from '../engine/transition';
import { Energy, EnergyChart, GenreChip, Grade, KeyBadge } from './common';
import { TransitionDetail } from './TransitionDetail';

interface Props {
  tracks: Track[];
  byId: Map<string, Track>;
  current: CurrentSet;
  setCurrent: (f: (c: CurrentSet) => CurrentSet) => void;
  playlists: RbPlaylistRef[];
  sets: SavedSet[];
  onSave: (name: string) => void;
  onDeleteSet: (id: string) => void;
  onPractice: () => void;
}

export function Planner({ tracks, byId, current, setCurrent, playlists, sets, onSave, onDeleteSet, onPractice }: Props) {
  const [length, setLength] = useState<number | ''>('');
  const [startId, setStartId] = useState('');
  const [detail, setDetail] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [pool, setPool] = useState<string[] | null>(null); // otomatik sıralamada kullanılacak havuz

  const setTracks = useMemo(() => current.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t), [current.trackIds, byId]);
  const review = useMemo(() => reviewSet(setTracks, current.arc), [setTracks, current.arc]);
  const arc = ARC_BY_ID[current.arc] ?? ARCS[0];

  const setIds = (ids: string[]) => setCurrent((c) => ({ ...c, trackIds: ids }));
  const move = (i: number, d: number) => {
    const ids = [...current.trackIds];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setIds(ids);
  };

  const runAuto = () => {
    const src = (pool ?? current.trackIds).map((id) => byId.get(id)).filter((t): t is Track => !!t);
    const base = src.length >= 2 ? src : tracks;
    if (base.length < 2) return;
    setBusy(true);
    setTimeout(() => {
      const ordered = autoOrder(base, { arc: current.arc, length: length ? Number(length) : undefined, startId: startId || undefined });
      if (!pool) setPool(base.map((t) => t.id));
      setIds(ordered.map((t) => t.id));
      setBusy(false);
    }, 20);
  };

  const suggestions = useMemo(() => {
    const last = setTracks[setTracks.length - 1];
    if (!last) return [];
    const inSet = new Set(current.trackIds);
    return tracks.filter((t) => !inSet.has(t.id)).map((t) => ({ t, s: pairScore(last, t) })).sort((a, b) => b.s - a.s).slice(0, 5);
  }, [setTracks, tracks, current.trackIds]);

  const loadIds = (ids: string[], arcId?: string, n?: string) => { setPool(null); setCurrent((c) => ({ trackIds: ids.filter((id) => byId.has(id)), arc: arcId ?? c.arc, name: n })); };

  // Her parçanın sette ne zaman çalınacağı
  const timeline = useMemo(() => {
    let t = 0;
    return setTracks.map((tr, i) => {
      const v = view(tr);
      const startAt = i === 0 ? v.mixInSec : review.plans[i - 1].cueB;
      const endAt = i < review.plans.length ? review.plans[i].startInA : v.durationSec;
      const at = t;
      t += Math.max(30, endAt - startAt);
      return at;
    });
  }, [setTracks, review]);

  if (tracks.length < 2) return <div className="card empty">Set kurmak için önce Kütüphane’ye en az 2 parça ekle.</div>;

  return (
    <>
      <div className="card">
        <h2>Set ayarları</h2>
        <div className="row">
          <label className="small muted">Kaynak</label>
          <select className="input" value="" onChange={(e) => {
            const v = e.target.value;
            if (v === 'all') loadIds(tracks.map((t) => t.id));
            else if (v.startsWith('pl:')) { const p = playlists[Number(v.slice(3))]; loadIds(p.trackIds, undefined, p.name); }
            else if (v.startsWith('set:')) { const s = sets.find((x) => x.id === v.slice(4)); if (s) loadIds(s.trackIds, s.arc, s.name); }
          }}>
            <option value="">{current.name ? `Şu an: ${current.name}` : `Şu an: ${setTracks.length} parça`} — değiştir…</option>
            <option value="all">Tüm kütüphane ({tracks.length})</option>
            {playlists.length > 0 && <optgroup label="rekordbox playlist’leri">{playlists.map((p, i) => <option key={i} value={'pl:' + i}>{p.name} ({p.trackIds.length})</option>)}</optgroup>}
            {sets.length > 0 && <optgroup label="Kayıtlı setlerim">{sets.map((s) => <option key={s.id} value={'set:' + s.id}>{s.name} ({s.trackIds.length})</option>)}</optgroup>}
          </select>
          <label className="small muted">Kurgu</label>
          <select className="input" value={current.arc} onChange={(e) => setCurrent((c) => ({ ...c, arc: e.target.value }))}>
            {ARCS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <label className="small muted">Parça sayısı</label>
          <input className="input" style={{ width: 80 }} type="number" min={2} placeholder="hepsi" value={length} onChange={(e) => setLength(e.target.value ? Number(e.target.value) : '')} />
          <label className="small muted">İlk parça</label>
          <select className="input" style={{ maxWidth: 220 }} value={startId} onChange={(e) => setStartId(e.target.value)}>
            <option value="">Otomatik</option>
            {(pool ?? current.trackIds).map((id) => byId.get(id)).filter(Boolean).map((t) => <option key={t!.id} value={t!.id}>{t!.title}</option>)}
          </select>
          <button className="btn primary" onClick={runAuto} disabled={busy}>{busy ? 'Sıralanıyor…' : '✨ Otomatik sırala'}</button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>{arc.description} Kendi sıranı da kullanabilirsin: uygulama mevcut sırayı her zaman puanlar ve zayıf geçişleri gösterir.</p>
      </div>

      {setTracks.length >= 2 && (
        <div className="grid2">
          <div className="card">
            <div className="row" style={{ marginBottom: 8 }}>
              <Grade g={review.grade} />
              <div className="grow">
                <div style={{ fontWeight: 800 }}>Set puanı: %{Math.round(review.average * 100)}</div>
                <div className="small muted">{setTracks.length} parça · ~{Math.round(review.totalMinutes)} dk{review.arcFit !== null ? ` · kurguya uyum %${Math.round(review.arcFit * 100)}` : ''}</div>
              </div>
            </div>
            <div className="row small" style={{ gap: 6 }}>
              {Object.entries(review.techniqueCounts).map(([id, n]) => <span key={id} className="chip">{TECH_BY_ID[id].name} ×{n}</span>)}
            </div>
            {review.weakest.length > 0 ? (
              <div className="warn" style={{ marginTop: 10 }}>
                {review.weakest.length} zayıf geçiş var: {review.weakest.slice(0, 4).map((i) => `${i + 1}→${i + 2}`).join(', ')}. “Otomatik sırala”yı dene veya bu geçişlerdeki teknik önerisine bak.
              </div>
            ) : <div className="info" style={{ marginTop: 10 }}>Zayıf geçiş yok. Şimdi bu seti baştan sona çalmayı dene!</div>}
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input grow" placeholder="Set adı (ör. Cuma evde pratik)" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn" disabled={!name.trim()} onClick={() => { onSave(name.trim()); setName(''); }}>Kaydet</button>
              <button className="btn" onClick={onPractice}>Bu seti çalış →</button>
            </div>
          </div>
          <div className="card">
            <h3>Enerji akışı</h3>
            <EnergyChart tracks={setTracks} target={arc.curve} />
            <div className="small muted">Mor çizgi setin enerjisi, kesikli çizgi seçilen kurgunun hedefi. Noktaların rengi türü gösterir.</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Set akışı</h2>
        {setTracks.length === 0 && <div className="empty">Set boş. Kaynak seçip “Otomatik sırala”ya bas.</div>}
        <div className="set-list">
          {setTracks.map((t, i) => {
            const v = view(t);
            const p = review.plans[i];
            return (
              <div key={t.id + i}>
                <div className="set-track">
                  <span className="idx">{i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontWeight: 700 }}>{t.title}</div>
                    <div className="small muted ellipsis">{t.artist} · sette {fmt(timeline[i] ?? 0)}</div>
                  </div>
                  <span className="hide-sm"><GenreChip g={t.genre} /></span>
                  <span className="num small" style={{ width: 54, textAlign: 'right' }}>{v.bpm ?? '–'}</span>
                  <KeyBadge code={v.camelot} />
                  <span className="hide-sm"><Energy v={v.energy} /></span>
                  <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <button className="btn small ghost" onClick={() => move(i, -1)} aria-label="Yukarı">↑</button>
                    <button className="btn small ghost" onClick={() => move(i, 1)} aria-label="Aşağı">↓</button>
                    <button className="btn small ghost" onClick={() => setIds(current.trackIds.filter((_, k) => k !== i))} aria-label="Çıkar">✕</button>
                  </div>
                </div>
                {p && (
                  <div className="transition">
                    <button className="transition-btn" onClick={() => setDetail(i)}>
                      <Grade g={p.grade} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{TECH_BY_ID[p.technique].name} <span className="muted small">· A’nın {fmt(p.startInA)}’inde başla</span></div>
                        <div className="small muted ellipsis">
                          {p.bpm ? `BPM %${Math.abs(p.bpm.diffPct).toFixed(1)}` : 'BPM ?'} · {p.key.label} · enerji {p.energyDelta >= 0 ? '+' : ''}{p.energyDelta}
                          {p.warnings.length > 0 && <span style={{ color: 'var(--ok)' }}> · ⚠ {p.warnings.length}</span>}
                        </div>
                      </div>
                      <span className="small" style={{ color: 'var(--accent2)', whiteSpace: 'nowrap' }}>Adımlar →</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {suggestions.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <h3>Sona eklemek için en uyumlu parçalar</h3>
            <div className="row">
              {suggestions.map(({ t, s }) => (
                <button key={t.id} className="btn small" onClick={() => setIds([...current.trackIds, t.id])}>
                  + {t.title} <span className="muted">%{Math.round(s * 100)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {sets.length > 0 && (
        <div className="card">
          <h2>Kayıtlı setlerim</h2>
          {sets.map((s) => (
            <div key={s.id} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="grow"><b>{s.name}</b> <span className="small muted">· {s.trackIds.length} parça · {ARC_BY_ID[s.arc]?.name} · {new Date(s.updatedAt).toLocaleDateString('tr-TR')}</span></div>
              <button className="btn small" onClick={() => loadIds(s.trackIds, s.arc, s.name)}>Aç</button>
              <button className="btn small ghost" onClick={() => confirm(`“${s.name}” silinsin mi?`) && onDeleteSet(s.id)}>Sil</button>
            </div>
          ))}
        </div>
      )}

      {detail !== null && setTracks[detail + 1] && <TransitionDetail a={setTracks[detail]} b={setTracks[detail + 1]} onClose={() => setDetail(null)} />}
    </>
  );
}
