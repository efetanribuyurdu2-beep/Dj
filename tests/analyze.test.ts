import { describe, expect, it } from 'vitest';
import { analyzeSamples } from '../src/analysis/analyze';
import { synth } from './synth';

describe('analyzeSamples', () => {
  it('house: BPM, ton, intro/outro, four-on-floor', () => {
    const x = synth({ bpm: 124, bars: 64, introBars: 16, outroBars: 16, chord: [57, 60, 64] });
    const a = analyzeSamples(x, 22050);
    expect(Math.abs(a.bpm - 124)).toBeLessThan(0.6);
    expect(a.camelot).toBe('8A'); // A minör
    expect(a.introBars).toBeGreaterThanOrEqual(12);
    expect(a.introBars).toBeLessThanOrEqual(20);
    expect(a.outroBars).toBeGreaterThanOrEqual(12);
    expect(a.fourOnFloor).toBeGreaterThan(0.55);
    expect(a.genreGuess).toBe('house');
  });

  it('hip-hop: ~92 BPM ve kırık ritim', () => {
    const x = synth({ bpm: 92, bars: 40, fourOnFloor: false, chord: [60, 64, 67] });
    const a = analyzeSamples(x, 22050);
    expect(Math.abs(a.bpm - 92)).toBeLessThan(0.6);
    expect(a.camelot).toBe('8B'); // C majör
    expect(a.fourOnFloor).toBeLessThan(0.55);
    expect(a.genreGuess).toBe('hiphop');
  });

  it('meta veriyi (rekordbox) ipucu olarak kullanır', () => {
    const x = synth({ bpm: 126, bars: 24 });
    const a = analyzeSamples(x, 22050, { bpm: 126, key: { pc: 7, minor: true } });
    expect(a.bpm).toBe(126);
    expect(a.camelot).toBe('6A');
  });

  it('downbeat: başta sessizlik olsa da bar başını bulur', () => {
    const bpm = 120;
    const x = synth({ bpm, bars: 48, introBars: 8, offsetSec: 0.75 });
    const a = analyzeSamples(x, 22050);
    const barLen = 240 / bpm;
    const rel = ((a.firstBeatSec - 0.75) / barLen) % 1;
    const dist = Math.min(Math.abs(rel), Math.abs(1 - Math.abs(rel)));
    expect(dist).toBeLessThan(0.05);
  });
});
