import { fitArcToDuration, makeSection } from './arc';
import { VENUES } from './content';
import type { ArcSection, DirectionId, GoalId, RoomConfig, Scenario, ScheduledCurveball, VenueId } from './types';

export const SCENARIOS: Scenario[] = [
  {
    id: 'sunset',
    title: 'Sunset to Afterdark',
    tagline: 'Rooftop · 35 kişi · 75 dk',
    brief: 'Gün batımında sakin Afro House ile açılış; hava karardıkça daha hareketli bir atmosfere geçiş. Sabır ödüllendirilir.',
    seed: 3519,
    room: {
      venue: 'rooftop',
      duration: 75,
      people: 35,
      startEnergy: 22,
      direction: 'afro',
      hitExpectation: 40,
      openness: 65,
      goal: 'peak',
      shares: { groove: 45, hits: 25, explorers: 30 },
    },
    arc: [
      makeSection('arrival', 10, 26, 'deep', 'low', 'Gün batımı. Müzik manzaraya eşlik etsin.', 'su1'),
      makeSection('warmup', 15, 40, 'afro', 'low', 'Perküsyon önde, vokal yoğunluğu düşük.', 'su2'),
      makeSection('lift', 15, 58, 'afro', 'mid', 'Hava kararıyor; bir chant vokalle ilk kıpırtı.', 'su3'),
      makeSection('peak', 15, 78, 'melodic', 'mid', 'Uzun melodik yükseliş, tek büyük an.', 'su4'),
      makeSection('release', 10, 56, 'melodic', 'low', 'Zirveden sonra kontrollü iniş.', 'su5'),
      makeSection('closing', 10, 40, 'deep', 'mid', 'Sıcak bir kapanış, herkes yavaşça dağılsın.', 'su6'),
    ],
    curveballs: [
      { id: 'popRequest', minute: 20 },
      { id: 'directionFlop', minute: 45 },
    ],
    pattern: 'Isınmayı acele etmeden uzatmak, zirveden önce gerilim kurmak ve vokali yalnızca lift bölümünde bir kez kullanmak.',
  },
  {
    id: 'anthems',
    title: 'Friends Want Anthems',
    tagline: 'House party · 20 kişi · 60 dk',
    brief: 'Arkadaşlar 2010–2020’lerin tanıdık pop enerjisini istiyor. House yönünü kaybetmeden hitleri dengede tutmak gerekiyor.',
    seed: 2060,
    room: {
      venue: 'house',
      duration: 60,
      people: 20,
      startEnergy: 38,
      direction: 'disco',
      hitExpectation: 85,
      openness: 35,
      goal: 'balanced',
      shares: { groove: 25, hits: 55, explorers: 20 },
    },
    arc: [
      makeSection('arrival', 5, 36, 'disco', 'high', 'Tanıdık sample’larla odayı ısıt.', 'an1'),
      makeSection('warmup', 10, 46, 'disco', 'high', 'Funky bas, yer yer bilinen nakaratlar.', 'an2'),
      makeSection('lift', 15, 60, 'afro', 'mid', 'House’a yaslan; hitleri seyrek tut.', 'an3'),
      makeSection('peak', 15, 76, 'anthems', 'high', 'Herkesin bağırarak söylediği bölüm.', 'an4'),
      makeSection('release', 8, 56, 'disco', 'mid', 'Nefes al, ama dansı bırakma.', 'an5'),
      makeSection('closing', 7, 48, 'anthems', 'high', 'Sonu herkesin bildiği bir şarkıyla bağla.', 'an6'),
    ],
    curveballs: [
      { id: 'crowdShift', minute: 15 },
      { id: 'chatty', minute: 35 },
    ],
    pattern: 'Vokalleri house parçalarıyla dönüşümlü kullanmak; hit grubunu kazanırken groove grubunu tamamen bırakmamak.',
  },
  {
    id: 'longnight',
    title: 'Small Room, Long Night',
    tagline: 'Small bar · 45 kişi · 120 dk',
    brief: 'Dar ve sıcak bir bar, iki saatlik set. Senden önceki DJ yüksek bitirdi. Enerjiyi erken tüketmemek her şey.',
    seed: 4512,
    room: {
      venue: 'bar',
      duration: 120,
      people: 45,
      startEnergy: 34,
      direction: 'afro',
      hitExpectation: 55,
      openness: 50,
      goal: 'stamina',
      shares: { groove: 40, hits: 30, explorers: 30 },
    },
    arc: [
      makeSection('arrival', 15, 44, 'afro', 'low', 'Devraldığın enerjiden kendi seviyene in.', 'ln1'),
      makeSection('warmup', 20, 42, 'afro', 'low', 'Uzun groove, düşük vokal.', 'ln2'),
      makeSection('lift', 20, 58, 'afro', 'mid', 'Yavaş yükselt, barı piste çek.', 'ln3'),
      makeSection('peak', 15, 72, 'disco', 'mid', 'İlk zirve; tamamını harcama.', 'ln4'),
      makeSection('release', 15, 50, 'melodic', 'low', 'Bilinçli nefes: insanlar su alsın.', 'ln5'),
      makeSection('peak', 15, 74, 'anthems', 'high', 'İkinci zirve, tanıdık vokallerle.', 'ln6'),
      makeSection('closing', 20, 42, 'deep', 'mid', 'Yavaş ve sıcak iniş.', 'ln7'),
    ],
    curveballs: [
      { id: 'hotHandover', minute: 0 },
      { id: 'earlyTired', minute: 40 },
    ],
    pattern: 'Erken dönemde nefes alanı açmak, iki zirve arasında gerçek bir düşüş bırakmak ve yoğunluğu 70’in üzerinde 15 dakikadan uzun tutmamak.',
  },
];

export function scenarioById(id: string | null | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** A reasonable starting arc for a custom room. */
export function defaultArc(room: RoomConfig): ArcSection[] {
  const d = room.direction;
  const start = room.startEnergy;
  const fam = room.hitExpectation > 65 ? 'high' : room.hitExpectation > 35 ? 'mid' : 'low';
  const peak = room.goal === 'peak' ? 82 : room.goal === 'stamina' ? 70 : 75;
  const alt: DirectionId = d === 'anthems' ? 'disco' : d === 'deep' ? 'afro' : d;
  const arc = [
    makeSection('arrival', 10, Math.max(20, start), d === 'anthems' ? 'disco' : 'deep', 'low', 'İnsanlar gelirken odayı tanı.'),
    makeSection('warmup', 15, Math.max(start, 40), alt, 'low', 'Ritmi kur, vokali az tut.'),
    makeSection('lift', 15, 58, alt, fam, 'İlk hareketlenme.'),
    makeSection('peak', 15, peak, room.hitExpectation > 60 ? 'anthems' : 'melodic', fam === 'low' ? 'mid' : 'high', 'Gecenin en yüksek anı.'),
    makeSection('release', 10, 55, alt, 'mid', 'Kontrollü bir nefes.'),
    makeSection('closing', 10, 42, d, 'mid', 'Yumuşak iniş.'),
  ];
  return fitArcToDuration(arc, room.duration);
}

const VENUE_CURVEBALL: Record<VenueId, ScheduledCurveball['id']> = {
  house: 'popRequest',
  rooftop: 'directionFlop',
  bar: 'earlyTired',
  beach: 'chatty',
  afterhours: 'hotHandover',
};

/** Curveballs for a custom room: one tied to the venue, one tied to length. */
export function defaultCurveballs(room: RoomConfig): ScheduledCurveball[] {
  const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5);
  const venueBall = VENUE_CURVEBALL[room.venue];
  const out: ScheduledCurveball[] = [
    { id: venueBall, minute: venueBall === 'hotHandover' ? 0 : round5(room.duration * 0.35) },
  ];
  if (room.duration >= 80) out.push({ id: 'cutShort', minute: round5(room.duration * 0.6) });
  else out.push({ id: room.hitExpectation > 60 ? 'crowdShift' : 'chatty', minute: round5(room.duration * 0.6) });
  return out;
}

export function roomFromVenue(venue: VenueId, prev?: Partial<RoomConfig>): RoomConfig {
  const v = VENUES[venue].defaults;
  return {
    venue,
    duration: v.duration,
    people: v.people,
    startEnergy: v.startEnergy,
    hitExpectation: v.hitExpectation,
    openness: v.openness,
    direction: prev?.direction ?? 'afro',
    goal: prev?.goal ?? ('balanced' as GoalId),
    shares: prev?.shares ?? { groove: 35, hits: 35, explorers: 30 },
  };
}
