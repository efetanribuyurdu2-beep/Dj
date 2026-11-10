// UI-facing state for the decks. Every change (mouse, touch, keyboard or MIDI)
// goes through here so the screen and the audio engine never disagree.
import { useSyncExternalStore } from 'react';
import { compatibleKeys } from './analysis';
import { getBlob, listTracks, stemKey, updateTrack, type TrackMeta } from './library';
import { analyseBuffer } from './analyseBuffer';
import { midi, type DeckId, type ResolvedInput } from './midi';
import { getMixer, hasMixer, STEMS, type StemName } from './mixer';

export interface DeckUi {
  trackId: string | null;
  loading: boolean;
  error: string | null;
  eq: { high: number; mid: number; low: number };
  filter: number;
  volume: number;
  trim: number;
  /** tempo fader −1…+1 (centre 0) */
  tempo: number;
  range: 6 | 8 | 16;
  stemMode: boolean;
  stemOn: Record<StemName, boolean>;
  playing: boolean;
}

export interface ControlState {
  decks: Record<DeckId, DeckUi>;
  crossfader: number;
  master: number;
  tracks: TrackMeta[];
  invertTempo: boolean;
}

const deckInit = (): DeckUi => ({
  trackId: null,
  loading: false,
  error: null,
  eq: { high: 0.5, mid: 0.5, low: 0.5 },
  filter: 0.5,
  volume: 0.8,
  trim: 0.5,
  tempo: 0,
  range: 8,
  stemMode: false,
  stemOn: { vocals: true, drums: true, bass: true, other: true },
  playing: false,
});

let state: ControlState = {
  decks: { A: deckInit(), B: deckInit() },
  crossfader: 0.5,
  master: 0.85,
  tracks: [],
  invertTempo: (() => {
    try {
      return localStorage.getItem('floor.midi.invertTempo') === '1';
    } catch {
      return false;
    }
  })(),
};
const subs = new Set<() => void>();
const set = (fn: (s: ControlState) => ControlState) => {
  state = fn(state);
  subs.forEach((l) => l());
};
const setDeck = (d: DeckId, p: Partial<DeckUi>) => set((s) => ({ ...s, decks: { ...s.decks, [d]: { ...s.decks[d], ...p } } }));

export function useControl(): ControlState {
  return useSyncExternalStore(
    (l) => {
      subs.add(l);
      return () => subs.delete(l);
    },
    () => state,
  );
}
export const getControl = () => state;

export function trackOf(id: string | null): TrackMeta | undefined {
  return id ? state.tracks.find((t) => t.id === id) : undefined;
}

export async function refreshTracks() {
  try {
    const tracks = await listTracks();
    set((s) => ({ ...s, tracks }));
  } catch {
    set((s) => ({ ...s, tracks: [] }));
  }
}

export function replaceTrack(meta: TrackMeta) {
  set((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === meta.id ? meta : t)) }));
}

export const rateOf = (d: DeckUi) => 1 + (d.tempo * d.range) / 100;

/** Effective BPM of a deck (analysed BPM × tempo). */
export function liveBpm(d: DeckId): number | null {
  const ui = state.decks[d];
  const bpm = trackOf(ui.trackId)?.analysis?.bpm;
  return bpm ? bpm * rateOf(ui) : null;
}

export function keyRelation(a: DeckId, b: DeckId): 'same' | 'compatible' | 'clash' | null {
  const ka = trackOf(state.decks[a].trackId)?.analysis?.camelot;
  const kb = trackOf(state.decks[b].trackId)?.analysis?.camelot;
  if (!ka || !kb) return null;
  if (ka === kb) return 'same';
  return compatibleKeys(ka).includes(kb) ? 'compatible' : 'clash';
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  return getMixer().decode(await blob.arrayBuffer());
}

export async function loadTrack(d: DeckId, id: string) {
  const mixer = getMixer();
  const deck = mixer.decks[d];
  setDeck(d, { loading: true, error: null });
  try {
    const blob = await getBlob(id);
    if (!blob) throw new Error('Dosya bu tarayıcıda bulunamadı.');
    const buf = await decodeBlob(blob);
    deck.load(id, buf);
    deck.onEnded = () => setDeck(d, { playing: false });
    const meta = trackOf(id);
    setDeck(d, { trackId: id, loading: false, playing: false, stemMode: false, stemOn: { vocals: true, drums: true, bass: true, other: true } });
    applyDeck(d);
    if (meta && !meta.analysis) {
      try {
        const analysis = await analyseBuffer(id, buf);
        const next = { ...meta, analysis, analysisError: undefined };
        await updateTrack(next);
        replaceTrack(next);
      } catch (e) {
        const next = { ...meta, analysisError: e instanceof Error ? e.message : String(e) };
        await updateTrack(next).catch(() => undefined);
        replaceTrack(next);
      }
    }
    if (meta?.stems) await loadStemsFor(d, id);
  } catch (e) {
    setDeck(d, { loading: false, error: e instanceof Error ? `Dosya açılamadı: ${e.message}` : 'Dosya açılamadı.' });
  }
}

/** Analyse a freshly added file without loading it on a deck. */
export async function analyseTrack(meta: TrackMeta) {
  try {
    const blob = await getBlob(meta.id);
    if (!blob) return;
    const buf = await decodeBlob(blob);
    const analysis = await analyseBuffer(meta.id, buf);
    const next = { ...meta, analysis, analysisError: undefined };
    await updateTrack(next);
    replaceTrack(next);
  } catch (e) {
    const next = { ...meta, analysisError: e instanceof Error ? e.message : 'Çözülemedi' };
    await updateTrack(next).catch(() => undefined);
    replaceTrack(next);
  }
}

export async function loadStemsFor(d: DeckId, id: string) {
  const deck = getMixer().decks[d];
  if (deck.trackId !== id) return;
  const bufs = {} as Record<StemName, AudioBuffer>;
  for (const s of STEMS) {
    const b = await getBlob(stemKey(id, s));
    if (!b) return;
    bufs[s] = await decodeBlob(b);
  }
  deck.loadStems(bufs);
  setDeck(d, { stemMode: true });
}

function applyDeck(d: DeckId) {
  const ui = state.decks[d];
  const deck = getMixer().decks[d];
  deck.setEq('high', ui.eq.high);
  deck.setEq('mid', ui.eq.mid);
  deck.setEq('low', ui.eq.low);
  deck.setFilter(ui.filter);
  deck.setVolume(ui.volume);
  deck.setTrim(ui.trim);
  deck.setRate(rateOf(ui));
}

// ---------- actions (UI + MIDI) ----------
export const act = {
  toggle(d: DeckId) {
    const deck = getMixer().decks[d];
    if (!deck.loaded) return;
    deck.toggle();
    setDeck(d, { playing: deck.playing });
  },
  cue(d: DeckId) {
    const deck = getMixer().decks[d];
    if (!deck.loaded) return;
    deck.cue();
    setDeck(d, { playing: deck.playing });
  },
  seek(d: DeckId, t: number) {
    getMixer().decks[d].seek(t);
  },
  jog(d: DeckId, delta: number) {
    getMixer().decks[d].jog(delta);
  },
  eq(d: DeckId, band: 'high' | 'mid' | 'low', v: number) {
    setDeck(d, { eq: { ...state.decks[d].eq, [band]: v } });
    if (hasMixer()) getMixer().decks[d].setEq(band, v);
  },
  filter(d: DeckId, v: number) {
    setDeck(d, { filter: v });
    if (hasMixer()) getMixer().decks[d].setFilter(v);
  },
  volume(d: DeckId, v: number) {
    setDeck(d, { volume: v });
    if (hasMixer()) getMixer().decks[d].setVolume(v);
  },
  trim(d: DeckId, v: number) {
    setDeck(d, { trim: v });
    if (hasMixer()) getMixer().decks[d].setTrim(v);
  },
  tempo(d: DeckId, v: number) {
    const t = Math.max(-1, Math.min(1, v));
    setDeck(d, { tempo: t });
    if (hasMixer()) getMixer().decks[d].setRate(rateOf(state.decks[d]));
  },
  range(d: DeckId, r: 6 | 8 | 16) {
    setDeck(d, { range: r });
    if (hasMixer()) getMixer().decks[d].setRate(rateOf(state.decks[d]));
  },
  /** Match this deck's tempo to the other deck's live BPM (tempo only, phase by ear). */
  sync(d: DeckId): string | null {
    const other: DeckId = d === 'A' ? 'B' : 'A';
    const target = liveBpm(other);
    const own = trackOf(state.decks[d].trackId)?.analysis?.bpm;
    if (!target || !own) return 'Sync için iki deck’te de analiz edilmiş BPM gerekli.';
    const ui = state.decks[d];
    const needed = (target / own - 1) * 100;
    let range = ui.range;
    if (Math.abs(needed) > range) range = Math.abs(needed) <= 16 ? 16 : range;
    if (Math.abs(needed) > range) return `Tempo farkı çok büyük (%${needed.toFixed(1)}).`;
    setDeck(d, { range });
    act.tempo(d, needed / range);
    return null;
  },
  stemMode(d: DeckId, on: boolean) {
    const deck = getMixer().decks[d];
    deck.setUseStems(on);
    setDeck(d, { stemMode: deck.useStems });
  },
  stem(d: DeckId, s: StemName) {
    const deck = getMixer().decks[d];
    if (!deck.useStems) return;
    deck.toggleStem(s);
    setDeck(d, { stemOn: { ...deck.stemOn } });
  },
  crossfader(v: number) {
    set((s) => ({ ...s, crossfader: v }));
    if (hasMixer()) getMixer().setCrossfader(v);
  },
  master(v: number) {
    set((s) => ({ ...s, master: v }));
    if (hasMixer()) getMixer().setMaster(v);
  },
  invertTempo(on: boolean) {
    set((s) => ({ ...s, invertTempo: on }));
    try {
      localStorage.setItem('floor.midi.invertTempo', on ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
  unload(d: DeckId) {
    setDeck(d, deckInit());
  },
};

/** Route a MIDI input to a deck action. Returns false for actions handled elsewhere. */
export function handleMidi(i: ResolvedInput): boolean {
  const [scope, name] = i.action.split('.') as [string, string | undefined];
  if (scope === 'decide') return false;
  if (i.kind === 'absolute') {
    const v = i.value;
    if (i.action === 'crossfader') return act.crossfader(v), true;
    if (i.action === 'master') return act.master(v), true;
    const d = scope as DeckId;
    switch (name) {
      case 'tempo': {
        const t = (v - 0.5) * 2;
        act.tempo(d, state.invertTempo ? -t : t);
        return true;
      }
      case 'volume':
        return act.volume(d, v), true;
      case 'trim':
        return act.trim(d, v), true;
      case 'eqHigh':
        return act.eq(d, 'high', v), true;
      case 'eqMid':
        return act.eq(d, 'mid', v), true;
      case 'eqLow':
        return act.eq(d, 'low', v), true;
      case 'filter':
        return act.filter(d, v), true;
    }
    return false;
  }
  const d = scope as DeckId;
  if (i.kind === 'relative') {
    if (name === 'jog' && hasMixer()) act.jog(d, i.delta);
    return true;
  }
  if (!i.pressed || !hasMixer()) return true;
  switch (name) {
    case 'play':
      act.toggle(d);
      break;
    case 'cue':
      act.cue(d);
      break;
    case 'sync':
      act.sync(d);
      break;
    case 'stem1':
    case 'stem2':
    case 'stem3':
    case 'stem4':
      act.stem(d, STEMS[Number(name.slice(4)) - 1]);
      break;
  }
  return true;
}

let wired = false;
export function wireMidi() {
  if (wired) return;
  wired = true;
  midi.onInput((i) => void handleMidi(i));
}
