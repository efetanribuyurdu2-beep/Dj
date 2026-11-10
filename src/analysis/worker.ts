/// <reference lib="webworker" />
import { analyzeSamples, type AnalyzeHints } from './analyze';

self.onmessage = (e: MessageEvent<{ id: string; samples: Float32Array; sr: number; hints: AnalyzeHints }>) => {
  const { id, samples, sr, hints } = e.data;
  try {
    const result = analyzeSamples(samples, sr, hints);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: String(err) });
  }
};
