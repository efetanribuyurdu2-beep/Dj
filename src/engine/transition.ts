// İki parça arasındaki geçişi değerlendirir ve FLX2 için zamanlı bir plan üretir.
import type { GenreId, Track } from '../types';
import { keyRelation, parseKey, toCamelot, type KeyRelation } from './camelot';
import { GENRES } from '../knowledge/genres';
import { TECH_BY_ID, type TechStep } from '../knowledge/techniques';

export interface TrackView {
  bpm: number | null;
  camelot: string | null;
  energy: number;
  introBars: number;
  outroBars: number;
  mixInSec: number;
  mixOutSec: number;
  firstBeatSec: number;
  durationSec: number;
  vocalIntro: number;
  vocalOutro: number;
  genre: GenreId;
  analyzed: boolean;
  dropSec: number | null; // ana bölüm başlangıcı
}

/** Analiz olsun ya da olmasın (sadece rekordbox verisi), parçanın kullanılabilir özellikleri. */
export function view(t: Track): TrackView {
  const a = t.analysis;
  const g = GENRES[t.genre];
  const bpm = a?.bpm ?? t.metaBpm ?? null;
  const camelot = a?.camelot ?? (t.metaKey ? (() => { const k = parseKey(t.metaKey); return k ? toCamelot(k) : null; })() : null);
  const dur = t.durationSec || 210;
  if (a) {
    const barLen = 240 / a.bpm;
    return {
      bpm, camelot, energy: a.energy, introBars: a.introBars, outroBars: a.outroBars, mixInSec: a.mixInSec, mixOutSec: a.mixOutSec,
      firstBeatSec: a.firstBeatSec, durationSec: dur, vocalIntro: a.vocalIntro, vocalOutro: a.vocalOutro, genre: t.genre, analyzed: true,
      dropSec: a.introBars > 0 ? a.firstBeatSec + a.introBars * barLen : null,
    };
  }
  // Sadece meta veri: türe göre makul varsayımlar
  const bars = g.djFriendlyIntro ? 16 : 0;
  const barLen = bpm ? 240 / bpm : 2;
  const est = bpm ? Math.max(2, Math.min(9, Math.round(1 + ((bpm - 80) / 50) * 7))) : 5;
  return {
    bpm, camelot, energy: est, introBars: bars, outroBars: bars, mixInSec: 0, mixOutSec: Math.max(0, dur - Math.max(bars, 16) * barLen),
    firstBeatSec: 0, durationSec: dur, vocalIntro: g.djFriendlyIntro ? 0.2 : 0.7, vocalOutro: g.djFriendlyIntro ? 0.2 : 0.7, genre: t.genre, analyzed: false,
    dropSec: bars ? bars * barLen : null,
  };
}

export interface BpmMatch { diffPct: number; mode: 'same' | 'double' | 'half'; bEffective: number }

export function bpmMatch(a: number | null, b: number | null): BpmMatch | null {
  if (!a || !b) return null;
  const opts: BpmMatch[] = [
    { diffPct: ((a - b) / b) * 100, mode: 'same', bEffective: b },
    { diffPct: ((a - 2 * b) / (2 * b)) * 100, mode: 'double', bEffective: 2 * b },
    { diffPct: ((a - b / 2) / (b / 2)) * 100, mode: 'half', bEffective: b / 2 },
  ];
  opts.sort((x, y) => Math.abs(x.diffPct) - Math.abs(y.diffPct));
  // yarım/iki kat ancak gerçekten belirgin şekilde daha iyiyse
  if (opts[0].mode !== 'same') {
    const same = opts.find((o) => o.mode === 'same')!;
    if (Math.abs(same.diffPct) - Math.abs(opts[0].diffPct) < 8) return same;
  }
  return opts[0];
}

const GENRE_AFFINITY: Record<string, number> = {
  'house|edm': 0.9, 'house|afro': 0.9, 'house|pop': 0.8, 'house|tr-pop': 0.7, 'pop|tr-pop': 0.9, 'pop|edm': 0.8,
  'hiphop|rnb': 0.9, 'hiphop|latin': 0.8, 'hiphop|pop': 0.7, 'hiphop|tr-pop': 0.65, 'afro|latin': 0.8, 'afro|hiphop': 0.7,
  'afro|pop': 0.75, 'rnb|pop': 0.75, 'latin|pop': 0.75, 'latin|tr-pop': 0.7, 'rnb|tr-pop': 0.7,
};

export function genreAffinity(a: GenreId, b: GenreId): number {
  if (a === b) return 1;
  return GENRE_AFFINITY[`${a}|${b}`] ?? GENRE_AFFINITY[`${b}|${a}`] ?? 0.5;
}

export interface TimedStep extends TechStep { atSec: number; clock: string }

export interface TransitionPlan {
  score: number; // 0-1
  grade: 'A' | 'B' | 'C' | 'D';
  bpm: BpmMatch | null;
  key: KeyRelation;
  energyDelta: number;
  genreSwitch: boolean;
  vocalClash: boolean;
  technique: string;
  alternatives: string[];
  reasons: string[];
  warnings: string[];
  startInA: number; // A'nın hangi saniyesinde geçiş başlıyor
  cueB: number; // B'nin nereden başlatılacağı
  cueBLabel: string;
  steps: TimedStep[];
}

export const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const OPEN_FORMAT: GenreId[] = ['pop', 'tr-pop', 'hiphop', 'latin', 'rnb'];

function scoreParts(A: TrackView, B: TrackView, bm: BpmMatch | null, key: KeyRelation, overlap: boolean) {
  const d = bm ? Math.abs(bm.diffPct) : 5;
  const bpmS = d <= 1 ? 1 : d <= 3 ? 0.92 : d <= 6 ? 0.75 : d <= 10 ? 0.5 : 0.3;
  const de = B.energy - A.energy;
  const enS = de >= 0 && de <= 2 ? 1 : de === -1 ? 0.85 : de === 3 || de === -2 ? 0.6 : 0.35;
  const gS = genreAffinity(A.genre, B.genre);
  // Üst üste binen geçişlerde ton daha kritik
  const kw = overlap ? 0.35 : 0.15;
  const bw = overlap ? 0.3 : 0.25;
  return clamp01(kw * key.score + bw * bpmS + 0.2 * enS + (1 - kw - bw - 0.2) * gS);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Sıralama algoritması için hızlı skor (zamanlama hesaplamadan). */
export function pairScore(a: Track, b: Track): number {
  return planTransition(a, b, false).score;
}

export function planTransition(a: Track, b: Track, withSteps = true, forceTech?: string): TransitionPlan {
  const A = view(a), B = view(b);
  const bm = bpmMatch(A.bpm, B.bpm);
  const key = A.camelot && B.camelot ? keyRelation(A.camelot, B.camelot) : keyRelation('', '');
  const diff = bm ? Math.abs(bm.diffPct) : 99;
  const vocalClash = A.vocalOutro > 0.6 && B.vocalIntro > 0.6;
  const genreSwitch = A.genre !== B.genre;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const alternatives: string[] = [];
  let tech: string;

  const canOverlap = diff <= 4 && !vocalClash && A.outroBars >= 8 && B.introBars >= 8;
  const clubby = (g: GenreId) => g === 'house' || g === 'afro' || g === 'edm';

  if (canOverlap && key.score >= 0.85) {
    if (clubby(A.genre) && clubby(B.genre) && key.score >= 0.9 && A.outroBars >= 16 && B.introBars >= 16 && diff <= 2) {
      tech = 'long-blend';
      reasons.push('Tonlar uyumlu, BPM neredeyse aynı ve iki parçanın da uzun DJ intro/outro’su var: uzun blend için ideal.');
      alternatives.push('bass-swap');
    } else {
      tech = 'bass-swap';
      reasons.push('BPM farkı küçük ve tonlar uyumlu; A’nın outro’su ile B’nin intro’su üst üste binebilir.');
      alternatives.push('filter');
    }
  } else if (canOverlap) {
    tech = 'filter';
    reasons.push(`BPM yakın ama tonlar tam uyumlu değil (${key.label}); filtre melodileri “saklayarak” çakışmayı azaltır.`);
    alternatives.push('echo-out', 'bass-swap');
  } else if (diff <= 6) {
    if (A.outroBars < 8 && B.introBars >= 8 && !vocalClash && key.score >= 0.5) {
      tech = 'loop-out';
      reasons.push('A’nın outro’su yok ama B’nin intro’su var: A’nın son temiz bölümünü loop’layıp B’yi üstüne getir.');
      alternatives.push('echo-out', 'quick-cut');
    } else if (OPEN_FORMAT.includes(B.genre) || OPEN_FORMAT.includes(A.genre)) {
      tech = (B.genre === 'pop' || B.genre === 'tr-pop') ? 'hook-drop' : 'quick-cut';
      reasons.push(tech === 'hook-drop'
        ? 'Pop/Türkçe pop parçaları kısa introlu: B’ye doğrudan nakaratından girmek enerjiyi korur.'
        : 'Open-format tarzında: A’nın frazı bitince B’ye 1. vuruşta kes.');
      alternatives.push(tech === 'hook-drop' ? 'quick-cut' : 'hook-drop', 'echo-out');
    } else {
      tech = 'filter';
      reasons.push('BPM yakın; intro/outro kısa olduğu için kısa bir filtre geçişi güvenli.');
      alternatives.push('echo-out');
    }
    if (vocalClash) reasons.push('İki parçanın da geçiş bölgesinde vokal var gibi görünüyor; üst üste bindirmekten kaçın.');
  } else {
    tech = 'echo-out';
    reasons.push(bm ? `BPM farkı büyük (%${diff.toFixed(1)}); tempoyu eşitlemek yerine A’yı eko ile söndürüp B’yi temiz başlat.` : 'BPM bilinmiyor; en güvenli yol eko ile çıkış.');
    alternatives.push('quick-cut');
    if (diff <= 15) alternatives.push('smart-fader');
  }

  if (forceTech && TECH_BY_ID[forceTech] && forceTech !== tech) {
    alternatives.unshift(tech);
    tech = forceTech;
  }
  const altSet = new Set(alternatives.filter((x) => x !== tech));
  alternatives.length = 0;
  alternatives.push(...altSet);

  if (bm && bm.mode !== 'same') reasons.push(`Tempo ${bm.mode === 'double' ? 'iki katı' : 'yarısı'} üzerinden eşleşiyor (${B.bpm} ↔ ${A.bpm}); yarım/çift tempo hissiyle geçiş yapılabilir.`);
  if (genreSwitch) reasons.push(`Tür değişiyor: ${GENRES[A.genre].name} → ${GENRES[B.genre].name}.`);
  const energyDelta = B.energy - A.energy;
  if (energyDelta >= 3) { warnings.push(`Büyük enerji sıçraması (+${energyDelta}). Arada köprü bir parça düşün veya Smart CFX ile build-up yap.`); if (!alternatives.includes('smart-cfx')) alternatives.push('smart-cfx'); }
  if (energyDelta <= -3) warnings.push(`Enerji sert düşüyor (${energyDelta}). Bilinçli bir “nefes” anı değilse sırayı gözden geçir.`);
  if (key.kind === 'clash' && (tech === 'bass-swap' || tech === 'long-blend' || tech === 'filter' || tech === 'loop-out')) warnings.push('Tonlar çakışıyor: üst üste binen kısmı kısa tut.');
  if (diff > 6 && diff < 99 && tech !== 'echo-out') warnings.push('Tempoyu %6’dan fazla değiştirmen gerekiyor; vokaller doğal duyulmayabilir.');
  if (!A.analyzed || !B.analyzed) warnings.push('Bu parçalardan en az biri ses dosyasıyla analiz edilmedi; intro/outro tahminidir.');
  if (bm && diff > 0.05 && diff <= 6 && ['bass-swap', 'long-blend', 'filter', 'loop-out'].includes(tech)) reasons.push(`B’yi %${(bm.diffPct).toFixed(1)} tempo ile çal (SYNC bunu otomatik yapar).`);

  const overlap = ['bass-swap', 'long-blend', 'filter', 'loop-out', 'smart-fader'].includes(tech);
  const score = scoreParts(A, B, bm, key, overlap);
  const grade = score >= 0.85 ? 'A' : score >= 0.7 ? 'B' : score >= 0.55 ? 'C' : 'D';

  // --- Zamanlama ---
  const aBeat = A.bpm ? 60 / A.bpm : 0.5;
  const aBar = aBeat * 4;
  let startInA = A.mixOutSec;
  if (!overlap) {
    // kesme/eko: outro yoksa fraz sonuna (8 bar sonra) koy
    startInA = A.outroBars >= 8 ? A.mixOutSec : A.mixOutSec + 8 * aBar;
    startInA = Math.min(startInA, A.durationSec - aBar);
  }
  let cueB = B.mixInSec, cueBLabel = 'B’nin ilk vuruşu (intro başı)';
  if (!overlap && B.dropSec && (OPEN_FORMAT.includes(B.genre) || tech === 'hook-drop')) {
    cueB = B.dropSec; cueBLabel = 'B’nin ana bölümü (intro sonrası – vokal/nakarat girişi)';
  }
  if (tech === 'hook-drop') cueBLabel = 'B’nin nakarat başı (otomatik tahmin: intro sonrası ilk güçlü bölüm – kulakla kontrol et)';

  const steps: TimedStep[] = withSteps
    ? TECH_BY_ID[tech].steps.map((s) => {
        const atSec = Math.max(0, startInA + s.atBeat * aBeat);
        return { ...s, atSec, clock: fmt(atSec) };
      })
    : [];

  return { score, grade, bpm: bm, key, energyDelta, genreSwitch, vocalClash, technique: tech, alternatives, reasons, warnings, startInA, cueB, cueBLabel, steps };
}
