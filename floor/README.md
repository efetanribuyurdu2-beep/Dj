# FLOOR — DJ Performance Studio

**Read the room. Shape the night.**

FLOOR bir DJ performans ve karar verme stüdyosudur: bir mekân kurarsın, kalabalığı tanırsın, gecenin enerji eğrisini çizersin ve kararlarını kurallı, açıklanabilir bir kalabalık simülasyonunda prova edersin. Prova sonunda kararlarından üretilmiş bir değerlendirme ve DDJ-FLX2 üzerinde yapılacak somut bir pratik görevi alırsın.

> Kalabalık tepkileri kurallı bir eğitim simülasyonudur; gerçek insanları öngörmez. Spotify, Rekordbox, djay veya donanım bağlantısı yoktur. Ses yok; isteğe bağlı “sentetik nabız” yalnızca simüle yoğunluğu yansıtır.

## Çalıştırma

FLOOR bu depoda `floor/` klasöründe, Set Koçu’ndan bağımsız bir uygulama olarak yaşar.

```bash
cd floor
npm install
npm run dev          # geliştirme sunucusu
npm test             # simülasyon, süre hesabı, kalıcılık testleri (vitest)
npm run typecheck
npm run build        # dist/ (statik, her yerde barındırılabilir)

# uçtan uca tarayıcı kontrolü (Playwright gerekir)
npx vite preview --port 4173 &
npm run e2e
```

## Deck: kendi parçaların, FLX2 ve stem'ler

`#/deck` ekranı iki deck'li bir tarayıcı mikseridir:

- **Dosyalar**: MP3/WAV/AIFF/FLAC sürükle-bırak. Dosyalar yalnızca tarayıcının IndexedDB deposunda kalır, sunucuya gitmez.
- **Analiz** (cihazda, Web Worker): BPM ve tahmini beat grid, ton ve Camelot kodu (uyumlu tonlar), peak/RMS, clipping, dalga formu ve enerji eğrisi. Tahmindir; LUFS değildir.
- **Mikser**: play/cue/sync (yalnızca tempo eşitler, faz senin kulağında), tempo ±6/8/16, trim, 3 bant EQ (kill), tek düğme filtre, kanal fader, crossfader, master limiter, canlı seviye ölçerler. Tempo değişince perde de değişir (key lock yok).
- **DDJ-FLX2**: Web MIDI (bilgisayarda Chrome/Edge). Hazır eşleme yok: "Öğret" ile her kontrol bir kez tanıtılır ve tarayıcıda saklanır. Pad'ler provada karar 1–6 olarak da öğretilebilir. iPad/Safari Web MIDI desteklemez; orada deck'ler dokunmatikle kullanılır.
- **Stem'ler**: yerel Demucs yardımcısı (aşağıda). Vokal/davul/bas/diğer olarak ayrılır, deck'te pad'lerle açılıp kapanır.

### Stem yardımcısı

```bash
# bir kez: Python 3.10+, ffmpeg, Demucs
pip install demucs
cd floor/stems-helper
python server.py                     # http://127.0.0.1:7777
python server.py --device mps        # Apple Silicon'da daha hızlı
python server.py --allow-origin https://KULLANICI.github.io   # site Pages'teyse
python -m unittest test_server.py    # protokol testleri (ffmpeg gerekir)
```

Yardımcı yalnızca 127.0.0.1'i dinler, izinli sitelere CORS verir ve iş bitince dosyaları siler. `--fake` yalnızca testtir: Demucs yerine kaba ffmpeg filtreleri kullanır ve arayüz bunu "test stem" diye işaretler.

## Akış

Studio → Room Builder → Night Arc → Rehearsal (kararlar + curveball’lar) → Debrief → kaydet → yeniden aç.

- **Studio**: “Tonight” örnek gecesi, Resume / Build a night / Quick rehearsal, üç senaryo, kayıtlı geceler, JSON dışa/içe aktarma.
- **Room Builder**: 5 mekân (her birinin sosyal çekim, yorulma hızı, enerji toleransı farklı), süre, kişi, başlangıç enerjisi, yön, hit beklentisi, açıklık, kalabalık yapısı, hedef. Plan anında güncellenir.
- **Night Arc**: sürüklenebilir enerji eğrisi (noktalar = enerji, sınırlar = süre, toplam korunur), klavye ve liste alternatifi, toplam/etkinlik süresi kontrolü.
- **Rehearsal**: duvar saatine bağlı simülasyon dakikası (kare hızından bağımsız), 5 dakikada bir karar, 1–6 klavye kısayolları, duraklat/devam/baştan, hız, olay ekleme, erken bitirme.
- **Debrief**: plan/oda enerji grafiği, dönüm noktaları, grup tepkileri, iyi karar, zayıf an, curveball dersleri ve FLX2 pratik görevi — hepsi kayıtlı kararlardan türetilir.

## Mimari

- `src/sim/` — UI’dan bağımsız, saf ve deterministik motor. Gece = (oda, akış, seed, olay günlüğü)’nün saf fonksiyonu; kayıtta yalnızca günlük tutulur, durum her açılışta yeniden üretilir.
- `src/store/` — sürümlü localStorage, zod doğrulaması, bozuk/eski kayıt kurtarma, JSON içe/dışa aktarma.
- `src/ui/` — React + TypeScript, SVG mekân planı ve grafikler, CSS değişkenli tasarım tokenları.
- `src/i18n/tr.ts` — merkezi arayüz metinleri (varsayılan Türkçe).
