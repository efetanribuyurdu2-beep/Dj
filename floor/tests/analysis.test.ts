import { describe, expect, it } from 'vitest';
import { analyse, chroma, compatibleKeys, estimateKey, estimateTempo, levels } from '../src/audio/analysis';

const SR = 44100;

/** Kick-like clicks (decaying 60 Hz bursts) with offbeat hats. */
function clickTrack(bpm: number, seconds: number, offset = 0.1): Float32Array {
  const x = new Float32Array(Math.floor(SR * seconds));
  const beat = 60 / bpm;
  for (let t = offset; t < seconds; t += beat) {
    const s = Math.floor(t * SR);
    for (let i = 0; i < 0.12 * SR && s + i < x.length; i++) x[s + i] += 0.8 * Math.sin((2 * Math.PI * 60 * i) / SR) * Math.exp(-i / (0.03 * SR));
    const h = Math.floor((t + beat / 2) * SR);
    for (let i = 0; i < 0.02 * SR && h + i < x.length; i++) x[h + i] += 0.15 * (((i * 7919) % 13) / 6.5 - 1) * Math.exp(-i / (0.005 * SR));
  }
  return x;
}

/** Sustained chord tones with a few harmonics. */
function chordTones(freqs: number[], seconds: number): Float32Array {
  const x = new Float32Array(Math.floor(SR * seconds));
  for (const f of freqs)
    for (let h = 1; h <= 3; h++)
      for (let i = 0; i < x.length; i++) x[i] += (0.2 / h / freqs.length) * Math.sin((2 * Math.PI * f * h * i) / SR);
  return x;
}

describe('tempo', () => {
  it.each([122, 124, 128, 100, 140])('finds %d BPM on a click track', (bpm) => {
    const r = estimateTempo(clickTrack(bpm, 30), SR);
    expect(r.bpm).not.toBeNull();
    expect(Math.abs(r.bpm! - bpm)).toBeLessThan(0.6);
    expect(r.confidence).toBeGreaterThan(0.2);
  });

  it('folds double-time into the DJ range (174 → 87)', () => {
    const r = estimateTempo(clickTrack(174, 30), SR);
    expect(Math.abs(r.bpm! - 87)).toBeLessThan(0.6);
  });

  it('estimates the beat phase', () => {
    const r = estimateTempo(clickTrack(120, 30, 0.25), SR);
    const beat = 0.5;
    const err = Math.abs(((r.firstBeat! - 0.25 + beat / 2 + beat * 10) % beat) - beat / 2);
    expect(err).toBeLessThan(0.03);
  });

  it('returns null for silence or very short audio', () => {
    expect(estimateTempo(new Float32Array(SR * 20), SR).bpm).toBeNull();
    expect(estimateTempo(clickTrack(120, 3), SR).bpm).toBeNull();
  });
});

describe('key', () => {
  it('A minor triad → A minor / 8A', () => {
    const k = estimateKey(chroma(chordTones([220, 261.63, 329.63], 12), SR));
    expect(k.key).toBe('A minor');
    expect(k.camelot).toBe('8A');
  });
  it('C major triad → C major / 8B', () => {
    const k = estimateKey(chroma(chordTones([261.63, 329.63, 392], 12), SR));
    expect(k.key).toBe('C major');
    expect(k.camelot).toBe('8B');
  });
  it('Camelot neighbours', () => {
    expect(compatibleKeys('8A')).toEqual(['8A', '7A', '9A', '8B']);
    expect(compatibleKeys('12B')).toEqual(['12B', '11B', '1B', '12A']);
  });
});

describe('levels + full analysis', () => {
  it('measures peak and RMS of a sine', () => {
    const x = new Float32Array(SR).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR));
    const l = levels([x]);
    expect(l.peakDb).toBeCloseTo(-6.02, 1);
    expect(l.rmsDb).toBeCloseTo(-9.03, 1);
    expect(l.clippedSamples).toBe(0);
  });

  it('counts clipping and builds overview + energy', () => {
    const x = clickTrack(124, 20);
    x[100] = 1;
    x[200] = -1;
    const a = analyse([x, x], SR);
    expect(a.clippedSamples).toBeGreaterThanOrEqual(4);
    expect(a.overview.peak).toHaveLength(800);
    expect(a.energy.length).toBe(20);
    expect(Math.abs(a.bpm! - 124)).toBeLessThan(0.6);
    const quiet = analyse([new Float32Array(SR * 10).map((_, i) => 0.01 * Math.sin(i / 10))], SR);
    expect(Math.max(...quiet.energy)).toBeLessThan(Math.min(...a.energy.slice(1, -1)));
  });
});
