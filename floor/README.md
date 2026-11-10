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
