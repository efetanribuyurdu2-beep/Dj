import { Component, lazy, Suspense, type ReactNode } from 'react';
import { t } from './i18n/tr';
import { StoreProvider, useStore } from './store/store';
import { href, useRoute, type Route } from './ui/router';
import { Studio } from './ui/screens/Studio';
import { RoomBuilder } from './ui/screens/RoomBuilder';
import { NightArc } from './ui/screens/NightArc';
import { Rehearsal } from './ui/screens/Rehearsal';
import { Debrief } from './ui/screens/Debrief';

const DeckScreen = lazy(() => import('./ui/deck/DeckScreen').then((m) => ({ default: m.DeckScreen })));

const STEPS: { name: Exclude<Route['name'], 'studio' | 'deck'>; n: string; label: string }[] = [
  { name: 'room', n: '01', label: t.nav.room },
  { name: 'arc', n: '02', label: t.nav.arc },
  { name: 'rehearse', n: '03', label: t.nav.rehearse },
  { name: 'debrief', n: '04', label: t.nav.debrief },
];

function Shell() {
  const route = useRoute();
  const store = useStore();
  const session = route.name !== 'studio' && route.name !== 'deck' ? store.get(route.id) : undefined;

  let body: ReactNode;
  if (route.name === 'studio') body = <Studio />;
  else if (route.name === 'deck')
    body = (
      <Suspense fallback={<p className="screen muted">Deck yükleniyor…</p>}>
        <DeckScreen />
      </Suspense>
    );
  else if (!session)
    body = (
      <div className="screen">
        <p className="notice notice-err">{t.common.notFound}</p>
        <a className="btn" href="#/">
          ← {t.common.studio}
        </a>
      </div>
    );
  else if (route.name === 'room') body = <RoomBuilder session={session} />;
  else if (route.name === 'arc') body = <NightArc session={session} />;
  else if (route.name === 'rehearse') body = <Rehearsal key={session.id} session={session} />;
  else body = <Debrief session={session} />;

  return (
    <div className={`app route-${route.name}`}>
      <a className="skip" href="#main">
        İçeriğe geç
      </a>
      <header className="topbar">
        <a className="wordmark" href="#/" aria-label="FLOOR — Studio">
          <span className="display wordmark-name">FLOOR</span>
          <span className="wordmark-sub mono">{t.motto}</span>
        </a>
        {session ? (
          <nav className="steps" aria-label="Gecenin adımları">
            {STEPS.map((s) => {
              const current = route.name === s.name;
              const disabled = s.name === 'debrief' && session.status !== 'finished';
              return disabled ? (
                <span key={s.name} className="step-link is-disabled" title="Prova bitince açılır">
                  <span className="mono step-n">{s.n}</span>
                  <span className="step-label">{s.label}</span>
                </span>
              ) : (
                <a key={s.name} className={`step-link${current ? ' is-current' : ''}`} href={href({ name: s.name, id: session.id })} aria-current={current ? 'page' : undefined}>
                  <span className="mono step-n">{s.n}</span>
                  <span className="step-label">{s.label}</span>
                </a>
              );
            })}
            <a className="step-link step-deck" href="#/deck">
              <span className="mono step-n">05</span>
              <span className="step-label">Deck</span>
            </a>
          </nav>
        ) : (
          <nav className="steps" aria-label="Bölümler">
            <a className={`step-link${route.name === 'studio' ? ' is-current' : ''}`} href="#/" aria-current={route.name === 'studio' ? 'page' : undefined}>
              <span className="step-label">Studio</span>
            </a>
            <a className={`step-link${route.name === 'deck' ? ' is-current' : ''}`} href="#/deck" aria-current={route.name === 'deck' ? 'page' : undefined}>
              <span className="mono step-n">05</span>
              <span className="step-label">Deck</span>
            </a>
          </nav>
        )}
      </header>
      {store.notice && (
        <p className="notice notice-warn app-notice" role="alert">
          {store.notice}{' '}
          <button type="button" className="btn-text" onClick={store.dismissNotice}>
            Tamam
          </button>
        </p>
      )}
      {!store.persistent && (
        <p className="notice notice-warn app-notice" role="alert">
          Kayıt yapılamıyor (tarayıcı depolaması dolu ya da kapalı). Çalışmaya devam edebilirsin ama sayfa yenilenince değişiklikler kaybolur; JSON olarak dışa aktarmayı düşün.
        </p>
      )}
      <main id="main" tabIndex={-1}>
        <ErrorBoundary>{body}</ErrorBoundary>
      </main>
      <footer className="sitefoot tiny mono">
        <span>FLOOR · DJ Performance Studio</span>
        <span>{t.simNote}</span>
        <span>Spotify, Rekordbox veya djay bağlantısı yoktur. FLX2 yalnızca Deck’te, MIDI learn ile.</span>
      </footer>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="screen">
          <p className="notice notice-err">Bu ekran açılırken bir hata oluştu: {this.state.error.message}</p>
          <a
            className="btn"
            href="#/"
            onClick={() => this.setState({ error: null })}
          >
            ← Studio
          </a>
        </div>
      );
    return this.props.children;
  }
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
