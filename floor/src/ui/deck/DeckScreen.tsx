import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { act, analyseTrack, keyRelation, liveBpm, loadStemsFor, rateOf, refreshTracks, replaceTrack, trackOf, useControl, wireMidi, type DeckUi } from '../../audio/control';
import { ACCEPT, addTrack, deleteStems, deleteTrack, fmtBytes, getBlob, isAudioFile, requestPersist, saveStems, storageInfo, type TrackMeta } from '../../audio/library';
import { ACTIONS, midi, type ActionDef, type DeckId, type MidiMsg } from '../../audio/midi';
import { getMixer, hasMixer, STEMS, type LiveLevels, type StemName } from '../../audio/mixer';
import { compatibleKeys } from '../../audio/analysis';
import { DEFAULT_HELPER, health, helperUrl, separate, setHelperUrl, type Health, type Job } from '../../audio/stemsClient';
import { FloorView, type Splits } from '../floor/FloorView';
import { Knob } from './Knob';
import { Waveform } from './Waveform';
import { loadTrack } from '../../audio/control';

const STEM_TR: Record<StemName, string> = { vocals: 'Vokal', drums: 'Davul', bass: 'Bas', other: 'Diğer' };

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

function useMidiState() {
  const [, force] = useState(0);
  useEffect(() => midi.onChange(() => force((n) => n + 1)), []);
  return midi;
}

/** Re-render ~10×/s while something plays (time readouts, meters). */
function useTicker(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setN((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [active]);
}

export function DeckScreen() {
  const c = useControl();
  const anyPlaying = c.decks.A.playing || c.decks.B.playing;
  useTicker(anyPlaying);

  useEffect(() => {
    wireMidi();
    void refreshTracks();
  }, []);

  return (
    <div className="screen deck-screen">
      <header className="screen-head deck-head">
        <div>
          <p className="eyebrow mono" lang="en">
            05 — Deck · Live audio
          </p>
          <h1 className="display h1">Kendi parçaların, gerçek ses.</h1>
          <p className="muted">
            MP3 / WAV dosyaların yalnızca bu tarayıcıda saklanır ve çalınır. Analiz (BPM, ton, seviye) cihazında yapılır; tahmindir. Tempo hızlandırınca perde de değişir
            (key lock yok).
          </p>
        </div>
      </header>

      <section className="console" aria-label="Deck’ler ve mikser">
        <DeckPanel id="A" ui={c.decks.A} />
        <MixerColumn />
        <DeckPanel id="B" ui={c.decks.B} />
      </section>

      <div className="deck-lower">
        <Library />
        <aside className="deck-aside">
          <LiveFloor />
          <StemHelperPanel />
          <MidiPanel />
        </aside>
      </div>
    </div>
  );
}

// ---------------- deck ----------------
function DeckPanel({ id, ui }: { id: DeckId; ui: DeckUi }) {
  const meta = trackOf(ui.trackId);
  const a = meta?.analysis;
  const deck = hasMixer() ? getMixer().decks[id] : null;
  const pos = useCallback(() => (deck ? deck.position() : 0), [deck]);
  const duration = deck?.duration ?? a?.duration ?? 0;
  const [msg, setMsg] = useState<string | null>(null);
  const bpm = liveBpm(id);
  const other: DeckId = id === 'A' ? 'B' : 'A';
  const rel = keyRelation(id, other);
  const pct = ui.tempo * ui.range;

  return (
    <section className={`deck deck-${id}${ui.playing ? ' is-playing' : ''}`} aria-label={`Deck ${id}`}>
      <header className="deck-top">
        <span className="deck-letter display">{id}</span>
        <div className="deck-title">
          <p className="deck-name">{meta ? meta.name : ui.loading ? 'Yükleniyor…' : 'Boş deck'}</p>
          <p className="mono tiny deck-meta">
            {a ? (
              <>
                <span title="Analiz edilen BPM × tempo">{bpm ? bpm.toFixed(1) : '—'} BPM</span>
                {' · '}
                <span title={`Uyumlu: ${a.camelot ? compatibleKeys(a.camelot).join(' ') : ''}`}>
                  {a.camelot ?? '—'} {a.key ? `(${a.key})` : ''}
                </span>
                {rel && (
                  <span className={`keyrel keyrel-${rel}`}>
                    {' · '}
                    {rel === 'same' ? 'aynı ton' : rel === 'compatible' ? `${other} ile uyumlu` : `${other} ile çatışabilir`}
                  </span>
                )}
              </>
            ) : meta?.analysisError ? (
              <span className="danger">Analiz edilemedi</span>
            ) : meta ? (
              'analiz ediliyor…'
            ) : (
              'Kütüphaneden bir parça yükle'
            )}
          </p>
        </div>
        <span className="mono deck-time">
          {fmtTime(pos())}
          <span className="muted"> / −{fmtTime(duration - pos())}</span>
        </span>
      </header>
      {ui.error && <p className="notice notice-err">{ui.error}</p>}
      <Waveform analysis={a} duration={duration} position={pos} cue={deck?.cuePoint ?? 0} onSeek={(t) => act.seek(id, t)} label={`Deck ${id} konum`} />

      <div className="deck-controls">
        <div className="transport-pads">
          <button type="button" className="tpad tpad-cue" disabled={!ui.trackId} onClick={() => act.cue(id)}>
            CUE
          </button>
          <button type="button" className={`tpad tpad-play${ui.playing ? ' is-on' : ''}`} disabled={!ui.trackId} onClick={() => act.toggle(id)} aria-pressed={ui.playing}>
            {ui.playing ? '❚❚' : '▶'}
            <span className="sr-only">{ui.playing ? 'Duraklat' : 'Çal'}</span>
          </button>
          <button
            type="button"
            className="tpad"
            disabled={!ui.trackId}
            onClick={() => setMsg(act.sync(id))}
            title="Tempoyu diğer deck’in BPM’ine eşitler. Faz (vuruş hizası) senin kulağına kalır."
          >
            SYNC
          </button>
          <span className="jog" aria-hidden="true" />
          <div className="nudge" role="group" aria-label="Pitch bend">
            <button type="button" className="step" disabled={!ui.playing} onClick={() => act.jog(id, -4)} aria-label="Yavaşlat (bend)">
              ‹
            </button>
            <button type="button" className="step" disabled={!ui.playing} onClick={() => act.jog(id, 4)} aria-label="Hızlandır (bend)">
              ›
            </button>
          </div>
        </div>

        <div className="tempo">
          <label className="tempo-label" htmlFor={`tempo-${id}`}>
            Tempo <span className="mono">{pct >= 0 ? '+' : ''}{pct.toFixed(2)}%</span>
          </label>
          <input
            id={`tempo-${id}`}
            type="range"
            min={-1}
            max={1}
            step={0.0025}
            value={ui.tempo}
            onChange={(e) => act.tempo(id, Number(e.target.value))}
            onDoubleClick={() => act.tempo(id, 0)}
            style={{ ['--pct' as string]: `${((ui.tempo + 1) / 2) * 100}%` }}
          />
          <div className="range-pick" role="group" aria-label="Tempo aralığı">
            {([6, 8, 16] as const).map((r) => (
              <button key={r} type="button" className={ui.range === r ? 'is-on' : ''} aria-pressed={ui.range === r} onClick={() => act.range(id, r)}>
                ±{r}
              </button>
            ))}
            <button type="button" onClick={() => act.tempo(id, 0)}>
              0
            </button>
          </div>
          <span className="mono tiny muted">oran ×{rateOf(ui).toFixed(4)}</span>
        </div>
      </div>
      {msg && (
        <p className="notice notice-warn tiny" role="status">
          {msg}{' '}
          <button type="button" className="btn-text" onClick={() => setMsg(null)}>
            Tamam
          </button>
        </p>
      )}

      <div className="stems-row">
        {meta?.stems ? (
          <>
            <label className="stem-mode">
              <input type="checkbox" checked={ui.stemMode} onChange={(e) => act.stemMode(id, e.target.checked)} /> Stem modu
              {meta.stems.fake && <span className="tag tag-miss">test stem’i</span>}
            </label>
            <div className="stem-pads" role="group" aria-label="Stem’ler">
              {STEMS.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={`spad${ui.stemOn[s] ? ' is-on' : ''}`}
                  disabled={!ui.stemMode}
                  aria-pressed={ui.stemOn[s]}
                  onClick={() => act.stem(id, s)}
                >
                  <span className="mono tiny">{i + 1}</span> {STEM_TR[s]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="tiny muted">{meta ? 'Stem yok. Kütüphaneden “Stem’lere ayır” ile oluştur.' : ''}</p>
        )}
      </div>
    </section>
  );
}

// ---------------- mixer ----------------
function Meter({ lv }: { lv: LiveLevels }) {
  const v = Math.max(0, Math.min(1, (lv.rmsDb + 48) / 48));
  return (
    <span className="vu" aria-hidden="true">
      <span className="vu-fill" style={{ transform: `scaleY(${v})` }} />
      {lv.peak > 0.98 && <span className="vu-clip" />}
    </span>
  );
}

function MixerColumn() {
  const c = useControl();
  const lv = (d: DeckId) => (hasMixer() ? getMixer().decks[d].levels() : null);
  const strip = (d: DeckId) => {
    const ui = c.decks[d];
    const l = lv(d);
    return (
      <div className="strip" aria-label={`Kanal ${d}`} role="group">
        <span className="strip-name mono">{d}</span>
        <Knob label="Trim" value={ui.trim} onChange={(v) => act.trim(d, v)} size={44} format={(v) => `${((v - 0.5) * 24).toFixed(1)} dB`} />
        <Knob label="Hi" value={ui.eq.high} onChange={(v) => act.eq(d, 'high', v)} format={eqText} />
        <Knob label="Mid" value={ui.eq.mid} onChange={(v) => act.eq(d, 'mid', v)} format={eqText} />
        <Knob label="Low" value={ui.eq.low} onChange={(v) => act.eq(d, 'low', v)} format={eqText} />
        <Knob label="Filter" value={ui.filter} onChange={(v) => act.filter(d, v)} format={filterText} />
        <div className="chfader">
          {l && <Meter lv={l} />}
          <input
            type="range"
            className="vertical"
            min={0}
            max={1}
            step={0.005}
            value={ui.volume}
            aria-label={`Kanal ${d} ses`}
            onChange={(e) => act.volume(d, Number(e.target.value))}
            style={{ ['--pct' as string]: `${ui.volume * 100}%` }}
          />
        </div>
      </div>
    );
  };
  return (
    <section className="mixer" aria-label="Mikser">
      <div className="strips">
        {strip('A')}
        {strip('B')}
      </div>
      <div className="xfader">
        <label htmlFor="xf" className="mono tiny">
          A ◂ crossfader ▸ B
        </label>
        <input
          id="xf"
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={c.crossfader}
          onChange={(e) => act.crossfader(Number(e.target.value))}
          onDoubleClick={() => act.crossfader(0.5)}
          style={{ ['--pct' as string]: `${c.crossfader * 100}%` }}
        />
      </div>
      <Knob label="Master" value={c.master} onChange={(v) => act.master(v)} center={false} size={46} />
    </section>
  );
}

const eqText = (v: number) => {
  const db = v < 0.5 ? -26 * (1 - v / 0.5) : 6 * ((v - 0.5) / 0.5);
  return v < 0.01 ? 'kill' : `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
};
const filterText = (v: number) => (v < 0.45 ? 'low-pass' : v > 0.55 ? 'high-pass' : 'kapalı');

// ---------------- library ----------------
function Library() {
  const c = useControl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof storageInfo>>>(null);
  const [q, setQ] = useState('');
  const [stemJobs, setStemJobs] = useState<Record<string, { job?: Job; error?: string; abort: AbortController }>>({});

  const refreshInfo = () => void storageInfo().then(setInfo);
  useEffect(refreshInfo, [c.tracks.length]);

  const addFiles = async (files: FileList | File[]) => {
    setErr(null);
    const list = [...files];
    const bad = list.filter((f) => !isAudioFile(f));
    const ok = list.filter(isAudioFile);
    if (bad.length) setErr(`${bad.length} dosya ses dosyası değil ve atlandı.`);
    if (ok.length) void requestPersist();
    for (const f of ok) {
      setBusy(`${f.name} ekleniyor…`);
      try {
        const meta = await addTrack(f);
        await refreshTracks();
        setBusy(`${f.name} analiz ediliyor…`);
        await analyseTrack(meta);
      } catch (e) {
        setErr(`${f.name} kaydedilemedi: ${e instanceof Error ? e.message : 'depolama hatası'}`);
      }
    }
    setBusy(null);
    refreshInfo();
  };

  const runStems = async (t: TrackMeta) => {
    const abort = new AbortController();
    setStemJobs((s) => ({ ...s, [t.id]: { abort } }));
    try {
      const blob = await getBlob(t.id);
      if (!blob) throw new Error('Dosya bulunamadı');
      const r = await separate(blob, t.name + '.' + (blob.type.includes('wav') ? 'wav' : 'mp3'), (job) => setStemJobs((s) => ({ ...s, [t.id]: { job, abort } })), abort.signal);
      const next = await saveStems(t, r.blobs, r.model, r.fake);
      replaceTrack(next);
      setStemJobs((s) => {
        const { [t.id]: _, ...rest } = s;
        return rest;
      });
      for (const d of ['A', 'B'] as DeckId[]) if (c.decks[d].trackId === t.id) await loadStemsFor(d, t.id);
      refreshInfo();
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      setStemJobs((s) => ({
        ...s,
        [t.id]: {
          abort,
          error: aborted ? 'İptal edildi.' : e instanceof TypeError ? 'Stem yardımcısına ulaşılamadı. Bilgisayarında çalışıyor mu? (aşağıdaki panel)' : e instanceof Error ? e.message : 'Hata',
        },
      }));
    }
  };

  const shown = useMemo(() => {
    const k = q.trim().toLocaleLowerCase('tr-TR');
    return k ? c.tracks.filter((t) => t.name.toLocaleLowerCase('tr-TR').includes(k) || t.analysis?.camelot?.toLowerCase() === k.toLowerCase()) : c.tracks;
  }, [c.tracks, q]);

  return (
    <section className="library" aria-labelledby="lib-title">
      <header className="section-head">
        <h2 id="lib-title" className="h2">
          Kütüphane
        </h2>
        <span className="mono tiny muted">
          {c.tracks.length} parça{info ? ` · ${fmtBytes(info.used)} / ${fmtBytes(info.quota)}${info.persisted ? ' · kalıcı' : ''}` : ''}
        </span>
      </header>
      <div
        className={`dropzone${drag ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <p>
          MP3 / WAV / AIFF / FLAC dosyalarını buraya bırak ya da{' '}
          <button type="button" className="btn-text" onClick={() => inputRef.current?.click()}>
            dosya seç
          </button>
          .
        </p>
        <p className="tiny muted">Dosyalar sunucuya gönderilmez; tarayıcının yerel deposunda (IndexedDB) kalır.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {busy && (
        <p className="notice" role="status">
          {busy}
        </p>
      )}
      {err && (
        <p className="notice notice-err" role="alert">
          {err}
        </p>
      )}
      {c.tracks.length > 4 && (
        <input type="text" className="lib-search" placeholder="Ara: isim ya da Camelot (8A)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Kütüphanede ara" />
      )}
      <ul className="tracklist">
        {shown.map((t) => {
          const a = t.analysis;
          const sj = stemJobs[t.id];
          const loadedOn = (['A', 'B'] as DeckId[]).filter((d) => c.decks[d].trackId === t.id);
          return (
            <li key={t.id} className="track">
              <div className="track-main">
                <p className="track-name">{t.name}</p>
                <p className="mono tiny track-meta">
                  {a ? (
                    <>
                      <span>{a.bpm ? `${a.bpm.toFixed(1)} BPM` : 'BPM ?'}</span>
                      {a.bpmConfidence < 0.25 && a.bpm && <span className="muted"> (düşük güven)</span>}
                      <span> · {a.camelot ?? '—'}</span>
                      <span> · {fmtTime(a.duration)}</span>
                      <span className={a.peakDb > -0.3 ? 'warn' : ''}> · peak {a.peakDb.toFixed(1)} dBFS</span>
                      <span> · RMS {a.rmsDb.toFixed(1)} dB</span>
                      {a.clippedSamples > 100 && <span className="warn"> · clip {a.clippedSamples}</span>}
                    </>
                  ) : t.analysisError ? (
                    <span className="danger">Çözülemedi: {t.analysisError}</span>
                  ) : (
                    'analiz bekleniyor…'
                  )}
                  <span className="muted"> · {fmtBytes(t.size)}</span>
                  {t.stems && <span className="tag">{t.stems.fake ? 'test stem' : `stem · ${t.stems.model}`}</span>}
                </p>
                {a && <EnergyStrip energy={a.energy} />}
                {sj && (
                  <p className={`tiny ${sj.error ? 'danger' : 'muted'}`} role="status">
                    {sj.error ??
                      (sj.job ? `Stem: ${sj.job.status === 'queued' ? 'sırada' : `%${sj.job.progress}`}` : 'Yardımcıya gönderiliyor…')}{' '}
                    {!sj.error && (
                      <button type="button" className="btn-text" onClick={() => sj.abort.abort()}>
                        İptal
                      </button>
                    )}
                  </p>
                )}
              </div>
              <div className="track-actions">
                {(['A', 'B'] as DeckId[]).map((d) => (
                  <button key={d} type="button" className={`btn ${loadedOn.includes(d) ? 'btn-ghost' : ''}`} onClick={() => void loadTrack(d, t.id)} disabled={c.decks[d].loading}>
                    {loadedOn.includes(d) ? `${d}’de` : `→ ${d}`}
                  </button>
                ))}
                {t.stems ? (
                  <button
                    type="button"
                    className="btn-text"
                    onClick={async () => {
                      replaceTrack(await deleteStems(t));
                      refreshInfo();
                    }}
                  >
                    Stem’leri sil
                  </button>
                ) : (
                  <button type="button" className="btn-text" disabled={!!sj && !sj.error} onClick={() => void runStems(t)}>
                    Stem’lere ayır
                  </button>
                )}
                <button
                  type="button"
                  className="btn-text danger"
                  disabled={loadedOn.length > 0}
                  title={loadedOn.length ? 'Önce deck’ten çıkar (başka parça yükle)' : undefined}
                  onClick={async () => {
                    if (!window.confirm(`“${t.name}” bu tarayıcıdan silinsin mi?`)) return;
                    await deleteTrack(t.id);
                    await refreshTracks();
                    refreshInfo();
                  }}
                >
                  Sil
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {c.tracks.length === 0 && <p className="muted empty">Henüz parça yok.</p>}
    </section>
  );
}

function EnergyStrip({ energy }: { energy: number[] }) {
  const n = 120;
  const step = Math.max(1, Math.ceil(energy.length / n));
  const pts: number[] = [];
  for (let i = 0; i < energy.length; i += step) pts.push(Math.max(...energy.slice(i, i + step)));
  return (
    <svg className="energy-strip" viewBox={`0 0 ${pts.length} 20`} preserveAspectRatio="none" role="img" aria-label={`Enerji eğrisi, en yüksek ${Math.max(...energy)}`}>
      <polyline points={pts.map((v, i) => `${i},${20 - (v / 100) * 18}`).join(' ')} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ---------------- live floor ----------------
function LiveFloor() {
  const c = useControl();
  const playing = c.decks.A.playing || c.decks.B.playing;
  const smooth = useRef({ e: 0, low: 0, mid: 0, high: 0 });
  const lv = hasMixer() ? getMixer().levels() : null;
  if (lv) {
    const s = smooth.current;
    const k = 0.15;
    s.e += k * (lv.energy - s.e);
    s.low += k * (lv.low - s.low);
    s.mid += k * (lv.mid - s.mid);
    s.high += k * (lv.high - s.high);
  }
  const s = smooth.current;
  const share = (bias: number) => Math.max(0.02, Math.min(0.95, (s.e - 22) / 60 + bias));
  const split = (f: number) => ({ floor: f, bar: (1 - f) * 0.6, lounge: (1 - f) * 0.4 });
  const splits: Splits = {
    groove: split(share((s.low - 0.5) * 0.4)),
    hits: split(share((s.mid - 0.5) * 0.4)),
    explorers: split(share((s.high - 0.4) * 0.4)),
  };
  return (
    <section className="livefloor" aria-labelledby="lf-title">
      <h2 id="lf-title" className="eyebrow mono">
        Canlı pist · ses enerjisi {Math.round(s.e)}
      </h2>
      <div className="floorpanel-stage">
        <FloorView
          venue="house"
          people={30}
          shares={{ groove: 35, hits: 35, explorers: 30 }}
          splits={splits}
          intensity={s.e}
          seed={7}
          live={playing}
          label={`Canlı ses görselleştirmesi. Ses enerjisi ${Math.round(s.e)}.`}
          showCounts={false}
        />
      </div>
      <p className="tiny muted">
        Bu görünüm yalnızca çalan sesin ölçülen enerjisini (seviye, bas, tiz) gösterir. Gerçek bir kalabalık tepkisi ya da simülasyon sonucu değildir.
      </p>
    </section>
  );
}

// ---------------- stem helper ----------------
function StemHelperPanel() {
  const [url, setUrl] = useState(helperUrl());
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const check = async (u = url) => {
    setChecking(true);
    setErr(null);
    try {
      setH(await health(u));
    } catch {
      setH(null);
      setErr('Bağlanılamadı.');
    }
    setChecking(false);
  };
  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="helper" aria-labelledby="hp-title">
      <h2 id="hp-title" className="eyebrow mono">
        Stem yardımcısı (Demucs, yerel)
      </h2>
      <p className={`helper-status ${h ? (h.fake ? 'is-warn' : 'is-ok') : 'is-off'}`} role="status">
        {checking ? 'Kontrol ediliyor…' : h ? (h.fake ? `Bağlı · TEST MODU (gerçek ayırma değil)` : `Bağlı · ${h.model} · ${h.device}`) : err ?? '—'}
      </p>
      <div className="helper-row">
        <input
          type="text"
          value={url}
          aria-label="Yardımcı adresi"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setHelperUrl(url || DEFAULT_HELPER)}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setHelperUrl(url || DEFAULT_HELPER);
            void check(url || DEFAULT_HELPER);
          }}
        >
          Kontrol et
        </button>
      </div>
      {!h && (
        <details className="helper-howto" open={!!err}>
          <summary className="btn-text">Bilgisayarında bir kez kur</summary>
          <ol className="tiny">
            <li>
              Python 3.10+ ve ffmpeg kur (macOS: <code>brew install python ffmpeg</code>).
            </li>
            <li>
              <code>pip install demucs</code>
            </li>
            <li>
              Depodaki <code>floor/stems-helper</code> klasöründe: <code>python server.py</code>
            </li>
            <li>
              Site GitHub Pages’teyse: <code>python server.py --allow-origin https://KULLANICI.github.io</code>
            </li>
          </ol>
          <p className="tiny muted">
            Bir parça CPU’da birkaç dakika sürer; Apple Silicon’da <code>--device mps</code> daha hızlıdır. Dosyalar yalnızca 127.0.0.1’deki yardımcıya gider, iş bitince silinir.
          </p>
        </details>
      )}
    </section>
  );
}

// ---------------- MIDI ----------------
function MidiPanel() {
  const m = useMidiState();
  const c = useControl();
  const [last, setLast] = useState<string | null>(null);
  useEffect(
    () =>
      m.onRaw((msg: MidiMsg) =>
        setLast(`${msg.type === 'note' ? 'Note' : 'CC'} ch${msg.channel + 1} #${msg.number} = ${msg.value}`),
      ),
    [m],
  );
  const groups = ['Deck A', 'Deck B', 'Mixer', 'Rehearsal'] as const;
  const bound = (a: ActionDef) => m.bindings.find((b) => b.action === a.id);
  return (
    <section className="midi" aria-labelledby="midi-title">
      <h2 id="midi-title" className="eyebrow mono">
        DDJ-FLX2 · MIDI
      </h2>
      {m.status === 'unsupported' ? (
        <p className="notice">
          Bu tarayıcı Web MIDI desteklemiyor (iPad/Safari). FLX2’yi bilgisayarda Chrome ya da Edge ile bağla. Burada deck’leri ekrandan kullanabilirsin.
        </p>
      ) : m.status !== 'ready' ? (
        <>
          <button type="button" className="btn btn-primary" onClick={() => void m.connect()} disabled={m.status === 'requesting'}>
            {m.status === 'requesting' ? 'İzin bekleniyor…' : 'FLX2’yi bağla'}
          </button>
          {m.status === 'denied' && <p className="notice notice-err">MIDI izni verilmedi. Tarayıcının site ayarlarından MIDI’ye izin ver.</p>}
          <p className="tiny muted">
            FLX2’yi USB ile bağla. Windows’ta Rekordbox açıkken cihazı başka uygulama kullanamayabilir; macOS’ta ikisi birlikte çalışabilir.
          </p>
        </>
      ) : (
        <>
          <p className="tiny" role="status">
            {m.devices.length ? `Bağlı: ${m.devices.join(', ')}` : 'MIDI cihazı görünmüyor. USB kablosunu kontrol et.'}
            {last && <span className="mono muted"> · son: {last}</span>}
          </p>
          <p className="tiny muted">
            Hazır FLX2 eşlemesi yok (Pioneer’ın MIDI listesini doğrulayamadım). “Öğret”e bas, sonra kontrolcüde o düğmeyi/fader’ı oynat. Eşleme bu tarayıcıda saklanır.
          </p>
          <label className="tiny">
            <input type="checkbox" checked={c.invertTempo} onChange={(e) => act.invertTempo(e.target.checked)} /> Tempo fader yönünü ters çevir
          </label>
          {groups.map((g) => (
            <details key={g} className="midi-group" open={g === 'Deck A'}>
              <summary>
                {g}{' '}
                <span className="mono tiny muted">
                  {ACTIONS.filter((a) => a.group === g && bound(a)).length}/{ACTIONS.filter((a) => a.group === g).length}
                </span>
              </summary>
              <ul className="midi-list">
                {ACTIONS.filter((a) => a.group === g).map((a) => {
                  const b = bound(a);
                  const learning = m.learning?.id === a.id;
                  return (
                    <li key={a.id} className={learning ? 'is-learning' : ''}>
                      <span>{a.label}</span>
                      <span className="mono tiny muted">{learning ? 'kontrolü oynat…' : b ? `${b.type === 'note' ? 'N' : 'CC'} ${b.channel + 1}/${b.number}` : '—'}</span>
                      <button type="button" className="btn-text" onClick={() => m.learn(learning ? null : a)}>
                        {learning ? 'Vazgeç' : 'Öğret'}
                      </button>
                      {b && (
                        <button type="button" className="btn-text danger" onClick={() => m.unbind(a.id)} aria-label={`${a.label} eşlemesini kaldır`}>
                          ×
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </>
      )}
    </section>
  );
}
