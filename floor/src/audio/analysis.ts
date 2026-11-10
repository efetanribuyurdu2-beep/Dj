// Offline track analysis on raw PCM. Pure functions: no Web Audio, runs in a worker or in tests.
// Everything here is an *estimate* from the signal; the UI labels it that way.

export interface TrackAnalysis {
  version: 1;
  duration: number;
  sampleRate: number;
  bpm: number | null;
  bpmConfidence: number; // 0–1
  firstBeat: number | null; // seconds, estimated phase of the beat grid
  key: string | null; // e.g. "A minor"
  camelot: string | null; // e.g. "8A"
  keyConfidence: number; // 0–1
  peakDb: number; // dBFS sample peak
  rmsDb: number; // dBFS over the whole track (not LUFS)
  clippedSamples: number;
  /** overview waveform: per bin [peak 0–1, low-band share 0–1] */
  overview: { peak: number[]; low: number[] };
  /** energy per ~1 s window, 0–100 */
  energy: number[];
}

export const OVERVIEW_BINS = 800;

const db = (x: number) => (x <= 1e-9 ? -180 : 20 * Math.log10(x));

/** Mix channels down to mono. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** Decimate with a simple boxcar low-pass. Good enough for tempo and chroma. */
export function downsample(x: Float32Array, sr: number, target: number): { data: Float32Array; sr: number } {
  const f = Math.max(1, Math.floor(sr / target));
  if (f === 1) return { data: x, sr };
  const n = Math.floor(x.length / f);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < f; k++) s += x[i * f + k];
    out[i] = s / f;
  }
  return { data: out, sr: sr / f };
}

// ---------- levels ----------
export function levels(channels: Float32Array[]): { peakDb: number; rmsDb: number; clippedSamples: number } {
  let peak = 0;
  let sum = 0;
  let n = 0;
  let clipped = 0;
  for (const c of channels) {
    for (let i = 0; i < c.length; i++) {
      const a = Math.abs(c[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += c[i] * c[i];
    }
    n += c.length;
  }
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / Math.max(1, n))), clippedSamples: clipped };
}

// ---------- overview + energy ----------
export function overview(mono: Float32Array, bins = OVERVIEW_BINS): { peak: number[]; low: number[] } {
  const per = Math.max(1, Math.floor(mono.length / bins));
  const peak: number[] = [];
  const low: number[] = [];
  let lp = 0;
  const a = 0.02; // one-pole low-pass (~140 Hz @ 44.1 kHz)
  for (let b = 0; b < bins; b++) {
    let p = 0;
    let eAll = 0;
    let eLow = 0;
    const start = b * per;
    const end = Math.min(mono.length, start + per);
    for (let i = start; i < end; i++) {
      const x = mono[i];
      lp += a * (x - lp);
      const ax = Math.abs(x);
      if (ax > p) p = ax;
      eAll += x * x;
      eLow += lp * lp;
    }
    peak.push(Math.min(1, p));
    low.push(eAll > 0 ? Math.min(1, (eLow / eAll) * 2.2) : 0);
  }
  return { peak, low };
}

/** 0–100 energy per window: loudness + low-end weight + onset density. */
export function energyCurve(mono: Float32Array, sr: number, windowSec = 1): number[] {
  const w = Math.max(1, Math.floor(sr * windowSec));
  const out: number[] = [];
  let lp = 0;
  const a = Math.min(1, (2 * Math.PI * 150) / sr);
  let prevE = 0;
  for (let s = 0; s + w <= mono.length; s += w) {
    let e = 0;
    let el = 0;
    let flux = 0;
    const sub = Math.max(1, Math.floor(w / 16));
    let acc = 0;
    for (let i = 0; i < w; i++) {
      const x = mono[s + i];
      lp += a * (x - lp);
      e += x * x;
      el += lp * lp;
      acc += x * x;
      if ((i + 1) % sub === 0) {
        const se = acc / sub;
        flux += Math.max(0, se - prevE);
        prevE = se;
        acc = 0;
      }
    }
    const rms = Math.sqrt(e / w);
    const loud = Math.max(0, Math.min(1, (db(rms) + 36) / 30));
    const lowShare = e > 0 ? Math.min(1, el / e) : 0;
    const punch = Math.min(1, (flux / (e / w + 1e-9)) / 30);
    out.push(Math.round(100 * Math.min(1, 0.6 * loud + 0.2 * lowShare * loud + 0.2 * punch * loud)));
  }
  return out;
}

// ---------- tempo ----------
/** Onset strength envelope (half-wave rectified log-energy flux). */
export function onsetEnvelope(mono: Float32Array, sr: number, hop: number): Float32Array {
  const frames = Math.floor(mono.length / hop);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < hop; i++) {
      const x = mono[f * hop + i];
      e += x * x;
    }
    const le = Math.log(1e-6 + e);
    env[f] = f === 0 ? 0 : Math.max(0, le - prev);
    prev = le;
  }
  // remove the slow trend (local mean over ±0.5 s) so loud sustained parts do not dominate
  const half = Math.max(1, Math.round((0.5 * sr) / hop));
  const pre = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) pre[f + 1] = pre[f] + env[f];
  const out = new Float32Array(frames);
  for (let c = 0; c < frames; c++) {
    const lo = Math.max(0, c - half);
    const hi = Math.min(frames, c + half + 1);
    out[c] = Math.max(0, env[c] - (pre[hi] - pre[lo]) / (hi - lo));
  }
  return out;
}

export interface TempoResult {
  bpm: number | null;
  confidence: number;
  firstBeat: number | null;
}

/** Tempo from autocorrelation of the onset envelope, folded to a DJ-friendly 78–160 BPM range. */
export function estimateTempo(mono: Float32Array, sr: number, minBpm = 78, maxBpm = 160): TempoResult {
  const target = 11025;
  const ds = downsample(mono, sr, target);
  const hop = 128;
  const fps = ds.sr / hop;
  const env = onsetEnvelope(ds.data, ds.sr, hop);
  if (env.length < fps * 8) return { bpm: null, confidence: 0, firstBeat: null };

  const minLag = Math.floor((60 * fps) / 200);
  const maxLag = Math.ceil((60 * fps) / 60);
  const ac = new Float32Array(maxLag + 2);
  const N = env.length;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < N; i++) s += env[i] * env[i + lag];
    ac[lag] = s / (N - lag);
  }
  // score each candidate BPM inside the range with its harmonics (×2 lag, ½ lag)
  let best = -1;
  let bestLag = 0;
  let sumScore = 0;
  let count = 0;
  const lagOf = (bpm: number) => (60 * fps) / bpm;
  const at = (lag: number) => {
    const i = Math.floor(lag);
    if (i < minLag || i + 1 > maxLag + 1) return 0;
    const f = lag - i;
    return ac[i] * (1 - f) + ac[i + 1] * f;
  };
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.1) {
    const l = lagOf(bpm);
    const score = at(l) + 0.5 * at(l * 2) + 0.25 * at(l / 2);
    sumScore += score;
    count++;
    if (score > best) {
      best = score;
      bestLag = l;
    }
  }
  if (best <= 0) return { bpm: null, confidence: 0, firstBeat: null };
  const mean = sumScore / count;
  const confidence = Math.max(0, Math.min(1, (best / (mean + 1e-12) - 1) / 3));

  // refine: comb over the whole track (beat grid sum) around the coarse estimate.
  // Integer-lag autocorrelation is only ~±1.5 BPM precise; the comb gets ~0.05 BPM.
  const sm = new Float32Array(N);
  for (let i = 0; i < N; i++) sm[i] = 0.25 * (env[i - 1] ?? 0) + 0.5 * env[i] + 0.25 * (env[i + 1] ?? 0);
  const coarse = (60 * fps) / bestLag;
  let refined = coarse;
  let phaseFrames = 0;
  let bestComb = -1;
  for (let cand = coarse - 2; cand <= coarse + 2; cand += 0.05) {
    const period = (60 * fps) / cand;
    for (let p = 0; p < period; p += 1) {
      let sum = 0;
      for (let t = p; t < N; t += period) sum += sm[Math.round(t)] ?? 0;
      if (sum > bestComb) {
        bestComb = sum;
        refined = cand;
        phaseFrames = p;
      }
    }
  }
  return { bpm: Math.round(refined * 10) / 10, confidence, firstBeat: phaseFrames / fps };
}

// ---------- key ----------
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function chroma(mono: Float32Array, sr: number): number[] {
  const ds = downsample(mono, sr, 11025);
  const x = ds.data;
  const fs = ds.sr;
  const N = 4096;
  const hop = 2048;
  const c = new Array(12).fill(0);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  // pitch class for each bin between ~65 Hz and ~2 kHz
  const pc: number[] = [];
  for (let k = 0; k < N / 2; k++) {
    const f = (k * fs) / N;
    if (f < 65 || f > 2100) pc.push(-1);
    else pc.push(((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12); // 0 = C
  }
  for (let s = 0; s + N <= x.length; s += hop) {
    for (let i = 0; i < N; i++) {
      re[i] = x[s + i] * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im);
    const frame = new Array(12).fill(0);
    for (let k = 1; k < N / 2; k++) {
      if (pc[k] < 0) continue;
      frame[pc[k]] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    const tot = frame.reduce((a, b) => a + b, 0);
    if (tot > 0) for (let i = 0; i < 12; i++) c[i] += frame[i] / tot;
  }
  return c;
}

// Krumhansl–Kessler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const PITCH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Camelot wheel numbers indexed by tonic pitch class
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let s = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < a.length; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  return s / Math.sqrt(sa * sb + 1e-12);
}

export function estimateKey(ch: number[]): { key: string | null; camelot: string | null; confidence: number } {
  if (ch.every((v) => v === 0)) return { key: null, camelot: null, confidence: 0 };
  const scores: { key: string; camelot: string; r: number }[] = [];
  for (let t = 0; t < 12; t++) {
    const rot = (p: number[]) => p.map((_, i) => p[(i - t + 12) % 12]);
    scores.push({ key: `${PITCH[t]} major`, camelot: `${CAMELOT_MAJOR[t]}B`, r: corr(ch, rot(MAJOR)) });
    scores.push({ key: `${PITCH[t]} minor`, camelot: `${CAMELOT_MINOR[t]}A`, r: corr(ch, rot(MINOR)) });
  }
  scores.sort((a, b) => b.r - a.r);
  const [a, b] = scores;
  const confidence = Math.max(0, Math.min(1, (a.r - b.r) * 6 + Math.max(0, a.r - 0.5)));
  return { key: a.key, camelot: a.camelot, confidence };
}

/** Camelot neighbours that usually mix harmonically. */
export function compatibleKeys(camelot: string): string[] {
  const m = /^(\d+)([AB])$/.exec(camelot);
  if (!m) return [];
  const n = Number(m[1]);
  const l = m[2];
  const wrap = (x: number) => ((x - 1 + 12) % 12) + 1;
  return [`${n}${l}`, `${wrap(n - 1)}${l}`, `${wrap(n + 1)}${l}`, `${n}${l === 'A' ? 'B' : 'A'}`];
}

export function analyse(channels: Float32Array[], sampleRate: number): TrackAnalysis {
  const mono = toMono(channels);
  const lv = levels(channels);
  const tempo = estimateTempo(mono, sampleRate);
  const k = estimateKey(chroma(mono, sampleRate));
  return {
    version: 1,
    duration: mono.length / sampleRate,
    sampleRate,
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    firstBeat: tempo.firstBeat,
    key: k.key,
    camelot: k.camelot,
    keyConfidence: k.confidence,
    ...lv,
    overview: overview(mono),
    energy: energyCurve(mono, sampleRate),
  };
}
