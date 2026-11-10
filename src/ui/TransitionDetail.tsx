import { useState } from 'react';
import type { Track } from '../types';
import { fmt, planTransition, view } from '../engine/transition';
import { TECH_BY_ID } from '../knowledge/techniques';
import { GENRES } from '../knowledge/genres';
import { Grade, KeyBadge, Modal, TrackMap } from './common';

export function TransitionDetail({ a, b, onClose }: { a: Track; b: Track; onClose: () => void }) {
  const base = planTransition(a, b);
  const [tech, setTech] = useState(base.technique);
  const plan = tech === base.technique ? base : planTransition(a, b, true, tech);
  const T = TECH_BY_ID[plan.technique];
  const A = view(a), B = view(b);
  const options = [base.technique, ...base.alternatives];

  return (
    <Modal onClose={onClose}>
      <div className="row" style={{ marginBottom: 8 }}>
        <Grade g={base.grade} />
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{a.title} → {b.title}</div>
          <div className="small muted">
            {GENRES[a.genre].name} → {GENRES[b.genre].name} · {A.bpm ?? '?'} → {B.bpm ?? '?'} BPM
            {base.bpm ? ` (fark %${Math.abs(base.bpm.diffPct).toFixed(1)})` : ''} · <KeyBadge code={A.camelot} /> → <KeyBadge code={B.camelot} /> {base.key.label} · enerji {A.energy} → {B.energy}
          </div>
        </div>
      </div>

      <div className="row" style={{ margin: '12px 0' }}>
        <span className="small muted">Teknik:</span>
        {options.map((id, i) => (
          <button key={id} className={'btn small' + (id === plan.technique ? ' primary' : '')} onClick={() => setTech(id)}>
            {TECH_BY_ID[id].name}{i === 0 ? ' ★' : ''}
          </button>
        ))}
      </div>

      <div className="info" style={{ marginBottom: 10 }}>
        <b>Neden bu geçiş?</b>
        <ul className="reasons">{base.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {plan.technique !== base.technique && <div className="small">★ önerilen teknikti; şu an alternatifi görüntülüyorsun.</div>}
      </div>
      {base.warnings.map((w, i) => <div key={i} className="warn" style={{ marginBottom: 8 }}>⚠ {w}</div>)}

      <h3 style={{ marginTop: 14 }}>{T.name} — adım adım (FLX2)</h3>
      <p className="small muted" style={{ marginTop: 0 }}>{T.howItSounds} Saatler <b>A parçasının</b> zamanıdır (rekordbox’taki geçen süre). B’yi {plan.cueBLabel} noktasından başlat: <b>{fmt(plan.cueB)}</b>.</p>
      <ol className="steps">
        {plan.steps.map((s, i) => (
          <li key={i}>
            <span className="clock">{s.clock}</span>
            <span className={'deck ' + s.deck.replace('+', '')}>{s.deck === 'A+B' ? 'A+B' : s.deck}</span>
            <span className="txt">{s.atBeat < 0 ? <span className="muted small">{-s.atBeat} vuruş önce · </span> : s.atBeat > 0 ? <span className="muted small">+{s.atBeat} vuruş · </span> : <span className="muted small">“1” · </span>}{s.text}</span>
          </li>
        ))}
      </ol>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div>
          <h3>A: {a.title}</h3>
          <TrackMap t={a} marks={[{ sec: plan.startInA, label: 'Geçiş', color: '#ff5c8a' }]} />
        </div>
        <div>
          <h3>B: {b.title}</h3>
          <TrackMap t={b} marks={[{ sec: plan.cueB, label: 'Başlat', color: '#2ec4b6' }]} />
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <div className="card" style={{ margin: 0 }}>
          <h3>Sık yapılan hatalar</h3>
          <ul className="reasons small">{T.mistakes.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h3>Alıştırma</h3>
          <p className="small" style={{ margin: 0 }}>{T.drill}</p>
        </div>
      </div>
    </Modal>
  );
}
