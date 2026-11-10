import { useEffect, useMemo, useRef, useState } from 'react';
import type { PracticeEntry, Track } from '../types';
import type { CurrentSet } from '../App';
import { TECHNIQUES, TECH_BY_ID } from '../knowledge/techniques';
import { ROADMAP } from '../knowledge/playbook';
import { reviewSet } from '../engine/order';
import { fmt, view } from '../engine/transition';
import { Grade, KeyBadge } from './common';

interface Props { tracks: Track[]; byId: Map<string, Track>; current: CurrentSet; practice: PracticeEntry[]; onLog: (tech: string, ok: boolean) => void }

export function Practice({ tracks, byId, current, practice, onLog }: Props) {
  const setTracks = useMemo(() => current.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t), [current.trackIds, byId]);
  const review = useMemo(() => reviewSet(setTracks, current.arc), [setTracks, current.arc]);

  const stats = useMemo(() => {
    const s: Record<string, { n: number; ok: number; recent: number }> = {};
    const weekAgo = Date.now() - 7 * 864e5;
    for (const e of practice) {
      const x = (s[e.techniqueId] ??= { n: 0, ok: 0, recent: 0 });
      x.n++; if (e.ok) x.ok++; if (e.at > weekAgo) x.recent++;
    }
    return s;
  }, [practice]);
  const mastered = TECHNIQUES.filter((t) => (stats[t.id]?.n ?? 0) >= 5 && (stats[t.id]!.ok / stats[t.id]!.n) >= 0.7).map((t) => t.id);
  const level = ROADMAP.findIndex((r) => !r.techniques.every((id) => mastered.includes(id)));
  const stage = ROADMAP[level === -1 ? ROADMAP.length - 1 : level];
  const today = practice.filter((e) => new Date(e.at).toDateString() === new Date().toDateString()).length;

  // Günün alıştırmaları: bulunduğun aşama + setinde geçen + başarı oranı düşük teknikler
  const drills = useMemo(() => {
    const score = (id: string) => {
      const st = stats[id];
      const rate = st ? st.ok / st.n : 0;
      const inSet = review.techniqueCounts[id] ?? 0;
      const inStage = stage.techniques.includes(id) ? 1 : 0;
      return inStage * 2 + Math.min(3, inSet) * 0.8 + (1 - rate) * 1.5 - TECH_BY_ID[id].difficulty * 0.3 - (st?.recent ?? 0) * 0.05;
    };
    return TECHNIQUES.map((t) => t.id).filter((id) => id !== 'tempo-ride').sort((a, b) => score(b) - score(a)).slice(0, 3);
  }, [stats, review, stage]);

  return (
    <>
      <div className="grid2">
        <PhraseCounter tracks={setTracks.length ? setTracks : tracks} />
        <div className="card">
          <h2>Gelişimin</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <div className="grow">
              <div style={{ fontWeight: 800 }}>Aşama: {stage.week} — {stage.focus}</div>
              <div className="small muted">Bugün {today} deneme · toplam {practice.length} · ustalaşılan teknik: {mastered.length}/{TECHNIQUES.length}</div>
            </div>
          </div>
          <ul className="reasons small">{stage.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
          <table className="table small" style={{ marginTop: 8 }}>
            <thead><tr><th>Teknik</th><th>Deneme</th><th>Başarı</th></tr></thead>
            <tbody>
              {TECHNIQUES.filter((t) => stats[t.id]).map((t) => (
                <tr key={t.id}><td>{t.name}{mastered.includes(t.id) ? ' ✅' : ''}</td><td className="num">{stats[t.id].n}</td>
                  <td style={{ width: '40%' }}><div className="bar"><div style={{ width: `${(stats[t.id].ok / stats[t.id].n) * 100}%`, background: 'var(--good)' }} /></div></td></tr>
              ))}
            </tbody>
          </table>
          {practice.length === 0 && <div className="muted small">Henüz kayıt yok. Bir geçişi denedikten sonra ✓ veya ✗’ye bas — not yazmana gerek yok.</div>}
        </div>
      </div>

      <div className="card">
        <h2>Bugünün alıştırmaları</h2>
        <div className="grid3">
          {drills.map((id) => {
            const t = TECH_BY_ID[id];
            const st = stats[id];
            return (
              <div key={id} className="card" style={{ margin: 0, background: 'var(--panel2)' }}>
                <div style={{ fontWeight: 800 }}>{t.name}</div>
                <div className="small muted" style={{ marginBottom: 6 }}>{'●'.repeat(t.difficulty)}{'○'.repeat(3 - t.difficulty)} · {review.techniqueCounts[id] ? `setinde ${review.techniqueCounts[id]} kez` : 'temel beceri'}{st ? ` · %${Math.round((st.ok / st.n) * 100)} başarı` : ''}</div>
                <p className="small" style={{ marginTop: 0 }}>{t.drill}</p>
                <div className="row"><button className="btn small" onClick={() => onLog(id, true)}>✓ Temiz oldu</button><button className="btn small ghost" onClick={() => onLog(id, false)}>✗ Olmadı</button></div>
              </div>
            );
          })}
        </div>
      </div>

      <SetRehearsal tracks={setTracks} review={review} onLog={onLog} />
    </>
  );
}

function SetRehearsal({ tracks, review, onLog }: { tracks: Track[]; review: ReturnType<typeof reviewSet>; onLog: (tech: string, ok: boolean) => void }) {
  const [i, setI] = useState(0);
  const n = review.plans.length;
  if (n === 0) return <div className="card"><h2>Set provası</h2><div className="muted">“Set Planla” sekmesinde bir set kurduğunda, burada geçişleri sırayla prova edebilirsin.</div></div>;
  const k = Math.min(i, n - 1);
  const p = review.plans[k];
  const a = tracks[k], b = tracks[k + 1];
  const next = (ok: boolean) => { onLog(p.technique, ok); setI((x) => Math.min(n - 1, x + 1)); };
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Set provası</h2>
        <span className="muted small">Geçiş {k + 1}/{n}</span>
        <div className="grow" />
        <button className="btn small" onClick={() => setI(Math.max(0, k - 1))} disabled={k === 0}>← Önceki</button>
        <button className="btn small" onClick={() => setI(Math.min(n - 1, k + 1))} disabled={k === n - 1}>Sonraki →</button>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Grade g={p.grade} />
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{a.title} → {b.title}</div>
          <div className="small muted">{TECH_BY_ID[p.technique].name} · {view(a).bpm} → {view(b).bpm} BPM · <KeyBadge code={view(a).camelot} /> → <KeyBadge code={view(b).camelot} /> · B’yi {fmt(p.cueB)}’den başlat</div>
        </div>
      </div>
      <ol className="steps">
        {p.steps.map((s, j) => (
          <li key={j}><span className="clock">{s.clock}</span><span className={'deck ' + s.deck.replace('+', '')}>{s.deck}</span><span className="txt">{s.text}</span></li>
        ))}
      </ol>
      <div className="row" style={{ marginTop: 12 }}>
        <span className="small muted">Nasıl geçti?</span>
        <button className="btn primary" onClick={() => next(true)}>✓ Temiz</button>
        <button className="btn" onClick={() => next(false)}>✗ Tekrar çalışmalıyım</button>
      </div>
    </div>
  );
}

/** Fraz sayacı: vuruş/bar/fraz görselleştirme + isteğe bağlı metronom + tap tempo */
function PhraseCounter({ tracks }: { tracks: Track[] }) {
  const [bpm, setBpm] = useState(124);
  const [running, setRunning] = useState(false);
  const [click, setClick] = useState(true);
  const [pos, setPos] = useState({ beat: 0, bar: 0, phrase: 0 });
  const start = useRef(0);
  const ctx = useRef<AudioContext | null>(null);
  const lastBeat = useRef(-1);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const el = (performance.now() - start.current) / 1000;
      const total = Math.floor(el / (60 / bpm));
      if (total !== lastBeat.current) {
        lastBeat.current = total;
        const beat = total % 4, bar = Math.floor(total / 4) % 8, phrase = Math.floor(total / 32);
        setPos({ beat, bar, phrase });
        if (click && ctx.current) {
          const c = ctx.current, o = c.createOscillator(), g = c.createGain();
          o.frequency.value = beat === 0 && bar === 0 ? 1760 : beat === 0 ? 1320 : 880;
          g.gain.setValueAtTime(0.25, c.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
          o.connect(g).connect(c.destination);
          o.start(); o.stop(c.currentTime + 0.07);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, bpm, click]);

  const toggle = () => {
    if (!running) {
      if (!ctx.current) { const C = window.AudioContext || (window as any).webkitAudioContext; ctx.current = new C(); }
      ctx.current.resume();
      start.current = performance.now();
      lastBeat.current = -1;
    }
    setRunning((r) => !r);
  };
  const one = () => { start.current = performance.now(); lastBeat.current = -1; if (!running) toggle(); };
  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 4) {
      const d = (taps.current[taps.current.length - 1] - taps.current[0]) / (taps.current.length - 1);
      setBpm(Math.round((60000 / d) * 10) / 10);
    }
  };
  const beatsToPhrase = 32 - ((pos.bar * 4 + pos.beat) % 32);

  return (
    <div className="card counter">
      <div className="row"><h2 style={{ margin: 0 }}>Fraz sayacı</h2><div className="grow" /><label className="small row" style={{ gap: 6 }}><input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} /> Klik sesi</label></div>
      <div className="row">
        <input className="input" style={{ width: 90 }} type="number" step={0.1} value={bpm} onChange={(e) => setBpm(Math.max(40, Math.min(220, Number(e.target.value) || 120)))} />
        <span className="muted small">BPM</span>
        <select className="input grow" value="" onChange={(e) => { const t = tracks.find((x) => x.id === e.target.value); const b = t && view(t).bpm; if (b) setBpm(b); }}>
          <option value="">Parçadan BPM al…</option>
          {tracks.filter((t) => view(t).bpm).slice(0, 200).map((t) => <option key={t.id} value={t.id}>{t.title} ({view(t).bpm})</option>)}
        </select>
        <button className="btn small" onClick={tap}>Tap</button>
      </div>
      <div className="beats">{[0, 1, 2, 3].map((b) => <div key={b} className={'beat' + (running && pos.beat === b ? ' on' : '') + (b === 0 ? ' one' : '')}>{b + 1}</div>)}</div>
      <div className="bars">{Array.from({ length: 8 }, (_, b) => <div key={b} className={'barcell' + (running && b < pos.bar ? ' done' : '') + (running && b === pos.bar ? ' on' : '')}>{b + 1}</div>)}</div>
      <div className="row">
        <div className="grow"><div className="muted small">Fraz</div><div className="bignum">{running ? pos.phrase + 1 : '–'}</div></div>
        <div className="grow"><div className="muted small">Sonraki fraza</div><div className="bignum">{running ? beatsToPhrase : '–'}<span className="small muted"> vuruş</span></div></div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={toggle}>{running ? 'Durdur' : 'Başlat'}</button>
        <button className="btn" onClick={one} title="Müzikte bir frazın ilk vuruşu geldiğinde bas">Şimdi “1”!</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>FLX2’de bir parça çalarken, frazın ilk vuruşunda “Şimdi 1!”e bas: sayaç müziğe kilitlenir ve geçişi ne zaman başlatacağını gösterir. 8 bar = 32 vuruş = 1 fraz.</p>
    </div>
  );
}
