// Testler için sentetik müzik üretici
export interface SynthOpts {
  bpm: number;
  bars: number;
  sr?: number;
  fourOnFloor?: boolean; // false => hip-hop tarzı kick (1 ve 3.5) + snare (2,4)
  chord?: number[]; // MIDI notaları
  introBars?: number; // yalnızca hi-hat + hafif perküsyon
  outroBars?: number;
  offsetSec?: number; // başta sessizlik
}

export function synth(o: SynthOpts): Float32Array {
  const sr = o.sr ?? 22050;
  const beat = 60 / o.bpm;
  const off = o.offsetSec ?? 0;
  const len = Math.ceil((off + o.bars * 4 * beat + 1) * sr);
  const x = new Float32Array(len);
  const chord = o.chord ?? [57, 60, 64];
  const intro = o.introBars ?? 0, outro = o.outroBars ?? 0;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  const addKick = (t: number, amp: number) => {
    const s0 = Math.floor(t * sr);
    for (let i = 0; i < 0.25 * sr && s0 + i < len; i++) {
      const tt = i / sr;
      const f = 50 + 90 * Math.exp(-tt * 30);
      x[s0 + i] += amp * Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 12);
    }
  };
  const addNoise = (t: number, amp: number, dec: number) => {
    const s0 = Math.floor(t * sr);
    let last = 0;
    for (let i = 0; i < 0.12 * sr && s0 + i < len; i++) {
      const n = rnd();
      x[s0 + i] += amp * (n - last) * 0.7 * Math.exp(-(i / sr) * dec); // kaba yüksek geçiren (hi-hat benzeri)
      last = n;
    }
  };

  for (let bar = 0; bar < o.bars; bar++) {
    const isIntro = bar < intro, isOutro = bar >= o.bars - outro;
    const full = !isIntro && !isOutro;
    for (let b = 0; b < 4; b++) {
      const t = off + (bar * 4 + b) * beat;
      if (o.fourOnFloor !== false) {
        addKick(t, full ? 0.8 : 0.35);
        addNoise(t + beat / 2, 0.08, 60);
      } else {
        if (b === 0) addKick(t, full ? 0.8 : 0.35);
        if (b === 2) addKick(t + beat / 2, full ? 0.7 : 0.3);
        if (b === 1 || b === 3) addNoise(t, full ? 0.35 : 0.15, 25);
        addNoise(t + beat / 2, 0.05, 80);
      }
    }
    if (full) {
      // sustain akor + bas
      const s0 = Math.floor((off + bar * 4 * beat) * sr), s1 = Math.floor((off + (bar + 1) * 4 * beat) * sr);
      for (let i = s0; i < s1 && i < len; i++) {
        const t = i / sr;
        let v = 0;
        for (const n of chord) {
          const f = 440 * Math.pow(2, (n - 69) / 12);
          v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * 2 * f * t);
        }
        const root = 440 * Math.pow(2, (chord[0] - 12 - 69) / 12);
        v = 0.06 * v + 0.25 * Math.sin(2 * Math.PI * root * t);
        x[i] += v;
      }
    }
  }
  return x;
}
