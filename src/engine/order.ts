// Otomatik set sıralama (beam search) ve playlist değerlendirme
import type { Track } from '../types';
import { ARC_BY_ID } from '../knowledge/playbook';
import { pairScore, planTransition, view, type TransitionPlan } from './transition';

export interface OrderOptions { arc: string; length?: number; startId?: string; beam?: number }

export function scoreMatrix(tracks: Track[]): number[][] {
  return tracks.map((a, i) => tracks.map((b, j) => (i === j ? 0 : pairScore(a, b))));
}

export function autoOrder(tracks: Track[], opts: OrderOptions): Track[] {
  const n = tracks.length;
  if (n <= 2) return [...tracks];
  const L = Math.min(n, Math.max(2, opts.length ?? n));
  const M = scoreMatrix(tracks);
  const energies = tracks.map((t) => view(t).energy);
  const bpms = tracks.map((t) => view(t).bpm ?? 0);
  const arc = ARC_BY_ID[opts.arc] ?? ARC_BY_ID.party;
  const target = (pos: number) => arc.curve(L === 1 ? 0 : pos / (L - 1));
  const usesArc = !Number.isNaN(target(0));
  const W = opts.beam ?? (n > 80 ? 60 : 150);

  const posCost = (idx: number, pos: number) => (usesArc ? 0.09 * Math.abs(energies[idx] - target(pos)) : 0);

  // Her parça için rastgele bir hash; kümenin imzası = XOR toplamı
  const rnd = tracks.map((_, i) => ((i + 1) * 2654435761) >>> 0 ^ ((i * 40503) << 7));
  interface Node { seq: number[]; used: Uint8Array; cost: number; hash: number }
  let beam: Node[] = [];
  const starts = opts.startId ? tracks.map((t, i) => (t.id === opts.startId ? i : -1)).filter((i) => i >= 0) : tracks.map((_, i) => i);
  for (const s of starts) {
    const used = new Uint8Array(n); used[s] = 1;
    // yavaş tempoyla başlamak hafifçe ödüllendirilir (tempo bloklarını yukarı doğru kurmak için)
    const tempoStart = bpms[s] ? 0.002 * Math.max(0, bpms[s] - 100) : 0;
    beam.push({ seq: [s], used, cost: posCost(s, 0) + (usesArc ? tempoStart : 0), hash: rnd[s] });
  }
  beam.sort((a, b) => a.cost - b.cost);
  beam = beam.slice(0, W);

  for (let pos = 1; pos < L; pos++) {
    const cand: { p: number; j: number; cost: number }[] = [];
    beam.forEach((node, p) => {
      const last = node.seq[node.seq.length - 1];
      const prev = node.seq.length >= 2 ? node.seq[node.seq.length - 2] : -1;
      for (let j = 0; j < n; j++) {
        if (node.used[j]) continue;
        let c = node.cost + (1 - M[last][j]) + posCost(j, pos);
        // A-B-A tarzı tür zikzaklarını cezalandır
        if (prev >= 0 && tracks[prev].genre === tracks[j].genre && tracks[last].genre !== tracks[j].genre) c += 0.15;
        cand.push({ p, j, cost: c });
      }
    });
    cand.sort((a, b) => a.cost - b.cost);
    const nb: Node[] = [];
    const seen = new Set<string>();
    for (const c of cand) {
      const parent = beam[c.p];
      const hash = (parent.hash ^ rnd[c.j]) >>> 0;
      const sig = c.j + ':' + hash;
      if (seen.has(sig)) continue; // aynı küme + aynı son parça: daha pahalısını at
      seen.add(sig);
      const used = new Uint8Array(parent.used); used[c.j] = 1;
      nb.push({ seq: parent.seq.concat(c.j), used, cost: c.cost, hash });
      if (nb.length >= W) break;
    }
    beam = nb;
  }
  return beam[0].seq.map((i) => tracks[i]);
}

export interface SetReview {
  plans: TransitionPlan[];
  average: number;
  grade: 'A' | 'B' | 'C' | 'D';
  weakest: number[]; // plan indeksleri
  arcFit: number | null; // 0-1
  totalMinutes: number;
  techniqueCounts: Record<string, number>;
}

export function reviewSet(tracks: Track[], arcId: string): SetReview {
  const plans: TransitionPlan[] = [];
  for (let i = 0; i + 1 < tracks.length; i++) plans.push(planTransition(tracks[i], tracks[i + 1]));
  const average = plans.length ? plans.reduce((s, p) => s + p.score, 0) / plans.length : 1;
  const grade = average >= 0.85 ? 'A' : average >= 0.7 ? 'B' : average >= 0.55 ? 'C' : 'D';
  const weakest = plans.map((p, i) => [p.score, i] as const).filter(([s]) => s < 0.62).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  const arc = ARC_BY_ID[arcId];
  let arcFit: number | null = null;
  if (arc && tracks.length > 1 && !Number.isNaN(arc.curve(0))) {
    const err = tracks.reduce((s, t, i) => s + Math.abs(view(t).energy - arc.curve(i / (tracks.length - 1))), 0) / tracks.length;
    arcFit = Math.max(0, 1 - err / 5);
  }
  // Tahmini süre: her parçanın girişten çıkışa kadar çalınan kısmı
  let total = 0;
  tracks.forEach((t, i) => {
    const v = view(t);
    const startAt = i === 0 ? v.mixInSec : plans[i - 1].cueB;
    const endAt = i < plans.length ? plans[i].startInA : v.durationSec;
    total += Math.max(30, endAt - startAt);
  });
  const techniqueCounts: Record<string, number> = {};
  plans.forEach((p) => (techniqueCounts[p.technique] = (techniqueCounts[p.technique] ?? 0) + 1));
  return { plans, average, grade, weakest, arcFit, totalMinutes: total / 60, techniqueCounts };
}

/** Kütüphane genelinde enerji puanlarını 1-10'a yayar (mutlak + göreli karışım). */
export function normalizeEnergies(tracks: Track[]): Track[] {
  const analyzed = tracks.filter((t) => t.analysis);
  if (analyzed.length < 4) return tracks.map((t) => (t.analysis ? { ...t, analysis: { ...t.analysis, energy: Math.round(1 + 9 * t.analysis.energyRaw) } } : t));
  const sorted = analyzed.map((t) => t.analysis!.energyRaw).sort((a, b) => a - b);
  const rank = (v: number) => sorted.findIndex((x) => x >= v) / Math.max(1, sorted.length - 1);
  return tracks.map((t) => {
    if (!t.analysis) return t;
    const e = Math.round(1 + 9 * (0.55 * t.analysis.energyRaw + 0.45 * rank(t.analysis.energyRaw)));
    return { ...t, analysis: { ...t.analysis, energy: Math.max(1, Math.min(10, e)) } };
  });
}
