import { useEffect, useRef } from 'react';
import type { TrackAnalysis } from '../../audio/analysis';

interface Props {
  analysis?: TrackAnalysis;
  duration: number;
  position: () => number;
  cue: number;
  onSeek: (t: number) => void;
  label: string;
}

/** Overview waveform: bar height = peak, warm lower part = low-end share. Canvas, DPR aware. */
export function Waveform({ analysis, duration, position, cue, onSeek, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext('2d');
      if (!g) return;
      g.scale(dpr, dpr);
      g.clearRect(0, 0, w, h);
      const css = getComputedStyle(c);
      const paper = css.getPropertyValue('--paper-2').trim() || '#d6cec1';
      const amber = css.getPropertyValue('--amber').trim() || '#f0a03c';
      const line = css.getPropertyValue('--line').trim() || '#3a342c';
      g.fillStyle = line;
      g.fillRect(0, h / 2, w, 1);
      if (!analysis) return;
      const { peak, low } = analysis.overview;
      const bw = w / peak.length;
      for (let i = 0; i < peak.length; i++) {
        const ph = Math.max(1, peak[i] * (h - 6));
        const x = i * bw;
        g.fillStyle = paper;
        g.globalAlpha = 0.75;
        g.fillRect(x, (h - ph) / 2, Math.max(1, bw - 0.4), ph);
        const lh = ph * low[i];
        g.fillStyle = amber;
        g.globalAlpha = 0.9;
        g.fillRect(x, (h - lh) / 2, Math.max(1, bw - 0.4), lh);
      }
      g.globalAlpha = 1;
      // estimated bar grid (every 4 beats)
      if (analysis.bpm && analysis.firstBeat !== null && duration > 0) {
        const bar = (60 / analysis.bpm) * 4;
        g.fillStyle = line;
        for (let t = analysis.firstBeat; t < duration; t += bar) g.fillRect((t / duration) * w, 0, 1, 5);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    return () => ro.disconnect();
  }, [analysis, duration]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (head.current && duration > 0) head.current.style.transform = `translateX(${(position() / duration) * (head.current.parentElement?.clientWidth ?? 0)}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [position, duration]);

  const seekAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration);
  };

  return (
    <div
      className="wave"
      role="slider"
      tabIndex={duration ? 0 : -1}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position())}
      onPointerDown={(e) => duration && seekAt(e.clientX, e.currentTarget)}
      onKeyDown={(e) => {
        if (!duration) return;
        if (e.key === 'ArrowRight') onSeek(position() + (e.shiftKey ? 30 : 5));
        else if (e.key === 'ArrowLeft') onSeek(position() - (e.shiftKey ? 30 : 5));
        else return;
        e.preventDefault();
      }}
    >
      <canvas ref={ref} className="wave-canvas" />
      {duration > 0 && <span className="wave-cue" style={{ left: `${(cue / duration) * 100}%` }} aria-hidden="true" />}
      <div ref={head} className="wave-head" aria-hidden="true" />
    </div>
  );
}
