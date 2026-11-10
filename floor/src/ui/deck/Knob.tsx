import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  label: string;
  value: number; // 0–1
  onChange: (v: number) => void;
  center?: boolean; // bipolar knob (EQ, filter, trim)
  size?: number;
  format?: (v: number) => string;
}

/** Rotary knob: drag up/down, arrow keys, double-click to reset. */
export function Knob({ label, value, onChange, center = true, size = 54, format }: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const a0 = -135;
  const ang = a0 + value * 270;
  const r = size / 2 - 5;
  const pt = (deg: number, rr = r) => {
    const t = ((deg - 90) * Math.PI) / 180;
    return [size / 2 + rr * Math.cos(t), size / 2 + rr * Math.sin(t)];
  };
  const arc = (from: number, to: number) => {
    const [x0, y0] = pt(from);
    const [x1, y1] = pt(to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    return `M${x0} ${y0} A${r} ${r} 0 ${large} ${to > from ? 1 : 0} ${x1} ${y1}`;
  };
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const onDown = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const k = e.shiftKey ? 600 : 200;
    onChange(clamp(drag.current.v + (drag.current.y - e.clientY) / k));
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + step));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - step));
    else if (e.key === 'Home') onChange(0);
    else if (e.key === 'End') onChange(1);
    else if (e.key === ' ' || e.key === 'Enter') onChange(center ? 0.5 : value);
    else return;
    e.preventDefault();
  };
  const [hx, hy] = pt(ang, r - 9);
  const [cx, cy] = pt(ang, r - 1);
  const text = format ? format(value) : `${Math.round(value * 100)}`;
  return (
    <div className="knob">
      <svg
        width={size}
        height={size}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={text}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => onChange(center ? 0.5 : value)}
        onKeyDown={onKey}
        className="knob-svg"
      >
        <path d={arc(a0, 135)} className="knob-track" />
        {center ? (
          Math.abs(value - 0.5) > 0.005 && <path d={value > 0.5 ? arc(0, ang) : arc(ang, 0)} className="knob-val" />
        ) : (
          value > 0.005 && <path d={arc(a0, ang)} className="knob-val" />
        )}
        <circle cx={size / 2} cy={size / 2} r={r - 6} className="knob-cap" />
        <line x1={hx} y1={hy} x2={cx} y2={cy} className="knob-line" />
      </svg>
      <span className="knob-label" lang="en">
        {label}
      </span>
    </div>
  );
}
