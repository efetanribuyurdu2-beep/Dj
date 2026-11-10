import { useMemo } from 'react';
import { t } from '../../i18n/tr';
import { DIRECTIONS, DIRECTION_IDS, GOALS, GROUPS, VENUES, VENUE_IDS } from '../../sim/content';
import { initialState } from '../../sim/engine';
import { fitArcToDuration } from '../../sim/arc';
import { defaultArc, defaultCurveballs } from '../../sim/scenarios';
import type { DirectionId, GoalId, GroupId, RoomConfig, VenueId } from '../../sim/types';
import { GROUP_IDS } from '../../sim/types';
import type { Session } from '../../store/schema';
import { Fader, Segmented } from '../controls';
import { FloorPanel } from '../floor/FloorPanel';
import { MarkIcon } from '../floor/FloorView';
import { LAYOUTS } from '../floor/layouts';
import { go } from '../router';
import { splitsOf } from '../useSim';
import { useEditable } from '../useEditable';
import { LockedNotice, ResetNotice } from './Notices';

export function RoomBuilder({ session }: { session: Session }) {
  const { edit, locked, hasProgress, copy } = useEditable(session, 'room');
  const room = session.room;
  const preview = useMemo(() => initialState(room), [room]);

  const setRoom = (patch: Partial<RoomConfig>) => {
    const next = { ...room, ...patch };
    const custom = session.scenarioId === null;
    const durationChanged = next.duration !== room.duration;
    edit({
      room: next,
      // the arc always follows the event length; custom rooms also get fitting curveballs
      arc: custom && patch.venue ? defaultArc(next) : durationChanged ? fitArcToDuration(session.arc, next.duration) : session.arc,
      curveballs: custom ? defaultCurveballs(next) : session.curveballs.filter((c) => c.minute < next.duration),
      name: custom ? `${VENUES[next.venue].name} · ${next.people} kişi` : session.name,
    });
  };

  const pickVenue = (v: VenueId) => {
    const d = VENUES[v].defaults;
    setRoom({ venue: v, ...d });
  };

  const shareSum = room.shares.groove + room.shares.hits + room.shares.explorers || 1;

  return (
    <div className="screen room">
      <header className="screen-head">
        <p className="eyebrow mono" lang="en">01 — {t.room.title}</p>
        <h1 className="display h1">{session.name}</h1>
        <p className="muted">Her seçim simülasyonun başlangıç koşullarını değiştirir ve plana anında yansır.</p>
      </header>
      {locked && <LockedNotice onCopy={copy} />}
      {hasProgress && <ResetNotice />}

      <div className="room-grid">
        <div className="room-controls">
          <fieldset className="venues" disabled={locked}>
            <legend>{t.room.venue}</legend>
            <div className="venue-row">
              {VENUE_IDS.map((v) => (
                <label key={v} className={`venue-opt${room.venue === v ? ' is-on' : ''}`}>
                  <input type="radio" name="venue" value={v} checked={room.venue === v} onChange={() => pickVenue(v)} />
                  <svg viewBox="0 0 1000 620" aria-hidden="true" className="venue-glyph">
                    <path d={LAYOUTS[v].outline} />
                    <ellipse cx={LAYOUTS[v].floor.cx} cy={LAYOUTS[v].floor.cy} rx={LAYOUTS[v].floor.rx} ry={LAYOUTS[v].floor.ry} />
                  </svg>
                  <span className="venue-name">{VENUES[v].name}</span>
                </label>
              ))}
            </div>
            <p className="venue-blurb">{VENUES[room.venue].blurb}</p>
            <dl className="venue-params mono">
              <div>
                <dt>sosyal çekim</dt>
                <dd>{Math.round(VENUES[room.venue].social * 100)}</dd>
              </div>
              <div>
                <dt>yorulma hızı</dt>
                <dd>×{VENUES[room.venue].fatigueRate.toFixed(2)}</dd>
              </div>
              <div>
                <dt>enerji toleransı</dt>
                <dd>{VENUES[room.venue].toleranceShift >= 0 ? '+' : ''}{VENUES[room.venue].toleranceShift}</dd>
              </div>
            </dl>
          </fieldset>

          <fieldset className="group-block" disabled={locked}>
            <legend>Gece</legend>
            <Fader label={t.room.duration} value={room.duration} min={30} max={180} step={5} unit="dk" onChange={(v) => setRoom({ duration: v })} />
            <Fader label={t.room.people} value={room.people} min={8} max={VENUES[room.venue].capacity * 2} step={1} unit="kişi" onChange={(v) => setRoom({ people: v })} />
            <Fader
              label={t.room.startEnergy}
              value={room.startEnergy}
              min={5}
              max={80}
              onChange={(v) => setRoom({ startEnergy: v })}
              hint="İnsanlar içeri girdiğinde odanın taşıdığı enerji."
            />
          </fieldset>

          <fieldset className="group-block" disabled={locked}>
            <legend>Müzik ve beklenti</legend>
            <Segmented<DirectionId>
              label={t.room.direction}
              value={room.direction}
              onChange={(v) => setRoom({ direction: v })}
              options={DIRECTION_IDS.map((d) => ({ value: d, label: DIRECTIONS[d].name, note: DIRECTIONS[d].note }))}
            />
            <Fader
              label={t.room.hitExpectation}
              value={room.hitExpectation}
              min={0}
              max={100}
              onChange={(v) => setRoom({ hitExpectation: v })}
              hint="Yüksekse tanıdık vokaller daha çok karşılık bulur; yokluğu daha çok hissedilir."
            />
            <Fader
              label={t.room.openness}
              value={room.openness}
              min={0}
              max={100}
              onChange={(v) => setRoom({ openness: v })}
              hint="Yüksekse yön değişiklikleri daha kolay kabul görür."
            />
          </fieldset>

          <fieldset className="group-block" disabled={locked}>
            <legend>{t.room.mix}</legend>
            <div className="mixbar" aria-hidden="true">
              {GROUP_IDS.map((g) => (
                <span key={g} className={`mixbar-seg mix-${g}`} style={{ flexGrow: room.shares[g] || 0.001 }} />
              ))}
            </div>
            {GROUP_IDS.map((g: GroupId) => (
              <Fader
                key={g}
                label={GROUPS[g].name}
                value={room.shares[g]}
                min={0}
                max={100}
                step={5}
                format={() => `%${Math.round((room.shares[g] / shareSum) * 100)}`}
                onChange={(v) => setRoom({ shares: { ...room.shares, [g]: v } })}
                hint={GROUPS[g].about}
              />
            ))}
            <p className="tiny muted">
              <MarkIcon group="groove" /> <MarkIcon group="hits" /> <MarkIcon group="explorers" /> {t.room.mixNote}
            </p>
          </fieldset>

          <fieldset className="group-block" disabled={locked}>
            <Segmented<GoalId>
              label={t.room.goal}
              value={room.goal}
              cols={2}
              onChange={(v) => setRoom({ goal: v })}
              options={(Object.keys(GOALS) as GoalId[]).map((g) => ({ value: g, label: GOALS[g].tr, note: GOALS[g].note }))}
            />
          </fieldset>
          <div className="room-next-mobile">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => go({ name: 'arc', id: session.id })}>
              {t.room.next} →
            </button>
          </div>
        </div>

        <aside className="room-preview">
          <div className="sticky">
            <FloorPanel
              venue={room.venue}
              people={room.people}
              shares={room.shares}
              splits={splitsOf(preview)}
              intensity={preview.intensity}
              seed={session.seed}
              live
              caption={`${room.people} kişi · ${room.duration} dk · başlangıç enerjisi ${room.startEnergy}`}
            />
            <div className="room-next">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => go({ name: 'arc', id: session.id })}>
                {t.room.next} →
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
