import { useEffect, useState } from 'react';

export type Route =
  | { name: 'studio' }
  | { name: 'deck' }
  | { name: 'room'; id: string }
  | { name: 'arc'; id: string }
  | { name: 'rehearse'; id: string }
  | { name: 'debrief'; id: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name, id] = parts;
  if (name === 'deck') return { name: 'deck' };
  if (id && (name === 'room' || name === 'arc' || name === 'rehearse' || name === 'debrief')) {
    return { name, id: decodeURIComponent(id) } as Route;
  }
  return { name: 'studio' };
}

export function href(r: Route): string {
  if (r.name === 'studio') return '#/';
  if (r.name === 'deck') return '#/deck';
  return `#/${r.name}/${encodeURIComponent(r.id)}`;
}

export function go(r: Route) {
  const h = href(r);
  if (window.location.hash !== h) window.location.hash = h;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
