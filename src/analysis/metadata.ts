// Dosya etiketlerini (ID3v2) ve rekordbox XML dışa aktarımını okur

export interface FileMeta { title?: string; artist?: string; genre?: string; bpm?: number; key?: string }

function decodeText(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const enc = bytes[0];
  const body = bytes.subarray(1);
  let s: string;
  try {
    if (enc === 1 || enc === 2) s = new TextDecoder(enc === 2 ? 'utf-16be' : 'utf-16').decode(body);
    else if (enc === 3) s = new TextDecoder('utf-8').decode(body);
    else s = new TextDecoder('latin1').decode(body);
  } catch { s = ''; }
  return s.replace(/\u0000+$/g, '').split('\u0000')[0].trim();
}

/** ID3v2.3 / v2.4 etiketlerinden temel alanları okur. */
export function parseId3(buf: ArrayBuffer): FileMeta {
  const b = new Uint8Array(buf);
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return {};
  const ver = b[3];
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  const end = Math.min(b.length, 10 + size);
  let p = 10;
  if (b[5] & 0x40) { // extended header
    const ext = ver === 4 ? ((b[p] & 0x7f) << 21) | ((b[p + 1] & 0x7f) << 14) | ((b[p + 2] & 0x7f) << 7) | (b[p + 3] & 0x7f) : (b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
    p += ver === 4 ? ext : ext + 4;
  }
  const meta: FileMeta = {};
  while (p + 10 <= end) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs = ver === 4
      ? ((b[p + 4] & 0x7f) << 21) | ((b[p + 5] & 0x7f) << 14) | ((b[p + 6] & 0x7f) << 7) | (b[p + 7] & 0x7f)
      : (b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7];
    const data = b.subarray(p + 10, p + 10 + fs);
    p += 10 + fs;
    if (fs <= 0) continue;
    if (id === 'TIT2') meta.title = decodeText(data);
    else if (id === 'TPE1') meta.artist = decodeText(data);
    else if (id === 'TCON') meta.genre = decodeText(data).replace(/^\(\d+\)/, '').trim() || undefined;
    else if (id === 'TBPM') { const v = parseFloat(decodeText(data).replace(',', '.')); if (v > 40 && v < 250) meta.bpm = v; }
    else if (id === 'TKEY') meta.key = decodeText(data) || undefined;
  }
  return meta;
}

/** "Sanatçı - Parça Adı (Extended Mix).mp3" -> {artist, title} */
export function metaFromFileName(name: string): FileMeta {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').replace(/^\d{1,3}[\s.\-]+/, '').trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { title: base };
}

export interface RbTrack { key: string; name: string; artist: string; genre?: string; bpm?: number; tonality?: string; totalTime?: number; fileName?: string }
export interface RbPlaylist { name: string; trackKeys: string[] }

/** rekordbox: Dosya > Dışa Aktar > "Koleksiyonu xml formatında dışa aktar" çıktısını okur. */
export function parseRekordboxXml(xml: string): { tracks: RbTrack[]; playlists: RbPlaylist[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML okunamadı');
  const tracks: RbTrack[] = [];
  const coll = doc.getElementsByTagName('COLLECTION')[0];
  if (coll) {
    for (const t of Array.from(coll.getElementsByTagName('TRACK'))) {
      const loc = t.getAttribute('Location') ?? '';
      let fileName: string | undefined;
      try { fileName = decodeURIComponent(loc.split('/').pop() ?? '') || undefined; } catch { fileName = loc.split('/').pop(); }
      const bpm = parseFloat(t.getAttribute('AverageBpm') ?? '');
      const tt = parseFloat(t.getAttribute('TotalTime') ?? '');
      tracks.push({
        key: t.getAttribute('TrackID') ?? loc,
        name: t.getAttribute('Name') ?? fileName ?? 'Bilinmeyen',
        artist: t.getAttribute('Artist') ?? '',
        genre: t.getAttribute('Genre') || undefined,
        bpm: bpm > 0 ? bpm : undefined,
        tonality: t.getAttribute('Tonality') || undefined,
        totalTime: tt > 0 ? tt : undefined,
        fileName,
      });
    }
  }
  const playlists: RbPlaylist[] = [];
  const pl = doc.getElementsByTagName('PLAYLISTS')[0];
  if (pl) {
    for (const node of Array.from(pl.getElementsByTagName('NODE'))) {
      if (node.getAttribute('Type') !== '1') continue; // 1 = playlist, 0 = klasör
      const keys = Array.from(node.getElementsByTagName('TRACK')).map((t) => t.getAttribute('Key') ?? '').filter(Boolean);
      if (keys.length) playlists.push({ name: node.getAttribute('Name') ?? 'Playlist', trackKeys: keys });
    }
  }
  return { tracks, playlists };
}

export function normName(s: string): string {
  return s.toLocaleLowerCase('tr').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
