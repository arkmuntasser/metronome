import { type MeterSettings, type Subdivision, defaultAccents, defaultGrouping } from './meter';

export interface TimeSignaturePreset {
  id: string;
  label: string;
  numerator: number;
  denominator: number;
  grouping: number[];
}

const preset = (numerator: number, denominator: number, feel: 'beat' | 'pulse' = 'beat', label?: string): TimeSignaturePreset => {
  const grouping = defaultGrouping(numerator, denominator, feel);
  const groupingLabel = grouping.some((g) => g !== grouping[0]) ? ` (${grouping.join('+')})` : '';
  const feelLabel = denominator >= 8 && grouping.every((g) => g === grouping[0]) && grouping[0] > 1 ? ` in ${grouping.length}` : '';
  return {
    id: `${numerator}/${denominator}-${grouping.join('')}`,
    label: label ?? `${numerator}/${denominator}${feelLabel}${groupingLabel}${feel === 'pulse' && denominator >= 8 ? ` in ${numerator}` : ''}`,
    numerator,
    denominator,
    grouping,
  };
};

export const TIME_SIGNATURE_PRESETS: TimeSignaturePreset[] = [
  preset(4, 4),
  preset(3, 4),
  preset(2, 4),
  preset(2, 2, 'beat', '2/2 (cut time)'),
  preset(5, 4),
  preset(6, 4),
  preset(6, 8),
  preset(6, 8, 'pulse'),
  preset(9, 8),
  preset(12, 8),
  preset(5, 8),
  preset(7, 8),
  preset(1, 4, 'beat', '1 (one to a bar)'),
];

export function meterFromPreset(p: TimeSignaturePreset, bpm: number, subdivision: Subdivision = 1): MeterSettings {
  return {
    bpm,
    numerator: p.numerator,
    denominator: p.denominator,
    grouping: [...p.grouping],
    accents: defaultAccents(p.grouping),
    subdivision,
  };
}
