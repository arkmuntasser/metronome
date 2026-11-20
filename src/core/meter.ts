/**
 * Meter model. Pure TypeScript, no DOM: this module is meant to be ported 1:1 to Swift.
 *
 * Terminology
 * - pulse:  one note of the time signature's denominator (an eighth in 6/8, a quarter in 4/4).
 * - beat:   one conducted beat. A beat is a group of one or more pulses
 *           (6/8 "in 2" = two beats of 3 pulses; 7/8 as 2+2+3 = three uneven beats).
 * - sub:    an optional subdivision click inside a pulse.
 */

export type Accent = 'strong' | 'medium' | 'weak';
export type Subdivision = 1 | 2 | 3 | 4;

export interface MeterSettings {
  /**
   * Tempo. Refers to the conducted beat when every beat has the same number of pulses
   * (4/4, 6/8 in 2 → dotted quarter, 9/8 in 3…), otherwise to the pulse (7/8 as 2+2+3 → eighth).
   */
  bpm: number;
  numerator: number;
  denominator: number;
  /** Pulses per conducted beat. Must sum to `numerator`. */
  grouping: number[];
  /** One accent per pulse (length = numerator). */
  accents: Accent[];
  /** Clicks per pulse. */
  subdivision: Subdivision;
}

export interface Beat {
  index: number;
  startPulse: number;
  pulses: number;
  /** Seconds from the start of the bar. */
  offset: number;
  /** Seconds. */
  duration: number;
}

export interface Meter {
  settings: MeterSettings;
  pulseDuration: number;
  barDuration: number;
  beats: Beat[];
}

export const MIN_BPM = 20;
export const MAX_BPM = 300;

/** True when the bpm number refers to the conducted beat rather than the pulse. */
export function tempoRefersToBeat(grouping: number[]): boolean {
  return grouping.every((g) => g === grouping[0]);
}

/** Sensible grouping for a time signature. `feel: 'beat'` groups compound meters (6/8 in 2). */
export function defaultGrouping(numerator: number, denominator: number, feel: 'beat' | 'pulse' = 'beat'): number[] {
  if (feel === 'pulse' || denominator < 8) return Array(numerator).fill(1);
  if (numerator % 3 === 0 && numerator > 3) return Array(numerator / 3).fill(3);
  switch (numerator) {
    case 5:
      return [3, 2];
    case 7:
      return [2, 2, 3];
    case 8:
      return [3, 3, 2];
    case 10:
      return [3, 3, 2, 2];
    case 11:
      return [3, 3, 3, 2];
    default:
      return Array(numerator).fill(1);
  }
}

/** Strong on the downbeat, medium on every other beat start, weak elsewhere. */
export function defaultAccents(grouping: number[]): Accent[] {
  const accents: Accent[] = [];
  grouping.forEach((g, i) => {
    for (let p = 0; p < g; p++) {
      accents.push(p === 0 ? (i === 0 ? 'strong' : grouping.every((x) => x === 1) ? 'weak' : 'medium') : 'weak');
    }
  });
  return accents;
}

export function validateMeter(s: MeterSettings): string[] {
  const errors: string[] = [];
  if (!(s.bpm >= MIN_BPM && s.bpm <= MAX_BPM)) errors.push(`bpm must be between ${MIN_BPM} and ${MAX_BPM}`);
  if (!Number.isInteger(s.numerator) || s.numerator < 1 || s.numerator > 16) errors.push('numerator must be 1–16');
  if (![1, 2, 4, 8, 16].includes(s.denominator)) errors.push('denominator must be 1, 2, 4, 8 or 16');
  if (s.grouping.length === 0 || s.grouping.some((g) => !Number.isInteger(g) || g < 1))
    errors.push('grouping must contain positive integers');
  if (s.grouping.reduce((a, b) => a + b, 0) !== s.numerator) errors.push('grouping must sum to numerator');
  if (s.accents.length !== s.numerator) errors.push('accents must have one entry per pulse');
  if (![1, 2, 3, 4].includes(s.subdivision)) errors.push('subdivision must be 1–4');
  return errors;
}

export function deriveMeter(settings: MeterSettings): Meter {
  const errors = validateMeter(settings);
  if (errors.length) throw new Error(`Invalid meter: ${errors.join('; ')}`);
  const { bpm, grouping } = settings;
  const pulseDuration = tempoRefersToBeat(grouping) ? 60 / bpm / grouping[0] : 60 / bpm;
  const beats: Beat[] = [];
  let pulse = 0;
  grouping.forEach((g, index) => {
    beats.push({ index, startPulse: pulse, pulses: g, offset: pulse * pulseDuration, duration: g * pulseDuration });
    pulse += g;
  });
  return { settings, pulseDuration, barDuration: settings.numerator * pulseDuration, beats };
}

/** The conducted beat that contains a pulse. */
export function beatOfPulse(meter: Meter, pulse: number): Beat {
  const p = ((pulse % meter.settings.numerator) + meter.settings.numerator) % meter.settings.numerator;
  return meter.beats.find((b) => p >= b.startPulse && p < b.startPulse + b.pulses)!;
}

/** The beat before `index`, wrapping into the previous bar. */
export function previousBeat(meter: Meter, index: number): Beat {
  const n = meter.beats.length;
  return meter.beats[(index - 1 + n) % n];
}
