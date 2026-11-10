// Otomatik parça analizi: BPM, beat grid, downbeat, ton, enerji, yapı (intro/outro/breakdown), vokal tahmini.
// Saf fonksiyonlar: hem Web Worker'da hem testlerde (Node) çalışır.

import { clamp, fft, hann, mean, movingAverage, percentile, sampleAt } from './dsp';
import { keyName, toCamelot, type KeyInfo } from '../engine/camelot';
import type { GenreId, Segment, TrackAnalysis } from '../types';

export const ANALYSIS_SR = 22050;
const N = 2048;
const HOP = 512;
// Pencereyi geriye kaydırarak frame zamanını ~olay zamanına hizala (onset pencerenin ~%60'ında tepe yapar)
const SHIFT = Math.round(0.6 * N);

export interface AnalyzeHints { bpm?: number; key?: KeyInfo | null }

interface FrameFeatures {
  fr: number; // frame/sn
  flux: Float64Array;
  lowFlux: Float64Array;
  rms: Float64Array;
  low: Float64Array;
  vocal: Float64Array;
  centroid: Float64Array;
}

export function frameFeatures(x: Float32Array, sr: number): FrameFeatures {
  const nFrames = Math.max(1, Math.floor(x.length / HOP));
  const win = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const half = N / 2;
  const binHz = sr / N;
  const lowMax = Math.max(2, Math.round(150 / binHz));
  const midLo = Math.round(300 / binHz), midHi = Math.round(3400 / binHz);
  const fluxMax = Math.round(4000 / binHz); // hi-hat'ler fazı bozmasın diye üst frekansları dışarıda bırak
  let prev = new Float64Array(half);
  let cur = new Float64Array(half);
  const flux = new Float64Array(nFrames), lowFlux = new Float64Array(nFrames);
  const rms = new Float64Array(nFrames), low = new Float64Array(nFrames);
  const vocal = new Float64Array(nFrames), centroid = new Float64Array(nFrames);

  for (let f = 0; f < nFrames; f++) {
    const off = f * HOP - SHIFT;
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = x[off + i] ?? 0;
      e += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    let fl = 0, lfl = 0, lowE = 0, cs = 0, ms = 0;
    let midE = 0, midLog = 0, totE = 1e-12;
    for (let k = 1; k < half; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const m = Math.log1p(100 * Math.sqrt(p));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0 && k <= fluxMax) { fl += d; if (k <= lowMax) lfl += d; }
      if (k <= lowMax) lowE += p;
      totE += p;
      const mag = Math.sqrt(p);
      cs += k * binHz * mag; ms += mag;
      if (k >= midLo && k <= midHi) { midE += p; midLog += Math.log(p + 1e-12); }
    }
    flux[f] = fl;
    lowFlux[f] = lfl;
    low[f] = Math.sqrt(lowE / N);
    centroid[f] = ms > 0 ? cs / ms : 0;
    const nb = midHi - midLo + 1;
    const flatness = Math.exp(midLog / nb) / (midE / nb + 1e-12); // 0 (tonal) .. 1 (gürültü)
    const midRatio = midE / totE;
    vocal[f] = midE > 1e-9 ? (1 - clamp(flatness * 4)) * clamp(midRatio * 2.5) : 0;
    const t = prev; prev = cur; cur = t;
  }
  return { fr: sr / HOP, flux, lowFlux, rms, low, vocal, centroid };
}

export function onsetEnvelope(ff: FrameFeatures): Float64Array {
  const o = new Float64Array(ff.flux.length);
  for (let i = 0; i < o.length; i++) o[i] = ff.flux[i] + 1.5 * ff.lowFlux[i];
  const avg = movingAverage(o, Math.round(ff.fr * 0.5));
  for (let i = 0; i < o.length; i++) o[i] = Math.max(0, o[i] - avg[i]);
  const sd = Math.sqrt(mean(Array.from(o, (v) => v * v))) || 1;
  for (let i = 0; i < o.length; i++) o[i] /= sd;
  return o;
}

/** Verilen periyot (frame) için en iyi faz ve skor. */
function combScore(o: Float64Array, period: number): { score: number; phase: number } {
  let best = -1, bestPhase = 0;
  const step = 0.5;
  for (let ph = 0; ph < period; ph += step) {
    let s = 0, c = 0;
    for (let t = ph; t < o.length - 1; t += period) { s += sampleAt(o, t); c++; }
    s /= Math.max(1, c);
    if (s > best) { best = s; bestPhase = ph; }
  }
  return { score: best, phase: bestPhase };
}

function tempoPrior(bpm: number): number {
  // DJ müziği için ~115 BPM merkezli log-normal önsel
  const z = Math.log2(bpm / 115) / 0.55;
  return Math.exp(-0.5 * z * z);
}

function estimateTempo(o: Float64Array, fr: number): { bpm: number; confidence: number } {
  const minLag = Math.floor((fr * 60) / 200), maxLag = Math.ceil((fr * 60) / 60);
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < o.length; i++) s += o[i] * o[i + lag];
    ac[lag] = s / (o.length - lag);
  }
  // Aday tepe noktaları
  const cands: { bpm: number; v: number }[] = [];
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      const a = ac[lag - 1], b = ac[lag], c = ac[lag + 1];
      const den = a - 2 * b + c;
      const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
      const l = lag + clamp(shift, -0.5, 0.5);
      // harmonik destek: 2x ve 4x gecikmede de tepe olmalı
      const support = sampleAt(ac, l) + 0.5 * sampleAt(ac, 2 * l) + 0.25 * sampleAt(ac, 4 * l);
      cands.push({ bpm: (60 * fr) / l, v: support });
    }
  }
  if (cands.length === 0) return { bpm: 120, confidence: 0 };
  cands.sort((x, y) => y.v - x.v);
  const top = cands.slice(0, 6);
  // Oktav varyantlarını comb skoru + önsel ile değerlendir
  let best = { bpm: 120, s: -1 };
  const scored: number[] = [];
  for (const c of top) {
    for (const mult of [0.5, 1, 2, 2 / 3, 1.5]) {
      const b = c.bpm * mult;
      if (b < 60 || b > 200) continue;
      const cs = combScore(o, (60 * fr) / b).score;
      const s = cs * (0.4 + tempoPrior(b));
      scored.push(s);
      if (s > best.s) best = { bpm: b, s };
    }
  }
  // İnce ayar: ±1.5 BPM aralığında 0.02 adım
  let fine = { bpm: best.bpm, s: -1 };
  for (let b = best.bpm - 1.5; b <= best.bpm + 1.5; b += 0.02) {
    const s = combScore(o, (60 * fr) / b).score;
    if (s > fine.s) fine = { bpm: b, s };
  }
  scored.sort((a, b) => b - a);
  const second = scored.find((s) => s < best.s * 0.999) ?? 0;
  const confidence = clamp((best.s - second) / (best.s + 1e-9) * 3);
  let bpm = fine.bpm;
  const r = Math.round(bpm);
  if (Math.abs(bpm - r) < 0.2) bpm = r;
  else bpm = Math.round(bpm * 10) / 10;
  return { bpm, confidence };
}

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db + 1e-12);
}

function estimateKey(x: Float32Array, sr: number): { key: KeyInfo; confidence: number } {
  const NK = 8192, HK = 4096;
  const win = hann(NK);
  const re = new Float64Array(NK), im = new Float64Array(NK);
  const binHz = sr / NK;
  const kLo = Math.ceil(70 / binHz), kHi = Math.floor(2000 / binHz);
  const pcOfBin = new Int8Array(kHi + 2);
  for (let k = kLo; k <= kHi; k++) {
    const midi = 12 * Math.log2((k * binHz) / 440) + 69;
    pcOfBin[k] = ((Math.round(midi) % 12) + 12) % 12;
  }
  const chroma = new Array(12).fill(0);
  const nFrames = Math.floor((x.length - NK) / HK) + 1;
  for (let f = 0; f < nFrames; f++) {
    const off = f * HK;
    for (let i = 0; i < NK; i++) { re[i] = (x[off + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    const mags = new Float64Array(kHi + 2);
    for (let k = kLo - 1; k <= kHi + 1; k++) mags[k] = Math.hypot(re[k], im[k]);
    const fc = new Array(12).fill(0);
    let tot = 0;
    for (let k = kLo; k <= kHi; k++) {
      if (mags[k] > mags[k - 1] && mags[k] >= mags[k + 1]) { // yalnızca spektral tepeler
        const w = Math.sqrt(mags[k]);
        fc[pcOfBin[k]] += w; tot += w;
      }
    }
    if (tot <= 0) continue;
    const mx = Math.max(...fc);
    for (let i = 0; i < 12; i++) chroma[i] += fc[i] / (mx || 1);
  }
  const scores: { key: KeyInfo; s: number }[] = [];
  for (let pc = 0; pc < 12; pc++) {
    const maj = KS_MAJOR.map((_, i) => KS_MAJOR[(i - pc + 12) % 12]);
    const min = KS_MINOR.map((_, i) => KS_MINOR[(i - pc + 12) % 12]);
    scores.push({ key: { pc, minor: false }, s: pearson(chroma, maj) });
    scores.push({ key: { pc, minor: true }, s: pearson(chroma, min) });
  }
  scores.sort((a, b) => b.s - a.s);
  const confidence = clamp((scores[0].s - scores[1].s) * 5 + (scores[0].s - 0.5));
  return { key: scores[0].key, confidence };
}

function barAggregate(arr: Float64Array, fr: number, barStarts: number[], barLen: number): number[] {
  return barStarts.map((s) => {
    const a = Math.floor(s * fr), b = Math.floor((s + barLen) * fr);
    return mean(arr, a, b);
  });
}

function normalizeByP(v: number[], p = 90): number[] {
  const ref = percentile(v, p) || 1;
  return v.map((x) => clamp(x / ref));
}

function runs(flags: boolean[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let s = -1;
  flags.forEach((f, i) => {
    if (f && s < 0) s = i;
    if (!f && s >= 0) { out.push({ start: s, end: i }); s = -1; }
  });
  if (s >= 0) out.push({ start: s, end: flags.length });
  return out;
}

export function analyzeSamples(x: Float32Array, sr: number, hints: AnalyzeHints = {}): TrackAnalysis {
  const duration = x.length / sr;
  const ff = frameFeatures(x, sr);
  const fr = ff.fr;
  const o = onsetEnvelope(ff);

  // --- Tempo ---
  let bpm: number, bpmConfidence: number;
  if (hints.bpm && hints.bpm > 40) { bpm = hints.bpm; bpmConfidence = 1; }
  else ({ bpm, confidence: bpmConfidence } = estimateTempo(o, fr));
  const periodF = (60 * fr) / bpm;
  const beatSec = 60 / bpm;

  // --- Beat fazı ---
  const { phase } = combScore(o, periodF);
  let firstBeat = phase / fr;
  while (firstBeat - beatSec >= 0) firstBeat -= beatSec;

  // --- Downbeat (bar başı): bölüm geçişlerindeki enerji sıçramasının kareler toplamını maksimize et ---
  const beatTimes: number[] = [];
  for (let t = firstBeat; t < duration - beatSec * 0.5; t += beatSec) beatTimes.push(t);
  const beatEnergy = beatTimes.map((t) => mean(ff.rms, Math.floor(t * fr), Math.floor((t + beatSec) * fr)) + mean(ff.low, Math.floor(t * fr), Math.floor((t + beatSec) * fr)));
  const beatOnset = beatTimes.map((t) => sampleAt(o, t * fr));
  let bestM = 0, bestS = -Infinity;
  for (let m = 0; m < 4; m++) {
    const bars: number[] = [];
    for (let i = m; i + 4 <= beatEnergy.length; i += 4) bars.push(beatEnergy[i] + beatEnergy[i + 1] + beatEnergy[i + 2] + beatEnergy[i + 3]);
    let s = 0;
    for (let i = 1; i < bars.length; i++) s += (bars[i] - bars[i - 1]) ** 2;
    s = s / Math.max(1, bars.length);
    let acc = 0, c = 0;
    for (let i = m; i < beatOnset.length; i += 4) { acc += beatOnset[i]; c++; }
    const onsetBonus = (acc / Math.max(1, c)) * 1e-3;
    const score = s + onsetBonus;
    if (score > bestS) { bestS = score; bestM = m; }
  }
  const firstDownbeat = beatTimes[bestM] ?? firstBeat;
  const barLen = beatSec * 4;
  const barStarts: number[] = [];
  for (let t = firstDownbeat; t + barLen <= duration + barLen * 0.5; t += barLen) barStarts.push(t);
  const nBars = barStarts.length;

  // --- Bar bazlı özellikler ---
  const barRms = barAggregate(ff.rms, fr, barStarts, barLen);
  const barLow = barAggregate(ff.low, fr, barStarts, barLen);
  const barVocRaw = barAggregate(ff.vocal, fr, barStarts, barLen);
  const eN = normalizeByP(barRms, 90);
  const lN = normalizeByP(barLow, 90);
  const barEnergy = eN.map((e, i) => clamp(0.6 * e + 0.4 * lN[i]));
  const vLo = percentile(barVocRaw, 15), vHi = percentile(barVocRaw, 90);
  const barVocal = barVocRaw.map((v) => (vHi - vLo > 1e-6 ? clamp((v - vLo) / (vHi - vLo)) : 0));

  // --- Yapı ---
  const main = barEnergy.map((e, i) => e >= 0.75 && lN[i] >= 0.55);
  const mainRuns = runs(main).filter((r) => r.end - r.start >= 4);
  const lastAudible = (() => { for (let i = nBars - 1; i >= 0; i--) if (eN[i] > 0.08) return i + 1; return nBars; })();
  const firstAudible = (() => { for (let i = 0; i < nBars; i++) if (eN[i] > 0.05) return i; return 0; })();
  const q = (b: number) => Math.round(b / 4) * 4; // 4 bar katlarına yuvarla
  let introBars = mainRuns.length ? q(mainRuns[0].start - firstAudible) + firstAudible : 0;
  let outroStart = mainRuns.length ? mainRuns[mainRuns.length - 1].end : nBars;
  outroStart = Math.min(nBars, firstAudible + q(outroStart - firstAudible));
  let outroBars = Math.max(0, lastAudible - outroStart);
  introBars = Math.max(0, Math.min(introBars, nBars));
  const segments: Segment[] = [];
  const toSec = (b: number) => (barStarts[Math.min(b, nBars - 1)] ?? 0) + (b >= nBars ? barLen : 0);
  const seg = (kind: Segment['kind'], a: number, b: number) => segments.push({ kind, startSec: Math.max(0, toSec(a)), endSec: Math.min(duration, toSec(b)), bars: b - a });
  if (introBars > 0) seg('intro', 0, introBars);
  for (let i = 1; i < mainRuns.length; i++) {
    const gap = mainRuns[i].start - mainRuns[i - 1].end;
    if (gap >= 4) {
      seg('breakdown', mainRuns[i - 1].end, mainRuns[i].start);
      seg('drop', mainRuns[i].start, Math.min(mainRuns[i].end, mainRuns[i].start + 8));
    }
  }
  if (outroBars > 0) seg('outro', outroStart, lastAudible);

  // Mix noktaları
  const mixInSec = Math.max(0, toSec(firstAudible));
  let mixOutBar: number;
  if (outroBars >= 8) mixOutBar = outroStart;
  else mixOutBar = Math.max(introBars, lastAudible - 16); // outro yoksa: bitişten 16 bar önce (loop ile uzatılabilir)
  const mixOutSec = toSec(Math.max(0, mixOutBar));

  // --- Four-on-the-floor (her vuruşta kick) ---
  const lowAtBeat = beatTimes.map((t) => {
    const c = Math.round(t * fr);
    let m = 0;
    for (let i = c - 2; i <= c + 2; i++) m = Math.max(m, ff.lowFlux[i] ?? 0);
    return m;
  });
  const mainBeats = lowAtBeat.filter((_, i) => {
    const b = Math.floor((beatTimes[i] - firstDownbeat) / barLen);
    return b >= 0 && main[b];
  });
  const pool = mainBeats.length > 16 ? mainBeats : lowAtBeat;
  const thr = 0.5 * percentile(pool, 75);
  const consistency = pool.length ? pool.filter((v) => v > thr).length / pool.length : 0;
  const offbeat = beatTimes.map((t) => sampleAt(ff.lowFlux, (t + beatSec / 2) * fr));
  const onOffRatio = mean(lowAtBeat) / (mean(offbeat) + 1e-9);
  const fourOnFloor = clamp(((consistency - 0.6) / 0.35) * 0.7 + clamp((onOffRatio - 1.5) / 2.5) * 0.3);

  // --- Ton ---
  let key: KeyInfo, keyConfidence: number;
  if (hints.key) { key = hints.key; keyConfidence = 1; }
  else ({ key, confidence: keyConfidence } = estimateKey(x, sr));

  // --- Enerji (mutlak, 0-1) ---
  const dbs = Array.from(ff.rms, (r) => 20 * Math.log10(r + 1e-9)).filter((d) => d > -60);
  const loud = percentile(dbs, 75); // tipik master: -14 .. -6 dBFS
  const density = mean(o) ; // normalize edilmiş onset ortalaması
  const bright = percentile(ff.centroid, 60);
  const energyRaw = clamp(
    0.35 * clamp((loud + 24) / 18) + 0.25 * clamp((density - 0.35) / 0.5) + 0.15 * clamp((bright - 1200) / 2200) + 0.25 * clamp((bpm - 85) / 50)
  );

  const avg = (a: number[], s: number, e: number) => (e > s ? a.slice(s, e).reduce((p, c) => p + c, 0) / (e - s) : 0);
  const introWin = Math.max(introBars, 8);
  const vocalIntro = avg(barVocal, firstAudible, Math.min(nBars, firstAudible + introWin));
  const vocalOutro = avg(barVocal, Math.max(0, Math.min(mixOutBar, lastAudible - 8)), lastAudible);

  let genreGuess: GenreId = 'pop';
  if (bpm >= 115 && bpm <= 135 && fourOnFloor >= 0.55) genreGuess = 'house';
  else if (bpm > 135 && fourOnFloor >= 0.55) genreGuess = 'edm';
  else if ((bpm >= 70 && bpm <= 108 && fourOnFloor < 0.5) || (bpm >= 140 && fourOnFloor < 0.4)) genreGuess = 'hiphop';

  return {
    bpm,
    bpmConfidence,
    firstBeatSec: firstDownbeat,
    key: keyName(key),
    camelot: toCamelot(key),
    keyConfidence,
    energyRaw,
    energy: Math.round(1 + 9 * energyRaw),
    barEnergy: barEnergy.map((v) => Math.round(v * 100) / 100),
    barVocal: barVocal.map((v) => Math.round(v * 100) / 100),
    segments,
    introBars,
    outroBars,
    mixInSec,
    mixOutSec,
    fourOnFloor,
    vocalIntro,
    vocalOutro,
    genreGuess,
  };
}
