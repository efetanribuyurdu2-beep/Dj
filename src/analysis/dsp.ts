// Temel sinyal işleme yardımcıları (bağımlılıksız)

/** Yerinde, iteratif radix-2 FFT. re/im uzunluğu 2'nin kuvveti olmalı. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // bit-reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

export function mean(a: ArrayLike<number>, from = 0, to = a.length): number {
  let s = 0;
  const end = Math.min(to, a.length);
  const start = Math.max(0, from);
  if (end <= start) return 0;
  for (let i = start; i < end; i++) s += a[i];
  return s / (end - start);
}

export function percentile(a: ArrayLike<number>, p: number): number {
  if (a.length === 0) return 0;
  const s = Array.from(a).sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx];
}

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/** Hareketli ortalama (merkezli). */
export function movingAverage(a: Float64Array, radius: number): Float64Array {
  const out = new Float64Array(a.length);
  let s = 0;
  const pre = new Float64Array(a.length + 1);
  for (let i = 0; i < a.length; i++) { s += a[i]; pre[i + 1] = s; }
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - radius), hi = Math.min(a.length, i + radius + 1);
    out[i] = (pre[hi] - pre[lo]) / (hi - lo);
  }
  return out;
}

/** Diziden doğrusal enterpolasyonla değer oku. */
export function sampleAt(a: ArrayLike<number>, x: number): number {
  if (x < 0 || x > a.length - 1) return 0;
  const i = Math.floor(x);
  const f = x - i;
  return i + 1 < a.length ? a[i] * (1 - f) + a[i + 1] * f : a[i];
}
