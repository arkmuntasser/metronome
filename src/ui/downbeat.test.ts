import { describe, expect, it } from 'vitest';
import { type CueSettings, Session, defaultAccents } from '../core';
import { downbeatIntensity } from './downbeat';

const cue: CueSettings = {
  startMode: 'countIn',
  holdMin: 1,
  holdMax: 1,
  fixedHold: 1,
  entry: { pulse: 0, offset: 0 },
  length: { kind: 'bars', bars: 2 },
  clicks: true,
  breath: false,
};
const s = new Session(
  { meter: { bpm: 120, numerator: 4, denominator: 4, grouping: [1, 1, 1, 1], accents: defaultAccents([1, 1, 1, 1]), subdivision: 1 }, cue, drill: { enabled: false, rounds: 1, restSeconds: 0 } },
  0,
);
const r = s.allRounds[0];

describe('downbeat intensity', () => {
  it('is full on every bar line: count-in, entry and following bars', () => {
    for (const bar of [-1, 0, 1]) expect(downbeatIntensity(s.stateAt(r.barZero + bar * 2 + 0.001))).toBeGreaterThan(0.95);
  });

  it('fades within beat 1 and is zero on the other beats', () => {
    expect(downbeatIntensity(s.stateAt(r.barZero + 0.1))).toBeLessThan(0.5);
    expect(downbeatIntensity(s.stateAt(r.barZero + 0.25))).toBe(0);
    for (const beat of [1, 2, 3]) expect(downbeatIntensity(s.stateAt(r.barZero + beat * 0.5 + 0.001))).toBe(0);
  });

  it('pulses on the cutoff, and is zero before the music and after the end', () => {
    expect(downbeatIntensity(s.stateAt(r.cutoff! + 0.001))).toBeGreaterThan(0.7);
    expect(downbeatIntensity(s.stateAt(r.holdStart + 0.1))).toBe(0);
    expect(downbeatIntensity(s.stateAt(s.end + 1))).toBe(0);
    expect(downbeatIntensity(null)).toBe(0);
  });
});
