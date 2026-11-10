// Geçiş teknikleri kütüphanesi – adımlar DDJ-FLX2 kontrollerine göre yazıldı.
// "A" = çalan (giden) parça, "B" = gelen parça. atBeat: geçiş başlangıcına göre vuruş (0 = A'da fraz başı).

export interface TechStep { atBeat: number; deck: 'A' | 'B' | 'A+B'; text: string }

export interface Technique {
  id: string;
  name: string;
  short: string;
  difficulty: 1 | 2 | 3;
  beats: number; // tipik süre
  bestFor: string;
  howItSounds: string;
  steps: TechStep[];
  mistakes: string[];
  drill: string;
  needs?: string; // ön koşul açıklaması
}

const PREP_SYNC = 'B’yi yükle, SYNC’e bas (veya TEMPO slider ile BPM’i A’ya eşitle). Kulaklık CUE butonuyla B’yi dinle, ilk vuruşa (1) cue noktası koy.';

export const TECHNIQUES: Technique[] = [
  {
    id: 'bass-swap', name: 'Bas Değişimi (EQ Mix)', short: 'İki parça birlikte çalar, baslar fraz başında yer değiştirir.', difficulty: 1, beats: 64,
    bestFor: 'Aynı türde, BPM farkı küçük (≤%4), intro/outro’su olan parçalar (özellikle house, dance-pop, afro).',
    howItSounds: 'Dinleyici geçişi neredeyse fark etmez; yeni parça “içeri süzülür”.',
    needs: 'B’nin en az 8–16 barlık davul introsu ve A’nın outro’su olmalı.',
    steps: [
      { atBeat: -32, deck: 'B', text: PREP_SYNC + ' B kanalında LOW düğmesini tamamen sola (kapalı) çevir, fader’ı aşağıda tut.' },
      { atBeat: 0, deck: 'B', text: 'A’nın fraz başında (1. vuruş) B’de PLAY’e bas. B’nin kanal fader’ını 16 vuruş boyunca yavaşça yukarı al.' },
      { atBeat: 16, deck: 'A+B', text: 'B fader’ı tam açık. Ses kalabalıksa A’nın HI düğmesini biraz kıs.' },
      { atBeat: 32, deck: 'A+B', text: 'TAM fraz başında: A’nın LOW’unu kapat, aynı anda B’nin LOW’unu aç (bas değişimi). İki bas aynı anda çalmasın!' },
      { atBeat: 48, deck: 'A', text: 'A’nın MID ve HI’ını yavaşça kıs, sonra fader’ını indir.' },
      { atBeat: 64, deck: 'A', text: 'A’yı durdur (PLAY). A’nın EQ’larını ortaya (12 yönü) geri al ki bir sonraki parça hazır olsun.' },
    ],
    mistakes: ['İki bası aynı anda açık bırakmak (ses çamurlaşır, hoparlör “uğuldar”).', 'Fraz ortasında başlatmak: B’yi her zaman 1. vuruşta ve fraz başında başlat.', 'SYNC açıkken jog’u itip grid’i kaydırmak.'],
    drill: 'İki house parçası seç. Sadece bas değişimini 5 kez yap; her seferinde LOW’ları tam 32. vuruşta değiştirmeye odaklan.',
  },
  {
    id: 'long-blend', name: 'Uzun Blend', short: '32+ bar süren, iki parçanın uzun süre birlikte çaldığı geçiş.', difficulty: 2, beats: 128,
    bestFor: 'Aynı tonda/uyumlu ton (Camelot ±1) ve aynı BPM’deki house/afro parçaları.',
    howItSounds: 'İki parça bir süre yeni bir “üçüncü parça” gibi birlikte akar — kulüp DJ’lerinin imza tekniği.',
    needs: 'Tonların uyumlu olması şart; değilse melodiler çakışır.',
    steps: [
      { atBeat: -32, deck: 'B', text: PREP_SYNC + ' B’de LOW kapalı, MID biraz kısık.' },
      { atBeat: 0, deck: 'B', text: 'Fraz başında B’yi başlat; fader’ı 32 vuruşta aç.' },
      { atBeat: 32, deck: 'B', text: 'B’nin MID’ini ortaya getir. İki parçanın melodisinin uyumunu kulaklıkla kontrol et.' },
      { atBeat: 64, deck: 'A+B', text: 'Fraz başında bas değişimi: A LOW kapalı, B LOW açık.' },
      { atBeat: 96, deck: 'A', text: 'A’nın HI ve MID’ini kıs, A’nın fader’ını yavaşça indir.' },
      { atBeat: 128, deck: 'A', text: 'A’yı durdur, EQ’ları sıfırla.' },
    ],
    mistakes: ['Ton uyumsuz parçaları uzun blend etmek.', 'Vokal kısımlarını üst üste bindirmek.'],
    drill: 'Aynı Camelot kodundaki iki parçayla 32 bar boyunca ikisini birlikte çalmayı dene; EQ ile hangisinin “önde” olduğunu değiştir.',
  },
  {
    id: 'filter', name: 'Filtre Geçişi (CFX)', short: 'CFX düğmesiyle frekansları süzerek geçiş.', difficulty: 1, beats: 32,
    bestFor: 'Tonlar tam uyumlu değilse, BPM farkı orta düzeydeyse veya tür değişiyorsa.',
    howItSounds: 'Giden parça “uzaklaşıyor/incelir”, gelen parça yavaşça “açılır”.',
    steps: [
      { atBeat: -16, deck: 'B', text: PREP_SYNC + ' Smart CFX kapalıyken CFX düğmesi klasik filtre gibi çalışır. B’nin CFX’ini basları kesen (high-pass) yöne çevir.' },
      { atBeat: 0, deck: 'B', text: 'Fraz başında B’yi başlat ve fader’ı aç (B şu an ince ve uzak duyulur).' },
      { atBeat: 0, deck: 'A', text: 'A’nın CFX’ini yavaşça high-pass yönüne çevirmeye başla (A incelir).' },
      { atBeat: 16, deck: 'B', text: 'B’nin CFX’ini yavaşça ortaya (filtre kapalı) getir.' },
      { atBeat: 32, deck: 'A+B', text: 'Fraz başında: B’nin CFX’i tam ortada, A’nın fader’ını indir. A’nın CFX’ini ortaya geri al.' },
    ],
    mistakes: ['Filtreyi çok hızlı çevirmek (16–32 vuruşa yay).', 'Geçişten sonra CFX’i ortada bırakmayı unutmak.'],
    drill: 'Tek bir parçada CFX’i 16 vuruşta sonuna kadar çevirip 16 vuruşta geri getir; sayarak yap.',
  },
  {
    id: 'echo-out', name: 'Eko ile Çıkış', short: 'Giden parçaya eko verip durdur, gelen parçayı 1. vuruşta başlat.', difficulty: 1, beats: 8,
    bestFor: 'BPM farkı büyükse, tür değişiyorsa (ör. house → hip-hop) veya vokaller çakışacaksa. Open-format DJ’lerin en çok kullandığı “güvenli” geçiş.',
    howItSounds: 'A yankılanarak sönerken B net bir şekilde girer — tempo farkı hiç hissedilmez.',
    steps: [
      { atBeat: -16, deck: 'B', text: 'B’yi yükle, kulaklıkta dinle ve başlatmak istediğin yere (ilk vuruş veya nakarat) cue/Hot Cue koy. SYNC gerekmez.' },
      { atBeat: -4, deck: 'A', text: 'A’nın fraz sonuna 4 vuruş kala ECHO efektini aç (Pad FX modunda echo pad’i veya rekordbox ekranında Beat FX → ECHO, 1/2 ya da 1 vuruş).' },
      { atBeat: 0, deck: 'A+B', text: 'Fraz başında (1): A’yı durdur (PLAY) — eko kuyruğu çalmaya devam eder — ve aynı anda B’yi başlat.' },
      { atBeat: 8, deck: 'A', text: 'Eko sönünce A’nın efektini kapat.' },
    ],
    mistakes: ['Ekoyu çok erken açmak (son 4 vuruş yeterli).', 'B’yi “1” yerine rastgele bir yerden başlatmak.'],
    drill: 'Farklı BPM’li iki parça seç (ör. 124 → 95). Sadece “4 vuruş eko + 1’de B” hareketini 10 kez çalış.',
  },
  {
    id: 'quick-cut', name: 'Hızlı Kesme (Cut)', short: 'Fraz başında crossfader ile anında geçiş.', difficulty: 1, beats: 4,
    bestFor: 'Hip-hop, pop, Türkçe pop; kısa parçalar; aynı veya yakın BPM.',
    howItSounds: 'Enerjik ve net — open-format setlerde hızlı akışı sağlar.',
    steps: [
      { atBeat: -16, deck: 'B', text: 'B’yi yükle; başlatmak istediğin yere (genelde güçlü bir giriş: vokal girişi, nakarat, drop) Hot Cue koy. BPM yakınsa SYNC’e bas.' },
      { atBeat: -8, deck: 'A+B', text: 'Crossfader’ı A tarafında tut, B’nin kanal fader’ını önceden yukarı al (crossfader B’yi susturuyor).' },
      { atBeat: 0, deck: 'A+B', text: 'A’nın fraz sonundaki “1”de: B’nin Hot Cue’suna bas ve aynı anda crossfader’ı hızla B tarafına çek.' },
    ],
    mistakes: ['Fraz ortasında kesmek (kulak bunu hemen “hata” olarak algılar).', 'Kesmeden önce B’nin seviyesini (TRIM/gain) kontrol etmemek.'],
    drill: 'Bir hip-hop parçasında 8 barı say ve her 8 barın sonunda başka bir parçaya kes. Sayma alışkanlığı geçişin %80’idir.',
  },
  {
    id: 'hook-drop', name: 'Nakarata Giriş (Hook Drop)', short: 'A’nın nakaratı biterken B’ye doğrudan nakaratından gir.', difficulty: 2, beats: 4,
    bestFor: 'Türkçe pop, yabancı pop, hip-hop – herkesin bildiği parçalar. Transition videolarındaki en etkili anlar genelde budur.',
    howItSounds: 'Kalabalık bir nakarattan diğerine geçer; enerji hiç düşmez.',
    steps: [
      { atBeat: -32, deck: 'B', text: 'B’yi kulaklıkta dinle, nakaratın 1. vuruşuna Hot Cue (pad 1) koy. BPM farkı ≤%6 ise SYNC aç.' },
      { atBeat: -4, deck: 'A', text: 'A’nın nakaratı bitmek üzere: son 4 vuruşu say (isteğe bağlı: A’nın CFX’ini hafif çevir).' },
      { atBeat: 0, deck: 'A+B', text: 'Nakarat bittiği anda (yeni fraz “1”): B’nin Hot Cue’suna bas, crossfader’ı B’ye çek veya A’nın fader’ını kapat.' },
    ],
    mistakes: ['Nakaratın ortasında atlamak.', 'İki farklı tonda nakaratı arka arkaya koymak (çok sert gelebilir; eko ekle).'],
    drill: 'Sevdiğin 5 parçanın nakaratlarına Hot Cue koy. Parçaları sadece nakarattan nakarata geçerek çal.',
  },
  {
    id: 'loop-out', name: 'Loop ile Uzatma', short: 'Outro’su olmayan parçayı loop ile uzatıp ona outro yarat.', difficulty: 2, beats: 32,
    bestFor: 'Radyo edit’ler, outro’su olmayan pop/Türkçe pop parçaları.',
    howItSounds: 'Parça sanki DJ için yapılmış uzun bir outro’ya sahipmiş gibi davranır.',
    steps: [
      { atBeat: -16, deck: 'A', text: 'A’nın son temiz (vokalsiz, ritimli) 4 veya 8 vuruşluk bölümünü bul. Beat Loop pad moduyla (veya rekordbox ekranındaki loop butonuyla) 4/8 vuruşluk loop kur.' },
      { atBeat: 0, deck: 'B', text: 'A loop’ta dönerken B’yi fraz başında başlat ve Bas Değişimi ya da Filtre adımlarını uygula.' },
      { atBeat: 32, deck: 'A', text: 'B tamamen geçince A’nın loop’unu kapat ve A’yı durdur.' },
    ],
    mistakes: ['Vokal içeren bölümü loop’lamak (tekrar eden vokal çok belli olur).', 'Loop’u vuruşun dışında başlatmak (Quantize açık olsun).'],
    drill: 'Bir pop parçasının son nakaratından sonra 4 vuruşluk loop kur, 16 vuruş say, loop’tan çık.',
  },
  {
    id: 'smart-fader', name: 'Smart Fader Geçişi', short: 'FLX2’nin Smart Fader özelliği BPM, bas ve sesi otomatik ayarlar.', difficulty: 1, beats: 32,
    bestFor: 'İlk aylarında BPM farkı olan (%4–%15) parçaları denerken. Öğrenme aşaması için güvenli ağ.',
    howItSounds: 'Kolay ve temiz; ancak her geçiş birbirine benzer.',
    steps: [
      { atBeat: -16, deck: 'B', text: 'B’yi yükle, cue noktasını ayarla. Smart Fader butonunu aç.' },
      { atBeat: 0, deck: 'B', text: 'Fraz başında B’yi başlat.' },
      { atBeat: 0, deck: 'A+B', text: 'Crossfader’ı (veya fader’ları) 16–32 vuruşta yavaşça B’ye kaydır; tempo ve bas otomatik ayarlanır.' },
      { atBeat: 32, deck: 'A', text: 'A’yı durdur. Sonraki geçişlerde aynısını manuel EQ ile dene.' },
    ],
    mistakes: ['Hep Smart Fader’a güvenip EQ ve fraz saymayı öğrenmemek.'],
    drill: 'Aynı geçişi önce Smart Fader ile, sonra Bas Değişimi ile yap; farkı dinle.',
  },
  {
    id: 'smart-cfx', name: 'Smart CFX ile Build-up', short: 'Giden parçada Smart CFX ile gerilim yükselt, sonra kes.', difficulty: 1, beats: 16,
    bestFor: 'EDM/dance ve enerjiyi yükselten geçişler; hızlı kesme veya eko öncesi.',
    howItSounds: 'Bir “yükselme” hissi; ardından gelen drop daha güçlü vurur.',
    steps: [
      { atBeat: -16, deck: 'A', text: 'Smart CFX’i aç (Serato/rekordbox’ta seçili Smart FX). A’nın son 16 vuruşunda CFX düğmesini yavaşça çevir — efekt miktarı artar.' },
      { atBeat: 0, deck: 'A+B', text: 'Fraz başında A’yı kes (crossfader/fader) ve B’yi drop’undan veya 1. vuruşundan başlat.' },
      { atBeat: 1, deck: 'A', text: 'A’nın CFX düğmesini ortaya geri al.' },
    ],
    mistakes: ['Efekti açık bırakmak.', 'Her geçişte kullanmak (etkisini kaybeder).'],
    drill: 'Bir parçanın breakdown’ında Smart CFX ile 16 vuruşluk build-up yap ve drop’a tam 1’de dön.',
  },
  {
    id: 'tempo-ride', name: 'Tempo Kaydırma', short: 'BPM’i birkaç parça boyunca yavaşça değiştirerek blok geçişi.', difficulty: 2, beats: 0,
    bestFor: 'Bir tür bloğundan diğerine BPM köprüsü kurarken (ör. 100 → 110 → 120).',
    howItSounds: 'Kimse fark etmeden setin temposu yükselir.',
    steps: [
      { atBeat: 0, deck: 'A', text: 'Parça tek başına çalarken TEMPO slider’ını 30–60 saniyede en fazla %2–3 oynat (Master Tempo/Key Lock açık olsun ki ton değişmesin).' },
      { atBeat: 0, deck: 'B', text: 'Sonraki parçayı bu yeni BPM’e SYNC ile eşle.' },
    ],
    mistakes: ['Tek seferde %6’dan fazla oynatmak (vokaller bozulur).', 'Key Lock kapalıyken tempo değiştirmek.'],
    drill: 'Bir parçayı çalarken tempoyu 1 dakikada 120’den 123’e çıkar; kimseye fark ettirme.',
  },
  {
    id: 'wordplay', name: 'Söz Oyunu Geçişi', short: 'A’daki bir sözü, B’deki aynı/benzer sözle “cevaplamak”.', difficulty: 3, beats: 4,
    bestFor: 'Transition videolarındaki en yaratıcı geçişler. Aynı kelime/isim geçen parçalar.',
    howItSounds: 'Esprili ve akılda kalıcı — kalabalık bağırarak tepki verir.',
    steps: [
      { atBeat: -32, deck: 'B', text: 'B’de A’daki sözle bağlantılı satırın başına Hot Cue koy (uygulama sözleri otomatik bulamaz; bu yaratıcı kısım senin).' },
      { atBeat: -2, deck: 'A', text: 'A’da ilgili söz söylenirken (son 1–2 vuruş) A’ya eko aç.' },
      { atBeat: 0, deck: 'A+B', text: 'Söz biter bitmez B’nin Hot Cue’suna bas, A’yı kapat.' },
    ],
    mistakes: ['Zamanlamayı kaçırmak: önce kulaklıkta 3–4 kez prova et.'],
    drill: 'Aynı kelimenin geçtiği iki parça bul (ör. “gece”, “dans”, bir isim). Bu geçişi kaydedip dinle.',
  },
];

export const TECH_BY_ID: Record<string, Technique> = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t]));
