import { describe, expect, it } from 'vitest';
import { beatOfPulse, defaultAccents, defaultGrouping, deriveMeter, previousBeat, validateMeter } from './meter';
import { TIME_SIGNATURE_PRESETS, meterFromPreset } from './presets';

const meter = (n: number, d: number, bpm: number, feel: 'beat' | 'pulse' = 'beat') => {
  const grouping = defaultGrouping(n, d, feel);
  return deriveMeter({ bpm, numerator: n, denominator: d, grouping, accents: defaultAccents(grouping), subdivision: 1 });
};

describe('meter', () => {
  it('4/4 at 120: quarter = 0.5s', () => {
    const m = meter(4, 4, 120);
    expect(m.pulseDuration).toBeCloseTo(0.5);
    expect(m.barDuration).toBeCloseTo(2);
    expect(m.beats.map((b) => b.offset)).toEqual([0, 0.5, 1, 1.5]);
  });

  it('6/8 in 2: bpm is the dotted quarter', () => {
    const m = meter(6, 8, 60);
    expect(m.beats).toHaveLength(2);
    expect(m.pulseDuration).toBeCloseTo(1 / 3);
    expect(m.beats[1].offset).toBeCloseTo(1);
  });

  it('6/8 in 6: bpm is the eighth', () => {
    const m = meter(6, 8, 120, 'pulse');
    expect(m.beats).toHaveLength(6);
    expect(m.pulseDuration).toBeCloseTo(0.5);
  });

  it('7/8 as 2+2+3: uneven beats, bpm is the eighth', () => {
    const m = meter(7, 8, 240);
    expect(m.beats.map((b) => b.pulses)).toEqual([2, 2, 3]);
    expect(m.pulseDuration).toBeCloseTo(0.25);
    expect(m.beats[2].duration).toBeCloseTo(0.75);
    expect(beatOfPulse(m, 5).index).toBe(2);
    expect(previousBeat(m, 0).index).toBe(2);
  });

  it('default accents: strong downbeat, medium beat starts in compound meters', () => {
    expect(defaultAccents([3, 3])).toEqual(['strong', 'weak', 'weak', 'medium', 'weak', 'weak']);
    expect(defaultAccents([1, 1, 1])).toEqual(['strong', 'weak', 'weak']);
  });

  it('rejects bad settings', () => {
    expect(validateMeter({ bpm: 120, numerator: 4, denominator: 4, grouping: [2, 1], accents: [], subdivision: 1 })).not.toHaveLength(0);
    expect(() => deriveMeter({ bpm: 0, numerator: 4, denominator: 4, grouping: [1, 1, 1, 1], accents: defaultAccents([1, 1, 1, 1]), subdivision: 1 })).toThrow();
  });

  it('every preset is valid', () => {
    for (const p of TIME_SIGNATURE_PRESETS) expect(validateMeter(meterFromPreset(p, 100))).toEqual([]);
  });
});
