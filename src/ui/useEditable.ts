import type { Session } from '../store/schema';
import { useStore } from '../store/store';
import { go } from './router';

/**
 * Editing the room or arc invalidates a rehearsal that already has decisions.
 * - draft: edit in place
 * - rehearsing: edit resets the rehearsal (after confirming once)
 * - finished: the finished night stays intact; edits go to a fresh copy
 */
export function useEditable(session: Session, screen: 'room' | 'arc') {
  const store = useStore();
  const locked = session.status === 'finished';
  const hasProgress = session.status === 'rehearsing' && session.events.length > 0;

  const edit = (patch: Partial<Session>) => {
    if (locked) return;
    if (hasProgress && !window.confirm('Bu değişiklik devam eden provadaki kararları sıfırlar. Devam edilsin mi?')) return;
    store.update(session.id, {
      ...patch,
      ...(hasProgress || session.status === 'rehearsing' ? { events: [], cursor: 0, status: 'draft' as const, stopAt: undefined } : {}),
    });
  };

  const copy = () => {
    const now = Date.now();
    const s: Session = {
      ...structuredClone(session),
      id: `n${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: `${session.name} (yeni)`,
      events: [],
      cursor: 0,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      finishedAt: undefined,
      stopAt: undefined,
      practice: undefined,
    };
    store.add(s);
    go({ name: screen, id: s.id });
  };

  return { edit, locked, hasProgress, copy };
}
