// Uygulama genelindeki veri tipleri

export type GenreId = 'house' | 'tr-pop' | 'pop' | 'hiphop' | 'rnb' | 'afro' | 'latin' | 'edm' | 'other';

export interface Segment {
  kind: 'intro' | 'outro' | 'breakdown' | 'drop';
  startSec: number;
  endSec: number;
  bars: number;
}

export interface TrackAnalysis {
  bpm: number;
  bpmConfidence: number; // 0-1
  firstBeatSec: number; // ilk "1" vuruşunun (downbeat) zamanı
  key: string; // örn. "Am", "C#"
  camelot: string; // örn. "8A"
  keyConfidence: number; // 0-1
  energyRaw: number; // kütüphaneye göre normalize edilmeden önceki enerji
  energy: number; // 1-10
  barEnergy: number[]; // her 4 vuruş (1 bar) için 0-1 enerji
  barVocal: number[]; // her bar için 0-1 vokal olasılığı (tahmini)
  segments: Segment[];
  introBars: number;
  outroBars: number;
  mixInSec: number; // gelen parça olarak başlatma noktası
  mixOutSec: number; // giden parça olarak geçişe başlama noktası
  fourOnFloor: number; // 0-1 (house tarzı düz kick)
  vocalIntro: number; // 0-1
  vocalOutro: number; // 0-1
  genreGuess: GenreId;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  fileName: string;
  durationSec: number;
  genreTag?: string; // dosya etiketinden veya rekordbox'tan
  genre: GenreId; // kullanılan tür
  genreSource: 'tag' | 'auto';
  metaBpm?: number; // rekordbox / etiket BPM'i
  metaKey?: string; // rekordbox / etiket tonu
  analysis?: TrackAnalysis;
  status: 'pending' | 'analyzing' | 'done' | 'meta-only' | 'error';
  error?: string;
  addedAt: number;
}

export interface SavedSet {
  id: string;
  name: string;
  trackIds: string[];
  arc: string;
  createdAt: number;
  updatedAt: number;
}

export interface PracticeEntry {
  id: string;
  techniqueId: string;
  ok: boolean;
  at: number;
}
