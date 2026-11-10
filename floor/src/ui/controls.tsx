import { useId, type ReactNode } from 'react';

interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
  format?: (v: number) => string;
}

/** Horizontal fader with a hardware-like track, value readout and fine-step buttons. */
export function Fader({ label, value, min, max, step = 1, unit, onChange, hint, format }: FaderProps) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const clampV = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="fader">
      <div className="fader-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="mono fader-val">
          {format ? format(value) : value}
          {unit && <span className="fader-unit"> {unit}</span>}
        </output>
      </div>
      <div className="fader-row">
        <button type="button" className="step" aria-label={`${label} azalt`} onClick={() => onChange(clampV(value - step))} disabled={value <= min}>
          −
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ['--pct' as string]: `${pct}%` }}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <button type="button" className="step" aria-label={`${label} artır`} onClick={() => onChange(clampV(value + step))} disabled={value >= max}>
          +
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="tiny muted">
          {hint}
        </p>
      )}
    </div>
  );
}

interface SegProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; note?: string }[];
  onChange: (v: T) => void;
  cols?: number;
}

/** Radio group styled as a row of hardware switches. Arrow keys work natively. */
export function Segmented<T extends string>({ label, value, options, onChange, cols }: SegProps<T>) {
  const name = useId();
  return (
    <fieldset className="seg" style={cols ? { ['--cols' as string]: cols } : undefined}>
      <legend>{label}</legend>
      <div className="seg-row">
        {options.map((o) => (
          <label key={o.value} className={`seg-opt${o.value === value ? ' is-on' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span className="seg-label">{o.label}</span>
            {o.note && <span className="seg-note">{o.note}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Stepper({ label, value, min, max, step = 1, unit, onChange }: Omit<FaderProps, 'hint' | 'format'>) {
  const id = useId();
  const clampV = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  return (
    <div className="stepper">
      <label htmlFor={id}>{label}</label>
      <div className="stepper-row">
        <button type="button" className="step" aria-label={`${label} azalt`} disabled={value <= min} onClick={() => onChange(clampV(value - step))}>
          −
        </button>
        <input
          id={id}
          className="mono"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && e.target.value !== '') onChange(clampV(n));
          }}
        />
        {unit && <span className="mono muted">{unit}</span>}
        <button type="button" className="step" aria-label={`${label} artır`} disabled={value >= max} onClick={() => onChange(clampV(value + step))}>
          +
        </button>
      </div>
    </div>
  );
}
