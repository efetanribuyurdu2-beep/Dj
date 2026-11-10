// Two-deck Web Audio mixer. Playback of the user's own local files only.
// Tempo uses playbackRate, so pitch follows tempo (no key lock) – the UI says so.
import type { DeckId } from './midi';

export const STEMS = ['vocals', 'drums', 'bass', 'other'] as const;
export type StemName = (typeof STEMS)[number];

/** 0–1 knob → dB. 0.5 = 0 dB, 0 = kill (−26 dB), 1 = +6 dB. */
export function eqDb(v: number): number {
  const x = Math.max(0, Math.min(1, v));
  return x < 0.5 ? -26 * (1 - x / 0.5) : 6 * ((x - 0.5) / 0.5);
}

/** One-knob filter: left = low-pass, right = high-pass, centre dead zone = off. */
export function filterCutoffs(v: number): { lp: number; hp: number } {
  const x = Math.max(0, Math.min(1, v));
  if (x < 0.45) return { lp: 80 * Math.pow(20000 / 80, x / 0.45), hp: 10 };
  if (x > 0.55) return { lp: 22000, hp: 20 * Math.pow(8000 / 20, (x - 0.55) / 0.45) };
  return { lp: 22000, hp: 10 };
}

/** Constant-power crossfader, x: 0 = full A, 1 = full B. */
export function xfadeGains(x: number): { A: number; B: number } {
  const c = Math.max(0, Math.min(1, x));
  return { A: Math.cos((c * Math.PI) / 2), B: Math.sin((c * Math.PI) / 2) };
}

export interface LiveLevels {
  rmsDb: number;
  peak: number;
  low: number; // 0–1 band levels
  mid: number;
  high: number;
  energy: number; // 0–100 heuristic
}

const SILENT: LiveLevels = { rmsDb: -120, peak: 0, low: 0, mid: 0, high: 0, energy: 0 };

function measure(an: AnalyserNode, time: Float32Array<ArrayBuffer>, freq: Float32Array<ArrayBuffer>, sr: number): LiveLevels {
  an.getFloatTimeDomainData(time);
  let s = 0;
  let p = 0;
  for (let i = 0; i < time.length; i++) {
    s += time[i] * time[i];
    const a = Math.abs(time[i]);
    if (a > p) p = a;
  }
  const rms = Math.sqrt(s / time.length);
  const rmsDb = rms > 1e-6 ? 20 * Math.log10(rms) : -120;
  an.getFloatFrequencyData(freq);
  const binHz = sr / 2 / freq.length;
  let lo = 0;
  let mi = 0;
  let hi = 0;
  let nl = 0;
  let nm = 0;
  let nh = 0;
  for (let i = 1; i < freq.length; i++) {
    const f = i * binHz;
    const mag = Math.pow(10, freq[i] / 20);
    if (f < 250) {
      lo += mag;
      nl++;
    } else if (f < 4000) {
      mi += mag;
      nm++;
    } else {
      hi += mag;
      nh++;
    }
  }
  const norm = (x: number, n: number) => Math.max(0, Math.min(1, (20 * Math.log10(x / Math.max(1, n) + 1e-9) + 70) / 60));
  const low = norm(lo, nl);
  const mid = norm(mi, nm);
  const high = norm(hi, nh);
  const loud = Math.max(0, Math.min(1, (rmsDb + 36) / 30));
  return { rmsDb, peak: p, low, mid, high, energy: Math.round(100 * Math.min(1, 0.65 * loud + 0.25 * low * loud + 0.1 * high)) };
}

export class Deck {
  readonly id: DeckId;
  private ctx: AudioContext;
  private sum: GainNode;
  private trim: GainNode;
  private eq: { low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode };
  private lp: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private fader: GainNode;
  readonly xfade: GainNode;
  readonly analyser: AnalyserNode;
  private buffers: { main: AudioBuffer | null; stems: Partial<Record<StemName, AudioBuffer>> } = { main: null, stems: {} };
  private stemGain: Record<StemName, GainNode>;
  stemOn: Record<StemName, boolean> = { vocals: true, drums: true, bass: true, other: true };
  useStems = false;
  private sources: AudioBufferSourceNode[] = [];
  playing = false;
  private offset = 0;
  private startedAt = 0;
  rate = 1;
  private nudgeFactor = 1;
  private nudgeTimer: number | null = null;
  cuePoint = 0;
  trackId: string | null = null;
  onEnded: (() => void) | null = null;
  private tBuf: Float32Array<ArrayBuffer>;
  private fBuf: Float32Array<ArrayBuffer>;

  constructor(ctx: AudioContext, id: DeckId, out: AudioNode) {
    this.ctx = ctx;
    this.id = id;
    this.sum = ctx.createGain();
    this.trim = ctx.createGain();
    const mk = (type: BiquadFilterType, f: number) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      return b;
    };
    this.eq = { low: mk('lowshelf', 220), mid: mk('peaking', 1000), high: mk('highshelf', 3200) };
    this.eq.mid.Q.value = 0.7;
    this.lp = mk('lowpass', 22000);
    this.hp = mk('highpass', 10);
    this.lp.Q.value = this.hp.Q.value = 1.2;
    this.fader = ctx.createGain();
    this.xfade = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.sum.connect(this.trim).connect(this.eq.low).connect(this.eq.mid).connect(this.eq.high).connect(this.hp).connect(this.lp).connect(this.fader);
    this.fader.connect(this.analyser);
    this.fader.connect(this.xfade).connect(out);
    this.stemGain = {} as Record<StemName, GainNode>;
    for (const s of STEMS) {
      const g = ctx.createGain();
      g.connect(this.sum);
      this.stemGain[s] = g;
    }
    this.tBuf = new Float32Array(this.analyser.fftSize);
    this.fBuf = new Float32Array(this.analyser.frequencyBinCount);
  }

  get duration(): number {
    return this.buffers.main?.duration ?? Object.values(this.buffers.stems)[0]?.duration ?? 0;
  }
  get loaded(): boolean {
    return !!this.buffers.main;
  }
  get hasStems(): boolean {
    return STEMS.every((s) => this.buffers.stems[s]);
  }

  position(): number {
    if (!this.playing) return this.offset;
    const p = this.offset + (this.ctx.currentTime - this.startedAt) * this.rate * this.nudgeFactor;
    return Math.min(p, this.duration);
  }

  load(trackId: string, buffer: AudioBuffer) {
    this.stop();
    this.trackId = trackId;
    this.buffers = { main: buffer, stems: {} };
    this.useStems = false;
    this.offset = 0;
    this.cuePoint = 0;
  }

  loadStems(stems: Record<StemName, AudioBuffer>) {
    const was = this.playing;
    const pos = this.position();
    this.stop();
    this.buffers.stems = stems;
    this.useStems = true;
    this.offset = pos;
    if (was) this.play();
  }

  setUseStems(on: boolean) {
    if (on && !this.hasStems) return;
    const was = this.playing;
    const pos = this.position();
    this.stop();
    this.useStems = on;
    this.offset = pos;
    if (was) this.play();
  }

  private startSources() {
    const at = Math.max(0, Math.min(this.offset, this.duration - 0.01));
    const make = (buf: AudioBuffer, dest: AudioNode) => {
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.playbackRate.value = this.rate * this.nudgeFactor;
      s.connect(dest);
      s.start(0, at);
      return s;
    };
    if (this.useStems && this.hasStems) {
      this.sources = STEMS.map((n) => make(this.buffers.stems[n]!, this.stemGain[n]));
    } else if (this.buffers.main) {
      this.sources = [make(this.buffers.main, this.sum)];
    }
    const first = this.sources[0];
    if (first)
      first.onended = () => {
        if (this.playing && this.position() >= this.duration - 0.05) {
          this.playing = false;
          this.offset = this.duration;
          this.onEnded?.();
        }
      };
    this.startedAt = this.ctx.currentTime;
    this.offset = at;
  }

  private stop() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* not started */
      }
      s.disconnect();
    }
    this.sources = [];
    if (this.playing) this.offset = this.position();
    this.playing = false;
  }

  play() {
    if (!this.loaded || this.playing) return;
    if (this.offset >= this.duration - 0.05) this.offset = 0;
    void this.ctx.resume();
    this.startSources();
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    const p = this.position();
    this.stop();
    this.offset = p;
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    const was = this.playing;
    this.stop();
    this.offset = Math.max(0, Math.min(this.duration, t));
    if (was) this.play();
  }

  /** CDJ-style: paused → set cue here; playing → jump back to cue and stop. */
  cue() {
    if (this.playing) {
      this.stop();
      this.offset = this.cuePoint;
    } else {
      this.cuePoint = this.offset;
    }
  }

  private applyRate() {
    if (this.playing) {
      this.offset = this.position();
      this.startedAt = this.ctx.currentTime;
    }
    for (const s of this.sources) s.playbackRate.setValueAtTime(this.rate * this.nudgeFactor, this.ctx.currentTime);
  }

  setRate(rate: number) {
    if (this.playing) {
      this.offset = this.position();
      this.startedAt = this.ctx.currentTime;
    }
    this.rate = rate;
    for (const s of this.sources) s.playbackRate.setValueAtTime(this.rate * this.nudgeFactor, this.ctx.currentTime);
  }

  /** Jog: bend while playing, scrub while paused. */
  jog(delta: number) {
    if (!this.loaded) return;
    if (!this.playing) {
      this.seek(this.offset + delta * 0.015);
      return;
    }
    this.nudgeFactor = 1 + Math.max(-0.08, Math.min(0.08, delta * 0.01));
    this.applyRate();
    if (this.nudgeTimer) window.clearTimeout(this.nudgeTimer);
    this.nudgeTimer = window.setTimeout(() => {
      this.nudgeFactor = 1;
      this.applyRate();
    }, 140);
  }

  setEq(band: 'low' | 'mid' | 'high', v: number) {
    this.eq[band].gain.setTargetAtTime(eqDb(v), this.ctx.currentTime, 0.01);
  }
  setFilter(v: number) {
    const c = filterCutoffs(v);
    this.lp.frequency.setTargetAtTime(c.lp, this.ctx.currentTime, 0.02);
    this.hp.frequency.setTargetAtTime(c.hp, this.ctx.currentTime, 0.02);
  }
  setVolume(v: number) {
    this.fader.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) ** 2, this.ctx.currentTime, 0.01);
  }
  setTrim(v: number) {
    // 0.5 = 0 dB, range ±12 dB
    this.trim.gain.setTargetAtTime(Math.pow(10, ((v - 0.5) * 24) / 20), this.ctx.currentTime, 0.01);
  }
  toggleStem(s: StemName) {
    this.stemOn[s] = !this.stemOn[s];
    this.stemGain[s].gain.setTargetAtTime(this.stemOn[s] ? 1 : 0, this.ctx.currentTime, 0.015);
  }

  levels(): LiveLevels {
    if (!this.playing) return SILENT;
    return measure(this.analyser, this.tBuf, this.fBuf, this.ctx.sampleRate);
  }
}

export class Mixer {
  readonly ctx: AudioContext;
  readonly decks: Record<DeckId, Deck>;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  readonly analyser: AnalyserNode;
  crossfader = 0.5;
  private tBuf: Float32Array<ArrayBuffer>;
  private fBuf: Float32Array<ArrayBuffer>;

  constructor() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.1;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    const bus = this.ctx.createGain();
    bus.connect(this.master).connect(this.limiter).connect(this.ctx.destination);
    this.limiter.connect(this.analyser);
    this.decks = { A: new Deck(this.ctx, 'A', bus), B: new Deck(this.ctx, 'B', bus) };
    this.setCrossfader(0.5);
    this.tBuf = new Float32Array(this.analyser.fftSize);
    this.fBuf = new Float32Array(this.analyser.frequencyBinCount);
  }

  setCrossfader(x: number) {
    this.crossfader = x;
    const g = xfadeGains(x);
    this.decks.A.xfade.gain.setTargetAtTime(g.A, this.ctx.currentTime, 0.005);
    this.decks.B.xfade.gain.setTargetAtTime(g.B, this.ctx.currentTime, 0.005);
  }
  setMaster(v: number) {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) ** 2, this.ctx.currentTime, 0.01);
  }
  /** Match B's tempo to A (or vice versa) using the analysed BPMs. Tempo only, not phase. */
  syncRate(targetBpm: number, ownBpm: number): number {
    return targetBpm / ownBpm;
  }
  levels(): LiveLevels {
    if (!this.decks.A.playing && !this.decks.B.playing) return SILENT;
    return measure(this.analyser, this.tBuf, this.fBuf, this.ctx.sampleRate);
  }
  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return await this.ctx.decodeAudioData(data);
  }
}

let shared: Mixer | null = null;
/** Created lazily on a user gesture (browsers block audio before that). */
export function getMixer(): Mixer {
  shared ??= new Mixer();
  return shared;
}
export function hasMixer(): boolean {
  return shared !== null;
}
