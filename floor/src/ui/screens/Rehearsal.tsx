import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/tr';
import { CURVEBALLS, CURVEBALL_IDS, DIRECTIONS, DIRECTION_IDS, MOVES } from '../../sim/content';
import { applyEvent, DECISION_EVERY, floorFraction, roomEnergy } from '../../sim/engine';
import { eventImpacts, eventLabel, instantFeedback } from '../../sim/debrief';
import { groupInsight } from '../../sim/insight';
import { sectionIndexAt, SECTION_LABEL } from '../../sim/arc';
import type { CurveballId, DirectionId, GroupId, MoveId, SimEvent } from '../../sim/types';
import { GROUPS } from '../../sim/content';
import { GROUP_IDS, MOVE_IDS } from '../../sim/types';
import type { Session } from '../../store/schema';
import { useStore } from '../../store/store';
import { FloorPanel } from '../floor/FloorPanel';
import { go } from '../router';
import { splitsOf, useRun } from '../useSim';
import { Pulse } from '../audio';
import { Timeline } from './Timeline';
import { midi } from '../../audio/midi';

export function Rehearsal({ session }: { session: Session }) {
  const store = useStore();
  const sim = useRun(session)!;
  const { cfg, result } = sim;
  const { state, pending } = result;
  const settings = store.data.settings;
  const [running, setRunning] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [injected, setInjected] = useState<CurveballId | null>(null);
  const [selected, setSelected] = useState<GroupId | null>(null);
  const finished = pending?.kind === 'finished';
  const curveball: CurveballId | null = pending?.kind === 'curveball' ? pending.id : injected;
  const needsDecision = pending?.kind === 'decision' && !curveball;
  const blocked = !!curveball || needsDecision || finished;
  const ticking = running && !blocked;

  // keep the latest session in a ref for the clock
  const sref = useRef(session);
  sref.current = session;

  // mark as active / rehearsing on entry
  useEffect(() => {
    store.setActive(session.id);
    if (session.status === 'draft') store.update(session.id, { status: 'rehearsing' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // finished → persist status + practice suggestion
  useEffect(() => {
    if (finished && session.status !== 'finished') {
      setRunning(false);
      store.update(session.id, { status: 'finished', finishedAt: Date.now() });
    }
  }, [finished, session.status, session.id, store]);

  // --- the clock: simulated minutes advance on wall time, not frames ---
  useEffect(() => {
    if (!ticking) return;
    const msPerMinute = 1000 / settings.speed;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      acc += Math.min(250, now - last);
      last = now;
      if (acc >= msPerMinute) {
        acc -= msPerMinute;
        const s = sref.current;
        store.update(s.id, { cursor: s.cursor + 1 });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ticking, settings.speed, store]);

  // keep cursor glued to the blocked minute so a pending decision never "skips"
  useEffect(() => {
    if (blocked && session.cursor !== state.minute) store.update(session.id, { cursor: state.minute });
  }, [blocked, session.cursor, state.minute, session.id, store]);

  // --- sound (synthetic, opt-in) ---
  const pulse = useRef<Pulse | null>(null);
  useEffect(() => {
    if (!pulse.current) return;
    pulse.current.intensity = state.intensity;
  }, [state.intensity]);
  useEffect(() => {
    if (settings.sound && ticking) {
      pulse.current ??= new Pulse();
      pulse.current.intensity = state.intensity;
      pulse.current.start();
    } else pulse.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sound, ticking]);
  useEffect(() => () => pulse.current?.stop(), []);

  const addEvent = useCallback(
    (e: SimEvent) => {
      store.update(session.id, (s) => ({ events: [...s.events, e], status: 'rehearsing' }));
    },
    [session.id, store],
  );

  const decide = useCallback(
    (move: MoveId, direction?: DirectionId) => {
      if (!needsDecision) return;
      if (move === 'shift' && !direction) {
        setShiftOpen(true);
        return;
      }
      setShiftOpen(false);
      addEvent({ type: 'move', minute: state.minute, move, direction });
      setRunning(true);
    },
    [needsDecision, addEvent, state.minute],
  );

  const answer = (id: CurveballId, option: string) => {
    addEvent({ type: 'curveball', minute: state.minute, id, option });
    setInjected(null);
  };

  const restart = () => {
    if (session.events.length && !window.confirm(t.rehearse.confirmRestart)) return;
    setRunning(false);
    setInjected(null);
    setShiftOpen(false);
    store.update(session.id, { events: [], cursor: 0, status: 'rehearsing', stopAt: undefined, finishedAt: undefined, practice: undefined });
  };

  const finishNow = () => {
    if (!window.confirm('Prova şu anda bitirilsin mi? Değerlendirme bu ana kadarki kararlara dayanacak.')) return;
    setRunning(false);
    setInjected(null);
    store.update(session.id, { stopAt: state.minute });
  };

  // keyboard: 1–6 moves, space play/pause
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < MOVE_IDS.length && needsDecision && !shiftOpen) {
        e.preventDefault();
        decide(MOVE_IDS[i]);
      } else if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON' && !finished) {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === 'Escape') {
        setShiftOpen(false);
        setInjecting(false);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [needsDecision, shiftOpen, decide, finished]);

  // FLX2 pads (MIDI learn: "Karar 1–6") pick decisions too
  const decideRef = useRef(decide);
  decideRef.current = decide;
  useEffect(
    () =>
      midi.onInput((i) => {
        const m = /^decide\.(\d)$/.exec(i.action);
        if (m && i.kind === 'button' && i.pressed) decideRef.current(MOVE_IDS[Number(m[1]) - 1]);
      }),
    [],
  );

  // --- derived readouts ---
  const energy = roomEnergy(state, cfg.room);
  const floorPct = Math.round(floorFraction(state, cfg.room) * 100);
  const fatigue = (state.groups.groove.fatigue + state.groups.hits.fatigue + state.groups.explorers.fatigue) / 3;
  const secIdx = sectionIndexAt(cfg.arc, Math.min(state.minute, cfg.room.duration - 1), cfg.room.duration);
  const sec = cfg.arc[secIdx];
  const nextDecision = Math.min(state.duration, Math.ceil((state.minute + (needsDecision ? 0 : 1)) / DECISION_EVERY) * DECISION_EVERY);
  const minutesInHigh = useMemo(() => {
    let n = 0;
    for (let i = result.snapshots.length - 1; i >= 0 && result.snapshots[i].intensity > 62; i--) n++;
    return n;
  }, [result.snapshots]);

  // feed: instant feedback for each logged event, plus measured result once its window has passed
  const feed = useMemo(() => {
    const sorted = session.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.minute - b.e.minute || a.i - b.i).map((x) => x.e);
    const impacts = eventImpacts(cfg, sorted, result);
    return sorted
      .map((e, k) => {
        const before = result.before[k];
        if (!before) return null;
        const after = applyEvent(before, e, cfg.room);
        const text = instantFeedback(cfg, e, before, after, sorted.slice(0, k));
        const imp = impacts[k];
        const measured =
          imp && state.minute >= e.minute + DECISION_EVERY
            ? GROUP_IDS.map((g) => `${GROUPS[g].short} ${imp.dEngagement[g] >= 0 ? '+' : ''}${Math.round(imp.dEngagement[g])}`).join(' · ')
            : null;
        return { key: `${k}-${e.minute}`, minute: e.minute, label: eventLabel(e), text, measured, curve: e.type === 'curveball' };
      })
      .filter(Boolean)
      .reverse() as { key: string; minute: number; label: string; text: string; measured: string | null; curve: boolean }[];
  }, [session.events, cfg, result, state.minute]);

  const usedCurveballs = new Set(session.events.filter((e) => e.type === 'curveball').map((e) => e.type === 'curveball' && e.id));
  const scheduledIds = new Set(cfg.curveballs.map((c) => c.id));

  const statusLine = finished
    ? t.rehearse.finished
    : curveball
      ? 'Beklenmedik bir durum: yanıtını seç.'
      : needsDecision
        ? `${t.rehearse.decide} · dk ${state.minute}`
        : running
          ? `${t.rehearse.waiting}: dk ${nextDecision}`
          : 'Duraklatıldı';

  return (
    <div className={`screen rehearse${ticking ? ' is-ticking' : ''}`}>
      <div className="transport" role="region" aria-label="Prova kontrolü">
        <div className="clock">
          <span className="mono clock-min" aria-label={`Dakika ${state.minute} / ${state.duration}`}>
            {String(state.minute).padStart(2, '0')}
            <span className="clock-of">/{state.duration}</span>
          </span>
          <span className="clock-sec">
            <span className="mono tiny" lang="en">{sec ? SECTION_LABEL[sec.kind] : ''}</span>
            <span className="clock-name">{session.name}</span>
          </span>
        </div>
        <p className={`status${needsDecision || curveball ? ' is-hot' : ''}`} aria-live="polite">
          {statusLine}
        </p>
        <div className="transport-btns">
          <button
            type="button"
            className="btn"
            onClick={() => setRunning((r) => !r)}
            disabled={finished || blocked}
            title={blocked && !finished ? 'Önce kararını ver' : undefined}
          >
            {running ? t.rehearse.pause : state.minute === 0 && !session.events.length ? t.rehearse.play : t.rehearse.resume}
          </button>
          <button type="button" className="btn btn-ghost" onClick={restart}>
            {t.rehearse.restart}
          </button>
          <div className="speed" role="group" aria-label={t.rehearse.speed}>
            {([1, 2, 4] as const).map((s) => (
              <button key={s} type="button" aria-pressed={settings.speed === s} className={settings.speed === s ? 'is-on' : ''} onClick={() => store.setSettings({ speed: s })}>
                {s}×
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`btn btn-ghost sound${settings.sound ? ' is-on' : ''}`}
            aria-pressed={settings.sound}
            onClick={() => store.setSettings({ sound: !settings.sound })}
            title={t.rehearse.soundNote}
          >
            {settings.sound ? '◉' : '○'} {t.rehearse.sound}
          </button>
          {!finished && (
            <button type="button" className="btn-text" onClick={finishNow} disabled={state.minute < 5} title={state.minute < 5 ? 'En az 5 dakika prova et' : undefined}>
              {t.rehearse.finish}
            </button>
          )}
        </div>
      </div>

      <Timeline cfg={cfg} snapshots={result.snapshots} events={session.events} minute={state.minute} duration={state.duration} />

      <div className="rehearse-grid">
        <div className="rehearse-stage">
          <FloorPanel
            venue={cfg.room.venue}
            people={cfg.room.people}
            shares={cfg.room.shares}
            splits={splitsOf(state)}
            intensity={state.intensity}
            seed={session.seed}
            live={ticking}
            selected={selected}
            onSelect={setSelected}
            insight={(g) => groupInsight(state, g, minutesInHigh)}
          />
          {curveball && !finished && (
            <div className="curveball" role="dialog" aria-modal="false" aria-labelledby="cb-title">
              <p className="eyebrow mono">
                <span lang="en">{t.rehearse.curveball}</span> · dk {state.minute}
              </p>
              <h2 id="cb-title" className="display cb-title">
                {CURVEBALLS[curveball].title}
              </h2>
              <p>{CURVEBALLS[curveball].context}</p>
              <div className="cb-options">
                {CURVEBALLS[curveball].options.map((o, i) => (
                  <button key={o.id} type="button" className="cb-opt" onClick={() => answer(curveball, o.id)} autoFocus={i === 0}>
                    <span className="mono cb-n">{String.fromCharCode(65 + i)}</span>
                    {o.label}
                  </button>
                ))}
              </div>
              {injected && (
                <button type="button" className="btn-text" onClick={() => setInjected(null)}>
                  {t.rehearse.cancel}
                </button>
              )}
            </div>
          )}
          {finished && (
            <div className="curveball done" role="status">
              <p className="eyebrow mono">dk {state.minute}</p>
              <h2 className="display cb-title">{t.rehearse.finished}</h2>
              <p>{session.events.length} karar ve yanıt kaydedildi. Değerlendirme bu kayıttan üretilecek.</p>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => go({ name: 'debrief', id: session.id })} autoFocus>
                {t.rehearse.seeDebrief} →
              </button>
            </div>
          )}
        </div>

        <aside className="rehearse-side">
          <div className="meters" aria-label="Simüle oda durumu">
            <Meter label="Yoğunluk" value={state.intensity} note="müziğin itişi" />
            <Meter label="Oda enerjisi" value={energy} note={`plan ${Math.round(result.snapshots[result.snapshots.length - 1].planned)}`} />
            <Meter label="Pist" value={floorPct} unit="%" note="dans edenler" />
            <Meter label="Yorgunluk" value={fatigue} warn={fatigue > 55} note={fatigue > 55 ? 'yüksek' : 'ortalama'} />
          </div>

          <div className={`pad${needsDecision ? ' is-armed' : ''}`} role="group" aria-label="Kararlar" aria-describedby="pad-hint">
            <p id="pad-hint" className="pad-hint mono tiny">
              {needsDecision
                ? sec
                  ? `Plan: ${SECTION_LABEL[sec.kind]} · ${DIRECTIONS[sec.direction].name} · tanıdıklık ${t.arc.fam[sec.familiarity]}`
                  : t.rehearse.decide
                : finished
                  ? 'Gece bitti'
                  : curveball
                    ? 'Önce beklenmedik duruma yanıt ver'
                    : `Sıradaki karar dk ${nextDecision}’da`}
            </p>
            {!needsDecision && !finished && !curveball && (
              <span className="pad-progress" aria-hidden="true">
                <span style={{ transform: `scaleX(${(state.minute % DECISION_EVERY) / DECISION_EVERY})` }} />
              </span>
            )}
            {shiftOpen ? (
              <div className="shift-pick">
                <p className="pad-q">{t.rehearse.pickDirection}</p>
                {DIRECTION_IDS.filter((d) => d !== state.direction).map((d) => (
                  <button key={d} type="button" className="pad-btn" onClick={() => decide('shift', d)} autoFocus={d === sec?.direction}>
                    <span className="pad-name">{DIRECTIONS[d].name}</span>
                    <span className="pad-hint-s">{DIRECTIONS[d].note}</span>
                  </button>
                ))}
                <button type="button" className="btn-text" onClick={() => setShiftOpen(false)}>
                  {t.rehearse.cancel}
                </button>
              </div>
            ) : (
              <div className="pad-grid">
                {MOVE_IDS.map((m) => (
                  <button key={m} type="button" className={`pad-btn move-${m}`} disabled={!needsDecision} onClick={() => decide(m)} aria-keyshortcuts={MOVES[m].key}>
                    <span className="mono pad-key" aria-hidden="true">
                      {MOVES[m].key}
                    </span>
                    <span className="pad-en" lang="en">{MOVES[m].name}</span>
                    <span className="pad-name">{MOVES[m].tr}</span>
                    <span className="pad-hint-s">{m === 'shift' ? `şu an: ${DIRECTIONS[state.direction].name}` : MOVES[m].hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="inject">
            {injecting ? (
              <div className="inject-list">
                <p className="tiny muted">{t.rehearse.injectNote}</p>
                {CURVEBALL_IDS.filter((c) => !usedCurveballs.has(c) && !scheduledIds.has(c)).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setInjected(c);
                      setInjecting(false);
                    }}
                  >
                    {CURVEBALLS[c].title}
                  </button>
                ))}
                <button type="button" className="btn-text" onClick={() => setInjecting(false)}>
                  {t.rehearse.cancel}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setRunning(false);
                  setInjecting(true);
                }}
                disabled={finished || !!curveball}
              >
                + {t.rehearse.inject}
              </button>
            )}
          </div>

          <section className="feed" aria-label={t.rehearse.feed}>
            <h2 className="eyebrow mono">{t.rehearse.feed}</h2>
            {feed.length === 0 ? (
              <p className="muted tiny">İlk kararını ver. Her kararın odaya etkisi burada açıklanır.</p>
            ) : (
              <ol className="feed-list">
                {feed.map((f, i) => (
                  <li key={f.key} className={`feed-item${i === 0 ? ' is-new' : ''}${f.curve ? ' is-curve' : ''}`}>
                    <span className="mono feed-min">{String(f.minute).padStart(2, '0')}′</span>
                    <div>
                      <p>{f.text}</p>
                      {f.measured && <p className="mono tiny feed-measured">5 dk sonra · {f.measured}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="tiny muted">{t.simNote} Sentetik nabız açıksa yalnızca simüle yoğunluğu yansıtır.</p>
        </aside>
      </div>
    </div>
  );
}

function Meter({ label, value, unit, note, warn }: { label: string; value: number; unit?: string; note?: string; warn?: boolean }) {
  const v = Math.round(value);
  return (
    <div className={`meter${warn ? ' is-warn' : ''}`}>
      <span className="meter-label">{label}</span>
      <span className="mono meter-val">
        {v}
        {unit}
      </span>
      <span className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, v / 100))})` }} />
      </span>
      {note && <span className="tiny muted meter-note">{note}{warn ? ' ▲' : ''}</span>}
    </div>
  );
}
