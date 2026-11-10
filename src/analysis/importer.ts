// Dosya içe aktarma + analiz kuyruğu
import type { Track } from '../types';
import { decodeToMono } from './decode';
import { metaFromFileName, normName, parseId3, parseRekordboxXml, type RbPlaylist, type RbTrack } from './metadata';
import { ANALYSIS_SR, type AnalyzeHints } from './analyze';
import { parseKey } from '../engine/camelot';
import { resolveGenre } from '../knowledge/genres';
import type { TrackAnalysis } from '../types';

export const AUDIO_RE = /\.(mp3|m4a|aac|wav|aif|aiff|flac|ogg|opus|alac|mp4)$/i;

export const trackIdFor = (fileName: string | undefined, artist: string, title: string) =>
  fileName ? 'f:' + normName(fileName) : 'm:' + normName(`${artist} ${title}`);

/** rekordbox XML'den sadece meta veriyle (ses dosyası olmadan) parça oluşturur. */
export function tracksFromRekordbox(xml: string): { tracks: Track[]; playlists: { name: string; trackIds: string[] }[] } {
  const { tracks: rb, playlists } = parseRekordboxXml(xml);
  const byKey = new Map<string, string>();
  const tracks: Track[] = rb.map((r: RbTrack) => {
    const id = trackIdFor(r.fileName, r.artist, r.name);
    byKey.set(r.key, id);
    const g = resolveGenre(r.genre, undefined, r.name, r.artist);
    return {
      id, title: r.name, artist: r.artist, fileName: r.fileName ?? r.name, durationSec: r.totalTime ?? 0,
      genreTag: r.genre, genre: g.genre, genreSource: g.source, metaBpm: r.bpm, metaKey: r.tonality,
      status: 'meta-only', addedAt: Date.now(),
    } satisfies Track;
  });
  return {
    tracks,
    playlists: playlists.map((p: RbPlaylist) => ({ name: p.name, trackIds: p.trackKeys.map((k) => byKey.get(k)).filter((x): x is string => !!x) })),
  };
}

/** Ses dosyası için (henüz analiz edilmemiş) parça kaydı oluşturur; mevcut rekordbox kaydıyla birleştirir. */
export async function trackFromFile(file: File, existing: Map<string, Track>): Promise<Track> {
  let tag = {} as ReturnType<typeof parseId3>;
  try { tag = parseId3(await file.slice(0, 512 * 1024).arrayBuffer()); } catch { /* etiket yok */ }
  const fromName = metaFromFileName(file.name);
  const id = trackIdFor(file.name, '', '');
  const prev = existing.get(id);
  const title = tag.title || prev?.title || fromName.title || file.name;
  const artist = tag.artist || prev?.artist || fromName.artist || '';
  const genreTag = tag.genre || prev?.genreTag;
  const g = resolveGenre(genreTag, undefined, title, artist);
  return {
    ...(prev ?? {}),
    id, title, artist, fileName: file.name, durationSec: prev?.durationSec ?? 0,
    genreTag, genre: prev?.genreSource === 'tag' ? prev.genre : g.genre, genreSource: genreTag ? 'tag' : 'auto',
    metaBpm: prev?.metaBpm ?? tag.bpm, metaKey: prev?.metaKey ?? tag.key,
    status: 'pending', addedAt: prev?.addedAt ?? Date.now(),
  };
}

let worker: Worker | null = null;
const waiting = new Map<string, { resolve: (a: TrackAnalysis) => void; reject: (e: Error) => void }>();
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.ok) w.resolve(e.data.result); else w.reject(new Error(e.data.error));
    };
  }
  return worker;
}

export async function analyzeFile(track: Track, file: File): Promise<Track> {
  const { samples, durationSec } = await decodeToMono(file);
  // rekordbox BPM'i güvenilirdir; dosya etiketindeki BPM bazen yuvarlanmıştır ama yine de iyi bir ipucudur
  const hints: AnalyzeHints = { bpm: track.metaBpm, key: parseKey(track.metaKey) };
  const analysis = await new Promise<TrackAnalysis>((resolve, reject) => {
    waiting.set(track.id, { resolve, reject });
    getWorker().postMessage({ id: track.id, samples, sr: ANALYSIS_SR, hints }, [samples.buffer]);
  });
  const g = track.genreSource === 'tag' ? { genre: track.genre, source: 'tag' as const } : resolveGenre(track.genreTag, analysis.genreGuess, track.title, track.artist);
  return { ...track, analysis, durationSec, genre: g.genre, genreSource: g.source, status: 'done', error: undefined };
}
