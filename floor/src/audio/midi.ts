// Web MIDI for the DDJ-FLX2 (or any class-compliant controller) via MIDI learn.
// No hard-coded FLX2 message table: Pioneer's MIDI list could not be verified here,
// so every control is taught once and stored locally.

export type DeckId = 'A' | 'B';
export type ControlKind = 'button' | 'absolute' | 'relative';

export interface ActionDef {
  id: string;
  label: string;
  kind: ControlKind;
  group: 'Deck A' | 'Deck B' | 'Mixer' | 'Rehearsal';
}

const deckActions = (d: DeckId): ActionDef[] => {
  const g = `Deck ${d}` as const;
  return [
    { id: `${d}.play`, label: 'Play / Pause', kind: 'button', group: g },
    { id: `${d}.cue`, label: 'Cue', kind: 'button', group: g },
    { id: `${d}.sync`, label: 'Sync (tempo)', kind: 'button', group: g },
    { id: `${d}.tempo`, label: 'Tempo fader', kind: 'absolute', group: g },
    { id: `${d}.jog`, label: 'Jog wheel', kind: 'relative', group: g },
    { id: `${d}.volume`, label: 'Channel fader', kind: 'absolute', group: g },
    { id: `${d}.trim`, label: 'Trim', kind: 'absolute', group: g },
    { id: `${d}.eqHigh`, label: 'EQ Hi', kind: 'absolute', group: g },
    { id: `${d}.eqMid`, label: 'EQ Mid', kind: 'absolute', group: g },
    { id: `${d}.eqLow`, label: 'EQ Low', kind: 'absolute', group: g },
    { id: `${d}.filter`, label: 'CFX / Filtre', kind: 'absolute', group: g },
    { id: `${d}.stem1`, label: 'Pad 1 · Vokal', kind: 'button', group: g },
    { id: `${d}.stem2`, label: 'Pad 2 · Davul', kind: 'button', group: g },
    { id: `${d}.stem3`, label: 'Pad 3 · Bas', kind: 'button', group: g },
    { id: `${d}.stem4`, label: 'Pad 4 · Diğer', kind: 'button', group: g },
  ];
};

export const ACTIONS: ActionDef[] = [
  ...deckActions('A'),
  ...deckActions('B'),
  { id: 'crossfader', label: 'Crossfader', kind: 'absolute', group: 'Mixer' },
  { id: 'master', label: 'Master', kind: 'absolute', group: 'Mixer' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `decide.${n}`, label: `Karar ${n}`, kind: 'button' as const, group: 'Rehearsal' as const })),
];

export interface Binding {
  action: string;
  type: 'note' | 'cc';
  channel: number; // 0–15
  number: number; // note or controller number
  /** relative encoders: how the delta is encoded */
  relative?: 'offset64' | 'twos';
}

export type MidiMsg =
  | { type: 'note'; channel: number; number: number; value: number; on: boolean }
  | { type: 'cc'; channel: number; number: number; value: number };

export function parseMidi(data: ArrayLike<number>): MidiMsg | null {
  if (!data || data.length < 3) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (status === 0x90) return { type: 'note', channel, number: data[1], value: data[2], on: data[2] > 0 };
  if (status === 0x80) return { type: 'note', channel, number: data[1], value: 0, on: false };
  if (status === 0xb0) return { type: 'cc', channel, number: data[1], value: data[2] };
  return null;
}

/** Decode a relative encoder value into a signed delta. */
export function relativeDelta(value: number, mode: 'offset64' | 'twos'): number {
  if (mode === 'offset64') return value - 64;
  return value < 64 ? value : value - 128;
}

/** Guess the encoding of a jog from the first value it sends. */
export function detectRelative(value: number): 'offset64' | 'twos' {
  return value >= 48 && value <= 80 ? 'offset64' : 'twos';
}

export function sameControl(a: Pick<Binding, 'type' | 'channel' | 'number'>, b: Pick<Binding, 'type' | 'channel' | 'number'>) {
  return a.type === b.type && a.channel === b.channel && a.number === b.number;
}

/** Create a binding from the first suitable message while learning. */
export function learnFrom(action: ActionDef, msg: MidiMsg): Binding | null {
  if (msg.type === 'note') {
    if (!msg.on) return null;
    return { action: action.id, type: 'note', channel: msg.channel, number: msg.number };
  }
  // 14-bit faders/knobs send MSB on n and LSB on n+32; learn the MSB only.
  // (Relative jogs commonly live on CC 32–63 themselves, so they are exempt.)
  if (action.kind === 'absolute' && msg.number >= 32 && msg.number < 64) return null;
  const b: Binding = { action: action.id, type: 'cc', channel: msg.channel, number: msg.number };
  if (action.kind === 'relative') b.relative = detectRelative(msg.value);
  return b;
}

/** Replace any existing binding of this action and of this physical control. */
export function upsertBinding(list: Binding[], b: Binding): Binding[] {
  return [...list.filter((x) => x.action !== b.action && !sameControl(x, b)), b];
}

export type ResolvedInput =
  | { action: string; kind: 'button'; pressed: boolean }
  | { action: string; kind: 'absolute'; value: number } // 0–1
  | { action: string; kind: 'relative'; delta: number };

export function resolve(bindings: Binding[], msg: MidiMsg): ResolvedInput | null {
  const b = bindings.find((x) => sameControl(x, { type: msg.type, channel: msg.channel, number: msg.number }));
  if (!b) return null;
  const def = ACTIONS.find((a) => a.id === b.action);
  if (!def) return null;
  if (def.kind === 'button') return { action: b.action, kind: 'button', pressed: msg.type === 'note' ? msg.on : msg.value > 0 };
  if (def.kind === 'relative') return { action: b.action, kind: 'relative', delta: relativeDelta(msg.value, b.relative ?? 'offset64') };
  return { action: b.action, kind: 'absolute', value: msg.value / 127 };
}

// ---------- browser glue ----------
type Listener = (input: ResolvedInput) => void;
type RawListener = (msg: MidiMsg, device: string) => void;

const BINDINGS_KEY = 'floor.midi.bindings';

export function loadBindings(): Binding[] {
  try {
    const raw = localStorage.getItem(BINDINGS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr)
      ? arr.filter((b) => b && typeof b.action === 'string' && (b.type === 'note' || b.type === 'cc') && Number.isInteger(b.channel) && Number.isInteger(b.number))
      : [];
  } catch {
    return [];
  }
}

export function saveBindings(b: Binding[]) {
  try {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(b));
  } catch {
    /* storage full / blocked: bindings live for this tab only */
  }
}

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied';

class MidiManager {
  status: MidiStatus = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'idle' : 'unsupported';
  devices: string[] = [];
  bindings: Binding[] = typeof localStorage !== 'undefined' ? loadBindings() : [];
  learning: ActionDef | null = null;
  private access: MIDIAccess | null = null;
  private listeners = new Set<Listener>();
  private raw = new Set<RawListener>();
  private changed = new Set<() => void>();

  onInput(l: Listener) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  onRaw(l: RawListener) {
    this.raw.add(l);
    return () => void this.raw.delete(l);
  }
  onChange(l: () => void) {
    this.changed.add(l);
    return () => void this.changed.delete(l);
  }
  private emit() {
    this.changed.forEach((l) => l());
  }

  async connect() {
    if (this.status === 'unsupported' || this.status === 'ready') return;
    this.status = 'requesting';
    this.emit();
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.status = 'ready';
      this.attach();
      this.access.onstatechange = () => this.attach();
    } catch {
      this.status = 'denied';
    }
    this.emit();
  }

  private attach() {
    if (!this.access) return;
    this.devices = [];
    this.access.inputs.forEach((input) => {
      this.devices.push(input.name ?? 'MIDI input');
      input.onmidimessage = (e: MIDIMessageEvent) => this.handle(e.data ?? new Uint8Array(), input.name ?? '');
    });
    this.emit();
  }

  handle(data: ArrayLike<number>, device = '') {
    const msg = parseMidi(data);
    if (!msg) return;
    this.raw.forEach((l) => l(msg, device));
    if (this.learning) {
      const b = learnFrom(this.learning, msg);
      if (b) {
        this.bindings = upsertBinding(this.bindings, b);
        saveBindings(this.bindings);
        this.learning = null;
        this.emit();
      }
      return;
    }
    const r = resolve(this.bindings, msg);
    if (r) this.listeners.forEach((l) => l(r));
  }

  learn(action: ActionDef | null) {
    this.learning = action;
    this.emit();
  }
  unbind(actionId: string) {
    this.bindings = this.bindings.filter((b) => b.action !== actionId);
    saveBindings(this.bindings);
    this.emit();
  }
  setBindings(b: Binding[]) {
    this.bindings = b;
    saveBindings(b);
    this.emit();
  }
}

export const midi = new MidiManager();

// Exposed for the end-to-end test (inject messages without hardware).
if (typeof window !== 'undefined') (window as unknown as { __floorMidi?: MidiManager }).__floorMidi = midi;
