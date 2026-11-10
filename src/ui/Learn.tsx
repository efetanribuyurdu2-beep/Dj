import { useState } from 'react';
import { PRINCIPLES, ROADMAP } from '../knowledge/playbook';
import { TECHNIQUES } from '../knowledge/techniques';
import { GENRE_LIST } from '../knowledge/genres';
import { ALL_CAMELOT, fromCamelot, keyRelation } from '../engine/camelot';
import { camelotColor } from './common';


const FLX2 = [
  ['TEMPO slider', 'Parçanın hızını (BPM) değiştirir. Yanındaki değer rekordbox ekranında görünür.'],
  ['SYNC', 'Gelen parçanın BPM’ini ve grid’ini çalan parçaya otomatik eşitler. Başlangıçta kullan, zamanla kulakla eşlemeyi de dene.'],
  ['CUE / PLAY', 'CUE: cue noktasına döner / dinleme noktasını ayarlar. PLAY: çal/durdur.'],
  ['Kulaklık CUE butonu', 'O kanalı kulaklıkta dinlersin – gelen parçayı kalabalık duymadan hazırlarsın.'],
  ['EQ (HI / MID / LOW)', 'Tiz, orta ve bas frekansları. Bas değişiminin (bass swap) kalbi LOW düğmesidir.'],
  ['CFX düğmesi', 'Smart CFX kapalıyken filtre: bir yöne tizleri, diğer yöne basları keser. Smart CFX açıkken seçili efekt miktarı da artar.'],
  ['Smart CFX', 'Tek düğmeyle filtre + efekt kombinasyonu. Build-up ve dramatik çıkışlar için.'],
  ['Smart Fader', 'Fader/crossfader hareketine göre BPM, bas ve ses seviyesini otomatik ayarlar. Öğrenirken güvenlik ağı.'],
  ['Kanal fader’ları / Crossfader', 'Fader: kanalın ses seviyesi. Crossfader: iki deck arasında hızlı geçiş (kesmeler için).'],
  ['Performans pad’leri', 'Hot Cue (parçanın belli noktalarına anında atlama), Pad FX (eko vb. efektler), loop ve sampler modları.'],
];

export function Learn() {
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState('8A');
  return (
    <>
      <div className="card">
        <h2>Bu bilgiler nereden geliyor?</h2>
        <p className="small" style={{ margin: 0 }}>
          Uygulamanın geçiş önerileri, kulüp ve open-format DJ’lerin (transition videolarındaki DJ’ler dahil) setlerinde tekrar tekrar görülen genel kurallardan oluşan bir kural motoruna dayanır:
          fraz zamanlaması, BPM blokları, harmonik (Camelot) uyum, vokal çakışmasından kaçınma ve enerji yönetimi.
          Belirli bir DJ’in setini kopyalamaz; senin parçalarını analiz edip bu kuralları <b>senin</b> setine uygular.
        </p>
      </div>

      <div className="card">
        <h2>Öğrenme yolu (sıfırdan)</h2>
        <div className="grid3">
          {ROADMAP.map((r) => (
            <div key={r.week} className="card" style={{ margin: 0, background: 'var(--panel2)' }}>
              <div className="small muted">{r.week}</div>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{r.focus}</div>
              <ul className="reasons small">{r.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Altın kurallar</h2>
        <div className="grid2">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <span className="chip">{p.tag}</span> <b>{p.title}</b>
              <p className="small muted" style={{ marginTop: 4 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Geçiş teknikleri</h2>
        {TECHNIQUES.map((t) => (
          <div key={t.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
            <button className="transition-btn" onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span style={{ width: 44 }} className="small muted">{'●'.repeat(t.difficulty)}{'○'.repeat(3 - t.difficulty)}</span>
              <div className="grow"><b>{t.name}</b><div className="small muted">{t.short}</div></div>
              <span>{open === t.id ? '−' : '+'}</span>
            </button>
            {open === t.id && (
              <div style={{ padding: '6px 8px 4px' }}>
                <p className="small"><b>Ne zaman:</b> {t.bestFor}</p>
                {t.needs && <p className="small"><b>Ön koşul:</b> {t.needs}</p>}
                <ol className="steps">
                  {t.steps.map((s, i) => (
                    <li key={i}><span className="clock">{s.atBeat === 0 ? '“1”' : s.atBeat > 0 ? `+${s.atBeat}` : s.atBeat}</span><span className={'deck ' + s.deck.replace('+', '')}>{s.deck}</span><span className="txt small">{s.text}</span></li>
                  ))}
                </ol>
                <p className="small muted">Soldaki sayı: geçiş başlangıcına göre vuruş. Set planlayıcıda bu sayılar senin parçanın gerçek saatlerine çevrilir.</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Camelot çarkı</h2>
          <p className="small muted" style={{ marginTop: 0 }}>Bir ton seç: uyumlu tonlar parlak, çakışanlar soluk görünür.</p>
          <CamelotWheel sel={sel} onSel={setSel} />
        </div>
        <div className="card">
          <h2>Türler ve tempo blokları</h2>
          <TempoChart />
          {GENRE_LIST.filter((g) => g.id !== 'other').map((g) => (
            <p key={g.id} className="small" style={{ margin: '6px 0' }}><span className="dot" style={{ background: g.color }} /> <b>{g.name}</b> ({g.bpm[0]}–{g.bpm[1]} BPM): <span className="muted">{g.notes}</span></p>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>DDJ-FLX2 hızlı rehber</h2>
        <div className="grid2">
          {FLX2.map(([k, v]) => <div key={k}><b>{k}</b><div className="small muted">{v}</div></div>)}
        </div>
        <p className="small muted">Not: Buton yerleri ve bazı özellikler rekordbox sürümüne göre değişebilir; emin olmadığın bir şeyde rekordbox ekranındaki karşılığını kullanabilirsin.</p>
      </div>
    </>
  );
}

function CamelotWheel({ sel, onSel }: { sel: string; onSel: (c: string) => void }) {
  const S = 320, c = S / 2;
  const seg = (n: number, outer: boolean) => {
    const a0 = ((n - 1) * 30 - 105) * (Math.PI / 180), a1 = a0 + (30 * Math.PI) / 180;
    const r0 = outer ? 105 : 55, r1 = outer ? 155 : 103;
    const p = (r: number, a: number) => `${c + r * Math.cos(a)},${c + r * Math.sin(a)}`;
    return `M${p(r0, a0)} L${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width="100%" style={{ maxWidth: 360, display: 'block', margin: '0 auto' }}>
      {ALL_CAMELOT.map((code) => {
        const n = parseInt(code), outer = code.endsWith('B');
        const rel = keyRelation(sel, code);
        const good = rel.kind === 'perfect' || rel.kind === 'good';
        const boost = rel.kind === 'boost';
        const a = ((n - 1) * 30 - 90) * (Math.PI / 180);
        const r = outer ? 130 : 79;
        const k = fromCamelot(code)!;
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return (
          <g key={code} onClick={() => onSel(code)} style={{ cursor: 'pointer' }}>
            <path d={seg(n, outer)} fill={camelotColor(code)} opacity={code === sel ? 1 : good ? 0.85 : boost ? 0.5 : 0.14} stroke="#0e0f14" strokeWidth={2} />
            <text x={c + r * Math.cos(a)} y={c + r * Math.sin(a) - 2} textAnchor="middle" style={{ fill: '#0e0f14', fontWeight: 800, fontSize: 13 }}>{code}</text>
            <text x={c + r * Math.cos(a)} y={c + r * Math.sin(a) + 11} textAnchor="middle" style={{ fill: '#0e0f14', fontSize: 9 }}>{names[k.pc]}{k.minor ? 'm' : ''}</text>
          </g>
        );
      })}
      <text x={c} y={c - 4} textAnchor="middle" style={{ fill: '#eceef5', fontWeight: 900, fontSize: 22 }}>{sel}</text>
      <text x={c} y={c + 14} textAnchor="middle">iç: minör · dış: majör</text>
    </svg>
  );
}

function TempoChart() {
  const W = 520, H = 22 * 8 + 24, x = (b: number) => 90 + ((b - 60) / 90) * (W - 100);
  const gs = GENRE_LIST.filter((g) => g.id !== 'other');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {[60, 80, 100, 120, 140].map((b) => <g key={b}><line x1={x(b)} x2={x(b)} y1={0} y2={H - 16} stroke="#2b2f40" /><text x={x(b) - 8} y={H - 4}>{b}</text></g>)}
      {gs.map((g, i) => (
        <g key={g.id}>
          <text x={0} y={i * 22 + 15}>{g.name}</text>
          <rect x={x(g.bpm[0])} y={i * 22 + 4} width={x(g.bpm[1]) - x(g.bpm[0])} height={14} rx={7} fill={g.color} opacity={0.85} />
        </g>
      ))}
    </svg>
  );
}
