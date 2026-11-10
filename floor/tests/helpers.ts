import { run, type SimConfig } from '../src/sim/engine';
import { SCENARIOS } from '../src/sim/scenarios';
import { CURVEBALLS } from '../src/sim/content';
import type { MoveId, SimEvent } from '../src/sim/types';

export function cfgOf(i = 0, over: Partial<SimConfig> = {}): SimConfig {
  const sc = SCENARIOS[i];
  return { room: sc.room, arc: sc.arc, seed: sc.seed, curveballs: sc.curveballs, ...over };
}

/** Play a whole night: `pick` chooses each move; curveballs get their option at `cbOption`. */
export function play(cfg: SimConfig, pick: (minute: number, n: number) => MoveId, cbOption = 0): SimEvent[] {
  const events: SimEvent[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const r = run(cfg, events, Number.MAX_SAFE_INTEGER);
    if (!r.pending || r.pending.kind === 'finished') return events;
    if (r.pending.kind === 'curveball') {
      events.push({ type: 'curveball', minute: r.state.minute, id: r.pending.id, option: CURVEBALLS[r.pending.id].options[cbOption].id });
    } else {
      const move = pick(r.state.minute, events.length);
      events.push({ type: 'move', minute: r.state.minute, move, direction: move === 'shift' ? 'melodic' : undefined });
    }
  }
  throw new Error('night did not finish');
}
