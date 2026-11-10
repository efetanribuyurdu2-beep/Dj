// Core, UI-independent types for the FLOOR simulation.

export type GroupId = 'groove' | 'hits' | 'explorers';
export const GROUP_IDS: GroupId[] = ['groove', 'hits', 'explorers'];

export type VenueId = 'house' | 'rooftop' | 'bar' | 'beach' | 'afterhours';

export type DirectionId = 'afro' | 'melodic' | 'deep' | 'anthems' | 'disco';

export type MoveId = 'groove' | 'vocal' | 'intensify' | 'breathe' | 'shift' | 'build';
export const MOVE_IDS: MoveId[] = ['groove', 'vocal', 'intensify', 'breathe', 'shift', 'build'];

export type GoalId = 'balanced' | 'peak' | 'convert' | 'stamina';

export type Zone = 'floor' | 'bar' | 'lounge';

export interface GroupShares {
  groove: number;
  hits: number;
  explorers: number;
}

/** Everything the user configures about the room. All 0–100 sliders unless noted. */
export interface RoomConfig {
  venue: VenueId;
  /** minutes */
  duration: number;
  people: number;
  startEnergy: number;
  direction: DirectionId;
  hitExpectation: number;
  openness: number;
  goal: GoalId;
  shares: GroupShares;
}

export type FamiliarityTarget = 'low' | 'mid' | 'high';
export type SectionKind = 'arrival' | 'warmup' | 'lift' | 'peak' | 'release' | 'closing';

export interface ArcSection {
  id: string;
  kind: SectionKind;
  minutes: number;
  /** planned room energy 0–100 */
  energy: number;
  direction: DirectionId;
  familiarity: FamiliarityTarget;
  purpose: string;
}

export interface CurveballOption {
  id: string;
  label: string;
  /** Effect applied instantly to the simulation state */
  effect: CurveballEffect;
  /** short result text shown after choosing */
  outcome: string;
  /** learning point for the debrief */
  lesson: string;
}

export interface CurveballEffect {
  intensity?: number; // delta
  vocal?: number; // delta
  consistency?: number; // delta
  engagement?: Partial<Record<GroupId, number>>;
  fatigue?: Partial<Record<GroupId, number>>;
  social?: number; // delta to chat pull
  durationDelta?: number; // minutes
  direction?: DirectionId;
  setMove?: MoveId;
}

export type CurveballId =
  | 'crowdShift'
  | 'popRequest'
  | 'earlyTired'
  | 'cutShort'
  | 'hotHandover'
  | 'chatty'
  | 'directionFlop';

export interface CurveballDef {
  id: CurveballId;
  title: string;
  context: string;
  /** Applied when the curveball appears, before the user answers */
  onset: CurveballEffect;
  options: CurveballOption[];
}

export interface ScheduledCurveball {
  id: CurveballId;
  minute: number;
}

export type SimEvent =
  | { type: 'move'; minute: number; move: MoveId; direction?: DirectionId }
  | { type: 'curveball'; minute: number; id: CurveballId; option: string };

export interface GroupState {
  engagement: number;
  fatigue: number;
}

export interface SimState {
  minute: number;
  duration: number;
  intensity: number;
  targetIntensity: number;
  vocal: number;
  consistency: number;
  direction: DirectionId;
  social: number;
  tension: number;
  move: MoveId;
  moveAge: number;
  repeat: number;
  vocalUses: number;
  groups: Record<GroupId, GroupState>;
}

export interface Snapshot {
  minute: number;
  intensity: number;
  energy: number;
  planned: number;
  vocal: number;
  consistency: number;
  groups: Record<GroupId, GroupState & { floor: number }>;
}

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  brief: string;
  room: RoomConfig;
  arc: ArcSection[];
  curveballs: ScheduledCurveball[];
  seed: number;
  /** what tends to work here – used by the debrief, never shown before rehearsal */
  pattern: string;
}
