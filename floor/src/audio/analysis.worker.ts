import { analyse } from './analysis';

self.onmessage = (e: MessageEvent<{ id: string; channels: Float32Array[]; sampleRate: number }>) => {
  const { id, channels, sampleRate } = e.data;
  try {
    const result = analyse(channels, sampleRate);
    (self as unknown as Worker).postMessage({ id, result });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
