import type { TrackAnalysis } from './analysis';

let worker: Worker | null = null;
const pending = new Map<string, { res: (a: TrackAnalysis) => void; rej: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<{ id: string; result?: TrackAnalysis; error?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.result) p.res(e.data.result);
    else p.rej(new Error(e.data.error ?? 'Analiz başarısız'));
  };
  return worker;
}

/** Analyse a decoded buffer off the main thread. */
export function analyseBuffer(id: string, buf: AudioBuffer): Promise<TrackAnalysis> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) channels.push(buf.getChannelData(c).slice());
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    getWorker().postMessage({ id, channels, sampleRate: buf.sampleRate }, channels.map((c) => c.buffer));
  });
}
