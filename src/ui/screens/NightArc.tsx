import { useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent } from 'react';
import { t } from '../../i18n/tr';
import { DIRECTIONS, DIRECTION_IDS } from '../../sim/content';
import {
  arcTotal,
  fitArcToDuration,
  makeSection,
  MAX_SECTION,
  MIN_SECTION,
  moveSection,
  plannedEnergyAt,
  sectionStarts,
  SECTION_KINDS,
  SECTION_LABEL,
  setSectionMinutes,
} from '../../sim/arc';
import type { ArcSection, DirectionId, FamiliarityTarget, SectionKind } from '../../sim/types';
import type { Session } from '../../store/schema';
import { Segmented, Stepper } from '../controls';
import { go } from '../router';
import { useEditable } from '../useEditable';
import { LockedNotice, ResetNotice } from './Notices';
import { useStore } from '../../store/store';

const VW = 1000;
const VH = 340;
const PAD = { l: 44, r: 16, t: 56, b: 40 };
const plotW = VW - PAD.l - PAD.r;
const plotH = VH - PAD.t - PAD.b;
const yOf = (e: number) => PAD.t + plotH * (1 - e / 100);

export function NightArc({ session }: { session: Session }) {
  const store = useStore();
  const { edit, locked, hasProgress, copy } = useEditable(session, 'arc');
  const arc = session.arc;
  const [selId, setSelId] = useState<string>(arc[0]?.id);
  const [view, setView] = useState<'curve' | 'list'>(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 560px)').matches ? 'list' : 'curve'));
  const sel = arc.find((s) => s.id === selId) ?? arc[0];
  const total = arcTotal(arc);
  const event = session.room.duration;
  const mismatch = total !== event;

  const setArc = (next: ArcSection[]) => edit({ arc: next });
  const patchSel = (p: Partial<ArcSection>) => setArc(arc.map((s) => (s.id === sel.id ? { ...s, ...p } : s)));

  const addAfter = () => {
    const i = arc.findIndex((s) => s.id === sel.id);
    const ns = makeSection('release', 10, Math.max(30, sel.energy - 10), sel.direction, 'mid', 'Yeni bölüm.');
    const next = [...arc.slice(0, i + 1), ns, ...arc.slice(i + 1)];
    setArc(next);
    setSelId(ns.id);
  };
  const remove = () => {
    if (arc.length <= 2) return;
    const i = arc.findIndex((s) => s.id === sel.id);
    const next = arc.filter((s) => s.id !== sel.id);
    setArc(next);
    setSelId(next[Math.max(0, i - 1)].id);
  };

  const startRehearsal = () => {
    store.setActive(session.id);
    if (session.status === 'draft') store.update(session.id, { status: 'rehearsing' });
    go({ name: 'rehearse', id: session.id });
  };

  return (
    <div className="screen arc">
      <header className="screen-head arc-head">
        <div>
          <p className="eyebrow mono" lang="en">02 — {t.arc.title}</p>
          <h1 className="display h1">{session.name}</h1>
          <p className="muted">{t.arc.energyNote}</p>
        </div>
        <div className={`totals mono${mismatch ? ' is-off' : ''}`} aria-live="polite">
          <span>
            {t.arc.total} <strong>{total}</strong> dk
          </span>
          <span className="totals-sep">/</span>
          <span>
            {t.arc.event} <strong>{event}</strong> dk
          </span>
        </div>
      </header>
      {locked && <LockedNotice onCopy={copy} />}
      {hasProgress && <ResetNotice />}
      {mismatch && !locked && (
        <div className="notice notice-warn" role="status">
          <span>
            {t.arc.mismatch} Fark: <span className="mono">{total - event > 0 ? '+' : ''}{total - event} dk</span>.
          </span>
          <span className="notice-actions">
            <button type="button" className="btn" onClick={() => setArc(fitArcToDuration(arc, event))}>
              {t.arc.fit}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={total < 30 || total > 180}
              onClick={() => edit({ room: { ...session.room, duration: total }, curveballs: session.curveballs.filter((c) => c.minute < total) })}
            >
              {t.arc.setEvent} ({total} dk)
            </button>
          </span>
        </div>
      )}

      <div className="viewswitch" role="group" aria-label="Görünüm">
        <button type="button" aria-pressed={view === 'curve'} className={view === 'curve' ? 'is-on' : ''} onClick={() => setView('curve')}>
          {t.arc.curveView}
        </button>
        <button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'is-on' : ''} onClick={() => setView('list')}>
          {t.arc.listView}
        </button>
      </div>

      {view === 'curve' ? (
        <ArcCurve arc={arc} duration={event} curveballs={session.curveballs} selId={sel.id} onSelect={setSelId} onChange={setArc} disabled={locked} />
      ) : (
        <ol className="arc-list">
          {arc.map((s, i) => (
            <li key={s.id} className={`arc-li${s.id === sel.id ? ' is-on' : ''}`}>
              <button type="button" className="arc-li-main" onClick={() => setSelId(s.id)} aria-current={s.id === sel.id}>
                <span className="mono arc-li-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="arc-li-kind">{SECTION_LABEL[s.kind]}</span>
                <span className="mono arc-li-meta">
                  {s.minutes} dk · E{s.energy} · {DIRECTIONS[s.direction].name} · tanıdıklık {t.arc.fam[s.familiarity]}
                </span>
              </button>
              <span className="arc-li-order">
                <button type="button" className="step" disabled={locked || i === 0} aria-label={`${SECTION_LABEL[s.kind]} ${t.arc.earlier}`} onClick={() => setArc(moveSection(arc, s.id, -1))}>
                  ↑
                </button>
                <button type="button" className="step" disabled={locked || i === arc.length - 1} aria-label={`${SECTION_LABEL[s.kind]} ${t.arc.later}`} onClick={() => setArc(moveSection(arc, s.id, 1))}>
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {sel && (
        <section className="section-editor" aria-label={`Bölüm: ${SECTION_LABEL[sel.kind]}`}>
          <fieldset disabled={locked}>
            <div className="se-head">
              <label className="se-kind">
                <span className="sr-only">Bölüm türü</span>
                <select value={sel.kind} onChange={(e) => patchSel({ kind: e.target.value as SectionKind })} className="display">
                  {SECTION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {SECTION_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mono se-summary">
                {sel.minutes} min / E{sel.energy} / {DIRECTIONS[sel.direction].note} / {t.arc.fam[sel.familiarity]} tanıdıklık
              </p>
            </div>
            <div className="se-grid">
              <Stepper label={t.arc.minutes} value={sel.minutes} min={MIN_SECTION} max={MAX_SECTION} unit="dk" onChange={(v) => setArc(setSectionMinutes(arc, sel.id, v))} />
              <Stepper label={t.arc.energy} value={sel.energy} min={0} max={100} step={5} onChange={(v) => patchSel({ energy: v })} />
              <label className="se-field">
                <span>{t.arc.direction}</span>
                <select value={sel.direction} onChange={(e) => patchSel({ direction: e.target.value as DirectionId })}>
                  {DIRECTION_IDS.map((d) => (
                    <option key={d} value={d}>
                      {DIRECTIONS[d].name}
                    </option>
                  ))}
                </select>
              </label>
              <Segmented<FamiliarityTarget>
                label={t.arc.familiarity}
                value={sel.familiarity}
                onChange={(v) => patchSel({ familiarity: v })}
                options={(['low', 'mid', 'high'] as const).map((f) => ({ value: f, label: t.arc.fam[f] }))}
              />
              <label className="se-field se-purpose">
                <span>{t.arc.purpose}</span>
                <input type="text" maxLength={140} value={sel.purpose} onChange={(e) => patchSel({ purpose: e.target.value })} />
              </label>
            </div>
            <div className="se-actions">
              <button type="button" className="btn btn-ghost" disabled={arc[0].id === sel.id} onClick={() => setArc(moveSection(arc, sel.id, -1))}>
                ← {t.arc.earlier}
              </button>
              <button type="button" className="btn btn-ghost" disabled={arc[arc.length - 1].id === sel.id} onClick={() => setArc(moveSection(arc, sel.id, 1))}>
                {t.arc.later} →
              </button>
              <button type="button" className="btn btn-ghost" disabled={arc.length >= 12} onClick={addAfter}>
                + {t.arc.add}
              </button>
              <button type="button" className="btn-text danger" disabled={arc.length <= 2} onClick={remove} title={arc.length <= 2 ? 'En az iki bölüm gerekir' : undefined}>
                {t.arc.remove}
              </button>
            </div>
          </fieldset>
        </section>
      )}

      <footer className="screen-foot">
        <button type="button" className="btn btn-ghost" onClick={() => go({ name: 'room', id: session.id })}>
          ← Room
        </button>
        <div className="foot-right">
          {mismatch && <span className="tiny muted">Provadan önce toplam süreyi eşitle.</span>}
          <button type="button" className="btn btn-primary btn-lg" disabled={mismatch && !locked} onClick={startRehearsal}>
            {locked ? 'Provayı gör' : t.arc.start} →
          </button>
        </div>
      </footer>
    </div>
  );
}

interface CurveProps {
  arc: ArcSection[];
  duration: number;
  curveballs: Session['curveballs'];
  selId: string;
  onSelect: (id: string) => void;
  onChange: (a: ArcSection[]) => void;
  disabled?: boolean;
}

/** Editable energy curve: drag dots vertically for energy, drag boundaries for duration. */
function ArcCurve({ arc, duration, curveballs, selId, onSelect, onChange, disabled }: CurveProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: 'energy' | 'edge'; i: number; startX: number; a: number; b: number } | null>(null);
  const total = arcTotal(arc) || 1;
  const xOf = (m: number) => PAD.l + (m / total) * plotW;
  const starts = sectionStarts(arc);

  const toLocal = (e: RPointerEvent) => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * VW, y: ((e.clientY - r.top) / r.height) * VH };
  };

  const onDown = (kind: 'energy' | 'edge', i: number) => (e: RPointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toLocal(e);
    drag.current = { kind, i, startX: p.x, a: arc[i].minutes, b: arc[i + 1]?.minutes ?? 0 };
    onSelect(arc[i].id);
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toLocal(e);
    if (d.kind === 'energy') {
      const energy = Math.round(Math.max(0, Math.min(100, (1 - (p.y - PAD.t) / plotH) * 100)) / 5) * 5;
      if (energy !== arc[d.i].energy) onChange(arc.map((s, j) => (j === d.i ? { ...s, energy } : s)));
    } else {
      // move minutes between section i and i+1; total stays constant
      const dm = Math.round(((p.x - d.startX) / plotW) * total);
      const a = Math.max(MIN_SECTION, Math.min(d.a + d.b - MIN_SECTION, d.a + dm));
      const b = d.a + d.b - a;
      if (a !== arc[d.i].minutes) onChange(arc.map((s, j) => (j === d.i ? { ...s, minutes: a } : j === d.i + 1 ? { ...s, minutes: b } : s)));
    }
  };
  const onUp = () => {
    drag.current = null;
  };

  const keyEnergy = (i: number) => (e: KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 5;
    let v = arc[i].energy;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v += step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v -= step;
    else if (e.key === 'Home') v = 0;
    else if (e.key === 'End') v = 100;
    else return;
    e.preventDefault();
    onChange(arc.map((s, j) => (j === i ? { ...s, energy: Math.max(0, Math.min(100, v)) } : s)));
  };
  const keyEdge = (i: number) => (e: KeyboardEvent) => {
    if (disabled) return;
    let dm = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') dm = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') dm = -1;
    else return;
    e.preventDefault();
    const a = arc[i].minutes + dm;
    const b = arc[i + 1].minutes - dm;
    if (a < MIN_SECTION || b < MIN_SECTION) return;
    onChange(arc.map((s, j) => (j === i ? { ...s, minutes: a } : j === i + 1 ? { ...s, minutes: b } : s)));
  };

  // smooth path through the planned energy
  const pts: string[] = [];
  for (let m = 0; m <= total; m += Math.max(0.5, total / 200)) {
    pts.push(`${xOf(m).toFixed(1)},${yOf(plannedEnergyAt(arc, (m / total) * duration, duration)).toFixed(1)}`);
  }
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${xOf(total)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`;

  return (
    <figure className="arccurve">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className={`arccurve-svg${disabled ? ' is-disabled' : ''}`}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="group"
        aria-label="Gecenin enerji eğrisi. Noktalar enerjiyi, aralardaki çizgiler bölüm sınırlarını ayarlar."
      >
        {[0, 25, 50, 75, 100].map((e) => (
          <g key={e} className="grid">
            <line x1={PAD.l} x2={VW - PAD.r} y1={yOf(e)} y2={yOf(e)} />
            <text x={PAD.l - 8} y={yOf(e) + 4} textAnchor="end">
              {e}
            </text>
          </g>
        ))}
        {arc.map((s, i) => {
          const x0 = xOf(starts[i]);
          const x1 = xOf(starts[i] + s.minutes);
          const on = s.id === selId;
          return (
            <g key={s.id} className={`col${on ? ' is-on' : ''}`} onClick={() => onSelect(s.id)}>
              <rect x={x0} y={PAD.t} width={x1 - x0} height={plotH} className="col-bg" />
              <text x={x0 + 8} y={PAD.t - 30} className="col-kind">
                {SECTION_LABEL[s.kind]}
              </text>
              <text x={x0 + 8} y={PAD.t - 12} className="col-meta">
                {s.minutes}′ · {DIRECTIONS[s.direction].name.split(' ')[0]}
              </text>
            </g>
          );
        })}
        <path d={area} className="curve-area" />
        <path d={line} className="curve-line" />
        {curveballs.map((c) => (
          <g key={`${c.id}${c.minute}`} className="cb-mark" transform={`translate(${xOf((c.minute / duration) * total)} ${VH - PAD.b + 16})`}>
            <path d="M0 -8 L6 0 L0 8 L-6 0 Z" />
            <title>Olası beklenmedik an · dk {c.minute}</title>
          </g>
        ))}
        <text x={PAD.l} y={VH - 6} className="axis-t">
          0′
        </text>
        <text x={VW - PAD.r} y={VH - 6} className="axis-t" textAnchor="end">
          {total}′
        </text>
        {arc.slice(0, -1).map((s, i) => {
          const x = xOf(starts[i] + s.minutes);
          return (
            <g key={`edge${s.id}`} className="edge">
              <line x1={x} x2={x} y1={PAD.t} y2={PAD.t + plotH} />
              <rect
                x={x - 9}
                y={PAD.t}
                width={18}
                height={plotH}
                className="edge-hit"
                tabIndex={disabled ? -1 : 0}
                role="slider"
                aria-label={`${SECTION_LABEL[s.kind]} ile ${SECTION_LABEL[arc[i + 1].kind]} arasındaki sınır`}
                aria-valuemin={MIN_SECTION}
                aria-valuemax={s.minutes + arc[i + 1].minutes - MIN_SECTION}
                aria-valuenow={s.minutes}
                aria-valuetext={`${SECTION_LABEL[s.kind]} ${s.minutes} dakika, ${SECTION_LABEL[arc[i + 1].kind]} ${arc[i + 1].minutes} dakika`}
                onPointerDown={onDown('edge', i)}
                onKeyDown={keyEdge(i)}
              />
            </g>
          );
        })}
        {arc.map((s, i) => {
          const cx = xOf(starts[i] + s.minutes / 2);
          const cy = yOf(s.energy);
          return (
            <g key={`h${s.id}`} className={`handle${s.id === selId ? ' is-on' : ''}`}>
              <circle cx={cx} cy={cy} r={22} className="handle-hit" />
              <circle cx={cx} cy={cy} r={8} className="handle-dot" />
              <text x={cx} y={cy - 16} textAnchor="middle" className="handle-val">
                {s.energy}
              </text>
              <circle
                cx={cx}
                cy={cy}
                r={22}
                className="handle-focus"
                tabIndex={disabled ? -1 : 0}
                role="slider"
                aria-label={`${SECTION_LABEL[s.kind]} enerjisi`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={s.energy}
                onPointerDown={onDown('energy', i)}
                onKeyDown={keyEnergy(i)}
                onFocus={() => onSelect(s.id)}
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="tiny muted">
        Noktaları yukarı-aşağı sürükle: enerji. Bölüm sınırlarını yana sürükle: süre (toplam değişmez). Klavye: ok tuşları. ◆ = olası beklenmedik an.
      </figcaption>
    </figure>
  );
}
