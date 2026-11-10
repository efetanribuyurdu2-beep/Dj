import { useMemo } from 'react';
import { initialState, run, zoneSplit, type RunResult, type SimConfig } from '../sim/engine';
import type { SimState } from '../sim/types';
import { GROUP_IDS } from '../sim/types';
import type { Session } from '../store/schema';
import type { Splits } from './floor/FloorView';

export function configOf(s: Session): SimConfig {
  return { room: s.room, arc: s.arc, seed: s.seed, curveballs: s.curveballs, stopAt: s.stopAt };
}

export function splitsOf(state: SimState): Splits {
  const out = {} as Splits;
  for (const g of GROUP_IDS) out[g] = zoneSplit(state, g);
  return out;
}

export function useRun(session: Session | undefined): { cfg: SimConfig; result: RunResult } | null {
  return useMemo(() => {
    if (!session) return null;
    const cfg = configOf(session);
    return { cfg, result: run(cfg, session.events, session.cursor) };
  }, [session]);
}

export function previewState(session: Pick<Session, 'room'>): SimState {
  return initialState(session.room);
}
