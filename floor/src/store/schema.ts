import { z } from 'zod';
import { CURVEBALL_IDS, DIRECTION_IDS, VENUE_IDS } from '../sim/content';
import { MOVE_IDS, type ArcSection, type RoomConfig, type ScheduledCurveball, type SimEvent } from '../sim/types';

export const STORE_VERSION = 1;
export const EXPORT_APP = 'floor';

const pct = z.number().finite().min(0).max(100);
const venue = z.enum(VENUE_IDS as [string, ...string[]]);
const direction = z.enum(DIRECTION_IDS as [string, ...string[]]);
const curveballId = z.enum(CURVEBALL_IDS as [string, ...string[]]);
const move = z.enum(MOVE_IDS as [string, ...string[]]);

export const roomSchema = z.object({
  venue,
  duration: z.number().int().min(20).max(240),
  people: z.number().int().min(5).max(300),
  startEnergy: pct,
  direction,
  hitExpectation: pct,
  openness: pct,
  goal: z.enum(['balanced', 'peak', 'convert', 'stamina']),
  shares: z.object({ groove: pct, hits: pct, explorers: pct }),
});

export const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['arrival', 'warmup', 'lift', 'peak', 'release', 'closing']),
  minutes: z.number().int().min(1).max(240),
  energy: pct,
  direction,
  familiarity: z.enum(['low', 'mid', 'high']),
  purpose: z.string().max(240),
});

export const eventSchema = z.union([
  z.object({ type: z.literal('move'), minute: z.number().int().min(0), move, direction: direction.optional() }),
  z.object({ type: z.literal('curveball'), minute: z.number().int().min(0), id: curveballId, option: z.string().max(40) }),
]);

export const sessionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(120),
  scenarioId: z.string().nullable(),
  room: roomSchema,
  arc: z.array(sectionSchema).min(1).max(12),
  curveballs: z.array(z.object({ id: curveballId, minute: z.number().int().min(0) })).max(10),
  seed: z.number().int(),
  events: z.array(eventSchema).max(500),
  cursor: z.number().int().min(0),
  status: z.enum(['draft', 'rehearsing', 'finished']),
  createdAt: z.number(),
  updatedAt: z.number(),
  finishedAt: z.number().optional(),
  stopAt: z.number().int().min(0).optional(),
  practice: z.object({ title: z.string(), task: z.string() }).optional(),
});

export const settingsSchema = z.object({
  sound: z.boolean(),
  speed: z.union([z.literal(1), z.literal(2), z.literal(4)]),
});

export const storeSchema = z.object({
  version: z.literal(STORE_VERSION),
  sessions: z.array(sessionSchema),
  activeId: z.string().nullable(),
  settings: settingsSchema,
});

export const exportSchema = z.object({
  app: z.literal(EXPORT_APP),
  version: z.number().int().min(1).max(STORE_VERSION),
  exportedAt: z.string(),
  sessions: z.array(sessionSchema).min(1),
});

export type SessionStatus = 'draft' | 'rehearsing' | 'finished';

export interface Session {
  id: string;
  name: string;
  scenarioId: string | null;
  room: RoomConfig;
  arc: ArcSection[];
  curveballs: ScheduledCurveball[];
  seed: number;
  events: SimEvent[];
  cursor: number;
  status: SessionStatus;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  /** minute at which the user ended the rehearsal early */
  stopAt?: number;
  practice?: { title: string; task: string };
}

export interface Settings {
  sound: boolean;
  speed: 1 | 2 | 4;
}

export interface StoreData {
  version: typeof STORE_VERSION;
  sessions: Session[];
  activeId: string | null;
  settings: Settings;
}
