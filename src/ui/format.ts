import { type MeterSettings, type PracticeSettings, tempoRefersToBeat } from '../core';

const NOTE: Record<number, string> = { 1: '𝅝', 2: '𝅗𝅥', 4: '♩', 8: '♪', 16: '𝅘𝅥𝅯' };

/** The note value the bpm refers to: ♩, ♩. (dotted, for 6/8 in 2), ♪ … */
export function tempoUnitLabel(m: Pick<MeterSettings, 'grouping' | 'denominator'>): string {
  const size = tempoRefersToBeat(m.grouping) ? m.grouping[0] : 1;
  const base = NOTE[m.denominator] ?? '♩';
  if (size === 1) return base;
  if (size === 3) return `${NOTE[m.denominator / 2] ?? base}.`;
  if (size === 2) return NOTE[m.denominator / 2] ?? `2×${base}`;
  return `${size}×${base}`;
}

/** Traditional Italian tempo marking for a bpm. */
export function tempoName(bpm: number): string {
  if (bpm < 40) return 'Grave';
  if (bpm < 60) return 'Largo';
  if (bpm < 66) return 'Larghetto';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 156) return 'Allegro';
  if (bpm < 176) return 'Vivace';
  if (bpm < 200) return 'Presto';
  return 'Prestissimo';
}

const OFFSETS: Record<number, [number, string][]> = {
  1: [[0, ''], [0.5, ' &']],
  2: [[0, ''], [0.5, ' &']],
  3: [[0, ''], [1 / 3, ' trip'], [2 / 3, ' let']],
  4: [[0, ''], [0.25, ' e'], [0.5, ' &'], [0.75, ' a']],
};

/** Choices for "come in on": every pulse, plus the off-beats that match the subdivision. */
export function entryOptions(s: PracticeSettings, numerator: number, grouping: number[]): { value: string; label: string }[] {
  const beatStarts = new Map<number, number>();
  let p = 0;
  grouping.forEach((g, i) => {
    beatStarts.set(p, i);
    p += g;
  });
  const grouped = grouping.some((g) => g > 1);
  const offsets = OFFSETS[s.subdivision];
  const opts: { value: string; label: string }[] = [];
  for (let pulse = 0; pulse < numerator; pulse++) {
    for (const [o, suffix] of offsets) {
      let label = `${pulse + 1}${suffix}`;
      if (o === 0 && pulse === 0) label += ' — downbeat';
      else if (o === 0 && grouped && beatStarts.has(pulse)) label += ` — beat ${beatStarts.get(pulse)! + 1}`;
      opts.push({ value: `${pulse}:${o}`, label });
    }
  }
  const current = `${s.cue.entry.pulse}:${s.cue.entry.offset}`;
  if (!opts.some((o) => o.value === current)) {
    opts.push({ value: current, label: `${s.cue.entry.pulse + 1} + ${Math.round(s.cue.entry.offset * 100)}%` });
  }
  return opts;
}
