import { memo, useMemo } from 'react';
import { GROUPS } from '../../sim/content';
import { mulberry32 } from '../../sim/rng';
import type { GroupId, GroupShares, VenueId, Zone } from '../../sim/types';
import { GROUP_IDS } from '../../sim/types';
import { LAYOUTS, VIEW, type Ellipse, type Layout, type Rect } from './layouts';

export type Splits = Record<GroupId, { floor: number; bar: number; lounge: number }>;

export const MAX_DOTS = 120;

interface Person {
  i: number;
  group: GroupId;
  rank: number;
  phase: number;
  pos: Record<Zone, [number, number]>;
}

/** Allocate dot counts to groups with largest remainder so totals always match. */
export function allocate(total: number, shares: GroupShares): Record<GroupId, number> {
  const sum = shares.groove + shares.hits + shares.explorers || 1;
  const raw = GROUP_IDS.map((g) => (shares[g] / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, r: r - Math.floor(r) })).sort((a, b) => b.r - a.r);
  for (let k = 0; left > 0; k++, left--) out[order[k % 3].i]++;
  return { groove: out[0], hits: out[1], explorers: out[2] };
}

function sampleIn(zone: Zone, l: Layout, rnd: () => number): [number, number] {
  if (zone === 'floor') {
    const e: Ellipse = l.floor;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.9;
    return [e.cx + Math.cos(a) * e.rx * r, e.cy + Math.sin(a) * e.ry * r];
  }
  const rect: Rect = zone === 'bar' ? l.bar : l.lounge;
  const pad = 14;
  return [rect.x + pad + rnd() * (rect.w - pad * 2), rect.y + pad + rnd() * (rect.h - pad * 2)];
}

/** Best-candidate sampling: spreads points evenly without a grid look. */
function spread(zone: Zone, l: Layout, n: number, rnd: () => number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let best: [number, number] = sampleIn(zone, l, rnd);
    let bestD = -1;
    for (let k = 0; k < 6; k++) {
      const c = sampleIn(zone, l, rnd);
      let d = Infinity;
      for (const p of pts) d = Math.min(d, (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2);
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    pts.push(best);
  }
  return pts;
}

function usePeople(venue: VenueId, people: number, shares: GroupShares, seed: number): Person[] {
  return useMemo(() => {
    const n = Math.min(MAX_DOTS, Math.max(1, Math.round(people)));
    const l = LAYOUTS[venue];
    const rnd = mulberry32(seed ^ 0x5bd1e995);
    const counts = allocate(n, shares);
    const zones: Record<Zone, [number, number][]> = {
      floor: spread('floor', l, n, rnd),
      bar: spread('bar', l, n, rnd),
      lounge: spread('lounge', l, n, rnd),
    };
    // shuffle slot order so groups interleave
    const slots = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
    const list: Person[] = [];
    let i = 0;
    for (const g of GROUP_IDS) {
      for (let k = 0; k < counts[g]; k++, i++) {
        const slot = slots[i];
        // even, interleaved ranks per group → smooth, monotone migrations
        const rank = (k + 0.5) / counts[g];
        list.push({
          i,
          group: g,
          rank,
          phase: rnd(),
          pos: { floor: zones.floor[slot], bar: zones.bar[slot], lounge: zones.lounge[slot] },
        });
      }
    }
    return list;
  }, [venue, people, shares.groove, shares.hits, shares.explorers, seed]);
}

export function zoneOf(rank: number, split: { floor: number; bar: number; lounge: number }): Zone {
  if (rank < split.floor) return 'floor';
  if (rank < split.floor + split.bar) return 'bar';
  return 'lounge';
}

export function Mark({ group, size = 7 }: { group: GroupId; size?: number }) {
  const m = GROUPS[group].mark;
  if (m === 'dot') return <circle className={`mark mark-${group}`} r={size * 0.78} />;
  if (m === 'ring') return <circle className={`mark mark-${group}`} r={size * 0.7} />;
  const s = size;
  return <path className={`mark mark-${group}`} d={`M0 ${-s} L${s * 0.9} ${s * 0.65} L${-s * 0.9} ${s * 0.65} Z`} />;
}

export function MarkIcon({ group }: { group: GroupId }) {
  return (
    <svg className="mark-icon" viewBox="-10 -10 20 20" aria-hidden="true" width="16" height="16">
      <Mark group={group} size={7} />
    </svg>
  );
}

interface Props {
  venue: VenueId;
  people: number;
  shares: GroupShares;
  splits: Splits;
  intensity: number;
  seed: number;
  selected?: GroupId | null;
  onSelect?: (g: GroupId | null) => void;
  live?: boolean;
  label: string;
  showCounts?: boolean;
}

function FloorViewInner({ venue, people, shares, splits, intensity, seed, selected, onSelect, live, label, showCounts = true }: Props) {
  const l = LAYOUTS[venue];
  const persons = usePeople(venue, people, shares, seed);
  const zoneCounts: Record<Zone, number> = { floor: 0, bar: 0, lounge: 0 };
  const placed = persons.map((p) => {
    const z = zoneOf(p.rank, splits[p.group]);
    zoneCounts[z]++;
    return { p, z };
  });
  const scale = people > MAX_DOTS ? people / MAX_DOTS : 1;
  const k = Math.max(0, Math.min(1, intensity / 100));
  // beat period follows intensity (visual only)
  const beat = (1.5 - k * 0.75).toFixed(2);
  const amp = (0.6 + k * 2.6).toFixed(2);
  const warm = Math.max(0, (k - 0.55) / 0.45);

  const zoneLabel = (z: Zone | 'booth', n: string, title: string) => {
    const pos = l.labels[z];
    const count = z === 'booth' ? '' : ` · ${Math.round(zoneCounts[z as Zone] * scale)}`;
    return (
      <text className="plan-label" x={pos.x} y={pos.y} textAnchor={pos.anchor ?? 'start'}>
        <tspan className="plan-label-n">{n}</tspan> {title}
        {showCounts && count}
      </text>
    );
  };

  return (
    <svg
      className={`floorview venue-${venue}${live ? ' is-live' : ''}${selected ? ' has-selection' : ''}`}
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label={label}
      style={{ ['--beat' as string]: `${beat}s`, ['--amp' as string]: amp }}
    >
      <defs>
        <radialGradient id={`lime-${venue}`}>
          <stop offset="0%" stopColor="var(--acid)" stopOpacity="0.55" />
          <stop offset="70%" stopColor="var(--acid)" stopOpacity="0.06" />
          <stop offset="100%" stopColor="var(--acid)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`amber-${venue}`}>
          <stop offset="0%" stopColor="var(--amber)" stopOpacity="0.6" />
          <stop offset="75%" stopColor="var(--amber)" stopOpacity="0.05" />
          <stop offset="100%" stopColor="var(--amber)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path className="plan-outline" d={l.outline} />
      {l.details}

      {/* light pools – opacity driven by simulated intensity */}
      <ellipse
        className="light"
        cx={l.floor.cx}
        cy={l.floor.cy}
        rx={l.floor.rx * 1.25}
        ry={l.floor.ry * 1.25}
        fill={`url(#lime-${venue})`}
        style={{ opacity: 0.25 + k * 0.6 * (1 - warm * 0.6) }}
      />
      <ellipse
        className="light"
        cx={l.floor.cx}
        cy={l.floor.cy}
        rx={l.floor.rx * 1.1}
        ry={l.floor.ry * 1.1}
        fill={`url(#amber-${venue})`}
        style={{ opacity: warm * 0.85 }}
      />

      <ellipse className="plan-floor" cx={l.floor.cx} cy={l.floor.cy} rx={l.floor.rx} ry={l.floor.ry} />
      <rect className="plan-zone" x={l.bar.x} y={l.bar.y} width={l.bar.w} height={l.bar.h} />
      <rect className="plan-zone" x={l.lounge.x} y={l.lounge.y} width={l.lounge.w} height={l.lounge.h} />
      <rect className="plan-booth" x={l.booth.x} y={l.booth.y} width={l.booth.w} height={l.booth.h} />
      <g className="plan-decks" transform={`translate(${l.booth.x + l.booth.w / 2} ${l.booth.y + l.booth.h / 2})`}>
        {l.booth.w > l.booth.h ? (
          <>
            <circle r={13} cx={-l.booth.w / 4} />
            <circle r={13} cx={l.booth.w / 4} />
            <rect x={-7} y={-14} width={14} height={28} />
          </>
        ) : (
          <>
            <circle r={13} cy={-l.booth.h / 4} />
            <circle r={13} cy={l.booth.h / 4} />
            <rect x={-14} y={-7} width={28} height={14} />
          </>
        )}
      </g>

      {zoneLabel('booth', '01', 'BOOTH')}
      {zoneLabel('floor', '02', 'FLOOR')}
      {zoneLabel('bar', '03', 'BAR')}
      {zoneLabel('lounge', '04', 'LOUNGE')}

      <g className="crowd">
        {placed.map(({ p, z }) => {
          const [x, y] = p.pos[z];
          const dim = selected && selected !== p.group;
          return (
            <g
              key={p.i}
              className={`person in-${z}${dim ? ' is-dim' : ''}${selected === p.group ? ' is-sel' : ''}`}
              style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, transitionDelay: `${(p.i % 9) * 70}ms` }}
              onClick={onSelect ? () => onSelect(selected === p.group ? null : p.group) : undefined}
            >
              <g className="bob" style={{ animationDelay: `${(-p.phase * 1.5).toFixed(2)}s` }}>
                <Mark group={p.group} />
              </g>
            </g>
          );
        })}
      </g>

      <g className="plan-scale" transform={`translate(${VIEW.w - 150} ${VIEW.h - 26})`}>
        <path d="M0 0 H100 M0 -5 V5 M50 -3 V3 M100 -5 V5" />
        <text x={0} y={-10}>0</text>
        <text x={100} y={-10} textAnchor="end">
          5 m
        </text>
      </g>
      {scale > 1 && (
        <text className="plan-note" x={20} y={VIEW.h - 14}>
          1 işaret ≈ {scale.toFixed(1)} kişi
        </text>
      )}
    </svg>
  );
}

export const FloorView = memo(FloorViewInner);
