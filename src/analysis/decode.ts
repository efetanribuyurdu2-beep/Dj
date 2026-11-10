// Ses dosyasını çöz ve analiz için 22.05 kHz mono'ya indir (ana thread; Safari'de OfflineAudioContext worker'da yok)
import { ANALYSIS_SR } from './analyze';

type OAC = typeof OfflineAudioContext;

export async function decodeToMono(file: Blob): Promise<{ samples: Float32Array; durationSec: number }> {
  const buf = await file.arrayBuffer();
  const Ctor: OAC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new Ctor(1, 1, ANALYSIS_SR);
  const audio: AudioBuffer = await new Promise((resolve, reject) => {
    // eski Safari callback imzasını da destekle
    const p = ctx.decodeAudioData(buf, resolve, reject) as unknown as Promise<AudioBuffer> | undefined;
    if (p && typeof (p as any).then === 'function') p.then(resolve, reject);
  });
  const n = audio.length;
  const out = new Float32Array(n);
  const ch = audio.numberOfChannels;
  for (let c = 0; c < ch; c++) {
    const d = audio.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] / ch;
  }
  // Tarayıcı istenen örnekleme hızına çözmediyse basitçe yeniden örnekle
  if (audio.sampleRate !== ANALYSIS_SR) {
    const ratio = audio.sampleRate / ANALYSIS_SR;
    const m = Math.floor(n / ratio);
    const rs = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const a = Math.floor(i * ratio), b = Math.min(n, Math.floor((i + 1) * ratio));
      let s = 0;
      for (let j = a; j < b; j++) s += out[j];
      rs[i] = s / Math.max(1, b - a);
    }
    return { samples: rs, durationSec: audio.duration };
  }
  return { samples: out, durationSec: audio.duration };
}
