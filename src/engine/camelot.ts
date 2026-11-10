// Ton (key) ve Camelot çarkı yardımcıları

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E' };

export interface KeyInfo { pc: number; minor: boolean }

export function keyName(k: KeyInfo): string {
  return NOTE_NAMES[k.pc] + (k.minor ? 'm' : '');
}

export function toCamelot(k: KeyInfo): string {
  const majorPc = k.minor ? (k.pc + 3) % 12 : k.pc;
  const n = (((majorPc * 7) % 12) + 7) % 12 + 1;
  return `${n}${k.minor ? 'A' : 'B'}`;
}

export function fromCamelot(code: string): KeyInfo | null {
  const m = /^0?(\d{1,2})\s*([AB])$/i.exec(code.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 12) return null;
  const minor = m[2].toUpperCase() === 'A';
  // n = ((pc*7)%12 + 7)%12 + 1  =>  (pc*7)%12 = (n - 8) mod 12  => pc = 7*(n-8) mod 12 (7*7=49≡1)
  const majorPc = (((7 * (n - 8)) % 12) + 12) % 12;
  return { pc: minor ? (majorPc + 9) % 12 : majorPc, minor };
}

/** "Am", "A minor", "F#m", "Dbmaj", "8A", "08B" gibi metinleri çözümler. */
export function parseKey(text: string | undefined | null): KeyInfo | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  const cam = fromCamelot(t);
  if (cam) return cam;
  const m = /^([A-Ga-g])([#♯b♭]?)\s*(m|min|minor|maj|major|M)?$/.exec(t);
  if (!m) return null;
  let root = m[1].toUpperCase();
  const acc = m[2] === '♯' ? '#' : m[2] === '♭' ? 'b' : m[2];
  if (acc === 'b') root = FLAT_TO_SHARP[root + 'b'] ?? root;
  else if (acc === '#') root = root + '#';
  if (root === 'E#') root = 'F';
  if (root === 'B#') root = 'C';
  const pc = NOTE_NAMES.indexOf(root);
  if (pc < 0) return null;
  const q = m[3];
  const minor = q === 'm' || q === 'min' || q === 'minor';
  return { pc, minor };
}

export function camelotParts(code: string): { n: number; letter: 'A' | 'B' } | null {
  const m = /^(\d{1,2})([AB])$/.exec(code);
  if (!m) return null;
  return { n: parseInt(m[1], 10), letter: m[2] as 'A' | 'B' };
}

export interface KeyRelation { score: number; label: string; kind: 'perfect' | 'good' | 'boost' | 'risky' | 'clash' | 'unknown' }

/** İki Camelot kodu arasındaki harmonik uyum. */
export function keyRelation(a: string, b: string): KeyRelation {
  const pa = camelotParts(a), pb = camelotParts(b);
  if (!pa || !pb) return { score: 0.5, label: 'Ton bilinmiyor', kind: 'unknown' };
  const d = (((pb.n - pa.n) % 12) + 12) % 12; // 0..11 ileri adım
  const sameLetter = pa.letter === pb.letter;
  if (d === 0 && sameLetter) return { score: 1, label: 'Aynı ton', kind: 'perfect' };
  if (d === 0) return { score: 0.9, label: 'Paralel/rölatif ton (A↔B)', kind: 'perfect' };
  if ((d === 1 || d === 11) && sameLetter) return { score: 0.9, label: d === 1 ? 'Bir adım yukarı (+1)' : 'Bir adım aşağı (−1)', kind: 'good' };
  if (d === 2 && sameLetter) return { score: 0.6, label: 'Enerji yükseltme (+2)', kind: 'boost' };
  if (d === 7 && sameLetter) return { score: 0.55, label: 'Yarım ton yukarı (+7) – enerji sıçraması', kind: 'boost' };
  if ((d === 1 || d === 11) && !sameLetter) return { score: 0.5, label: 'Çapraz geçiş (riskli ama kullanılır)', kind: 'risky' };
  if ((d === 10) && sameLetter) return { score: 0.45, label: 'İki adım aşağı (−2)', kind: 'risky' };
  return { score: 0.15, label: 'Tonlar çakışıyor', kind: 'clash' };
}

export const ALL_CAMELOT = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();
