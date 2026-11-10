import { useMemo, useRef, useState } from 'react';
import { t } from '../../i18n/tr';
import { GOALS, VENUES } from '../../sim/content';
import { buildDebrief } from '../../sim/debrief';
import { SCENARIOS } from '../../sim/scenarios';
import { exportSessions, parseImport } from '../../store/persistence';
import type { Session } from '../../store/schema';
import { customSession, sessionFromScenario, useStore } from '../../store/store';
import { roomFromVenue } from '../../sim/scenarios';
import { FloorPanel } from '../floor/FloorPanel';
import { go } from '../router';
import { configOf, previewState, splitsOf } from '../useSim';
import { downloadText } from '../download';

const FEATURED = SCENARIOS[0];

function routeFor(s: Session) {
  if (s.status === 'finished') return { name: 'debrief' as const, id: s.id };
  if (s.status === 'rehearsing') return { name: 'rehearse' as const, id: s.id };
  return { name: 'arc' as const, id: s.id };
}

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function Studio() {
  const store = useStore();
  const { sessions, activeId } = store.data;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const active = sessions.find((s) => s.id === activeId && s.status !== 'finished');
  const finished = sessions.filter((s) => s.status === 'finished').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const last = finished[0];
  const practiceFrom = finished.find((s) => s.practice);
  const lastDebrief = useMemo(() => (last ? buildDebrief(configOf(last), last.events) : null), [last]);

  const preview = useMemo(() => previewState({ room: FEATURED.room }), []);

  const startScenario = (id: string, where: 'rehearse' | 'arc' | 'room') => {
    const s = sessionFromScenario(id);
    if (!s) return;
    store.add(s);
    go({ name: where, id: s.id });
  };

  const buildNight = () => {
    const s = customSession(roomFromVenue('house'));
    store.add(s);
    go({ name: 'room', id: s.id });
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const r = parseImport(text);
    if (!r.ok) {
      setMsg({ kind: 'err', text: r.error });
      return;
    }
    const { added, updated } = store.importSessions(r.sessions);
    setMsg({
      kind: 'ok',
      text: added + updated === 0 ? 'Dosyadaki oturumlar zaten güncel; değişiklik yapılmadı.' : `${added} yeni, ${updated} güncellenmiş oturum içe aktarıldı.`,
    });
  };

  return (
    <div className="studio">
      <section className="hero" aria-labelledby="tonight-title">
        <div className="hero-copy">
          <p className="eyebrow mono">
            <span lang="en">{t.studio.tonight}</span> <span className="eyebrow-rule" aria-hidden="true" /> {new Date().toLocaleDateString('tr-TR', { weekday: 'long' })}
          </p>
          <h1 id="tonight-title" className="display hero-title">
            {VENUES[FEATURED.room.venue].name.split(' ')[0]},
            <br />
            {FEATURED.room.people} people,
            <br />
            <span className="accent-text">{FEATURED.room.duration} minutes.</span>
          </h1>
          <p className="ticket mono" lang="en">
            <span>{FEATURED.title}</span>
            <span aria-hidden="true">✶</span>
            <span>{GOALS[FEATURED.room.goal].name}</span>
          </p>
          <p className="lede">{FEATURED.brief}</p>

          <div className="actions" role="group" aria-label="Ana eylemler">
            <button
              type="button"
              className="action"
              disabled={!active}
              onClick={() => active && go(routeFor(active))}
              aria-describedby="resume-note"
            >
              <span className="action-n mono">A</span>
              <span className="action-name">{t.studio.resume}</span>
              <span id="resume-note" className="action-note">
                {active ? `${active.name} · dk ${active.cursor}/${active.room.duration}` : t.studio.resumeNone}
              </span>
            </button>
            <button type="button" className="action" onClick={buildNight}>
              <span className="action-n mono">B</span>
              <span className="action-name">{t.studio.build}</span>
              <span className="action-note">{t.studio.buildNote}</span>
            </button>
            <button type="button" className="action action-primary" onClick={() => startScenario(FEATURED.id, 'rehearse')}>
              <span className="action-n mono">C</span>
              <span className="action-name">{t.studio.quick}</span>
              <span className="action-note">{t.studio.quickNote}</span>
            </button>
          </div>
          <p className="deck-cta">
            <a href="#/deck">
              <span className="mono step-n">05</span> Deck — kendi MP3/WAV’larınla çal, analiz et, stem’lere ayır, FLX2 bağla →
            </a>
          </p>
        </div>
        <div className="hero-plan">
          <FloorPanel
            venue={FEATURED.room.venue}
            people={FEATURED.room.people}
            shares={FEATURED.room.shares}
            splits={splitsOf(preview)}
            intensity={preview.intensity}
            seed={FEATURED.seed}
            live
            caption="Gece başlamadan önceki oda. Bir gruba dokun."
          />
        </div>
      </section>

      {(practiceFrom || last) && (
        <section className="since" aria-label="Son durum">
          {practiceFrom?.practice && (
            <div className="since-item">
              <p className="eyebrow mono">{t.studio.nextPractice}</p>
              <h2 className="h3">{practiceFrom.practice.title}</h2>
              <p>{practiceFrom.practice.task}</p>
            </div>
          )}
          {last && lastDebrief && (
            <div className="since-item">
              <p className="eyebrow mono">{t.studio.lastRun}</p>
              <h2 className="h3">
                <a href={`#/debrief/${last.id}`}>{last.name}</a>
              </h2>
              <p>{lastDebrief.goal.text}</p>
            </div>
          )}
        </section>
      )}

      <section className="lineup" aria-labelledby="sc-title">
        <header className="section-head">
          <h2 id="sc-title" className="h2">
            {t.studio.scenarios}
          </h2>
          <p className="muted">{t.studio.scenariosNote}</p>
        </header>
        <ol className="lineup-list">
          {SCENARIOS.map((sc, i) => (
            <li key={sc.id} className="lineup-row">
              <span className="lineup-n mono">{String(i + 1).padStart(2, '0')}</span>
              <div className="lineup-main">
                <h3 className="display lineup-title">{sc.title}</h3>
                <p className="mono lineup-meta">
                  {sc.tagline} · hedef: {GOALS[sc.room.goal].tr.toLocaleLowerCase('tr-TR')}
                </p>
                <p className="lineup-brief">{sc.brief}</p>
              </div>
              <div className="lineup-actions">
                <button type="button" className="btn" onClick={() => startScenario(sc.id, 'rehearse')}>
                  Prova et
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => startScenario(sc.id, 'room')}>
                  Özelleştir
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="nights" aria-labelledby="nights-title">
        <header className="section-head">
          <h2 id="nights-title" className="h2">
            {t.studio.yourNights}
          </h2>
          <div className="data-actions">
            <button
              type="button"
              className="btn-text"
              disabled={sessions.length === 0}
              title={sessions.length === 0 ? 'Dışa aktarılacak oturum yok' : undefined}
              onClick={() => downloadText(`floor-${new Date().toISOString().slice(0, 10)}.json`, exportSessions(sessions))}
            >
              {t.studio.export}
            </button>
            <button type="button" className="btn-text" onClick={() => fileRef.current?.click()}>
              {t.studio.import}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
          </div>
        </header>
        {msg && (
          <p className={`notice ${msg.kind === 'err' ? 'notice-err' : ''}`} role="status">
            {msg.text}{' '}
            <button type="button" className="btn-text" onClick={() => setMsg(null)}>
              Kapat
            </button>
          </p>
        )}
        {sessions.length === 0 ? (
          <p className="muted empty">{t.studio.noNights}</p>
        ) : (
          <ul className="night-list">
            {sessions.map((s) => (
              <li key={s.id} className="night-row">
                <a className="night-link" href={`#/${routeFor(s).name}/${s.id}`}>
                  <span className="night-name">{s.name}</span>
                  <span className="mono night-meta">
                    {VENUES[s.room.venue].name} · {s.room.people} kişi · {s.room.duration} dk
                  </span>
                </a>
                <span className={`tag tag-${s.status}`}>{t.studio.status[s.status]}</span>
                <span className="mono night-date">{dateFmt.format(s.updatedAt)}</span>
                <button
                  type="button"
                  className="btn-text danger"
                  onClick={() => {
                    if (window.confirm(t.studio.confirmDelete)) store.remove(s.id);
                  }}
                  aria-label={`${s.name} oturumunu sil`}
                >
                  {t.studio.delete}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
