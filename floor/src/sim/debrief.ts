// Debrief generation – every sentence is derived from the actual event log and
// the replayed snapshots. Nothing here is canned per scenario.
import { CURVEBALLS, DIRECTIONS, GOALS, GROUPS, MOVES } from './content';
import { plannedEnergyAt, sectionIndexAt, SECTION_LABEL } from './arc';
import { DECISION_EVERY, roomEnergy, run, type RunResult, type SimConfig } from './engine';
import type { GroupId, SimEvent, SimState, Snapshot } from './types';
import { GROUP_IDS } from './types';

const WINDOW = DECISION_EVERY;

export interface EventImpact {
  index: number;
  event: SimEvent;
  label: string;
  minute: number;
  /** change in weighted engagement over the following window */
  dEngagement: Record<GroupId, number>;
  dFatigue: number;
  dEnergy: number;
  score: number;
  notes: string[];
}

function weights(cfg: SimConfig): Record<GroupId, number> {
  const s = cfg.room.shares;
  const sum = s.groove + s.hits + s.explorers || 1;
  return { groove: s.groove / sum, hits: s.hits / sum, explorers: s.explorers / sum };
}

function snapAt(snaps: Snapshot[], minute: number): Snapshot {
  return snaps[Math.max(0, Math.min(snaps.length - 1, minute))];
}

export function eventLabel(e: SimEvent): string {
  if (e.type === 'move') {
    const m = MOVES[e.move];
    return e.move === 'shift' && e.direction ? `${m.tr} → ${DIRECTIONS[e.direction].name}` : m.tr;
  }
  const c = CURVEBALLS[e.id];
  const o = c.options.find((x) => x.id === e.option);
  return `${c.title}: ${o?.label ?? ''}`;
}

const fmt = (n: number) => (n > 0 ? `+${Math.round(n)}` : `${Math.round(n)}`);
const avgFatigue = (s: { groups: Record<GroupId, { fatigue: number }> }) =>
  (s.groups.groove.fatigue + s.groups.hits.fatigue + s.groups.explorers.fatigue) / 3;

/** Context notes explaining *why* an event had the effect it had. */
function contextNotes(cfg: SimConfig, e: SimEvent, before: SimState, prevEvents: SimEvent[], planned: number, energy: number): string[] {
  const notes: string[] = [];
  const fat = avgFatigue(before);
  const late = before.minute / Math.max(1, before.duration);
  if (e.type === 'move') {
    const lastMove = [...prevEvents].reverse().find((x) => x.type === 'move');
    if (lastMove && lastMove.type === 'move' && lastMove.move === e.move && e.move !== 'groove') {
      notes.push('Aynı kararı art arda verdiğin için etkisi azaldı.');
    }
    switch (e.move) {
      case 'breathe':
        if (fat > 40) notes.push(`Yorgunluk yüksekken (≈${Math.round(fat)}) verildi; pist toparlanmaya ihtiyaç duyuyordu.`);
        else if (fat < 15 && late < 0.8) notes.push('Pist henüz yorgun değilken verildi; düşüş biraz erken geldi.');
        if (before.move === 'build') notes.push('Kurulan gerilim karşılıksız kaldı.');
        break;
      case 'intensify':
        if (before.move === 'build' && before.tension > 12) notes.push('Önceden kurulan gerilim karşılığını buldu.');
        if (energy > planned + 12) notes.push('Plana göre enerji zaten yüksekti; yoğunluk erken yükseldi.');
        if (fat > 50) notes.push('Yorgun bir pistte yoğunluk artışı kısa ömürlü olur.');
        if (late > 0.85) notes.push('Gecenin sonuna çok yakın; kapanış için alan daralıyor.');
        break;
      case 'vocal': {
        const uses = prevEvents.filter((x) => x.type === 'move' && x.move === 'vocal').length + 1;
        if (uses >= 3) notes.push(`Bu gecenin ${uses}. belirgin vokaliydi; tanıdıklığın etkisi azalıyor.`);
        if (cfg.room.hitExpectation < 40) notes.push('Bu odada hit beklentisi düşük.');
        break;
      }
      case 'shift': {
        const shifts = prevEvents.filter((x) => x.type === 'move' && x.move === 'shift').length + 1;
        if (shifts >= 3) notes.push(`${shifts}. yön değişikliği; bütünlük hissi zayıflıyor.`);
        if (cfg.room.openness > 60) notes.push('Yeni müziğe açık bir oda; yön değişikliği daha kolay kabul gördü.');
        break;
      }
      case 'build':
        if (energy > 70) notes.push('Zaten yüksek bir enerjide gerilim kurmak yorgunluğu hızlandırır.');
        break;
      case 'groove':
        if (before.moveAge > 12 && before.move === 'groove') notes.push('Uzun süre aynı akışta kalındı; keşif grubu sıkılmaya başlayabilir.');
        break;
    }
  } else {
    const opt = CURVEBALLS[e.id].options.find((o) => o.id === e.option);
    if (opt) notes.push(opt.outcome);
  }
  return notes;
}

export function eventImpacts(cfg: SimConfig, events: SimEvent[], result: RunResult): EventImpact[] {
  const w = weights(cfg);
  const sorted = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.minute - b.e.minute || a.i - b.i);
  return sorted.map(({ e }, k) => {
    const before = result.before[k];
    const s0 = snapAt(result.snapshots, e.minute);
    const s1 = snapAt(result.snapshots, e.minute + WINDOW);
    // the event happens *at* minute; snapshot at minute is pre-event. Compare to the pre-event state.
    const dEng = {} as Record<GroupId, number>;
    let weighted = 0;
    for (const g of GROUP_IDS) {
      const b = before ? before.groups[g].engagement : s0.groups[g].engagement;
      dEng[g] = s1.groups[g].engagement - b;
      weighted += dEng[g] * w[g];
    }
    const fBefore = before ? avgFatigue(before) : avgFatigue(s0);
    const dFat = avgFatigue(s1) - fBefore;
    const dEnergy = s1.energy - s0.energy;
    const arcGap = Math.abs(s1.energy - s1.planned) - Math.abs(s0.energy - s0.planned);
    const score = weighted - Math.max(0, dFat) * 0.45 + Math.max(0, -dFat) * 0.25 - arcGap * 0.2;
    const prev = sorted.slice(0, k).map((x) => x.e);
    return {
      index: k,
      event: e,
      label: eventLabel(e),
      minute: e.minute,
      dEngagement: dEng,
      dFatigue: dFat,
      dEnergy,
      score,
      notes: before ? contextNotes(cfg, e, before, prev, s0.planned, s0.energy) : [],
    };
  });
}

/** One-line live feedback right after a decision (uses instant deltas). */
export function instantFeedback(cfg: SimConfig, e: SimEvent, before: SimState, after: SimState, prev: SimEvent[]): string {
  const parts: string[] = [];
  const ranked = GROUP_IDS.map((g) => ({ g, d: after.groups[g].engagement - before.groups[g].engagement }))
    .filter((x) => Math.abs(x.d) >= 1.5)
    .sort((a, b) => b.d - a.d);
  const ups = ranked.filter((x) => x.d > 0).map((x) => GROUPS[x.g].name);
  const downs = ranked.filter((x) => x.d < 0).map((x) => GROUPS[x.g].name);
  const head = eventLabel(e);
  if (ups.length) parts.push(`${ups.join(' ve ')} ilgisi arttı`);
  if (downs.length) parts.push(`${downs.join(' ve ')} biraz geri çekildi`);
  const dir = after.targetIntensity - before.intensity;
  if (dir > 8) parts.push('yoğunluk önümüzdeki dakikalarda yükselecek');
  if (dir < -8) parts.push('yoğunluk birkaç dakika içinde inecek');
  if (e.type === 'move' && e.move === 'build') parts.push('gerilim birikmeye başlıyor; karşılığını vermezsen boşa gider');
  const notes = contextNotes(cfg, e, before, prev, planned(cfg, before.minute), energyOf(cfg, before));
  const body = parts.length ? parts.join('; ') + '.' : 'Oda şimdilik aynı yerde.';
  return `${head}: ${capitalize(body)}${notes.length ? ' ' + notes.join(' ') : ''}`;
}

function capitalize(s: string) {
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

function planned(cfg: SimConfig, minute: number) {
  return plannedEnergyAt(cfg.arc, minute, cfg.room.duration);
}
function energyOf(cfg: SimConfig, s: SimState) {
  return roomEnergy(s, cfg.room);
}

export interface GroupReaction {
  group: GroupId;
  start: number;
  end: number;
  avg: number;
  avgFloor: number;
  best?: EventImpact;
  worst?: EventImpact;
  text: string;
}

export interface Metric {
  id: 'arc' | 'stamina' | 'balance';
  label: string;
  value: number;
  text: string;
}

export interface Debrief {
  minutes: number;
  endedEarly: boolean;
  peakEarly: boolean;
  metrics: Metric[];
  flow: string;
  goal: { achieved: boolean; text: string };
  turningPoints: EventImpact[];
  groups: GroupReaction[];
  best?: EventImpact;
  worst?: { minute: number; title: string; text: string };
  practice: { title: string; task: string; why: string };
  stats: { decisions: number; vocals: number; shifts: number; breathes: number; maxIntensityRun: number };
  lessons: string[];
}

function longestRun(snaps: Snapshot[], pred: (s: Snapshot) => boolean): { len: number; start: number } {
  let best = { len: 0, start: 0 };
  let cur = 0;
  let start = 0;
  snaps.forEach((s, i) => {
    if (pred(s)) {
      if (cur === 0) start = i;
      cur++;
      if (cur > best.len) best = { len: cur, start };
    } else cur = 0;
  });
  return best;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function buildDebrief(cfg: SimConfig, events: SimEvent[]): Debrief {
  const result = run(cfg, events, Number.MAX_SAFE_INTEGER);
  const snaps = result.snapshots;
  const impacts = eventImpacts(cfg, events, result);
  const w = weights(cfg);
  const total = result.state.minute;
  const stoppedByUser = cfg.stopAt !== undefined && total >= cfg.stopAt && total < result.state.duration;
  const endedEarly = total < cfg.room.duration;

  // --- metrics ---
  const dev = mean(snaps.map((s) => Math.abs(s.energy - s.planned)));
  const arcScore = Math.round(Math.max(0, 100 - dev * 3.5));
  const third = snaps.slice(Math.floor(snaps.length * 0.66));
  const fatigueLate = mean(third.map((s) => avgFatigue(s)));
  const floorLate = mean(third.map((s) => GROUP_IDS.reduce((a, g) => a + s.groups[g].floor * w[g], 0)));
  const peakFatigue = Math.max(...snaps.map((s) => avgFatigue(s)));
  const staminaScore = Math.round(Math.max(0, Math.min(100, 100 - peakFatigue * 0.6 - fatigueLate * 0.4 + (floorLate - 0.5) * 30)));
  const groupAvg = GROUP_IDS.map((g) => mean(snaps.map((s) => s.groups[g].engagement)));
  const spread = Math.max(...groupAvg) - Math.min(...groupAvg);
  const balanceScore = Math.round(Math.max(0, 100 - spread * 2.2));

  const metrics: Metric[] = [
    {
      id: 'arc',
      label: 'Plana uyum',
      value: arcScore,
      text: `Oda enerjisi planladığın eğriden ortalama ${Math.round(dev)} puan uzakta kaldı.`,
    },
    {
      id: 'stamina',
      label: 'Pist dayanıklılığı',
      value: staminaScore,
      text: `En yüksek ortalama yorgunluk ${Math.round(peakFatigue)}; son üçte birde pistin ≈%${Math.round(floorLate * 100)}’i doluydu.`,
    },
    {
      id: 'balance',
      label: 'Oda dengesi',
      value: balanceScore,
      text: `Gruplar arasındaki ortalama ilgi farkı ${Math.round(spread)} puan.`,
    },
  ];

  // --- flow narrative ---
  const peakSnap = snaps.reduce((a, b) => (b.energy > a.energy ? b : a), snaps[0]);
  const plannedPeakMinute = snaps.reduce((a, b) => (b.planned > a.planned ? b : a), snaps[0]).minute;
  const peakSec = cfg.arc[sectionIndexAt(cfg.arc, peakSnap.minute, cfg.room.duration)];
  const early = peakSnap.minute < plannedPeakMinute - 10;
  const late = peakSnap.minute > plannedPeakMinute + 10;
  const highRun = longestRun(snaps, (s) => s.intensity > 70);
  const lowRun = longestRun(snaps, (s) => s.energy < 35);
  const flowParts = [
    `Gecenin en yüksek anı ${peakSnap.minute}. dakikada${peakSec ? ` (${SECTION_LABEL[peakSec.kind]})` : ''} geldi; oda enerjisi ${Math.round(peakSnap.energy)}.`,
    early
      ? `Planladığın zirveden yaklaşık ${plannedPeakMinute - peakSnap.minute} dakika önce — enerjiyi erken harcadın.`
      : late
        ? `Planladığın zirveden ${peakSnap.minute - plannedPeakMinute} dakika sonra; yükseliş beklenenden yavaş kuruldu.`
        : 'Planladığın zirve zamanına yakın.',
  ];
  if (highRun.len >= 12) flowParts.push(`Yoğunluk ${highRun.len} dakika boyunca 70’in üzerinde kaldı (dk ${highRun.start}–${highRun.start + highRun.len}).`);
  if (lowRun.len >= 15 && lowRun.start > 5) flowParts.push(`Dk ${lowRun.start}’den itibaren ${lowRun.len} dakika enerji 35’in altında seyretti.`);
  if (stoppedByUser) flowParts.push(`Provayı ${total}. dakikada sen bitirdin; değerlendirme bu ana kadarki kararlara dayanıyor.`);
  else if (endedEarly) flowParts.push(`Gece planlanandan ${cfg.room.duration - total} dakika erken bitti.`);

  // --- goal ---
  const goal = cfg.room.goal;
  let achieved = false;
  let goalText = '';
  if (goal === 'peak') {
    const floorAtPeak = GROUP_IDS.reduce((a, g) => a + peakSnap.groups[g].floor * w[g], 0);
    achieved = peakSnap.energy >= 72 && floorAtPeak >= 0.62 && !early && arcScore >= 60;
    goalText = `Zirvede pistin ≈%${Math.round(floorAtPeak * 100)}’i doluydu${early ? ', ama zirve erken geldi' : ''}${arcScore < 60 ? '; gecenin geri kalanı plandan çok uzaklaştı' : ''}.`;
  } else if (goal === 'balanced') {
    achieved = spread < 14 && Math.min(...groupAvg) > 45 && staminaScore >= 45;
    goalText = `En düşük grup ortalaması ${Math.round(Math.min(...groupAvg))}, fark ${Math.round(spread)} puan.`;
  } else if (goal === 'convert') {
    const f0 = GROUP_IDS.reduce((a, g) => a + snaps[0].groups[g].floor * w[g], 0);
    const fMax = Math.max(...snaps.map((s) => GROUP_IDS.reduce((a, g) => a + s.groups[g].floor * w[g], 0)));
    achieved = fMax - f0 > 0.35;
    goalText = `Pist doluluğu ≈%${Math.round(f0 * 100)}’den en fazla ≈%${Math.round(fMax * 100)}’e çıktı.`;
  } else {
    achieved = floorLate > 0.55 && fatigueLate < 55 && arcScore >= 50;
    goalText = `Son üçte birde doluluk ≈%${Math.round(floorLate * 100)}, ortalama yorgunluk ${Math.round(fatigueLate)}.`;
  }

  // --- turning points: biggest absolute effects ---
  const turningPoints = [...impacts].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 3).sort((a, b) => a.minute - b.minute);

  // --- groups ---
  const groups: GroupReaction[] = GROUP_IDS.map((g, gi) => {
    const start = snaps[0].groups[g].engagement;
    const end = snaps[snaps.length - 1].groups[g].engagement;
    const avgFloor = mean(snaps.map((s) => s.groups[g].floor));
    const byG = [...impacts].sort((a, b) => b.dEngagement[g] - a.dEngagement[g]);
    const best = byG[0] && byG[0].dEngagement[g] > 2 ? byG[0] : undefined;
    const worstC = byG[byG.length - 1];
    const worst = worstC && worstC.dEngagement[g] < -2 ? worstC : undefined;
    const bits = [`Ortalama ilgi ${Math.round(groupAvg[gi])}, zamanın ≈%${Math.round(avgFloor * 100)}’inde pistteydiler.`];
    if (best) bits.push(`En çok “${best.label}” (dk ${best.minute}) ile açıldılar (${fmt(best.dEngagement[g])}).`);
    if (worst) bits.push(`“${worst.label}” (dk ${worst.minute}) onları geri çekti (${fmt(worst.dEngagement[g])}).`);
    return { group: g, start, end, avg: groupAvg[gi], avgFloor, best, worst, text: bits.join(' ') };
  });

  // --- best / worst ---
  const byScore = [...impacts].sort((a, b) => b.score - a.score);
  const best = byScore[0] && byScore[0].score > 0 ? byScore[0] : undefined;
  let worst: Debrief['worst'];
  const worstImpact = byScore[byScore.length - 1];
  const fatigueRun = longestRun(snaps, (s) => avgFatigue(s) > 60);
  if (fatigueRun.len >= 10 && (!worstImpact || worstImpact.score > -4)) {
    worst = {
      minute: fatigueRun.start,
      title: `Dk ${fatigueRun.start}–${fatigueRun.start + fatigueRun.len}: yorgun pist`,
      text: `Ortalama yorgunluk ${fatigueRun.len} dakika boyunca 60’ın üzerindeydi. Bu aralıkta bir nefes alanı açmak pisti daha uzun ayakta tutardı.`,
    };
  } else if (worstImpact && worstImpact.score < 0 && worstImpact !== best) {
    const losers = GROUP_IDS.filter((g) => worstImpact.dEngagement[g] < -2).map((g) => GROUPS[g].name);
    worst = {
      minute: worstImpact.minute,
      title: `Dk ${worstImpact.minute}: ${worstImpact.label}`,
      text: `${losers.length ? losers.join(' ve ') + ' bu karardan sonra uzaklaştı. ' : ''}${worstImpact.notes.join(' ') || 'Sonraki beş dakikada oda kazanılandan fazlasını kaybetti.'}`,
    };
  } else if (Math.abs(dev) > 10) {
    const gap = snaps.reduce((a, b) => (Math.abs(b.energy - b.planned) > Math.abs(a.energy - a.planned) ? b : a), snaps[0]);
    worst = {
      minute: gap.minute,
      title: `Dk ${gap.minute}: plandan en uzak an`,
      text: `Oda enerjisi ${Math.round(gap.energy)}, planın ${Math.round(gap.planned)} idi. Gecenin geri kalanında bu farkı kapatmak için daha erken davranılabilirdi.`,
    };
  }

  // --- stats ---
  const moves = events.filter((e): e is Extract<SimEvent, { type: 'move' }> => e.type === 'move');
  const stats = {
    decisions: events.length,
    vocals: moves.filter((m) => m.move === 'vocal').length,
    shifts: moves.filter((m) => m.move === 'shift').length,
    breathes: moves.filter((m) => m.move === 'breathe').length,
    maxIntensityRun: highRun.len,
  };

  // --- practice task: pick the most relevant weakness ---
  const practice = pickPractice(cfg, { stats, early, highRun, peakFatigue, spread, groupAvg, arcScore, total, endedEarly: endedEarly && !stoppedByUser });

  const lessons = events
    .filter((e): e is Extract<SimEvent, { type: 'curveball' }> => e.type === 'curveball')
    .map((e) => {
      const o = CURVEBALLS[e.id].options.find((x) => x.id === e.option);
      return o ? `${CURVEBALLS[e.id].title} — ${o.lesson}` : '';
    })
    .filter(Boolean);

  return {
    minutes: total,
    endedEarly,
    peakEarly: early,
    metrics,
    flow: flowParts.join(' '),
    goal: { achieved, text: `${GOALS[goal].tr}: ${achieved ? 'tuttu.' : 'tam tutmadı.'} ${goalText}` },
    turningPoints,
    groups,
    best,
    worst,
    practice,
    stats,
    lessons,
  };
}

interface PracticeInput {
  stats: Debrief['stats'];
  early: boolean;
  highRun: { len: number };
  peakFatigue: number;
  spread: number;
  groupAvg: number[];
  arcScore: number;
  total: number;
  endedEarly: boolean;
}

function pickPractice(cfg: SimConfig, p: PracticeInput): Debrief['practice'] {
  const grooveMinutes = Math.max(8, Math.min(20, Math.round(cfg.room.duration / 6)));
  if (p.stats.vocals >= 3) {
    return {
      title: 'Vokalsiz groove',
      task: `FLX2 üzerinde yoğunluğu artırmadan ${grooveMinutes} dakika groove korumayı dene. Bu sürede en fazla bir belirgin vokal parçası kullan; geçişleri EQ’daki bas düğmesiyle yap.`,
      why: `Bu provada ${p.stats.vocals} belirgin vokal kullandın; her biri bir öncekinden daha az etki yarattı.`,
    };
  }
  if (p.early || p.highRun.len >= 15) {
    const target = Math.max(15, Math.round(cfg.room.duration * 0.3));
    return {
      title: 'Sabırlı yükseliş',
      task: `${target} dakikalık bir mini set hazırla: her geçişte yoğunluğu yalnızca bir kademe artır. Zirve parçasını son 5 dakikaya sakla; öncesinde FLX2’nin filtre (CFX) düğmesini en fazla yarıya kadar aç.`,
      why: p.early ? 'Bu provada zirve planlanandan erken geldi.' : `Yoğunluk ${p.highRun.len} dakika boyunca 70’in üzerinde kaldı.`,
    };
  }
  if (p.peakFatigue > 55 && p.stats.breathes === 0) {
    return {
      title: 'Kontrollü düşüş',
      task: 'Yüksek enerjili bir parçadan sonra bilinçli olarak daha sakin bir parçaya geç. Geçişi 16 vuruşta, bas EQ’yu kısarak ve tempo farkını 3 BPM’in altında tutarak yap; ardından 2 parça içinde enerjiyi geri kur.',
      why: `Pistin ortalama yorgunluğu ${Math.round(p.peakFatigue)}’e çıktı ve hiç nefes alanı açılmadı.`,
    };
  }
  if (p.stats.shifts >= 3) {
    return {
      title: 'Tek yönde derinleş',
      task: 'Tek bir müzikal yönden (örneğin yalnızca Afro House) art arda 5 parça çal. Çeşitliliği tür değiştirerek değil, perküsyon yoğunluğu ve vokal miktarıyla yarat.',
      why: `Bu provada ${p.stats.shifts} kez yön değiştirdin; groove grubu bütünlük hissini kaybetti.`,
    };
  }
  if (p.spread > 16) {
    const low = GROUP_IDS[p.groupAvg.indexOf(Math.min(...p.groupAvg))];
    return {
      title: 'Köprü parçaları',
      task: `${GROUPS[low].name} için en az üç “köprü” parça seç: hem ritmi hem tanıdık bir öğeyi taşıyan house edit’leri. Rekordbox’ta bunları ayrı bir playlist’e koy ve bir provada ikisini art arda çal.`,
      why: `${GROUPS[low].name} grubu gece boyunca diğerlerinden geride kaldı (fark ${Math.round(p.spread)} puan).`,
    };
  }
  if (p.endedEarly) {
    return {
      title: 'Kısa kapanış',
      task: 'Her setin için 10 dakikalık bir “acil kapanış” planı hazırla: 2–3 parça, enerjiyi yumuşakça indiren ve tanıdık bir son parçayla biten. FLX2 hot cue’larına bu parçaların çıkış noktalarını işaretle.',
      why: 'Gece planlanandan erken bitti.',
    };
  }
  if (p.arcScore < 60) {
    return {
      title: 'Eğriyi takip et',
      task: 'Bir sonraki pratikte gecenin enerji eğrisini kâğıda çiz ve her 10 dakikada nerede olduğunu işaretle. Plandan saparsan bunu bilinçli bir karar olarak not et.',
      why: `Oda enerjisi planladığın eğriden belirgin biçimde uzaklaştı (uyum ${p.arcScore}).`,
    };
  }
  return {
    title: 'Bir kademe zor',
    task: `Aynı senaryoyu daha az kararla dene: ${Math.max(3, Math.round(p.stats.decisions * 0.6))} değişiklikte aynı akışı kurmaya çalış. Gerçek pratikte her geçişi en az 32 vuruş uzunluğunda tut.`,
    why: 'Bu prova dengeli geçti; bir sonraki adım daha az müdahaleyle aynı sonucu almak.',
  };
}

