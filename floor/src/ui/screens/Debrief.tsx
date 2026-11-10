import { useMemo } from 'react';
import { t } from '../../i18n/tr';
import { GOALS, GROUPS, VENUES } from '../../sim/content';
import { buildDebrief, type Debrief as D } from '../../sim/debrief';
import { run } from '../../sim/engine';
import { GROUP_IDS } from '../../sim/types';
import type { Session } from '../../store/schema';
import { useStore } from '../../store/store';
import { MarkIcon } from '../floor/FloorView';
import { go } from '../router';
import { configOf } from '../useSim';
import { Timeline } from './Timeline';
import { downloadText } from '../download';
import { exportSessions } from '../../store/persistence';

function headline(d: D): string {
  if (d.goal.achieved) return 'Gece tuttu.';
  if (d.stats.maxIntensityRun >= 15) return 'Pist erken yoruldu.';
  if (d.peakEarly) return 'Zirve erken geldi.';
  const low = d.groups.reduce((a, b) => (b.avg < a.avg ? b : a));
  if (low.avg < 40) return `${GROUPS[low.group].short} grubu kaybedildi.`;
  if (d.metrics[0].value < 55) return 'Plan ve oda ayrıştı.';
  return 'Neredeyse.';
}

export function Debrief({ session }: { session: Session }) {
  const store = useStore();
  const cfg = useMemo(() => configOf(session), [session]);
  const d = useMemo(() => buildDebrief(cfg, session.events), [cfg, session.events]);
  const result = useMemo(() => run(cfg, session.events, Number.MAX_SAFE_INTEGER), [cfg, session.events]);
  const notFinished = session.status !== 'finished';

  const clone = (where: 'rehearse' | 'arc') => {
    const now = Date.now();
    const s: Session = {
      ...structuredClone(session),
      id: `n${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: session.name.replace(/ \((tekrar|yeni)\)$/, '') + ' (tekrar)',
      events: [],
      cursor: 0,
      status: where === 'rehearse' ? 'rehearsing' : 'draft',
      createdAt: now,
      updatedAt: now,
      finishedAt: undefined,
      stopAt: undefined,
      practice: undefined,
    };
    store.add(s);
    go({ name: where, id: s.id });
  };

  const saved = session.practice?.task === d.practice.task;
  const markers = d.turningPoints.map((tp, i) => ({ minute: tp.minute, n: i + 1 }));
  const table = result.snapshots.filter((s) => s.minute % 5 === 0);

  if (notFinished) {
    return (
      <div className="screen">
        <p className="notice">Bu gecenin provası henüz bitmedi. Değerlendirme gece bittiğinde gerçek kararlarından üretilir.</p>
        <a className="btn btn-primary" href={`#/rehearse/${session.id}`}>
          Provaya dön →
        </a>
      </div>
    );
  }

  return (
    <article className="screen debrief">
      <header className="db-head reveal" style={{ ['--i' as string]: 0 }}>
        <p className="eyebrow mono">
          <span lang="en">04 — {t.debrief.title} · {VENUES[session.room.venue].name}</span> · {session.room.people} kişi · {d.minutes} dk
        </p>
        <h1 className="display db-title">{headline(d)}</h1>
        <p className="db-goal">
          <span className={`tag ${d.goal.achieved ? 'tag-ok' : 'tag-miss'}`}>{d.goal.achieved ? '✓ hedef' : '× hedef'}</span> {d.goal.text}
        </p>
      </header>

      <section className="db-block reveal" style={{ ['--i' as string]: 1 }} aria-labelledby="db-flow">
        <h2 id="db-flow" className="eyebrow mono">
          {t.debrief.flow}
        </h2>
        <Timeline cfg={cfg} snapshots={result.snapshots} events={session.events} minute={d.minutes} duration={d.minutes} detailed markers={markers} />
        <p className="db-lede">{d.flow}</p>
        <details className="db-table">
          <summary className="btn-text">Veriyi tablo olarak göster</summary>
          <table>
            <thead>
              <tr>
                <th scope="col">dk</th>
                <th scope="col">plan</th>
                <th scope="col">oda</th>
                <th scope="col">yoğunluk</th>
                {GROUP_IDS.map((g) => (
                  <th key={g} scope="col">
                    {GROUPS[g].short} pist %
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((s) => (
                <tr key={s.minute}>
                  <td className="mono">{s.minute}</td>
                  <td className="mono">{Math.round(s.planned)}</td>
                  <td className="mono">{Math.round(s.energy)}</td>
                  <td className="mono">{Math.round(s.intensity)}</td>
                  {GROUP_IDS.map((g) => (
                    <td key={g} className="mono">
                      {Math.round(s.groups[g].floor * 100)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="db-metrics reveal" style={{ ['--i' as string]: 2 }} aria-label="Ölçütler">
        {d.metrics.map((m) => (
          <div key={m.id} className="db-metric">
            <span className="db-metric-label">{m.label}</span>
            <span className="mono db-metric-val">{m.value}</span>
            <span className="db-metric-track" aria-hidden="true">
              <span style={{ transform: `scaleX(${m.value / 100})` }} />
            </span>
            <p className="tiny">{m.text}</p>
          </div>
        ))}
      </section>

      <div className="db-cols">
        <section className="db-block reveal" style={{ ['--i' as string]: 3 }} aria-labelledby="db-turn">
          <h2 id="db-turn" className="eyebrow mono">
            {t.debrief.turning}
          </h2>
          {d.turningPoints.length === 0 ? (
            <p className="muted">Kayıtlı karar yok.</p>
          ) : (
            <ol className="db-turns">
              {d.turningPoints.map((tp, i) => (
                <li key={tp.index}>
                  <span className="mono db-turn-n">{i + 1}</span>
                  <div>
                    <h3 className="h4">
                      <span className="mono">dk {tp.minute}</span> · {tp.label}
                    </h3>
                    <p className="mono tiny">
                      {GROUP_IDS.map((g) => `${GROUPS[g].short} ${tp.dEngagement[g] >= 0 ? '+' : ''}${Math.round(tp.dEngagement[g])}`).join(' · ')} · yorgunluk{' '}
                      {tp.dFatigue >= 0 ? '+' : ''}
                      {Math.round(tp.dFatigue)}
                    </p>
                    {tp.notes.length > 0 && <p>{tp.notes.join(' ')}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="db-block reveal" style={{ ['--i' as string]: 4 }} aria-labelledby="db-groups">
          <h2 id="db-groups" className="eyebrow mono">
            {t.debrief.groups}
          </h2>
          <ul className="db-groups">
            {d.groups.map((g) => (
              <li key={g.group}>
                <h3 className="h4">
                  <MarkIcon group={g.group} /> {GROUPS[g.group].name}
                  <span className="mono muted">
                    {' '}
                    {Math.round(g.start)} → {Math.round(g.end)}
                  </span>
                </h3>
                <p>{g.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="db-cols">
        <section className="db-block db-good reveal" style={{ ['--i' as string]: 5 }} aria-labelledby="db-best">
          <h2 id="db-best" className="eyebrow mono">
            {t.debrief.best}
          </h2>
          {d.best ? (
            <>
              <h3 className="h3">
                <span className="mono">dk {d.best.minute}</span> · {d.best.label}
              </h3>
              <p>
                Sonraki beş dakikada{' '}
                {GROUP_IDS.filter((g) => d.best!.dEngagement[g] > 1)
                  .map((g) => `${GROUPS[g].name} ${Math.round(d.best!.dEngagement[g])} puan`)
                  .join(', ') || 'oda dengede kaldı'}
                {d.best.dFatigue < -2 ? `; yorgunluk ${Math.round(-d.best.dFatigue)} puan azaldı` : ''}. {d.best.notes.join(' ')}
              </p>
            </>
          ) : (
            <p className="muted">{t.debrief.noBest}</p>
          )}
        </section>
        <section className="db-block db-bad reveal" style={{ ['--i' as string]: 6 }} aria-labelledby="db-worst">
          <h2 id="db-worst" className="eyebrow mono">
            {t.debrief.worst}
          </h2>
          {d.worst ? (
            <>
              <h3 className="h3">{d.worst.title}</h3>
              <p>{d.worst.text}</p>
            </>
          ) : (
            <p className="muted">Belirgin bir kopuş anı yok.</p>
          )}
        </section>
      </div>

      {d.lessons.length > 0 && (
        <section className="db-block reveal" style={{ ['--i' as string]: 7 }} aria-labelledby="db-lessons">
          <h2 id="db-lessons" className="eyebrow mono">
            {t.debrief.lessons}
          </h2>
          <ul className="db-lessons">
            {d.lessons.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="practice reveal" style={{ ['--i' as string]: 8 }} aria-labelledby="db-practice">
        <div className="practice-stub mono" aria-hidden="true" lang="en">
          <span>FLOOR</span>
          <span>PRACTICE</span>
          <span>DDJ-FLX2</span>
        </div>
        <div className="practice-body">
          <h2 id="db-practice" className="eyebrow mono">
            {t.debrief.practice}
          </h2>
          <h3 className="display practice-title">{d.practice.title}</h3>
          <p className="practice-task">{d.practice.task}</p>
          <p className="tiny muted">Neden: {d.practice.why}</p>
          <button
            type="button"
            className={`btn ${saved ? 'btn-ghost' : 'btn-primary'}`}
            disabled={saved}
            onClick={() => store.update(session.id, { practice: { title: d.practice.title, task: d.practice.task } })}
          >
            {saved ? `✓ ${t.debrief.saved}` : t.debrief.save}
          </button>
        </div>
      </section>

      <section className="db-stats reveal mono tiny" style={{ ['--i' as string]: 9 }} aria-label={t.debrief.stats}>
        <span>{d.stats.decisions} karar/yanıt</span>
        <span>{d.stats.vocals} vokal</span>
        <span>{d.stats.shifts} yön değişikliği</span>
        <span>{d.stats.breathes} nefes</span>
        <span>hedef: {GOALS[session.room.goal].tr}</span>
        <span>seed {session.seed}</span>
      </section>

      <footer className="screen-foot">
        <a className="btn btn-ghost" href="#/">
          ← {t.common.studio}
        </a>
        <div className="foot-right">
          <button type="button" className="btn-text" onClick={() => downloadText(`floor-${session.id}.json`, exportSessions([session]))}>
            Bu geceyi dışa aktar
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => clone('arc')}>
            {t.debrief.editArc}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => clone('rehearse')}>
            Yeniden prova et →
          </button>
        </div>
      </footer>
      <p className="tiny muted">{t.simNote} Aynı seed ve aynı kararlarla bu sonuç her seferinde aynıdır.</p>
    </article>
  );
}
