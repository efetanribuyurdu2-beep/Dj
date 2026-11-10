// Short, state-derived explanations for a selected crowd group.
import { DIRECTIONS, GROUPS } from './content';
import { floorShare } from './engine';
import type { GroupId, SimState } from './types';

export function groupInsight(s: SimState, g: GroupId, minutesInHigh: number): string {
  const gs = s.groups[g];
  const def = GROUPS[g];
  const floor = floorShare(s, g);
  const lines: string[] = [];

  if (gs.fatigue > 55 && minutesInHigh >= 10) {
    lines.push(`${minutesInHigh} dakikadır yüksek yoğunlukta dans ediyorlar; kısa bir nefes alanı faydalı olabilir.`);
  } else if (gs.fatigue > 55) {
    lines.push('Yorulmaya başladılar; yoğunluk artışı onları pistten uzaklaştırabilir.');
  } else if (gs.fatigue < 15 && s.intensity < 45 && s.minute > 10) {
    lines.push('Dinlenmiş durumdalar ve daha fazlasına hazırlar.');
  }

  if (g === 'hits') {
    if (s.vocal < 40 && gs.engagement < 55) lines.push('Uzun süredir tanıdık bir nakarat duymadılar.');
    else if (s.vocalUses >= 3) lines.push('Bu gece çok sayıda hit duydular; yenisinin etkisi azalıyor.');
  }
  if (g === 'groove') {
    if (s.consistency < 45) lines.push('Son yön değişiklikleri akışlarını böldü.');
    else if (def.affinity[s.direction] >= 0.8 && gs.engagement > 55) lines.push(`${DIRECTIONS[s.direction].name} tam onlara göre; akışı korumak yeterli.`);
  }
  if (g === 'explorers') {
    if (s.move === 'groove' && s.moveAge > 8) lines.push('Bir süredir yeni bir şey duymadılar; ilgileri dağılıyor.');
    else if (s.consistency < 50) lines.push('Taze yön değişimi ilgilerini canlandırdı.');
  }

  if (lines.length === 0) {
    if (floor > 0.66) lines.push('Çoğu pistte ve keyifli görünüyor.');
    else if (floor < 0.3) lines.push('Çoğu pistin dışında; onları çağıracak bir şey bekliyorlar.');
    else lines.push('Kararsızlar: bir kısmı pistte, bir kısmı kenarda bekliyor.');
  }
  return lines.join(' ');
}
