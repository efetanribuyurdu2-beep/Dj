import { useId, useState } from 'react';
import { GROUPS, VENUES } from '../../sim/content';
import type { GroupId, GroupShares, VenueId } from '../../sim/types';
import { GROUP_IDS } from '../../sim/types';
import { t } from '../../i18n/tr';
import { allocate, FloorView, MarkIcon, MAX_DOTS, type Splits } from './FloorView';

interface Props {
  venue: VenueId;
  people: number;
  shares: GroupShares;
  splits: Splits;
  intensity: number;
  seed: number;
  live?: boolean;
  insight?: (g: GroupId) => string;
  selected?: GroupId | null;
  onSelect?: (g: GroupId | null) => void;
  caption?: string;
}

export function crowdSummary(people: number, shares: GroupShares, splits: Splits) {
  const counts = allocate(Math.round(people), shares);
  return GROUP_IDS.map((g) => {
    const n = counts[g];
    const floor = Math.round(n * splits[g].floor);
    const bar = Math.round(n * splits[g].bar);
    return { g, n, floor, bar, lounge: Math.max(0, n - floor - bar) };
  });
}

export function FloorPanel({ venue, people, shares, splits, intensity, seed, live, insight, selected: selCtl, onSelect: onSelCtl, caption }: Props) {
  const [selLocal, setSelLocal] = useState<GroupId | null>(null);
  const selected = selCtl !== undefined ? selCtl : selLocal;
  const onSelect = onSelCtl ?? setSelLocal;
  const [asList, setAsList] = useState(false);
  const tableId = useId();
  const rows = crowdSummary(people, shares, splits);
  const totalFloor = rows.reduce((a, r) => a + r.floor, 0);
  const label = `${VENUES[venue].name} planı: ${Math.round(people)} kişiden yaklaşık ${totalFloor} kişi pistte. Ayrıntılı dağılım tabloda.`;

  return (
    <section className="floorpanel" aria-label="Mekân">
      <div className="floorpanel-stage">
        {asList ? (
          <CrowdTable rows={rows} id={tableId} visible />
        ) : (
          <FloorView
            venue={venue}
            people={people}
            shares={shares}
            splits={splits}
            intensity={intensity}
            seed={seed}
            selected={selected}
            onSelect={onSelect}
            live={live}
            label={label}
          />
        )}
        {!asList && <CrowdTable rows={rows} id={tableId} />}
      </div>
      <div className="floorpanel-bar">
        <div className="legend" role="group" aria-label="Seyirci grupları">
          {rows.map((r) => (
            <button
              key={r.g}
              type="button"
              className={`legend-item${selected === r.g ? ' is-on' : ''}`}
              aria-pressed={selected === r.g}
              onClick={() => onSelect(selected === r.g ? null : r.g)}
            >
              <MarkIcon group={r.g} />
              <span className="legend-name">{GROUPS[r.g].short}</span>
              <span className="legend-num mono">
                {r.floor}/{r.n}
                <span className="sr-only"> kişi pistte</span>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn-text" onClick={() => setAsList((v) => !v)} aria-pressed={asList}>
          {asList ? t.rehearse.planToggle : t.rehearse.listToggle}
        </button>
      </div>
      <div className="floorpanel-info" aria-live="polite">
        {selected ? (
          <p>
            <strong>{GROUPS[selected].name}.</strong> {insight ? insight(selected) : GROUPS[selected].about}
          </p>
        ) : (
          <p className="muted">{caption ?? 'Bir gruba dokun: ne durumda olduklarını gör.'}</p>
        )}
      </div>
      {people > MAX_DOTS && <p className="tiny muted">Görsel {MAX_DOTS} işaretle sınırlı.</p>}
    </section>
  );
}

function CrowdTable({ rows, id, visible }: { rows: ReturnType<typeof crowdSummary>; id: string; visible?: boolean }) {
  return (
    <table id={id} className={visible ? 'crowd-table' : 'sr-only'}>
      <caption className={visible ? 'tiny muted' : undefined}>Simüle kalabalık dağılımı (kişi)</caption>
      <thead>
        <tr>
          <th scope="col">Grup</th>
          <th scope="col">Pist</th>
          <th scope="col">Bar</th>
          <th scope="col">Lounge</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.g}>
            <th scope="row">
              <MarkIcon group={r.g} /> {GROUPS[r.g].name}
            </th>
            <td className="mono">{r.floor}</td>
            <td className="mono">{r.bar}</td>
            <td className="mono">{r.lounge}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
