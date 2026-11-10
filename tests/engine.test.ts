import { describe, expect, it } from 'vitest';
import { keyRelation, parseKey, toCamelot, fromCamelot } from '../src/engine/camelot';
import { planTransition } from '../src/engine/transition';
import { autoOrder, reviewSet } from '../src/engine/order';
import { resolveGenre } from '../src/knowledge/genres';
import type { GenreId, Track } from '../src/types';

function t(id: string, bpm: number, key: string, genre: GenreId, energy: number, intro = 16, outro = 16, vocal = 0.1): Track {
  const k = parseKey(key)!;
  return {
    id, title: id, artist: '', fileName: id + '.mp3', durationSec: 300, genre, genreSource: 'tag', status: 'done', addedAt: 0,
    analysis: {
      bpm, bpmConfidence: 1, firstBeatSec: 0.1, key, camelot: toCamelot(k), keyConfidence: 1, energyRaw: energy / 10, energy,
      barEnergy: [], barVocal: [], segments: [], introBars: intro, outroBars: outro, mixInSec: 0.1, mixOutSec: 240,
      fourOnFloor: genre === 'house' ? 0.9 : 0.2, vocalIntro: vocal, vocalOutro: vocal, genreGuess: genre,
    },
  };
}

describe('camelot', () => {
  it('ton dönüşümleri', () => {
    expect(toCamelot(parseKey('Am')!)).toBe('8A');
    expect(toCamelot(parseKey('C')!)).toBe('8B');
    expect(toCamelot(parseKey('F#m')!)).toBe('11A');
    expect(toCamelot(parseKey('Dbm')!)).toBe('12A');
    expect(toCamelot(parseKey('Ab')!)).toBe('4B');
    expect(toCamelot(parseKey('Bbm')!)).toBe('3A');
    expect(toCamelot(fromCamelot('5A')!)).toBe('5A');
    for (let n = 1; n <= 12; n++) for (const l of ['A', 'B']) expect(toCamelot(fromCamelot(`${n}${l}`)!)).toBe(`${n}${l}`);
  });
  it('uyum', () => {
    expect(keyRelation('8A', '8A').kind).toBe('perfect');
    expect(keyRelation('8A', '9A').kind).toBe('good');
    expect(keyRelation('12A', '1A').kind).toBe('good');
    expect(keyRelation('8A', '8B').kind).toBe('perfect');
    expect(keyRelation('8A', '3B').kind).toBe('clash');
  });
});

describe('geçiş planı', () => {
  it('house → house uyumlu: blend', () => {
    const p = planTransition(t('a', 124, 'Am', 'house', 6), t('b', 124, 'Em', 'house', 7));
    expect(['long-blend', 'bass-swap']).toContain(p.technique);
    expect(p.grade).toBe('A');
    expect(p.steps.length).toBeGreaterThan(3);
  });
  it('house → hip-hop büyük BPM farkı: eko', () => {
    const p = planTransition(t('a', 124, 'Am', 'house', 7), t('b', 92, 'Am', 'hiphop', 6, 0, 0, 0.8));
    expect(p.technique).toBe('echo-out');
  });
  it('Türkçe pop, outro yok: nakarata giriş / kesme', () => {
    const p = planTransition(t('a', 100, 'Am', 'tr-pop', 6, 2, 0, 0.8), t('b', 102, 'Dm', 'tr-pop', 7, 2, 0, 0.8));
    expect(['hook-drop', 'quick-cut']).toContain(p.technique);
  });
  it('yarım tempo eşleşmesi', () => {
    const p = planTransition(t('a', 128, 'Am', 'house', 7), t('b', 64, 'Am', 'hiphop', 6));
    expect(p.bpm?.mode).toBe('double'); // B iki kat tempoda eşleşir
  });
});

describe('otomatik sıralama', () => {
  it('BPM bloklarını gruplar ve skoru iyileştirir', () => {
    const lib = [
      t('h1', 124, 'Am', 'house', 8), t('p1', 96, 'C', 'pop', 5), t('h2', 125, 'Em', 'house', 9), t('hh1', 92, 'Am', 'hiphop', 6),
      t('h3', 123, 'Dm', 'house', 7), t('p2', 98, 'G', 'pop', 6), t('hh2', 90, 'Dm', 'hiphop', 5), t('tr1', 110, 'Bm', 'tr-pop', 7),
    ];
    const shuffled = reviewSet(lib, 'party').average;
    const ordered = autoOrder(lib, { arc: 'practice' });
    expect(ordered.length).toBe(lib.length);
    expect(new Set(ordered.map((x) => x.id)).size).toBe(lib.length);
    expect(reviewSet(ordered, 'practice').average).toBeGreaterThan(shuffled);
    const sub = autoOrder(lib, { arc: 'party', length: 5, startId: 'hh2' });
    expect(sub.length).toBe(5);
    expect(sub[0].id).toBe('hh2');
  });
  it('100 parçada hızlı çalışır', () => {
    const lib = Array.from({ length: 100 }, (_, i) => t('x' + i, 90 + (i * 7) % 40, ['Am', 'C', 'Em', 'G', 'Dm'][i % 5], (['house', 'pop', 'hiphop', 'tr-pop'] as GenreId[])[i % 4], 1 + (i % 10)));
    const s = Date.now();
    autoOrder(lib, { arc: 'party' });
    expect(Date.now() - s).toBeLessThan(8000);
  });
});

describe('tür', () => {
  it('Türkçe başlıktan Türkçe Pop', () => {
    expect(resolveGenre('Pop', undefined, 'Kalbimin Sahibi', 'Sezen').genre).toBe('tr-pop');
    expect(resolveGenre(undefined, 'pop', 'Gülümse', 'X').genre).toBe('tr-pop');
    expect(resolveGenre('Deep House', undefined, 'X', 'Y').genre).toBe('house');
    expect(resolveGenre('Hip-Hop/Rap', undefined, 'X', 'Y').genre).toBe('hiphop');
  });
});
