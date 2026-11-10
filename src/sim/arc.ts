import type { ArcSection, DirectionId, FamiliarityTarget, SectionKind } from './types';

export const MIN_SECTION = 3;
export const MAX_SECTION = 90;

export const SECTION_LABEL: Record<SectionKind, string> = {
  arrival: 'Arrival',
  warmup: 'Warm-up',
  lift: 'Lift',
  peak: 'Peak',
  release: 'Release',
  closing: 'Closing',
};

export const SECTION_KINDS: SectionKind[] = ['arrival', 'warmup', 'lift', 'peak', 'release', 'closing'];

export function arcTotal(arc: ArcSection[]): number {
  return arc.reduce((sum, s) => sum + s.minutes, 0);
}

/** Start minute of every section, in order. */
export function sectionStarts(arc: ArcSection[]): number[] {
  const out: number[] = [];
  let t = 0;
  for (const s of arc) {
    out.push(t);
    t += s.minutes;
  }
  return out;
}

/**
 * Scale section lengths so they add up exactly to `duration`,
 * keeping each ≥ MIN_SECTION and distributing rounding error (largest remainder).
 */
export function fitArcToDuration(arc: ArcSection[], duration: number): ArcSection[] {
  if (arc.length === 0) return arc;
  const total = arcTotal(arc);
  const target = Math.max(duration, arc.length * MIN_SECTION);
  const raw = arc.map((s) => (total > 0 ? (s.minutes / total) * target : target / arc.length));
  const floored = raw.map((r) => Math.max(MIN_SECTION, Math.floor(r)));
  let diff = target - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  let k = 0;
  while (diff > 0) {
    floored[order[k % order.length].i] += 1;
    diff--;
    k++;
  }
  // over-allocation (because of MIN_SECTION) – take back from the largest sections
  while (diff < 0) {
    let maxI = 0;
    for (let i = 1; i < floored.length; i++) if (floored[i] > floored[maxI]) maxI = i;
    if (floored[maxI] <= MIN_SECTION) break;
    floored[maxI] -= 1;
    diff++;
  }
  return arc.map((s, i) => ({ ...s, minutes: floored[i] }));
}

export function setSectionMinutes(arc: ArcSection[], id: string, minutes: number): ArcSection[] {
  const m = Math.round(Math.min(MAX_SECTION, Math.max(MIN_SECTION, minutes)));
  return arc.map((s) => (s.id === id ? { ...s, minutes: m } : s));
}

export function moveSection(arc: ArcSection[], id: string, delta: -1 | 1): ArcSection[] {
  const i = arc.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= arc.length) return arc;
  const next = arc.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Index of the section a given night-minute falls in (arc scaled to `duration`). */
export function sectionIndexAt(arc: ArcSection[], minute: number, duration: number): number {
  const total = arcTotal(arc);
  if (!arc.length || total <= 0) return -1;
  const t = (minute / Math.max(1, duration)) * total;
  let acc = 0;
  for (let i = 0; i < arc.length; i++) {
    acc += arc[i].minutes;
    if (t < acc) return i;
  }
  return arc.length - 1;
}

/** Smooth planned energy curve: linear interpolation between section midpoints. */
export function plannedEnergyAt(arc: ArcSection[], minute: number, duration: number): number {
  const total = arcTotal(arc);
  if (!arc.length || total <= 0) return 50;
  const t = (minute / Math.max(1, duration)) * total;
  const starts = sectionStarts(arc);
  const mids = arc.map((s, i) => starts[i] + s.minutes / 2);
  if (t <= mids[0]) return arc[0].energy;
  for (let i = 0; i < arc.length - 1; i++) {
    if (t <= mids[i + 1]) {
      const f = (t - mids[i]) / (mids[i + 1] - mids[i]);
      return arc[i].energy + (arc[i + 1].energy - arc[i].energy) * f;
    }
  }
  return arc[arc.length - 1].energy;
}

let idCounter = 0;
export function sectionId(): string {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter}`;
}

export function makeSection(
  kind: SectionKind,
  minutes: number,
  energy: number,
  direction: DirectionId,
  familiarity: FamiliarityTarget,
  purpose: string,
  id?: string,
): ArcSection {
  return { id: id ?? sectionId(), kind, minutes, energy, direction, familiarity, purpose };
}
