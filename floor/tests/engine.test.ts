import { describe, expect, it } from 'vitest';
import { applyMove, initialState, run, tick } from '../src/sim/engine';
import { mulberry32 } from '../src/sim/rng';
import { MOVE_IDS, GROUP_IDS, type SimState } from '../src/sim/types';
import { cfgOf, play } from './helpers';

const avgFatigue = (s: SimState) => GROUP_IDS.reduce((a, g) => a + s.groups[g].fatigue, 0) / 3;

describe('determinism', () => {
  it('same scenario, seed and decisions → identical night', () => {
    const cfg = cfgOf(0);
    const events = play(cfg, (_m, n) => MOVE_IDS[n % MOVE_IDS.length]);
    const a = run(cfg, events, Infinity);
    const b = run(structuredClone(cfg), structuredClone(events), Infinity);
    expect(b.snapshots).toEqual(a.snapshots);
    expect(b.state).toEqual(a.state);
  });

  it('a different seed changes the night, but only slightly (noise, not chaos)', () => {
    const cfg = cfgOf(0);
    const events = play(cfg, () => 'groove');
    const a = run(cfg, events, Infinity).snapshots;
    const b = run({ ...cfg, seed: cfg.seed + 1 }, events, Infinity).snapshots;
    expect(b).not.toEqual(a);
    const maxGap = Math.max(...a.map((s, i) => Math.abs(s.energy - b[i].energy)));
    expect(maxGap).toBeLessThan(12);
  });

  it('replaying in pieces equals replaying at once (clock is step-based, not frame-based)', () => {
    const cfg = cfgOf(1);
    const events = play(cfg, (m) => (m % 10 === 0 ? 'vocal' : 'groove'));
    const full = run(cfg, events, Infinity);
    let last = run(cfg, events, 0);
    for (let m = 1; m <= cfg.room.duration; m++) last = run(cfg, events, m);
    expect(last.state).toEqual(full.state);
  });
});

describe('bounds', () => {
  it('every state variable stays in range for random decision sequences', () => {
    for (let sc = 0; sc < 3; sc++) {
      for (let seed = 1; seed <= 15; seed++) {
        const rnd = mulberry32(seed * 97);
        const cfg = cfgOf(sc);
        const events = play(cfg, () => MOVE_IDS[Math.floor(rnd() * MOVE_IDS.length)], seed % 3);
        const r = run(cfg, events, Infinity);
        for (const s of r.snapshots) {
          for (const v of [s.intensity, s.energy, s.vocal, s.consistency]) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
          }
          for (const g of GROUP_IDS) {
            expect(s.groups[g].engagement).toBeGreaterThanOrEqual(0);
            expect(s.groups[g].engagement).toBeLessThanOrEqual(100);
            expect(s.groups[g].fatigue).toBeGreaterThanOrEqual(0);
            expect(s.groups[g].fatigue).toBeLessThanOrEqual(100);
            expect(s.groups[g].floor).toBeGreaterThanOrEqual(0);
            expect(s.groups[g].floor).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('rules', () => {
  const room = cfgOf(0).room;
  const advance = (s: SimState, n: number) => {
    for (let i = 0; i < n; i++) s = tick(s, room, 1);
    return s;
  };

  it('sustained high intensity builds fatigue; breathing space recovers it', () => {
    let s = initialState({ ...room, startEnergy: 80 });
    s = advance(applyMove(s, 'groove', room), 25);
    const tired = avgFatigue(s);
    expect(tired).toBeGreaterThan(25);

    const pushed = advance(applyMove(s, 'intensify', room), 10);
    const rested = advance(applyMove(s, 'breathe', room), 10);
    expect(avgFatigue(rested)).toBeLessThan(tired);
    expect(avgFatigue(pushed)).toBeGreaterThan(avgFatigue(rested) + 10);
  });

  it('a familiar vocal wins the hit group but costs the groove group', () => {
    const s = advance(initialState(room), 10);
    const v = applyMove(s, 'vocal', room);
    expect(v.groups.hits.engagement).toBeGreaterThan(s.groups.hits.engagement);
    expect(v.groups.groove.engagement).toBeLessThan(s.groups.groove.engagement);
  });

  it('repeating the same move gives diminishing returns', () => {
    const s0 = advance(initialState(room), 10);
    const once = applyMove(s0, 'vocal', room);
    const gain1 = once.groups.hits.engagement - s0.groups.hits.engagement;
    const again = applyMove(once, 'vocal', room);
    const gain2 = again.groups.hits.engagement - once.groups.hits.engagement;
    expect(again.repeat).toBe(1);
    expect(gain2).toBeLessThan(gain1);

    const i1 = applyMove(s0, 'intensify', room);
    const i2 = applyMove({ ...i1, intensity: i1.targetIntensity }, 'intensify', room);
    expect(i2.targetIntensity - i1.targetIntensity).toBeLessThan(i1.targetIntensity - s0.intensity);
  });

  it('constant direction changes erode consistency', () => {
    let s = advance(initialState(room), 5);
    const start = s.consistency;
    for (const d of ['melodic', 'disco', 'anthems'] as const) s = applyMove(s, 'shift', room, d);
    expect(s.consistency).toBeLessThan(start - 50);
  });

  it('a build that lands pays off more than intensifying cold', () => {
    const s0 = advance(initialState(room), 20);
    let built = applyMove(s0, 'build', room);
    built = advance(built, 5);
    const landed = applyMove(built, 'intensify', room);
    const cold = applyMove(advance(applyMove(s0, 'groove', room), 5), 'intensify', room);
    const sum = (s: SimState) => GROUP_IDS.reduce((a, g) => a + s.groups[g].engagement, 0);
    expect(sum(landed) - sum(built)).toBeGreaterThan(sum(cold) - sum(advance(applyMove(s0, 'groove', room), 5)) + 10);
  });

  it('only intensifying is not the best strategy', () => {
    const cfg = cfgOf(2);
    const max = run(cfg, play(cfg, () => 'intensify'), Infinity);
    const paced = run(
      cfg,
      play(cfg, (m) => (m < 20 ? 'groove' : m % 20 === 0 ? 'breathe' : m % 20 === 10 ? 'build' : m % 20 === 15 ? 'intensify' : 'groove')),
      Infinity,
    );
    expect(avgFatigue(paced.state)).toBeLessThan(avgFatigue(max.state));
  });
});
