// Optional synthetic pulse. Off by default, started only by a user gesture.
// It reflects the *simulated* intensity only – it is not music and controls nothing.

export class Pulse {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  intensity = 30;

  start() {
    if (this.timer !== null) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx ??= new AC();
    void this.ctx.resume();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.18;
    this.gain.connect(this.ctx.destination);
    this.nextTime = this.ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.gain?.disconnect();
    this.gain = null;
  }

  private bpm() {
    return 112 + Math.round(this.intensity * 0.14);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.gain) return;
    const sixteenth = 60 / this.bpm() / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const s = this.step % 16;
      const k = this.intensity;
      if (s % 4 === 0 && k > 12) this.kick(this.nextTime);
      if (s % 4 === 2 && k > 35) this.hat(this.nextTime, 0.5);
      if (s % 2 === 1 && k > 62) this.hat(this.nextTime, 0.22);
      if ((s === 4 || s === 12) && k > 70) this.clap(this.nextTime);
      if ((s === 3 || s === 10) && k > 25 && k < 70) this.shaker(this.nextTime);
      this.nextTime += sixteenth;
      this.step++;
    }
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + 0.32);
  }

  private noise(t: number, dur: number, freq: number, vol: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.gain!);
    src.start(t);
  }

  private hat(t: number, v: number) {
    this.noise(t, 0.05, 7000, v * 0.5);
  }
  private shaker(t: number) {
    this.noise(t, 0.08, 4500, 0.12);
  }
  private clap(t: number) {
    this.noise(t, 0.14, 1500, 0.35);
  }
}
