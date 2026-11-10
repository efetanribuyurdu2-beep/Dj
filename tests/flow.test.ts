import { describe, expect, it } from 'vitest';
import { run } from '../src/sim/engine';
import { arcTotal, fitArcToDuration, MIN_SECTION, moveSection, plannedEnergyAt, setSectionMinutes } from '../src/sim/arc';
import { defaultArc, defaultCurveballs, roomFromVenue, SCENARIOS } from '../src/sim/scenarios';
import { buildDebrief } from '../src/sim/debrief';
import { VENUE_IDS } from '../src/sim/content';
import { cfgOf, play } from './helpers';

describe('night arc durations', () => {
  it('every scenario arc adds up to the event length', () => {
    for (const sc of SCENARIOS) expect(arcTotal(sc.arc)).toBe(sc.room.duration);
  });

  it('fitting to a duration sums exactly and keeps minimum lengths', () => {
    const arc = SCENARIOS[2].arc;
    for (const d of [30, 47, 61, 75, 119, 180]) {
      const fit = fitArcToDuration(arc, d);
      expect(arcTotal(fit)).toBe(d);
      expect(fit.every((s) => s.minutes >= MIN_SECTION)).toBe(true);
      expect(fit.map((s) => s.id)).toEqual(arc.map((s) => s.id));
    }
    // keeps proportions roughly
    const doubled = fitArcToDuration(SCENARIOS[0].arc, 150);
    expect(doubled.map((s) => s.minutes)).toEqual(SCENARIOS[0].arc.map((s) => s.minutes * 2));
  });

  it('editing a section changes the total consistently; reorder keeps the total', () => {
    const arc = SCENARIOS[0].arc;
    const longer = setSectionMinutes(arc, arc[1].id, arc[1].minutes + 7);
    expect(arcTotal(longer)).toBe(arcTotal(arc) + 7);
    expect(setSectionMinutes(arc, arc[1].id, 0)[1].minutes).toBe(MIN_SECTION);
    const moved = moveSection(arc, arc[0].id, 1);
    expect(moved[1].id).toBe(arc[0].id);
    expect(arcTotal(moved)).toBe(arcTotal(arc));
    expect(moveSection(arc, arc[0].id, -1)).toBe(arc);
  });

  it('planned energy follows the sections', () => {
    const arc = SCENARIOS[0].arc;
    expect(plannedEnergyAt(arc, 0, 75)).toBe(arc[0].energy);
    expect(plannedEnergyAt(arc, 75, 75)).toBe(arc[arc.length - 1].energy);
    const peakMid = 10 + 15 + 15 + 7.5;
    expect(plannedEnergyAt(arc, peakMid, 75)).toBeCloseTo(arc[3].energy);
  });

  it('custom rooms get a fitting arc and curveballs inside the night', () => {
    for (const v of VENUE_IDS) {
      const room = roomFromVenue(v);
      expect(arcTotal(defaultArc(room))).toBe(room.duration);
      for (const c of defaultCurveballs(room)) expect(c.minute).toBeLessThan(room.duration);
    }
  });
});

describe('rehearsal flow', () => {
  it('asks for a decision at minute 0 and every 5 minutes', () => {
    const cfg = cfgOf(0, { curveballs: [] });
    expect(run(cfg, [], 100).pending).toEqual({ kind: 'decision' });
    const r = run(cfg, [{ type: 'move', minute: 0, move: 'groove' }], 100);
    expect(r.state.minute).toBe(5);
    expect(r.pending).toEqual({ kind: 'decision' });
  });

  it('the clock cursor stops the replay in between decisions', () => {
    const cfg = cfgOf(0, { curveballs: [] });
    const r = run(cfg, [{ type: 'move', minute: 0, move: 'groove' }], 3);
    expect(r.state.minute).toBe(3);
    expect(r.pending).toBeNull();
  });

  it('a scheduled curveball appears at its minute, before the decision', () => {
    const cfg = cfgOf(0); // popRequest @20
    const events = play(cfg, () => 'groove').filter((e) => e.minute < 20);
    const r = run(cfg, events, 100);
    expect(r.state.minute).toBe(20);
    expect(r.pending).toEqual({ kind: 'curveball', id: 'popRequest' });
    const answered = run(cfg, [...events, { type: 'curveball', minute: 20, id: 'popRequest', option: 'edit' }], 100);
    expect(answered.pending).toEqual({ kind: 'decision' });
  });

  it('a curveball at minute 0 comes first (hot handover)', () => {
    expect(run(cfgOf(2), [], 10).pending).toEqual({ kind: 'curveball', id: 'hotHandover' });
  });

  it('cut-short shortens the night', () => {
    const cfg = cfgOf(0, { curveballs: [{ id: 'cutShort', minute: 30 }] });
    const r = run(cfg, play(cfg, () => 'groove'), Infinity);
    expect(r.state.minute).toBe(60);
    expect(r.pending).toEqual({ kind: 'finished' });
  });

  it('finishing early stops at the chosen minute', () => {
    const cfg = cfgOf(0, { curveballs: [] });
    const events = play(cfg, () => 'groove').filter((e) => e.minute <= 20);
    const r = run({ ...cfg, stopAt: 22 }, events, Infinity);
    expect(r.state.minute).toBe(22);
    expect(r.pending).toEqual({ kind: 'finished' });
    expect(buildDebrief({ ...cfg, stopAt: 22 }, events).flow).toContain('22. dakikada sen bitirdin');
  });
});

describe('debrief comes from the real decisions', () => {
  it('different decisions produce different evaluations', () => {
    const cfg = cfgOf(1);
    const vocalHeavy = buildDebrief(cfg, play(cfg, () => 'vocal'));
    const pushy = buildDebrief(cfg, play(cfg, () => 'intensify'));
    expect(vocalHeavy.practice.title).toBe('Vokalsiz groove');
    expect(vocalHeavy.stats.vocals).toBeGreaterThanOrEqual(10);
    expect(pushy.practice.title).not.toBe(vocalHeavy.practice.title);
    expect(pushy.flow).not.toBe(vocalHeavy.flow);
  });

  it('best decision and turning points point at logged events', () => {
    const cfg = cfgOf(0);
    const events = play(cfg, (m) => (m < 20 ? 'groove' : m < 35 ? 'build' : m === 40 ? 'intensify' : m > 55 ? 'breathe' : 'groove'));
    const d = buildDebrief(cfg, events);
    const minutes = new Set(events.map((e) => e.minute));
    expect(d.best).toBeDefined();
    expect(minutes.has(d.best!.minute)).toBe(true);
    for (const tp of d.turningPoints) expect(minutes.has(tp.minute)).toBe(true);
    expect(d.lessons.length).toBe(2); // two curveballs in this scenario
  });

  it('a thoughtful plan scores better than pure intensity', () => {
    const cfg = cfgOf(0);
    const pushy = buildDebrief(cfg, play(cfg, () => 'intensify'));
    const paced = buildDebrief(
      cfg,
      play(cfg, (m) => (m < 15 ? 'groove' : m < 25 ? 'build' : m === 25 ? 'intensify' : m < 40 ? 'build' : m === 40 ? 'intensify' : m < 55 ? 'groove' : 'breathe')),
    );
    expect(paced.metrics[0].value).toBeGreaterThan(pushy.metrics[0].value);
    expect(pushy.goal.achieved).toBe(false);
  });

  it('scenarios differ in parameters and events, not just names', () => {
    const keys = SCENARIOS.map((s) => JSON.stringify([s.room.venue, s.room.duration, s.room.goal, s.curveballs.map((c) => c.id)]));
    expect(new Set(keys).size).toBe(SCENARIOS.length);
  });
});
