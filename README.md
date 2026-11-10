# Set Koçu 🎧

DDJ-FLX2 + rekordbox ile DJ'liğe başlayanlar için kişisel set planlayıcı ve pratik koçu.
Müziklerini ekle; uygulama her parçayı **otomatik** analiz eder, setini sıralar ve her geçiş için
**hangi tekniği, ne zaman ve FLX2'de hangi düğmeyle** yapacağını adım adım söyler. Manuel not gerekmez.

## Neler yapıyor?

| Bölüm | Ne işe yarar |
|---|---|
| **Kütüphane** | Ses dosyalarını (MP3, M4A, WAV, AIFF, FLAC) ve/veya rekordbox XML'ini ekle. BPM, ton (Camelot), enerji (1–10), intro/outro uzunluğu, breakdown/drop, vokal tahmini, ritim tipi ve tür otomatik çıkarılır. |
| **Set Planla** | Seçtiğin kurguya göre (Parti, Yolculuk, Isınma, Zirve, Pratik) **otomatik sıralama**. Her geçişe puan (A–D), önerilen teknik + alternatifler, A parçasının saatine göre zamanlanmış FLX2 adımları, enerji grafiği, zayıf geçiş uyarıları, “sona ne eklesem?” önerileri. Kendi sıranı da puanlar. |
| **Pratik** | Fraz sayacı (metronom, tap tempo, “Şimdi 1!” ile müziğe kilitlenme), seviyene göre günün alıştırmaları, set provası (geçişleri sırayla), tek dokunuşla ✓/✗ ile gelişim takibi. |
| **Öğren** | Sıfırdan öğrenme yolu, DJ'lerin genel kuralları, 11 geçiş tekniği, interaktif Camelot çarkı, tür/tempo blokları, FLX2 hızlı rehber. |

### Geçiş önerileri nereden geliyor?
Kulüp ve open-format DJ'lerin setlerinde (transition videoları dahil) sürekli görülen genel kurallar
bir kural motoruna dönüştürüldü: fraz zamanlaması (8 bar), BPM blokları ve %6 kuralı, Camelot uyumu,
vokal çakışmasından kaçınma, intro/outro yapısı, tür geçişleri ve enerji yönetimi.
Motor bu kuralları **senin** parçalarının analizine uygular (`src/engine/transition.ts`).

## Kullanım

- **iPad:** Uygulamayı Safari'de aç → Paylaş → *Ana Ekrana Ekle*. Müzikleri “Dosyalar” uygulamasından seç.
  (Apple Music / Spotify parçaları DRM'li olduğu için eklenemez.)
- **Bilgisayar:** Aynı adresi tarayıcıda aç. rekordbox'ta *Dosya → Dışa Aktar → Koleksiyonu xml formatında dışa aktar*
  ile çıkan XML'i ekleyebilirsin: rekordbox'ın BPM/ton verisi ve playlist'lerin gelir.
- **iPad ↔ bilgisayar:** Veriler cihazda (IndexedDB) tutulur. *Yedeği indir* ile JSON al, diğer cihazda *Yedeği yükle*.
- Dosyaların hiçbir yere yüklenmez; analiz tamamen tarayıcıda yapılır.

## Geliştirme

```bash
npm install
npm run dev      # http://localhost:5173 (aynı Wi-Fi'deki iPad'den IP adresiyle açılabilir)
npm test         # analiz + motor testleri
npm run build    # dist/
```

### Yayınlama (GitHub Pages)
1. Depo ayarlarında *Settings → Pages → Source: GitHub Actions* seç.
2. Değişiklikleri `main` dalına birleştir; `.github/workflows/pages.yml` testleri çalıştırıp siteyi yayınlar.

## Yapı

```
src/analysis/   ses çözme, BPM/beat/downbeat, ton, enerji, yapı, vokal, ID3 + rekordbox XML
src/engine/     Camelot, geçiş planlayıcı, otomatik sıralama (beam search), set değerlendirme
src/knowledge/  tür profilleri, teknik kütüphanesi (FLX2 adımları), kurgu şablonları, kurallar
src/ui/         React arayüzü
tests/          sentetik müzikle analiz testleri, motor testleri
```

Not: Otomatik analiz tahmindir. rekordbox'ın BPM/ton verisi varsa o kullanılır; vokal tespiti kaba bir tahmindir.
