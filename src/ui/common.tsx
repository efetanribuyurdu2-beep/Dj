import { useEffect, type ReactNode } from 'react';
import type { GenreId, Track } from '../types';
import { GENRES } from '../knowledge/genres';
import { camelotParts } from '../engine/camelot';
import { fmt, view } from '../engine/transition';

export function camelotColor(code: string | null | undefined): string {
  const p = code ? camelotParts(code) : null;
  if (!p) return '#5b6078';
  const hue = ((p.n - 1) * 30 + 0) % 360;
  return `hsl(${hue} ${p.letter === 'A' ? 70 : 85}% ${p.letter === 'A' ? 62 : 72}%)`;
}

export function KeyBadge({ code, title }: { code: string | null | undefined; title?: string }) {
  return <span className="key" style={{ background: camelotColor(code) }} title={title}>{code ?? '?'}</span>;
}

export function GenreChip({ g }: { g: GenreId }) {
  const p = GENRES[g];
  return <span className="chip"><span className="dot" style={{ background: p.color }} />{p.name}</span>;
}

export function Energy({ v }: { v: number }) {
  return <span className="energy" title={`Enerji ${v}/10`}>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < v ? 'on' : ''} />)}</span>;
}

export function Grade({ g }: { g: string }) {
  return <span className={`grade ${g}`}>{g}</span>;
}

export function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn small ghost" onClick={onClose}>Kapat ✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** Parçanın bar bazlı enerji haritası: intro/outro/breakdown ve mix noktaları. */
export function TrackMap({ t, marks = [] }: { t: Track; marks?: { sec: number; label: string; color: string }[] }) {
  const a = t.analysis;
  if (!a || a.barEnergy.length === 0) return <div className="muted small">Bu parça için ses analizi yok (sadece rekordbox verisi).</div>;
  const W = 800, H = 90;
  const dur = t.durationSec || 1;
  const x = (sec: number) => (sec / dur) * W;
  const barLen = 240 / a.bpm;
  const segColor: Record<string, string> = { intro: '#2ec4b6', outro: '#2ec4b6', breakdown: '#ffd166', drop: '#ff5c8a' };
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Parça yapısı">
      {a.segments.map((s, i) => (
        <rect key={i} x={x(s.startSec)} y={0} width={Math.max(1, x(s.endSec) - x(s.startSec))} height={H} fill={segColor[s.kind]} opacity={0.13} />
      ))}
      {a.barEnergy.map((e, i) => {
        const sx = x(a.firstBeatSec + i * barLen);
        const w = Math.max(1, x(barLen) - 1);
        const v = a.barVocal[i] ?? 0;
        return <rect key={i} x={sx} y={H - e * H} width={w} height={e * H} fill={v > 0.6 ? '#ff5c8a' : '#7c5cff'} opacity={0.85} />;
      })}
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={x(m.sec)} x2={x(m.sec)} y1={0} y2={H} stroke={m.color} strokeWidth={2} />
          <text x={Math.min(W - 60, x(m.sec) + 3)} y={H + 14} style={{ fill: m.color }}>{m.label} {fmt(m.sec)}</text>
        </g>
      ))}
      {a.segments.map((s, i) => (
        <text key={'t' + i} x={x(s.startSec) + 3} y={12}>{({ intro: 'Intro', outro: 'Outro', breakdown: 'Breakdown', drop: 'Drop' } as Record<string, string>)[s.kind]} ({s.bars} bar)</text>
      ))}
    </svg>
  );
}

/** Set enerji eğrisi + hedef yay */
export function EnergyChart({ tracks, target }: { tracks: Track[]; target?: (p: number) => number }) {
  const W = 800, H = 160, P = 24;
  const n = tracks.length;
  if (n < 2) return null;
  const xs = (i: number) => P + (i / (n - 1)) * (W - 2 * P);
  const ys = (e: number) => H - P - ((e - 1) / 9) * (H - 2 * P);
  const pts = tracks.map((t, i) => [xs(i), ys(view(t).energy)] as const);
  const tgt = target && !Number.isNaN(target(0)) ? Array.from({ length: 41 }, (_, i) => [P + (i / 40) * (W - 2 * P), ys(target(i / 40))] as const) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Set enerji eğrisi">
      {[2, 4, 6, 8, 10].map((e) => (
        <g key={e}><line x1={P} x2={W - P} y1={ys(e)} y2={ys(e)} stroke="#2b2f40" /><text x={2} y={ys(e) + 4}>{e}</text></g>
      ))}
      {tgt && <polyline points={tgt.map((p) => p.join(',')).join(' ')} fill="none" stroke="#9aa0b4" strokeDasharray="5 5" strokeWidth={1.5} />}
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#7c5cff" strokeWidth={3} />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5} fill={GENRES[tracks[i].genre].color} stroke="#0e0f14" strokeWidth={2}><title>{tracks[i].title}</title></circle>)}
    </svg>
  );
}
