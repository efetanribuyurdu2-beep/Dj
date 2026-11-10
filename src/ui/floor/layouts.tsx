import type { ReactNode } from 'react';
import type { VenueId, Zone } from '../../sim/types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Ellipse { cx: number; cy: number; rx: number; ry: number }

export interface Layout {
  outline: string;
  booth: Rect;
  floor: Ellipse;
  bar: Rect;
  lounge: Rect;
  labels: Record<Zone | 'booth', { x: number; y: number; anchor?: 'start' | 'end' | 'middle' }>;
  details: ReactNode;
}

const W = 1000;
const H = 620;
export const VIEW = { w: W, h: H };

const hatch = (id: string, x: number, y: number, w: number, h: number, step = 14) => {
  const lines: ReactNode[] = [];
  for (let i = 0; i <= w + h; i += step) {
    lines.push(<line key={i} x1={x + i} y1={y} x2={x + i - h} y2={y + h} />);
  }
  return (
    <g className="plan-hatch">
      <clipPath id={id}>
        <rect x={x} y={y} width={w} height={h} />
      </clipPath>
      <g clipPath={`url(#${id})`}>{lines}</g>
    </g>
  );
};

export const LAYOUTS: Record<VenueId, Layout> = {
  house: {
    outline: 'M60 60 H940 V560 H560 M500 560 H60 Z',
    booth: { x: 410, y: 72, w: 180, h: 58 },
    floor: { cx: 430, cy: 330, rx: 210, ry: 140 },
    bar: { x: 720, y: 90, w: 200, h: 290 },
    lounge: { x: 90, y: 440, w: 300, h: 100 },
    labels: {
      booth: { x: 500, y: 158, anchor: 'middle' },
      floor: { x: 430, y: 500, anchor: 'middle' },
      bar: { x: 820, y: 408, anchor: 'middle' },
      lounge: { x: 100, y: 428 },
    },
    details: (
      <g>
        <path className="plan-wall" d="M690 60 V230 M690 300 V560" />
        <path className="plan-thin" d="M690 230 A70 70 0 0 1 760 300" />
        <rect className="plan-furn" x={720} y={500} width={200} height={40} />
        <rect className="plan-furn" x={90} y={505} width={260} height={34} rx={6} />
        <path className="plan-thin" d="M500 560 A60 60 0 0 1 560 500" />
        <text className="plan-note" x={700} y={46}>MUTFAK → BAR</text>
      </g>
    ),
  },
  rooftop: {
    outline: 'M80 90 L920 60 L950 540 L60 570 Z',
    booth: { x: 96, y: 250, w: 70, h: 150 },
    floor: { cx: 400, cy: 330, rx: 200, ry: 150 },
    bar: { x: 720, y: 110, w: 180, h: 150 },
    lounge: { x: 660, y: 340, w: 250, h: 170 },
    labels: {
      booth: { x: 96, y: 236 },
      floor: { x: 400, y: 506, anchor: 'middle' },
      bar: { x: 900, y: 286, anchor: 'end' },
      lounge: { x: 910, y: 530, anchor: 'end' },
    },
    details: (
      <g>
        <path className="plan-thin" d="M96 104 L906 76 L934 526 L76 554 Z" />
        {[150, 260, 370, 480, 590].map((x) => (
          <circle key={x} className="plan-furn" cx={x} cy={x < 300 ? 120 : 118} r={9} />
        ))}
        <path className="plan-sun" d="M40 330 m-26 0 a26 26 0 0 1 52 0" />
        <text className="plan-note" x={24} y={300}>W</text>
        <text className="plan-note" x={60} y={600}>SUNSET ↙ BATI CEPHESİ</text>
      </g>
    ),
  },
  bar: {
    outline: 'M50 150 H950 V500 H50 Z',
    booth: { x: 850, y: 300, w: 80, h: 150 },
    floor: { cx: 650, cy: 380, rx: 150, ry: 90 },
    bar: { x: 80, y: 166, w: 760, h: 80 },
    lounge: { x: 80, y: 300, w: 300, h: 180 },
    labels: {
      booth: { x: 930, y: 476, anchor: 'end' },
      floor: { x: 650, y: 486, anchor: 'middle' },
      bar: { x: 80, y: 140 },
      lounge: { x: 80, y: 290 },
    },
    details: (
      <g>
        <rect className="plan-furn" x={80} y={250} width={760} height={14} />
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i} className="plan-thin" cx={110 + i * 62} cy={282} r={8} />
        ))}
        <path className="plan-wall" d="M50 500 V420 M50 340 V150" />
        <text className="plan-note" x={50} y={530}>ENTRANCE</text>
        <text className="plan-note" x={950} y={530} textAnchor="end">12 × 4.5 m</text>
      </g>
    ),
  },
  beach: {
    outline: 'M60 70 H940 V470 Q 820 500 700 480 T 460 486 T 220 478 T 60 490 Z',
    booth: { x: 440, y: 80, w: 120, h: 66 },
    floor: { cx: 500, cy: 280, rx: 230, ry: 130 },
    bar: { x: 790, y: 110, w: 130, h: 170 },
    lounge: { x: 90, y: 330, w: 250, h: 120 },
    labels: {
      booth: { x: 500, y: 172, anchor: 'middle' },
      floor: { x: 500, y: 434, anchor: 'middle' },
      bar: { x: 920, y: 306, anchor: 'end' },
      lounge: { x: 90, y: 320 },
    },
    details: (
      <g>
        <path className="plan-water" d="M40 530 Q 180 510 320 530 T 600 530 T 960 526" />
        <path className="plan-water" d="M40 568 Q 200 548 360 568 T 680 566 T 960 562" />
        <path className="plan-thin" d="M790 110 L855 80 L920 110" />
        {[[120, 380], [200, 410], [280, 372]].map(([x, y]) => (
          <rect key={x} className="plan-furn" x={x - 26} y={y - 12} width={52} height={24} rx={4} transform={`rotate(-12 ${x} ${y})`} />
        ))}
        <text className="plan-note" x={60} y={604}>SHORELINE</text>
      </g>
    ),
  },
  afterhours: {
    outline: 'M150 70 H850 V560 H150 Z',
    booth: { x: 420, y: 84, w: 160, h: 56 },
    floor: { cx: 500, cy: 330, rx: 230, ry: 165 },
    bar: { x: 170, y: 440, w: 140, h: 100 },
    lounge: { x: 740, y: 160, w: 92, h: 380 },
    labels: {
      booth: { x: 500, y: 166, anchor: 'middle' },
      floor: { x: 500, y: 520, anchor: 'middle' },
      bar: { x: 170, y: 428 },
      lounge: { x: 832, y: 150, anchor: 'end' },
    },
    details: (
      <g>
        {[
          [260, 200],
          [740, 120],
          [260, 360],
        ].map(([x, y]) => (
          <rect key={`${x}${y}`} className="plan-pillar" x={x - 12} y={y - 12} width={24} height={24} />
        ))}
        {hatch('ah-hatch', 150, 70, 60, 120)}
        <text className="plan-note" x={150} y={596}>04:10 — NO WINDOWS</text>
      </g>
    ),
  },
};
