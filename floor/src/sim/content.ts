// Fictional, rule-based content for the simulation. None of these values are
// derived from real audience research – they are visible, editable assumptions.
import type {
  CurveballDef,
  CurveballId,
  DirectionId,
  GoalId,
  GroupId,
  MoveId,
  VenueId,
} from './types';

export interface VenueDef {
  id: VenueId;
  name: string;
  short: string;
  blurb: string;
  /** default sliders */
  defaults: { duration: number; people: number; startEnergy: number; hitExpectation: number; openness: number };
  /** pull towards bar / talking, 0–1 */
  social: number;
  /** multiplier on fatigue build-up (heat, crowding, hour) */
  fatigueRate: number;
  /** shifts every group's comfortable intensity */
  toleranceShift: number;
  capacity: number;
}

export const VENUES: Record<VenueId, VenueDef> = {
  house: {
    id: 'house',
    name: 'House party',
    short: 'Ev partisi',
    blurb: 'Salon pist olur, mutfak bar. Herkes birbirini tanır; tanıdık şarkı beklentisi yüksek.',
    defaults: { duration: 90, people: 25, startEnergy: 35, hitExpectation: 75, openness: 40 },
    social: 0.55,
    fatigueRate: 1.0,
    toleranceShift: 0,
    capacity: 40,
  },
  rooftop: {
    id: 'rooftop',
    name: 'Rooftop sunset',
    short: 'Çatı, gün batımı',
    blurb: 'Açık hava, ferah alan. Gece yavaş açılır; erken yüksek enerji yersiz kalır.',
    defaults: { duration: 75, people: 35, startEnergy: 25, hitExpectation: 50, openness: 60 },
    social: 0.45,
    fatigueRate: 0.85,
    toleranceShift: -4,
    capacity: 60,
  },
  bar: {
    id: 'bar',
    name: 'Small bar',
    short: 'Küçük bar',
    blurb: 'Dar, sıcak, uzun gece. Bar tezgâhı sürekli insan çeker; pist kolay yorulur.',
    defaults: { duration: 120, people: 45, startEnergy: 30, hitExpectation: 55, openness: 45 },
    social: 0.65,
    fatigueRate: 1.15,
    toleranceShift: 0,
    capacity: 60,
  },
  beach: {
    id: 'beach',
    name: 'Beach gathering',
    short: 'Sahil buluşması',
    blurb: 'Kum, rüzgâr, gevşek bir kalabalık. Perküsyon iyi taşır; ritim bozulursa insanlar dağılır.',
    defaults: { duration: 90, people: 50, startEnergy: 30, hitExpectation: 60, openness: 55 },
    social: 0.4,
    fatigueRate: 0.8,
    toleranceShift: 2,
    capacity: 80,
  },
  afterhours: {
    id: 'afterhours',
    name: 'After-hours room',
    short: 'After-hours',
    blurb: 'Gece yarısını çoktan geçmiş, karanlık oda. Dinleyici açık ama yorgun; hit beklentisi düşük.',
    defaults: { duration: 90, people: 40, startEnergy: 55, hitExpectation: 25, openness: 80 },
    social: 0.2,
    fatigueRate: 1.25,
    toleranceShift: 6,
    capacity: 60,
  },
};

export const VENUE_IDS = Object.keys(VENUES) as VenueId[];

export interface GroupDef {
  id: GroupId;
  name: string;
  short: string;
  mark: 'dot' | 'ring' | 'tri';
  /** comfortable musical intensity */
  comfort: number;
  /** preferred vocal familiarity */
  vocalPref: number;
  /** fatigue build-up multiplier */
  stamina: number;
  /** how much they value direction consistency (negative = like change) */
  consistencyWeight: number;
  affinity: Record<DirectionId, number>;
  about: string;
}

export const GROUPS: Record<GroupId, GroupDef> = {
  groove: {
    id: 'groove',
    name: 'Groove odaklılar',
    short: 'Groove',
    mark: 'dot',
    comfort: 64,
    vocalPref: 22,
    stamina: 0.8,
    consistencyWeight: 0.35,
    affinity: { afro: 1, deep: 0.8, melodic: 0.7, disco: 0.6, anthems: 0.2 },
    about: 'Uzun, kesintisiz ritimle açılırlar. Sık kopuş ve art arda hitler onları pistten uzaklaştırır.',
  },
  hits: {
    id: 'hits',
    name: 'Hit isteyenler',
    short: 'Hitler',
    mark: 'ring',
    comfort: 58,
    vocalPref: 78,
    stamina: 1.1,
    consistencyWeight: 0,
    affinity: { anthems: 1, disco: 0.8, afro: 0.45, melodic: 0.4, deep: 0.1 },
    about: 'Tanıdık vokal ve birlikte söylenebilen nakaratlar ister. Hızlı ısınır, hızlı yorulur.',
  },
  explorers: {
    id: 'explorers',
    name: 'Keşfe açıklar',
    short: 'Keşif',
    mark: 'tri',
    comfort: 56,
    vocalPref: 30,
    stamina: 0.9,
    consistencyWeight: -0.2,
    affinity: { melodic: 0.95, afro: 0.85, deep: 0.75, disco: 0.5, anthems: 0.3 },
    about: 'Yeni sesler ve ani olmayan yön değişimleri onları canlı tutar. Uzun tekdüzelikte ilgileri düşer.',
  },
};

export interface DirectionDef {
  id: DirectionId;
  name: string;
  /** baseline vocal familiarity of this music */
  vocal: number;
  /** comfortable intensity of the style */
  lean: number;
  note: string;
}

export const DIRECTIONS: Record<DirectionId, DirectionDef> = {
  afro: { id: 'afro', name: 'Afro House', vocal: 30, lean: 58, note: 'perküsyon önde, chant vokaller' },
  melodic: { id: 'melodic', name: 'Melodic House', vocal: 24, lean: 55, note: 'uzun melodik yükselişler' },
  deep: { id: 'deep', name: 'Deep / Lounge', vocal: 16, lean: 38, note: 'düşük yoğunluk, sıcak bas' },
  disco: { id: 'disco', name: 'Disco House', vocal: 55, lean: 62, note: 'funky bas, tanıdık sample’lar' },
  anthems: { id: 'anthems', name: '2010–20 Anthems', vocal: 88, lean: 66, note: 'parti hitleri, birlikte söylenen nakaratlar' },
};

export const DIRECTION_IDS = Object.keys(DIRECTIONS) as DirectionId[];

export interface MoveDef {
  id: MoveId;
  name: string;
  tr: string;
  hint: string;
  key: string;
}

export const MOVES: Record<MoveId, MoveDef> = {
  groove: { id: 'groove', name: 'Stay in the groove', tr: 'Akışta kal', hint: 'Yoğunluğu ve yönü koru', key: '1' },
  vocal: { id: 'vocal', name: 'Familiar vocal', tr: 'Tanıdık vokal', hint: 'Bilinen bir nakarat getir', key: '2' },
  intensify: { id: 'intensify', name: 'Increase intensity', tr: 'Yoğunluğu artır', hint: 'Bir kademe yukarı', key: '3' },
  breathe: { id: 'breathe', name: 'Breathing space', tr: 'Nefes alanı', hint: 'Kontrollü düşüş', key: '4' },
  shift: { id: 'shift', name: 'Change direction', tr: 'Yön değiştir', hint: 'Başka bir müzikal yöne geç', key: '5' },
  build: { id: 'build', name: 'Build to a peak', tr: 'Zirveye kur', hint: 'Gerilimi yavaşça biriktir', key: '6' },
};

export interface GoalDef {
  id: GoalId;
  name: string;
  tr: string;
  note: string;
}

export const GOALS: Record<GoalId, GoalDef> = {
  balanced: { id: 'balanced', name: 'Keep everyone in', tr: 'Herkesi içeride tut', note: 'Üç grubun ilgisi birbirinden fazla kopmasın.' },
  peak: { id: 'peak', name: 'Land one big peak', tr: 'Tek büyük zirve', note: 'Doğru anda, dolu bir pistle zirveye çık.' },
  convert: { id: 'convert', name: 'Turn talk into dance', tr: 'Sohbeti dansa çevir', note: 'Barda duranları yavaş yavaş piste taşı.' },
  stamina: { id: 'stamina', name: 'Last the whole night', tr: 'Sonuna kadar canlı', note: 'Son üçte birde pist hâlâ dolu ve yorgun olmasın.' },
};

export const CURVEBALLS: Record<CurveballId, CurveballDef> = {
  crowdShift: {
    id: 'crowdShift',
    title: 'Kalabalık değişti',
    context: 'Yeni bir arkadaş grubu geldi; çoğu hit bekliyor. Pistteki groove grubu ise yeni oturmuştu.',
    onset: { engagement: { hits: -10, groove: 2 }, social: 0.12 },
    options: [
      {
        id: 'bridge',
        label: 'Disco house ile köprü kur',
        effect: { direction: 'disco', consistency: -15, engagement: { hits: 8, groove: -3 } },
        outcome: 'Funky bas iki grubu ortada buluşturdu, ama groove biraz gevşedi.',
        lesson: 'Köprü türleri iki kitleyi aynı anda kaybetmeden yön değiştirmenin yoludur.',
      },
      {
        id: 'hold',
        label: 'Akışı bozma, bekle',
        effect: { consistency: 8, engagement: { groove: 5, hits: -6 } },
        outcome: 'Pistteki akış korundu; yeni gelenler barda bekliyor.',
        lesson: 'Zaten dans edenleri korumak, yeni gelenleri hemen kazanmaktan daha değerli olabilir.',
      },
      {
        id: 'anthem',
        label: 'Hemen tanıdık bir hit',
        effect: { vocal: 40, direction: 'anthems', consistency: -30, engagement: { hits: 16, groove: -10, explorers: -6 } },
        outcome: 'Yeni gelenler piste koştu; groove grubu kenara çekildi.',
        lesson: 'Hızlı kazanç ödünç alınmış enerjidir; arkasından ne çalacağını bilmen gerekir.',
      },
    ],
  },
  popRequest: {
    id: 'popRequest',
    title: 'Booth’a istek geldi',
    context: 'Birkaç kişi booth’a gelip 2010’lardan bir parti hiti istiyor. Seti henüz house yönünde tutuyorsun.',
    onset: { engagement: { hits: -6 } },
    options: [
      {
        id: 'edit',
        label: 'Hitin house edit’ini bul',
        effect: { vocal: 28, consistency: -8, engagement: { hits: 10, groove: 1, explorers: 2 } },
        outcome: 'Nakarat tanındı, ritim bozulmadı. İki taraf da kabul etti.',
        lesson: 'İsteği yönüne çevirmek, reddetmekle teslim olmak arasındaki üçüncü yoldur.',
      },
      {
        id: 'later',
        label: '“Birazdan” de, sırayı koru',
        effect: { engagement: { hits: -4, groove: 3 } },
        outcome: 'İstek bekletildi; sözünü tutmazsan bu grup ilgisini kaybedecek.',
        lesson: 'Erteleme ancak geri döndüğünde işe yarar. Bir sonraki kararlarda vokal fırsatını kollamalısın.',
      },
      {
        id: 'straight',
        label: 'Orijinalini hemen çal',
        effect: { vocal: 50, direction: 'anthems', consistency: -35, engagement: { hits: 15, groove: -9, explorers: -7 } },
        outcome: 'İsteyenler çok mutlu; geri kalan pist bir anlığına durdu.',
        lesson: 'İstek doğrudan çalınınca seti yeniden kurmak için bir köprüye ihtiyaç duyarsın.',
      },
    ],
  },
  earlyTired: {
    id: 'earlyTired',
    title: 'Pist erken yoruldu',
    context: 'Sıcak bastırdı; pistin önü terlemiş, bazıları bar tarafına bakıyor. Henüz zirve zamanı değil.',
    onset: { fatigue: { groove: 14, hits: 16, explorers: 12 } },
    options: [
      {
        id: 'dip',
        label: 'Kısa, deep bir ara ver',
        effect: { intensity: -18, setMove: 'breathe', fatigue: { groove: -6, hits: -6, explorers: -6 }, engagement: { hits: -4 } },
        outcome: 'Enerji düştü ama kimse gitmedi; insanlar nefeslendi.',
        lesson: 'Erken bir nefes, sonradan kurulacak zirvenin bedelidir.',
      },
      {
        id: 'vocalLift',
        label: 'Tanıdık bir vokalle tut',
        effect: { vocal: 35, engagement: { hits: 8, groove: -2 }, fatigue: { hits: 4 } },
        outcome: 'Nakarat pisti tuttu, ama yorgunluk sürüyor.',
        lesson: 'Vokal ilgiyi taşır, yorgunluğu almaz.',
      },
      {
        id: 'push',
        label: 'Tempoyu koru, içinden geç',
        effect: { intensity: 4, engagement: { groove: 3 }, fatigue: { groove: 5, hits: 7, explorers: 5 } },
        outcome: 'Pist dolu kaldı, ama yorgunluk birikmeye devam ediyor.',
        lesson: 'Bazen işe yarar; ama bir sonraki düşüşü daha sert yaşarsın.',
      },
    ],
  },
  cutShort: {
    id: 'cutShort',
    title: 'Süre kısaldı',
    context: 'Mekân sorumlusu yanına geldi: gürültü şikâyeti var, 15 dakika erken bitirmen gerekiyor.',
    onset: { durationDelta: -15 },
    options: [
      {
        id: 'compress',
        label: 'Zirveyi öne çek',
        effect: { setMove: 'build', intensity: 6, engagement: { groove: 2, explorers: 2 } },
        outcome: 'Plan sıkıştı; zirveye daha kısa bir yoldan gidiyorsun.',
        lesson: 'Süre kısalınca bölüm atlamak, bütün bölümleri hızlandırmaktan daha temiz olur.',
      },
      {
        id: 'keep',
        label: 'Planı koru, kapanışı kısalt',
        effect: { consistency: 6 },
        outcome: 'Akış bozulmadı; ama kapanışa ayıracak zaman azaldı.',
        lesson: 'Kapanışsız bir gece aniden kesilmiş gibi hissedilir. Son 10 dakikayı korumak önemlidir.',
      },
      {
        id: 'close',
        label: 'Kapanışa şimdi başla',
        effect: { intensity: -12, setMove: 'breathe', engagement: { hits: -3 } },
        outcome: 'Erken ama yumuşak bir iniş başladı.',
        lesson: 'Erken kapanış, kalabalığı tatmin edilmemiş bırakabilir; zirveyi hiç yaşamamış olabilirler.',
      },
    ],
  },
  hotHandover: {
    id: 'hotHandover',
    title: 'Önceki DJ çok yüksek bitirdi',
    context: 'Senden önceki set peak-time techno ile bitti. Oda yüksek enerjide, ama senin planın ısınmayla başlıyor.',
    onset: { intensity: 30, fatigue: { groove: 18, hits: 20, explorers: 16 }, engagement: { groove: 14, hits: 12, explorers: 12 } },
    options: [
      {
        id: 'ride',
        label: 'Enerjiyi devral, yavaşça indir',
        effect: { setMove: 'breathe', intensity: -6, engagement: { groove: 3 } },
        outcome: 'Geçiş hissedilmedi; birkaç parça içinde kendi seviyene indin.',
        lesson: 'Devralırken önce odanın bulunduğu yerden başla, sonra kendi yönüne taşı.',
      },
      {
        id: 'reset',
        label: 'Temiz bir sıfırlama yap',
        effect: { intensity: -30, consistency: -20, engagement: { groove: -10, hits: -12, explorers: -4 }, fatigue: { groove: -8, hits: -8, explorers: -8 } },
        outcome: 'Oda bir anda soğudu; ama yorgunluk da sıfırlandı.',
        lesson: 'Sert sıfırlama dürüst ama pahalıdır; ilk dakikalarda kalabalığın bir kısmını kaybedersin.',
      },
      {
        id: 'match',
        label: 'Aynı yoğunlukta devam et',
        effect: { setMove: 'intensify', engagement: { groove: 4, hits: 4 }, fatigue: { groove: 6, hits: 6, explorers: 6 } },
        outcome: 'Pist dolu ama planın çok önünde, yorgunluk birikiyor.',
        lesson: 'Başkasının zirvesini sürdürmek, kendi zirven için yer bırakmaz.',
      },
    ],
  },
  chatty: {
    id: 'chatty',
    title: 'Oda sohbete döndü',
    context: 'Kalabalık barda toplandı; müzik iyi gidiyor ama insanlar konuşmayı seçiyor.',
    onset: { social: 0.3 },
    options: [
      {
        id: 'lounge',
        label: 'Sohbete eşlik et, sonra çağır',
        effect: { intensity: -8, social: -0.08, setMove: 'groove', engagement: { explorers: 4 } },
        outcome: 'Arka plan oldun; bir süre sonra insanlar kendiliğinden piste dönmeye başladı.',
        lesson: 'Sohbet eden bir odayı zorlamak yerine onunla birlikte nefes almak güven kazandırır.',
      },
      {
        id: 'hook',
        label: 'Herkesin bildiği bir intro',
        effect: { vocal: 42, social: -0.2, engagement: { hits: 12, groove: -3, explorers: -2 } },
        outcome: 'İlk notada başlar döndü; bar yarı yarıya boşaldı.',
        lesson: 'Tanıdık bir intro sosyal odayı ikna etmenin en hızlı yoludur, ama sık kullanılınca gücünü kaybeder.',
      },
      {
        id: 'percussion',
        label: 'Perküsyonu öne al',
        effect: { direction: 'afro', intensity: 6, consistency: -10, social: -0.14, engagement: { groove: 8, explorers: 4, hits: -3 } },
        outcome: 'Ritim barı çekti; önce groove grubu geldi.',
        lesson: 'Perküsyon konuşmanın altında bile hissedilir; vokale başvurmadan çağırabilir.',
      },
    ],
  },
  directionFlop: {
    id: 'directionFlop',
    title: 'Yön karşılık bulmadı',
    context: 'Son iki parçadır melodik bir yöne kaydın; pist dağılmadı ama sessizleşti. Bakışlar booth’a dönüyor.',
    onset: { engagement: { hits: -10, groove: -6, explorers: 3 } },
    options: [
      {
        id: 'commit',
        label: 'Yönde kal, daha güçlü parçayla',
        effect: { intensity: 8, consistency: 10, engagement: { explorers: 6, groove: 2, hits: -4 } },
        outcome: 'Kararlılık bir kısım dinleyiciyi kazandı; hit grubu hâlâ mesafeli.',
        lesson: 'Bir yönü savunmak için daha iyi bir örneğini çalmak, yönü bırakmaktan daha ikna edicidir.',
      },
      {
        id: 'retreat',
        label: 'Bilinen zemine dön',
        effect: { direction: 'afro', consistency: -18, engagement: { groove: 8, hits: 4, explorers: -6 } },
        outcome: 'Pist rahatladı; keşif grubu biraz hayal kırıklığı yaşadı.',
        lesson: 'Geri dönmek yenilgi değildir; deneme yapmak için odaya önce güven vermek gerekir.',
      },
      {
        id: 'blend',
        label: 'İki yönü uzun bir miksle harmanla',
        effect: { consistency: 4, vocal: 10, engagement: { groove: 4, hits: 2, explorers: 3 } },
        outcome: 'Uzun geçiş sessizliği yumuşattı; kimse kaybedilmedi, kimse coşmadı.',
        lesson: 'Uzun miksler riski dağıtır; ama net bir an yaratmaz.',
      },
    ],
  },
};

export const CURVEBALL_IDS = Object.keys(CURVEBALLS) as CurveballId[];
