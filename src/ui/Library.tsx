import { useMemo, useRef, useState } from 'react';
import type { GenreId, Track } from '../types';
import { GENRE_LIST, GENRES } from '../knowledge/genres';
import { fmt, view } from '../engine/transition';
import { Energy, GenreChip, KeyBadge, Modal, TrackMap } from './common';

interface Props {
  tracks: Track[];
  onFiles: (f: FileList | File[]) => void;
  onRemove: (id: string) => void;
  onGenre: (id: string, g: GenreId) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (f: File) => void;
  onPlan: (ids: string[]) => void;
}

const STATUS: Record<Track['status'], string> = { pending: 'Sırada', analyzing: 'Analiz ediliyor…', done: 'Analiz edildi', 'meta-only': 'rekordbox verisi', error: 'Hata' };

export function Library({ tracks, onFiles, onRemove, onGenre, onClear, onExport, onImport, onPlan }: Props) {
  const [over, setOver] = useState(false);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState<GenreId | 'all'>('all');
  const [sort, setSort] = useState<'added' | 'bpm' | 'key' | 'energy' | 'title'>('added');
  const [detail, setDetail] = useState<Track | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const ql = q.toLocaleLowerCase('tr');
    const f = tracks.filter((t) => (genre === 'all' || t.genre === genre) && (!ql || (t.title + ' ' + t.artist).toLocaleLowerCase('tr').includes(ql)));
    const cmp: Record<string, (a: Track, b: Track) => number> = {
      added: (a, b) => b.addedAt - a.addedAt,
      bpm: (a, b) => (view(a).bpm ?? 0) - (view(b).bpm ?? 0),
      key: (a, b) => (parseInt(view(a).camelot ?? '99') - parseInt(view(b).camelot ?? '99')) || (view(a).camelot ?? '').localeCompare(view(b).camelot ?? ''),
      energy: (a, b) => view(b).energy - view(a).energy,
      title: (a, b) => a.title.localeCompare(b.title, 'tr'),
    };
    return f.sort(cmp[sort]);
  }, [tracks, q, genre, sort]);

  const counts = useMemo(() => {
    const c: Partial<Record<GenreId, number>> = {};
    tracks.forEach((t) => (c[t.genre] = (c[t.genre] ?? 0) + 1));
    return c;
  }, [tracks]);
  const analyzed = tracks.filter((t) => t.status === 'done').length;

  return (
    <>
      <div className="card">
        <div
          className={'drop' + (over ? ' over' : '')}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
        >
          <h2 style={{ marginBottom: 6 }}>Müziklerini ekle — gerisini uygulama halleder</h2>
          <p className="muted" style={{ margin: '0 0 12px' }}>
            Ses dosyalarını (MP3, M4A/AAC, WAV, AIFF, FLAC) seç. Her parçanın <b>BPM</b>, <b>ton (Camelot)</b>, <b>enerji</b>, <b>intro/outro</b>, <b>vokal</b> ve <b>tür</b> bilgisi otomatik çıkarılır.
            İstersen rekordbox’ın <b>XML</b> dışa aktarımını da ekle; rekordbox’ın BPM/ton verisi ve playlist’lerin kullanılır.
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>Dosya seç</button>
            <input ref={fileRef} type="file" multiple accept="audio/*,.mp3,.m4a,.aac,.wav,.aif,.aiff,.flac,.xml" hidden onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }} />
          </div>
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Dosyalar cihazından dışarı çıkmaz; analiz tamamen tarayıcıda yapılır. iPad’de “Dosyalar” uygulamasındaki müzikleri seçebilirsin (Apple Music/Spotify’daki şarkılar DRM’li olduğu için eklenemez).
          </p>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Kütüphane</h2>
          <span className="muted small">{tracks.length} parça · {analyzed} analiz edildi</span>
          <div className="grow" />
          <button className="btn small" onClick={onExport} title="iPad ↔ bilgisayar arasında taşımak için">Yedeği indir</button>
          <button className="btn small" onClick={() => backupRef.current?.click()}>Yedeği yükle</button>
          <input ref={backupRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
          {tracks.length > 0 && <button className="btn small ghost" onClick={onClear}>Tümünü sil</button>}
        </div>
        {tracks.length > 0 && (
          <div className="row" style={{ marginBottom: 10 }}>
            <input className="input grow" placeholder="Ara: parça veya sanatçı" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" value={genre} onChange={(e) => setGenre(e.target.value as GenreId | 'all')}>
              <option value="all">Tüm türler</option>
              {GENRE_LIST.filter((g) => counts[g.id]).map((g) => <option key={g.id} value={g.id}>{g.name} ({counts[g.id]})</option>)}
            </select>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="added">Son eklenen</option><option value="bpm">BPM</option><option value="key">Ton</option><option value="energy">Enerji</option><option value="title">Ad</option>
            </select>
            <button className="btn primary" disabled={list.length < 2} onClick={() => onPlan(list.map((t) => t.id))}>Bu {list.length} parçayla set kur →</button>
          </div>
        )}
        {tracks.length === 0 ? (
          <div className="empty">Henüz parça yok. Yukarıdan birkaç parça ekleyerek başla — 10–20 parça ilk set için ideal.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Parça</th><th>Tür</th><th>BPM</th><th>Ton</th><th>Enerji</th><th className="hide-sm">Intro / Outro</th><th className="hide-sm">Durum</th></tr></thead>
              <tbody>
                {list.map((t) => {
                  const v = view(t);
                  return (
                    <tr key={t.id} className="clickable" onClick={() => setDetail(t)}>
                      <td className="title-cell"><div className="ellipsis" style={{ fontWeight: 600 }}>{t.title}</div><div className="ellipsis small muted">{t.artist || t.fileName}</div></td>
                      <td><GenreChip g={t.genre} /></td>
                      <td className="num">{v.bpm ? v.bpm.toFixed(v.bpm % 1 ? 1 : 0) : '–'}</td>
                      <td><KeyBadge code={v.camelot} title={t.analysis?.key ?? t.metaKey} /></td>
                      <td><Energy v={v.energy} /></td>
                      <td className="hide-sm small num">{t.analysis ? `${t.analysis.introBars} / ${t.analysis.outroBars} bar` : '–'}</td>
                      <td className="hide-sm small" style={{ color: t.status === 'error' ? 'var(--bad)' : t.status === 'done' ? 'var(--good)' : 'var(--muted)' }}>{STATUS[t.status]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (() => {
        const t = tracks.find((x) => x.id === detail.id) ?? detail;
        const a = t.analysis, v = view(t);
        return (
          <Modal onClose={() => setDetail(null)}>
            <h2 style={{ margin: '0 0 2px' }}>{t.title}</h2>
            <div className="muted" style={{ marginBottom: 12 }}>{t.artist} · {fmt(t.durationSec)} · {t.fileName}</div>
            <div className="grid3" style={{ marginBottom: 12 }}>
              <div className="card" style={{ margin: 0 }}><div className="muted small">BPM</div><div className="bignum">{v.bpm ?? '–'}</div>{a && !t.metaBpm && <div className="small muted">Güven: %{Math.round(a.bpmConfidence * 100)}</div>}{t.metaBpm && <div className="small muted">rekordbox/etiket verisi</div>}</div>
              <div className="card" style={{ margin: 0 }}><div className="muted small">Ton</div><div className="bignum"><KeyBadge code={v.camelot} /></div><div className="small muted">{a?.key ?? t.metaKey}{a && !t.metaKey ? ` · güven %${Math.round(a.keyConfidence * 100)}` : ''}</div></div>
              <div className="card" style={{ margin: 0 }}><div className="muted small">Enerji</div><div className="bignum">{v.energy}<span className="muted small">/10</span></div><Energy v={v.energy} /></div>
            </div>
            {a && (
              <>
                <h3>Parça haritası</h3>
                <TrackMap t={t} marks={[{ sec: a.mixInSec, label: 'Giriş', color: '#2ec4b6' }, { sec: a.mixOutSec, label: 'Çıkış', color: '#ff5c8a' }]} />
                <p className="small muted">Mor çubuklar barların enerjisini, pembe çubuklar vokal olasılığı yüksek barları gösterir (vokal tespiti tahminidir). Yeşil bölgeler intro/outro, sarı bölgeler breakdown’dur.</p>
                <div className="grid2">
                  <div className="info">
                    <b>Gelen parça olarak:</b> {a.introBars >= 8 ? `${a.introBars} barlık intro var → blend için uygun. ${fmt(a.mixInSec)}’den başlat.` : 'Intro kısa → kesme / eko veya nakarattan giriş daha uygun.'}
                    {a.vocalIntro > 0.6 && ' Intro’da vokal olabilir.'}
                  </div>
                  <div className="info">
                    <b>Giden parça olarak:</b> {a.outroBars >= 8 ? `${a.outroBars} barlık outro ${fmt(a.mixOutSec)}’de başlıyor.` : `Outro yok; ${fmt(a.mixOutSec)} civarında loop ile uzat veya eko ile çık.`}
                    {a.vocalOutro > 0.6 && ' Son bölümde vokal var gibi.'}
                  </div>
                </div>
                <p className="small muted">Ritim: {a.fourOnFloor > 0.55 ? 'düz 4/4 kick (house tarzı)' : 'kırık ritim (hip-hop/pop tarzı)'} · Otomatik tür tahmini: {GENRES[a.genreGuess].name}</p>
              </>
            )}
            {t.status === 'error' && <div className="warn">{t.error}</div>}
            {t.status === 'meta-only' && <div className="info">Bu parça yalnızca rekordbox verisinden geldi. Ses dosyasını da eklersen intro/outro, enerji ve vokal analizi yapılır.</div>}
            <div className="row" style={{ marginTop: 14 }}>
              <label className="small muted">Tür:</label>
              <select className="input" value={t.genre} onChange={(e) => onGenre(t.id, e.target.value as GenreId)}>
                {GENRE_LIST.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <span className="small muted">{t.genreSource === 'auto' ? 'otomatik belirlendi' : t.genreTag ? `etiket: ${t.genreTag}` : 'elle seçildi'}</span>
              <div className="grow" />
              <button className="btn small ghost" onClick={() => { onRemove(t.id); setDetail(null); }}>Kütüphaneden çıkar</button>
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
