// Tür profilleri: kulüp / open-format DJ'lerin yaygın pratiklerinden derlenmiş genel kurallar.
import type { GenreId } from '../types';

export interface GenreProfile {
  id: GenreId;
  name: string;
  color: string;
  bpm: [number, number]; // tipik aralık
  phraseBars: number; // tipik fraz uzunluğu (bar)
  playMinutes: [number, number]; // open-format sette tipik çalma süresi
  djFriendlyIntro: boolean; // genelde DJ'e uygun uzun intro var mı
  preferred: string[]; // tercih edilen teknik id'leri (sırayla)
  notes: string;
}

export const GENRES: Record<GenreId, GenreProfile> = {
  house: {
    id: 'house', name: 'House', color: '#7c5cff', bpm: [118, 128], phraseBars: 8, playMinutes: [3, 5], djFriendlyIntro: true,
    preferred: ['bass-swap', 'long-blend', 'filter'],
    notes: 'Uzun intro/outro’lu "Extended Mix"ler blend için yapılmıştır. Geçişler 16–32 bar sürebilir; bas değişimi fraz başında yapılır.',
  },
  'tr-pop': {
    id: 'tr-pop', name: 'Türkçe Pop', color: '#ff5c8a', bpm: [90, 130], phraseBars: 8, playMinutes: [1.5, 3], djFriendlyIntro: false,
    preferred: ['hook-drop', 'quick-cut', 'echo-out', 'loop-out'],
    notes: 'Radyo versiyonları kısa introyla hemen vokale girer. Nakarat (sing-along) anı enerjidir: nakarattan nakarata kesme ve eko ile çıkış en temiz sonuç verir. Uzun blend’de vokaller çakışır.',
  },
  pop: {
    id: 'pop', name: 'Yabancı Pop', color: '#ffb02e', bpm: [95, 128], phraseBars: 8, playMinutes: [1.5, 3], djFriendlyIntro: false,
    preferred: ['quick-cut', 'hook-drop', 'echo-out', 'bass-swap'],
    notes: 'Mümkünse "Intro/Outro/DJ Edit" versiyonları kullan. Dance-pop (120+ BPM) house’a çok rahat bağlanır.',
  },
  hiphop: {
    id: 'hiphop', name: 'Hip-Hop', color: '#2ec4b6', bpm: [80, 100], phraseBars: 8, playMinutes: [1, 2.5], djFriendlyIntro: false,
    preferred: ['quick-cut', 'echo-out', 'hook-drop', 'bass-swap'],
    notes: 'Open-format DJ’ler hip-hop’ta parçaları kısa çalar (1–2 dk) ve 1. vuruşta keser. Trap (130–150) yarım tempoda ~65–75 gibi hissedilir.',
  },
  rnb: {
    id: 'rnb', name: 'R&B', color: '#c77dff', bpm: [65, 100], phraseBars: 8, playMinutes: [1.5, 3], djFriendlyIntro: false,
    preferred: ['echo-out', 'quick-cut', 'filter'],
    notes: 'Yavaş ve vokal ağırlıklı; enerjiyi düşürmek / setin “nefes” bölümü için ideal.',
  },
  afro: {
    id: 'afro', name: 'Afro / Afrobeats', color: '#06d6a0', bpm: [98, 124], phraseBars: 8, playMinutes: [2, 4], djFriendlyIntro: true,
    preferred: ['bass-swap', 'filter', 'echo-out'],
    notes: 'Afrobeats (~100–110) hip-hop ile house arasında köprü görevi görür; afro house (118–124) house bloklarına uyar.',
  },
  latin: {
    id: 'latin', name: 'Latin / Reggaeton', color: '#ef476f', bpm: [88, 102], phraseBars: 8, playMinutes: [1.5, 3], djFriendlyIntro: false,
    preferred: ['quick-cut', 'echo-out', 'hook-drop'],
    notes: 'Dembow ritmi hip-hop temposuna yakın; hip-hop ↔ reggaeton geçişleri BPM eşleşince kolaydır.',
  },
  edm: {
    id: 'edm', name: 'EDM / Dance', color: '#118ab2', bpm: [124, 130], phraseBars: 8, playMinutes: [2, 4], djFriendlyIntro: true,
    preferred: ['bass-swap', 'filter', 'smart-cfx'],
    notes: 'Build-up + drop yapısı: drop’u drop’un yerine (fraz başına) denk getirmek ana hedeftir.',
  },
  other: {
    id: 'other', name: 'Diğer', color: '#8d99ae', bpm: [70, 140], phraseBars: 8, playMinutes: [2, 4], djFriendlyIntro: false,
    preferred: ['echo-out', 'filter', 'quick-cut'],
    notes: 'Tür bilinmiyor: güvenli teknikleri (eko, filtre) tercih et.',
  },
};

export const GENRE_LIST = Object.values(GENRES);

/** Etiket metnini (ID3/rekordbox "Genre") türe eşler. */
export function genreFromTag(tag: string | undefined): GenreId | null {
  if (!tag) return null;
  const t = tag.toLocaleLowerCase('tr');
  if (/türk|turk|turkish|tr pop|arabesk/.test(t)) return 'tr-pop';
  if (/afro|amapiano/.test(t)) return 'afro';
  if (/house|garage|disco|nu disco/.test(t)) return 'house';
  if (/hip.?hop|rap|trap|drill|grime/.test(t)) return 'hiphop';
  if (/r&b|rnb|r'n'b|soul/.test(t)) return 'rnb';
  if (/reggaeton|latin|dembow|moombah|baile|funk carioca/.test(t)) return 'latin';
  if (/edm|electro|big room|dance|trance|dubstep|future/.test(t)) return 'edm';
  if (/pop/.test(t)) return 'pop';
  return null;
}

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_WORDS = /\b(ben|sen|seni|beni|bir|yok|gibi|olsun|hadi|sana|bana|gece|yalan|yarim)\b|\b(kalbi|sevgil|seviyor|sevdi|gönl)/i;

/** Etiket yoksa: ses analizinden gelen tahmin + başlıktaki Türkçe ipuçları. */
export function resolveGenre(tag: string | undefined, guess: string | undefined, title: string, artist: string): { genre: GenreId; source: 'tag' | 'auto' } {
  const fromTag = genreFromTag(tag);
  if (fromTag) {
    // "Pop" etiketli ama Türkçe başlıklı => Türkçe Pop
    if (fromTag === 'pop' && (TR_CHARS.test(title + artist) || TR_WORDS.test(title))) return { genre: 'tr-pop', source: 'tag' };
    return { genre: fromTag, source: 'tag' };
  }
  let g = (guess as GenreId) || 'pop';
  if (g === 'pop' && (TR_CHARS.test(title + artist) || TR_WORDS.test(title))) g = 'tr-pop';
  return { genre: g, source: 'auto' };
}
