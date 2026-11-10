import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { plannedEnergyAt, sectionStarts, SECTION_LABEL } from '../../sim/arc';
import { eventLabel } from '../../sim/debrief';
import type { SimConfig } from '../../sim/engine';
import type { SimEvent, Snapshot } from '../../sim/types';

interface Props {
  cfg: SimConfig;
  snapshots: Snapshot[];
  events: SimEvent[];
  minute: number;
  duration: number;
  /** debrief mode: taller, hover tooltip, numbered markers */
  detailed?: boolean;
  markers?: { minute: number; n: number }[];
}

const VW = 1000;
const SHORT = { arrival: 'ARR', warmup: 'WRM', lift: 'LFT', peak: 'PK', release: 'REL', closing: 'CLS' } as const;

/** Planned energy (dashed, neutral) vs simulated room energy (solid, lime) on one 0–100 axis. */
export function Timeline({ cfg, snapshots, events, minute, duration, detailed, markers }: Props) {
  const VH = detailed ? 300 : 132;
  const pad = { l: detailed ? 40 : 8, r: detailed ? 56 : 8, t: detailed ? 30 : 22, b: detailed ? 30 : 16 };
  const w = VW - pad.l - pad.r;
  const h = VH - pad.t - pad.b;
  const D = Math.max(duration, cfg.room.duration);
  const x = (m: number) => pad.l + (m / D) * w;
  const y = (e: number) => pad.t + h * (1 - e / 100);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const planned: string[] = [];
  for (let m = 0; m <= cfg.room.duration; m += 1) planned.push(`${x(m).toFixed(1)},${y(plannedEnergyAt(cfg.arc, m, cfg.room.duration)).toFixed(1)}`);
  const actual = snapshots.map((s) => `${x(s.minute).toFixed(1)},${y(s.energy).toFixed(1)}`);
  const total = cfg.arc.reduce((a, s) => a + s.minutes, 0) || 1;
  const starts = sectionStarts(cfg.arc);
  const answered = new Set(events.filter((e) => e.type === 'curveball').map((e) => e.type === 'curveball' && e.id));

  const onMove = (e: RPointerEvent) => {
    if (!detailed || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * VW;
    const m = Math.round(((px - pad.l) / w) * D);
    setHover(m >= 0 && m < snapshots.length ? m : null);
  };
  const hs = hover !== null ? snapshots[hover] : null;
  const hoverEvents = hover !== null ? events.filter((e) => e.minute === hover) : [];
  const last = snapshots[snapshots.length - 1];

  return (
    <figure className={`timeline${detailed ? ' is-detailed' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="timeline-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Enerji zaman çizgisi: dakika ${minute} / ${duration}. Kesikli çizgi plan, düz çizgi simüle oda enerjisi.`}
      >
        {cfg.arc.map((s, i) => {
          const x0 = x((starts[i] / total) * cfg.room.duration);
          const x1 = x(((starts[i] + s.minutes) / total) * cfg.room.duration);
          return (
            <g key={s.id} className="tl-sec">
              <line x1={x0} x2={x0} y1={pad.t - (detailed ? 18 : 14)} y2={pad.t + h} vectorEffect="non-scaling-stroke" />
              {i === cfg.arc.length - 1 && <line x1={x1} x2={x1} y1={pad.t} y2={pad.t + h} vectorEffect="non-scaling-stroke" />}
            </g>
          );
        })}
        {detailed &&
          [0, 50, 100].map((e) => (
            <g key={e} className="grid">
              <line x1={pad.l} x2={VW - pad.r} y1={y(e)} y2={y(e)} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        {duration < cfg.room.duration && (
          <rect x={x(duration)} y={pad.t} width={x(cfg.room.duration) - x(duration)} height={h} className="tl-cut" />
        )}
        <polyline points={planned.join(' ')} className="tl-plan" vectorEffect="non-scaling-stroke" />
        <polyline points={actual.join(' ')} className="tl-actual" vectorEffect="non-scaling-stroke" />
        {events.map((e, i) => (
          <line
            key={i}
            x1={x(e.minute)}
            x2={x(e.minute)}
            y1={pad.t + h}
            y2={pad.t + h + (e.type === 'curveball' ? 12 : 6)}
            className={e.type === 'curveball' ? 'tl-tick is-curve' : 'tl-tick'}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {cfg.curveballs
          .filter((c) => !answered.has(c.id) && c.minute < duration)
          .map((c) => (
            <line key={c.id} x1={x(c.minute)} x2={x(c.minute)} y1={pad.t + h} y2={pad.t + h + 12} className="tl-tick is-upcoming" vectorEffect="non-scaling-stroke" />
          ))}
        {!detailed && <line x1={x(minute)} x2={x(minute)} y1={pad.t - 4} y2={pad.t + h + 4} className="tl-head" vectorEffect="non-scaling-stroke" />}
        {hs && (
          <line x1={x(hs.minute)} x2={x(hs.minute)} y1={pad.t} y2={pad.t + h} className="tl-cross" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* HTML overlays keep dots round and labels crisp despite the stretched SVG */}
      <div className="tl-overlay" aria-hidden="true" style={{ ['--vh' as string]: VH }}>
        {last && (
          <span className="tl-dot" style={{ left: `${(x(last.minute) / VW) * 100}%`, top: `${(y(last.energy) / VH) * 100}%` }} />
        )}
        {detailed && last && (
          <>
            <span className="tl-label is-actual" style={{ left: `${(x(last.minute) / VW) * 100}%`, top: `${(y(last.energy) / VH) * 100}%` }}>
              oda
            </span>
            <span
              className="tl-label is-plan"
              style={{ left: `${(x(cfg.room.duration) / VW) * 100}%`, top: `${(y(plannedEnergyAt(cfg.arc, cfg.room.duration, cfg.room.duration)) / VH) * 100}%` }}
            >
              plan
            </span>
          </>
        )}
        {cfg.arc.map((s, i) => (
          <span key={s.id} lang="en" className="tl-sec-t mono" style={{ left: `${(x((starts[i] / total) * cfg.room.duration) / VW) * 100}%` }}>
            <span className="full">{SECTION_LABEL[s.kind]}</span>
            <span className="short" aria-hidden="true">
              {SHORT[s.kind]}
            </span>
          </span>
        ))}
        {detailed &&
          [0, 50, 100].map((e) => (
            <span key={e} className="tl-grid-t mono" style={{ top: `${(y(e) / VH) * 100}%` }}>
              {e}
            </span>
          ))}
        {markers?.map((mk) => (
          <span key={mk.n} className="tl-marker mono" style={{ left: `${(x(mk.minute) / VW) * 100}%` }}>
            {mk.n}
          </span>
        ))}
        {hs && (
          <span className="tl-tip" style={{ left: `${(x(hs.minute) / VW) * 100}%` }}>
            <span className="mono">dk {hs.minute}</span>
            <span>
              oda <b className="mono">{Math.round(hs.energy)}</b> · plan <b className="mono">{Math.round(hs.planned)}</b>
            </span>
            {hoverEvents.map((e, i) => (
              <span key={i} className="tl-tip-ev">
                {eventLabel(e)}
              </span>
            ))}
          </span>
        )}
      </div>
      <figcaption className="tl-legend tiny">
        <span className="lg-plan">plan</span>
        <span className="lg-actual">oda enerjisi (simüle)</span>
        <span className="lg-tick">karar</span>
        <span className="lg-curve">beklenmedik an</span>
      </figcaption>
    </figure>
  );
}
