// Set kurgusu şablonları ve deneyimli DJ'lerin yaygın kuralları (genel derleme).

export interface Arc {
  id: string;
  name: string;
  description: string;
  /** 0..1 konumundaki hedef enerji (1-10) */
  curve: (p: number) => number;
}

const lerp = (pts: [number, number][], p: number) => {
  for (let i = 1; i < pts.length; i++) {
    if (p <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0 || 1);
    }
  }
  return pts[pts.length - 1][1];
};

export const ARCS: Arc[] = [
  {
    id: 'party', name: 'Parti (Open Format)', description: 'Dalga dalga yükselen enerji; zirve setin ~%75’inde, sonra kısa bir iniş. Karışık tür setleri için en yaygın kurgu.',
    curve: (p) => lerp([[0, 5], [0.25, 7], [0.4, 6], [0.6, 8], [0.75, 9], [0.9, 8], [1, 7]], p),
  },
  {
    id: 'journey', name: 'Yolculuk', description: 'Sakin başla, yavaşça zirveye çık, sonunda yumuşak in. Kulüp/house setlerinin klasik yayı.',
    curve: (p) => lerp([[0, 3], [0.3, 5], [0.6, 7.5], [0.8, 9], [1, 6]], p),
  },
  {
    id: 'warmup', name: 'Isınma Seti', description: 'Gecenin ilk DJ’i: enerjiyi asla zirveye taşıma, yavaşça 6–7’ye çıkar.',
    curve: (p) => lerp([[0, 3], [0.5, 5], [1, 6.5]], p),
  },
  {
    id: 'peak', name: 'Zirve Saati', description: 'Baştan yüksek enerji, küçük nefes aralarıyla 8–10 bandında kal.',
    curve: (p) => lerp([[0, 7], [0.3, 8.5], [0.5, 8], [0.8, 9.5], [1, 9]], p),
  },
  {
    id: 'practice', name: 'Pratik (en kolay geçişler)', description: 'Enerji eğrisini önemseme; geçişleri olabildiğince kolay ve uyumlu sırala. Yeni başlarken ideal.',
    curve: () => NaN,
  },
];

export const ARC_BY_ID: Record<string, Arc> = Object.fromEntries(ARCS.map((a) => [a.id, a]));

export interface Principle { title: string; body: string; tag: string }

/** Kulüp ve open-format DJ setlerinde (ör. transition videolarında) tekrar tekrar görülen genel kurallar. */
export const PRINCIPLES: Principle[] = [
  { tag: 'Zamanlama', title: 'Her şey frazda başlar', body: 'Pop, house ve hip-hop’ın neredeyse tamamı 8 barlık (32 vuruş) bloklarla ilerler. Geçişi her zaman bir fraz başında (“1”) başlat ve bitir. Doğru BPM + yanlış zamanlama, kötü bir geçiştir.' },
  { tag: 'Zamanlama', title: 'Saymayı alışkanlık yap', body: '“1-2-3-4, 2-2-3-4 … 8-2-3-4”. Uygulamadaki Fraz Sayacı ile pratik yap; bir süre sonra kulağın frazı kendiliğinden hissedecek.' },
  { tag: 'Tempo', title: 'BPM bloklarıyla düşün', body: 'Open-format DJ’ler seti tempo bloklarına ayırır: R&B/Hip-hop (85–100) → Reggaeton/Afrobeats (95–110) → Pop (110–124) → House (120–128). Blok içinde blend, bloklar arasında eko/kesme veya köprü parçası kullanılır.' },
  { tag: 'Tempo', title: '%6 kuralı', body: 'Tempoyu %6’dan fazla oynatmak vokalleri ve hissi bozar. Fark büyükse uzun blend yerine Eko ile Çıkış veya Hızlı Kesme kullan.' },
  { tag: 'Ton', title: 'Harmonik geçiş (Camelot)', body: 'Aynı numara, ±1 numara veya aynı numaranın A↔B’si uyumludur. +2 ve +7 “enerji yükseltir”. Uyum sadece parçalar uzun süre üst üste çalıyorsa kritiktir; kesmede daha az önemlidir.' },
  { tag: 'Vokal', title: 'İki vokal = kaos', body: 'İki vokali asla üst üste bindirme. Vokalli parçadan çıkarken, gelen parçanın intro’su enstrümantal olmalı; değilse eko ya da kesme kullan.' },
  { tag: 'Enerji', title: 'Enerjiyi yönet, maksimuma kilitleme', body: 'Sürekli 10/10 çalmak kalabalığı yorar. Zirveden sonra 1–2 parça nefes ver, sonra tekrar yükselt. Enerji sıçramaları yukarı doğru küçük adımlarla (+1/+2) olmalı.' },
  { tag: 'Seçim', title: 'Kısa çal, en iyi kısmı çal', body: 'Open-format setlerde pop/hip-hop parçaları genelde 1–2.5 dakika çalınır: bir kıta + nakarat. House parçaları 3–5 dakika. Sıkılmadan önce geç.' },
  { tag: 'Seçim', title: 'Doğru versiyonu kullan', body: 'House için “Extended Mix”, pop için “Intro/Outro” veya “DJ Edit” versiyonları blend’i çok kolaylaştırır.' },
  { tag: 'Teknik', title: 'Bas tek kanaldan', body: 'Aynı anda yalnızca bir parçanın bası (LOW) açık olsun. Bas değişimini fraz başında tek hamlede yap.' },
  { tag: 'Teknik', title: 'Seviyeleri eşitle', body: 'Gelen parçayı açmadan önce kulaklıkta ses seviyesini kontrol et (TRIM/gain). Kanal seviye göstergeleri aynı hizada olsun, kırmızıya çıkmasın.' },
  { tag: 'Yaratıcılık', title: 'Transition videolarının sırrı', body: 'Etkileyici geçişlerin çoğu aslında basit hareketlerin iyi zamanlanmasıdır: nakarattan nakarata kesme, 1’de drop, kısa eko, söz oyunu. Önce temel üç tekniği (Bas Değişimi, Eko, Kesme) otomatikleştir.' },
  { tag: 'Pratik', title: 'Kaydet ve dinle', body: 'rekordbox’ta seti kaydet ve ertesi gün dinle. Dinleyici gözüyle hataları çok daha net duyarsın.' },
];

export interface LearnStep { week: string; focus: string; goals: string[]; techniques: string[] }

/** Sıfırdan başlayan biri için önerilen öğrenme yolu. */
export const ROADMAP: LearnStep[] = [
  { week: '1. hafta', focus: 'Fraz ve sayma', goals: ['Fraz sayacıyla 8 barı sayabilmek', 'Parçanın “1”ini kulakla bulmak', 'Cue/Hot Cue kullanmak'], techniques: ['quick-cut'] },
  { week: '2. hafta', focus: 'Güvenli geçişler', goals: ['Eko ile çıkışı fraz başında yapmak', 'Hızlı kesmeyi doğru “1”de yapmak'], techniques: ['echo-out', 'quick-cut'] },
  { week: '3. hafta', focus: 'EQ ve blend', goals: ['Bas değişimini tam fraz başında yapmak', 'Filtre ile geçiş'], techniques: ['bass-swap', 'filter'] },
  { week: '4. hafta', focus: 'Set kurgusu', goals: ['10 parçalık bir seti uygulamanın önerdiği sırayla baştan sona çalmak', 'Kaydedip dinlemek'], techniques: ['smart-fader', 'loop-out'] },
  { week: '5–8. hafta', focus: 'Open-format ve yaratıcılık', goals: ['Nakarattan nakarata geçiş', 'Tempo bloklarını değiştirmek', 'İlk söz oyunu geçişi'], techniques: ['hook-drop', 'tempo-ride', 'wordplay', 'long-blend'] },
];
