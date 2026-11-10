// Rule-based, deterministic crowd simulation.
// One step = one simulated minute. Never depends on frame rate or wall clock.
import { CURVEBALLS, DIRECTIONS, GROUPS, VENUES } from './content';
import { plannedEnergyAt } from './arc';
import { clamp, keyedRng } from './rng';
import type {
  ArcSection,
  CurveballEffect,
  CurveballId,
  GroupId,
  MoveId,
  RoomConfig,
  ScheduledCurveball,
  SimEvent,
  SimState,
  Snapshot,
} from './types';
import { GROUP_IDS } from './types';

export const DECISION_EVERY = 5;

export interface SimConfig {
  room: RoomConfig;
  arc: ArcSection[];
  seed: number;
  curveballs: ScheduledCurveball[];
  /** end the night early at this minute (user pressed finish) */
  stopAt?: number;
}

export function initialState(room: RoomConfig): SimState {
  const base = 18 + room.startEnergy * 0.55;
  const dir = DIRECTIONS[room.direction];
  const groups = {} as SimState['groups'];
  for (const g of GROUP_IDS) {
    const aff = GROUPS[g].affinity[room.direction];
    groups[g] = { engagement: clamp(base + (aff - 0.5) * 12), fatigue: 0 };
  }
  return {
    minute: 0,
    duration: room.duration,
    intensity: room.startEnergy,
    targetIntensity: room.startEnergy,
    vocal: dir.vocal,
    consistency: 70,
    direction: room.direction,
    social: VENUES[room.venue].social,
    tension: 0,
    move: 'groove',
    moveAge: 0,
    repeat: 0,
    vocalUses: 0,
    groups,
  };
}

/** Diminishing returns when the same move is repeated back to back. */
export function repeatFactor(repeat: number): number {
  return 1 / (1 + 0.45 * repeat);
}

/** Share of a group that is on the dance floor right now (0–1). */
export function floorShare(s: SimState, g: GroupId): number {
  const gs = s.groups[g];
  const x = (gs.engagement - 42 - s.social * 22 - gs.fatigue * 0.35) / 9;
  return 1 / (1 + Math.exp(-x));
}

/** Where the off-floor part of a group goes: tired → lounge, social → bar. */
export function zoneSplit(s: SimState, g: GroupId): { floor: number; bar: number; lounge: number } {
  const floor = floorShare(s, g);
  const off = 1 - floor;
  const tired = s.groups[g].fatigue / 100;
  const loungeW = 0.25 + tired * 1.4;
  const barW = 0.35 + s.social;
  const lounge = (off * loungeW) / (loungeW + barW);
  return { floor, bar: off - lounge, lounge };
}

export function roomEnergy(s: SimState, room: RoomConfig): number {
  let floor = 0;
  for (const g of GROUP_IDS) floor += room.shares[g] * floorShare(s, g);
  const shareSum = room.shares.groove + room.shares.hits + room.shares.explorers || 1;
  return clamp(0.5 * s.intensity + 50 * (floor / shareSum));
}

export function floorFraction(s: SimState, room: RoomConfig): number {
  let floor = 0;
  const sum = room.shares.groove + room.shares.hits + room.shares.explorers || 1;
  for (const g of GROUP_IDS) floor += room.shares[g] * floorShare(s, g);
  return floor / sum;
}

function cloneState(s: SimState): SimState {
  return {
    ...s,
    groups: {
      groove: { ...s.groups.groove },
      hits: { ...s.groups.hits },
      explorers: { ...s.groups.explorers },
    },
  };
}

function applyEffect(s: SimState, e: CurveballEffect): void {
  if (e.intensity) {
    s.intensity = clamp(s.intensity + e.intensity);
    s.targetIntensity = clamp(s.targetIntensity + e.intensity);
  }
  if (e.vocal) s.vocal = clamp(s.vocal + e.vocal);
  if (e.consistency) s.consistency = clamp(s.consistency + e.consistency);
  if (e.social) s.social = clamp(s.social + e.social, 0, 1);
  if (e.durationDelta) s.duration = Math.max(s.minute + DECISION_EVERY, s.duration + e.durationDelta);
  if (e.direction) s.direction = e.direction;
  for (const g of GROUP_IDS) {
    const de = e.engagement?.[g];
    if (de) s.groups[g].engagement = clamp(s.groups[g].engagement + de);
    const df = e.fatigue?.[g];
    if (df) s.groups[g].fatigue = clamp(s.groups[g].fatigue + df);
  }
  if (e.setMove) {
    s.move = e.setMove;
    s.moveAge = 0;
    if (e.setMove === 'breathe') s.targetIntensity = clamp(s.intensity - 16);
    if (e.setMove === 'intensify') s.targetIntensity = clamp(s.intensity + 10);
    if (e.setMove === 'groove') s.targetIntensity = s.intensity;
  }
}

/** Apply a DJ decision at the current minute. Pure. */
export function applyMove(prev: SimState, move: MoveId, room: RoomConfig, direction?: SimState['direction']): SimState {
  const s = cloneState(prev);
  s.repeat = move === prev.move && prev.moveAge <= DECISION_EVERY + 1 ? prev.repeat + 1 : 0;
  const f = repeatFactor(s.repeat);
  const lateness = s.minute / Math.max(1, s.duration);
  const hitPull = room.hitExpectation / 100;
  const open = room.openness / 100;
  const builtUp = prev.move === 'build' ? Math.min(1, prev.tension / 40) : 0;

  switch (move) {
    case 'groove':
      s.targetIntensity = s.intensity;
      s.consistency = clamp(s.consistency + 8);
      break;
    case 'vocal': {
      s.vocalUses += 1;
      const wear = 1 / (1 + 0.35 * Math.max(0, s.vocalUses - 2));
      s.vocal = clamp(s.vocal + 42 * f * wear);
      s.groups.hits.engagement = clamp(s.groups.hits.engagement + (5 + 9 * hitPull) * f * wear);
      s.groups.groove.engagement = clamp(s.groups.groove.engagement - 2 - (s.vocalUses > 3 ? 3 : 0));
      s.groups.explorers.engagement = clamp(s.groups.explorers.engagement - 1.5);
      s.targetIntensity = clamp(s.intensity + 4);
      s.social = clamp(s.social - 0.05 * f, 0, 1);
      break;
    }
    case 'intensify': {
      s.targetIntensity = clamp(s.intensity + 16 * f);
      if (builtUp > 0.3) {
        // payoff of a build: the drop lands
        const pay = 6 + 10 * builtUp;
        for (const g of GROUP_IDS) s.groups[g].engagement = clamp(s.groups[g].engagement + pay);
        s.targetIntensity = clamp(s.intensity + 22);
      }
      if (lateness > 0.85) {
        for (const g of GROUP_IDS) s.groups[g].fatigue = clamp(s.groups[g].fatigue + 4);
      }
      s.tension = 0;
      break;
    }
    case 'breathe': {
      s.targetIntensity = Math.max(18, clamp(s.intensity - 22));
      if (builtUp > 0.3) {
        // a build that never lands is a letdown
        for (const g of GROUP_IDS) s.groups[g].engagement = clamp(s.groups[g].engagement - 5 * builtUp);
      }
      s.tension = 0;
      break;
    }
    case 'shift': {
      const next = direction ?? s.direction;
      const changed = next !== s.direction;
      s.direction = next;
      s.consistency = clamp(s.consistency - (changed ? 38 : 12) * (1.2 - 0.4 * open));
      s.groups.explorers.engagement = clamp(s.groups.explorers.engagement + (changed ? 4 + 6 * open : 1) * f);
      s.vocal = clamp(s.vocal * 0.5 + DIRECTIONS[next].vocal * 0.5);
      s.tension = 0;
      break;
    }
    case 'build':
      s.tension = prev.move === 'build' ? prev.tension : 0;
      s.targetIntensity = s.intensity;
      break;
  }
  s.move = move;
  s.moveAge = 0;
  return s;
}

export function applyEvent(s: SimState, e: SimEvent, room: RoomConfig): SimState {
  return e.type === 'move' ? applyMove(s, e.move, room, e.direction) : applyCurveball(s, e.id, e.option);
}

export function applyCurveball(prev: SimState, id: CurveballId, optionId: string): SimState {
  const def = CURVEBALLS[id];
  const s = cloneState(prev);
  applyEffect(s, def.onset);
  const opt = def.options.find((o) => o.id === optionId) ?? def.options[0];
  applyEffect(s, opt.effect);
  return s;
}

/** Advance one simulated minute. Deterministic for (state, room, seed). */
export function tick(prev: SimState, room: RoomConfig, seed: number): SimState {
  const s = cloneState(prev);
  const rng = keyedRng(seed, s.minute);
  const venue = VENUES[room.venue];
  const dir = DIRECTIONS[s.direction];
  const lateness = s.minute / Math.max(1, s.duration);
  const hitPull = room.hitExpectation / 100;
  const open = room.openness / 100;

  // --- the music ---
  if (s.move === 'build' && s.moveAge < 12) {
    s.targetIntensity = clamp(s.targetIntensity + 2.2);
    s.tension = clamp(s.tension + 4);
  }
  s.intensity = clamp(s.intensity + (s.targetIntensity - s.intensity) * 0.3);
  s.vocal = clamp(s.vocal + (dir.vocal - s.vocal) * 0.12);
  if (s.move !== 'shift' || s.moveAge > 2) s.consistency = clamp(s.consistency + 1.6);

  // --- the room ---
  const closing = lateness > 0.85 ? (lateness - 0.85) / 0.15 : 0;
  for (const g of GROUP_IDS) {
    const def = GROUPS[g];
    const gs = s.groups[g];
    // what the group wants rises through the night: from the room's start energy towards its comfort zone
    const ramp = Math.min(1, lateness / 0.45);
    const eased = ramp * ramp * (3 - 2 * ramp);
    const comfort = def.comfort + venue.toleranceShift;
    const ideal = room.startEnergy + (comfort - room.startEnergy) * (0.25 + 0.75 * eased) - gs.fatigue * 0.4 - closing * 14;
    const intensityFit = clamp(1 - Math.abs(s.intensity - ideal) / 26, -1.2, 1);
    const wantVocal = g === 'hits' ? def.vocalPref * (0.6 + 0.4 * hitPull) + 12 * hitPull : def.vocalPref;
    const vocalFit = clamp(1 - Math.abs(s.vocal - wantVocal) / 45, -1, 1);
    const dirFit = def.affinity[s.direction] * 2 - 1;
    let flow = 0;
    if (g === 'groove') flow = (s.consistency - 55) / 45;
    if (g === 'explorers') {
      // like freshness, get bored by long sameness
      const stale = s.move === 'groove' ? Math.max(0, s.moveAge - 8) / 10 : 0;
      flow = (0.15 + open * 0.3) * ((60 - s.consistency) / 60) - stale * (0.6 + open * 0.4);
    }
    if (g === 'hits') flow = s.vocalUses === 0 && s.minute > 20 ? -0.25 * hitPull : 0;
    const anticipation = s.move === 'build' && g !== 'hits' ? 0.25 : 0;
    const drive =
      0.38 * intensityFit + 0.24 * vocalFit + 0.22 * dirFit + 0.16 * flow + anticipation;
    const noise = (rng() - 0.5) * 1.2;
    const ceiling = 100 - gs.fatigue * 0.55;
    gs.engagement = clamp(gs.engagement + drive * 3.4 + noise, 0, ceiling);
    // nobody stays at 100: excitement settles unless it is renewed
    if (gs.engagement > 72) gs.engagement -= (gs.engagement - 72) * 0.07;

    // fatigue: builds above ~52 intensity for the people on the floor, recovers below
    const onFloor = floorShare(s, g);
    if (s.intensity > 50) {
      gs.fatigue = clamp(gs.fatigue + ((s.intensity - 50) / 50) * 3.0 * def.stamina * venue.fatigueRate * (0.4 + onFloor));
    } else {
      gs.fatigue = clamp(gs.fatigue - ((50 - s.intensity) / 50) * 3.2 - 0.2);
    }
    gs.fatigue = clamp(gs.fatigue - (1 - onFloor) * 0.35);
    // a deliberate breather (breakdown, lower-energy record) gives real rest for a few minutes
    if (s.move === 'breathe' && s.moveAge < 6) gs.fatigue = clamp(gs.fatigue - 1.6);
  }
  // social pull relaxes slowly back to the venue baseline
  s.social = clamp(s.social + (venue.social - s.social) * 0.04, 0, 1);

  s.minute += 1;
  s.moveAge += 1;
  return s;
}

export function snapshot(s: SimState, cfg: SimConfig): Snapshot {
  const groups = {} as Snapshot['groups'];
  for (const g of GROUP_IDS) groups[g] = { ...s.groups[g], floor: floorShare(s, g) };
  return {
    minute: s.minute,
    intensity: s.intensity,
    energy: roomEnergy(s, cfg.room),
    planned: plannedEnergyAt(cfg.arc, s.minute, cfg.room.duration),
    vocal: s.vocal,
    consistency: s.consistency,
    groups,
  };
}

export type Pending =
  | { kind: 'curveball'; id: CurveballId }
  | { kind: 'decision' }
  | { kind: 'finished' }
  | null;

export interface RunResult {
  state: SimState;
  snapshots: Snapshot[];
  /** state captured right before each logged event, aligned to events */
  before: SimState[];
  pending: Pending;
}

function isDecisionMinute(minute: number): boolean {
  return minute % DECISION_EVERY === 0;
}

/**
 * Replay a night from scratch up to `untilMinute`, applying logged events.
 * The whole run is a pure function of (config, events, untilMinute).
 */
export function run(cfg: SimConfig, events: SimEvent[], untilMinute: number): RunResult {
  let s = initialState(cfg.room);
  const snapshots: Snapshot[] = [snapshot(s, cfg)];
  const before: SimState[] = [];
  const answered = new Set(events.filter((e) => e.type === 'curveball').map((e) => `${e.id}@${e.minute}`));
  let ei = 0;
  const sorted = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.minute - b.e.minute || a.i - b.i)
    .map((x) => x.e);

  for (;;) {
    // apply every event logged for this minute
    while (ei < sorted.length && sorted[ei].minute === s.minute) {
      const e = sorted[ei];
      before.push(s);
      s = applyEvent(s, e, cfg.room);
      ei++;
    }
    if (s.minute >= s.duration || (cfg.stopAt !== undefined && s.minute >= cfg.stopAt)) {
      return { state: s, snapshots, before, pending: { kind: 'finished' } };
    }
    // what does this minute still need?
    const due = cfg.curveballs.find((c) => c.minute === s.minute && !answered.has(`${c.id}@${c.minute}`));
    const moved = sorted.some((e) => e.type === 'move' && e.minute === s.minute);
    const pending: Pending = due
      ? { kind: 'curveball', id: due.id }
      : isDecisionMinute(s.minute) && !moved
        ? { kind: 'decision' }
        : null;
    if (pending || s.minute >= untilMinute) {
      return { state: s, snapshots, before, pending };
    }
    s = tick(s, cfg.room, cfg.seed);
    snapshots.push(snapshot(s, cfg));
  }
}
