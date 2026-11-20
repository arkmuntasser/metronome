import { describe, expect, it } from 'vitest';
import { defaultAccents, defaultGrouping, deriveMeter, type Subdivision } from './meter';
import {
  type AudioEvent,
  type CueSettings,
  CUTOFF_DURATION,
  LOWER_DURATION,
  RAISE_DURATION,
  buildRound,
  conductorAt,
  requestStop,
  roundEvents,
} from './timeline';
import { REST_POSITION } from './patterns';
import { Session } from './session';

const meter = (n: number, d: number, bpm: number, subdivision: Subdivision = 1) => {
  const grouping = defaultGrouping(n, d);
  return deriveMeter({ bpm, numerator: n, denominator: d, grouping, accents: defaultAccents(grouping), subdivision });
};

const cue = (over: Partial<CueSettings> = {}): CueSettings => ({
  startMode: 'random',
  holdMin: 1,
  holdMax: 5,
  fixedHold: 3,
  entry: { pulse: 0, offset: 0 },
  length: { kind: 'untilStopped' },
  clicks: true,
  breath: false,
  ...over,
});

const clicks = (evs: AudioEvent[]) => evs.filter((e) => e.kind === 'click') as Extract<AudioEvent, { kind: 'click' }>[];

describe('cue-in timeline (4/4 @ 120, downbeat entry)', () => {
  const m = meter(4, 4, 120);
  const r = buildRound(m, cue(), 10, 2);

  it('raise → hold → one prep beat → entry on the downbeat', () => {
    expect(r.holdStart).toBeCloseTo(10 + RAISE_DURATION);
    expect(r.prepStart).toBeCloseTo(10 + RAISE_DURATION + 2);
    expect(r.prepDuration).toBeCloseTo(0.5);
    expect(r.entryTime).toBeCloseTo(r.prepStart + 0.5);
    expect(r.barZero).toBeCloseTo(r.entryTime);
  });

  it('is silent until the entry, then clicks every beat with the downbeat accented', () => {
    const evs = clicks(roundEvents(r, 0, r.entryTime + 2.01));
    expect(evs[0].time).toBeCloseTo(r.entryTime);
    expect(evs.map((e) => e.accent)).toEqual(['strong', 'weak', 'weak', 'weak', 'strong']);
    expect(evs.every((e) => e.time >= r.entryTime - 1e-9)).toBe(true);
  });

  it('never double-counts across adjacent windows', () => {
    const whole = roundEvents(r, 0, 30).map((e) => e.time);
    const pieces: number[] = [];
    for (let t = 0; t < 30; t += 0.025) pieces.push(...roundEvents(r, t, t + 0.025).map((e) => e.time));
    expect(pieces).toHaveLength(whole.length);
  });

  it('baton path is continuous through every phase', () => {
    let prev = conductorAt(r, 9.99).baton;
    for (let t = 10; t < r.entryTime + 6; t += 0.002) {
      const b = conductorAt(r, t).baton;
      expect(Math.hypot(b.x - prev.x, b.y - prev.y)).toBeLessThan(0.05);
      prev = b;
    }
  });

  it('phases happen in order', () => {
    expect(conductorAt(r, 9).phase).toBe('rest');
    expect(conductorAt(r, 10.5).phase).toBe('raise');
    expect(conductorAt(r, r.holdStart + 1).phase).toBe('hold');
    expect(conductorAt(r, r.prepStart + 0.1).phase).toBe('prep');
    const s = conductorAt(r, r.entryTime + 0.6);
    expect(s).toMatchObject({ phase: 'conducting', bar: 0, beat: 1, entered: true });
    expect(conductorAt(r, r.entryTime).baton).toEqual({ x: 0, y: 0 });
  });
});

describe('pickups and offbeat entries', () => {
  it('entry on beat 4: the prep is beat 3 and bar 0 is a partial pickup bar', () => {
    const m = meter(4, 4, 120);
    const r = buildRound(m, cue({ entry: { pulse: 3, offset: 0 } }), 0, 1);
    expect(r.cueBeat).toBe(3);
    expect(r.entryTime).toBeCloseTo(r.cueIctus);
    expect(r.barZero).toBeCloseTo(r.entryTime - 1.5);
    const first = clicks(roundEvents(r, 0, 100))[0];
    expect(first).toMatchObject({ bar: 0, pulse: 3, accent: 'weak' });
  });

  it('entry on the "and" of 4: cue on beat 4, enter half a beat later, clicks start there', () => {
    const m = meter(4, 4, 120, 2);
    const r = buildRound(m, cue({ entry: { pulse: 3, offset: 0.5 } }), 0, 1);
    expect(r.entryTime).toBeCloseTo(r.cueIctus + 0.25);
    const evs = clicks(roundEvents(r, 0, 100)).slice(0, 2);
    expect(evs[0]).toMatchObject({ accent: 'sub', pulse: 3 });
    expect(evs[0].time).toBeCloseTo(r.entryTime);
    expect(evs[1]).toMatchObject({ accent: 'strong', bar: 1, pulse: 0 });
  });

  it('6/8 in 2, entry on the 3rd eighth: cue the downbeat, enter two eighths later', () => {
    const m = meter(6, 8, 60);
    const r = buildRound(m, cue({ entry: { pulse: 2, offset: 0 } }), 0, 1);
    expect(r.cueBeat).toBe(0);
    expect(r.prepDuration).toBeCloseTo(1); // previous beat = beat 2 (a dotted quarter)
    expect(r.entryTime).toBeCloseTo(r.cueIctus + 2 / 3);
  });

  it('7/8 (2+2+3): prep beat before the downbeat is the long 3-eighth beat', () => {
    const m = meter(7, 8, 240);
    const r = buildRound(m, cue(), 0, 1);
    expect(r.prepDuration).toBeCloseTo(0.75);
  });
});

describe('start modes', () => {
  it('count-in: one audible bar before a downbeat entry, conducted', () => {
    const m = meter(3, 4, 60);
    const r = buildRound(m, cue({ startMode: 'countIn' }), 0, 0.6);
    expect(r.clickStart).toBeCloseTo(r.entryTime - 3);
    const evs = clicks(roundEvents(r, 0, r.entryTime + 0.01));
    expect(evs.map((e) => e.bar)).toEqual([-1, -1, -1, 0]);
    expect(conductorAt(r, r.clickStart + 1.5)).toMatchObject({ phase: 'conducting', bar: -1, beat: 1, entered: false });
  });

  it('count-in with a pickup on beat 3 counts the full bar plus the beats before the entry', () => {
    const m = meter(4, 4, 60);
    const r = buildRound(m, cue({ startMode: 'countIn', entry: { pulse: 2, offset: 0 } }), 0, 0.6);
    const before = clicks(roundEvents(r, 0, r.entryTime - 0.01));
    expect(before).toHaveLength(6);
  });

  it('session uses the fixed hold exactly', () => {
    const s = new Session(
      { meter: meter(4, 4, 120).settings, cue: cue({ startMode: 'fixed', fixedHold: 3 }), drill: { enabled: false, rounds: 1, restSeconds: 0 } },
      0,
    );
    expect(s.allRounds[0].prepStart - s.allRounds[0].holdStart).toBeCloseTo(3);
  });

  it('random holds stay inside the range', () => {
    for (const x of [0, 0.5, 0.999]) {
      const s = new Session({ meter: meter(4, 4, 120).settings, cue: cue(), drill: { enabled: false, rounds: 1, restSeconds: 0 } }, 0, () => x);
      const hold = s.allRounds[0].prepStart - s.allRounds[0].holdStart;
      expect(hold).toBeGreaterThanOrEqual(1);
      expect(hold).toBeLessThanOrEqual(5);
    }
  });
});

describe('ending', () => {
  const m = meter(4, 4, 120);

  it('N bars: cuts off at the bar line after N full bars, with a final release click', () => {
    const r = buildRound(m, cue({ length: { kind: 'bars', bars: 2 } }), 0, 1);
    expect(r.cutoff).toBeCloseTo(r.barZero + 4);
    const evs = clicks(roundEvents(r, 0, 100));
    expect(evs).toHaveLength(9);
    expect(evs[8]).toMatchObject({ final: true });
    expect(evs[8].time).toBeCloseTo(r.cutoff!);
    expect(r.end).toBeCloseTo(r.cutoff! + CUTOFF_DURATION + LOWER_DURATION);
    expect(conductorAt(r, r.end + 1)).toMatchObject({ phase: 'done', baton: REST_POSITION });
  });

  it('N bars with a pickup: the pickup bar does not count', () => {
    const r = buildRound(m, cue({ entry: { pulse: 3, offset: 0 }, length: { kind: 'bars', bars: 2 } }), 0, 1);
    expect(r.cutoff).toBeCloseTo(r.barZero + 3 * 2);
  });

  it('stop while conducting: cutoff at the next bar line', () => {
    const r0 = buildRound(m, cue(), 0, 1);
    const r = requestStop(r0, r0.entryTime + 2.7); // in bar 1
    expect(r.cutoff).toBeCloseTo(r0.entryTime + 4);
    expect(clicks(roundEvents(r, r0.entryTime + 2.7, 100)).at(-1)).toMatchObject({ final: true });
    expect(conductorAt(r, r.cutoff! + 0.1).phase).toBe('cutoff');
    expect(conductorAt(r, r.cutoff! + CUTOFF_DURATION + 0.1).phase).toBe('lower');
  });

  it('stop during the hold: no clicks at all, baton lowers', () => {
    const r0 = buildRound(m, cue(), 0, 3);
    const r = requestStop(r0, r0.holdStart + 1);
    expect(roundEvents(r, 0, 100)).toHaveLength(0);
    expect(conductorAt(r, r0.holdStart + 1.5).phase).toBe('lower');
    expect(conductorAt(r, r.end).phase).toBe('done');
  });

  it('clicks off: conductor still runs but nothing sounds', () => {
    const r = buildRound(m, cue({ clicks: false }), 0, 1);
    expect(roundEvents(r, 0, 100)).toHaveLength(0);
  });

  it('breath sound spans the prep beat', () => {
    const r = buildRound(m, cue({ breath: true, clicks: false }), 0, 1);
    expect(roundEvents(r, 0, 100)).toEqual([{ kind: 'breath', time: r.prepStart, duration: 0.5 }]);
  });
});

describe('drill', () => {
  const settings = {
    meter: meter(4, 4, 120).settings,
    cue: cue(),
    drill: { enabled: true, rounds: 3, restSeconds: 2 },
  };

  it('builds N rounds of N bars with rests and different holds', () => {
    let i = 0;
    const holds = [0.1, 0.9, 0.5];
    const s = new Session(settings, 0, () => holds[i++]);
    const rs = s.allRounds;
    expect(rs).toHaveLength(3);
    expect(rs[1].raiseStart).toBeCloseTo(rs[0].end + 2);
    expect(rs.map((r) => r.prepStart - r.holdStart)).toEqual([1.4, 4.6, 3].map((x) => expect.closeTo(x)));
    expect(rs.every((r) => r.cutoff !== null)).toBe(true);
    expect(s.stateAt(rs[1].raiseStart + 0.5)).toMatchObject({ round: 1, totalRounds: 3, phase: 'raise' });
    expect(s.stateAt(s.end + 1).finished).toBe(true);
  });

  it('stop during round 1 cuts it off and drops the remaining rounds', () => {
    const s = new Session(settings, 0, () => 0.5);
    const t = s.allRounds[0].entryTime + 1;
    s.stop(t);
    expect(s.allRounds).toHaveLength(1);
    expect(s.allRounds[0].cutoff).toBeCloseTo(s.allRounds[0].entryTime + 2);
  });

  it('stop during a rest ends the session', () => {
    const s = new Session(settings, 0, () => 0.5);
    s.stop(s.allRounds[0].end + 1);
    expect(s.allRounds).toHaveLength(1);
    expect(s.stateAt(s.allRounds[0].end + 1.5).finished).toBe(true);
  });

  it('kill silences immediately', () => {
    const s = new Session(settings, 0, () => 0.5);
    const t = s.allRounds[0].entryTime + 1;
    s.kill(t);
    expect(s.eventsBetween(t, 1000)).toHaveLength(0);
  });
});
