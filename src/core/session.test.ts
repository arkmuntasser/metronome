import { describe, expect, it } from 'vitest';
import { type MeterSettings, defaultAccents } from './meter';
import { type AudioEvent, type CueSettings } from './timeline';
import { Session } from './session';
import { tapTempo } from './tempo';

const m = (bpm: number, over: Partial<MeterSettings> = {}): MeterSettings => ({
  bpm,
  numerator: 4,
  denominator: 4,
  grouping: [1, 1, 1, 1],
  accents: defaultAccents([1, 1, 1, 1]),
  subdivision: 1,
  ...over,
});
const cue = (over: Partial<CueSettings> = {}): CueSettings => ({
  startMode: 'fixed',
  holdMin: 1,
  holdMax: 5,
  fixedHold: 2,
  entry: { pulse: 0, offset: 0 },
  length: { kind: 'untilStopped' },
  clicks: true,
  breath: true,
  ...over,
});
const session = (c: Partial<CueSettings> = {}, drill = { enabled: false, rounds: 1, restSeconds: 2 }) =>
  new Session({ meter: m(120), cue: cue(c), drill }, 0, () => 0.5);
type Click = Extract<AudioEvent, { kind: 'click' }>;
const clicks = (s: Session, from = 0, to = 1000) => s.eventsBetween(from, to).filter((e): e is Click => e.kind === 'click');

describe('live tempo change', () => {
  it('takes effect from the next beat, keeping bar numbers', () => {
    const s = session();
    const entry = s.allRounds[0].entryTime;
    // at 120 bpm beats are 0.5s apart. Change during beat 2 of bar 0 (entry+0.6).
    s.changeMeter(entry + 0.6, m(60));
    const cs = clicks(s, entry, entry + 6);
    const times = cs.map((c) => +(c.time - entry).toFixed(3));
    expect(times.slice(0, 5)).toEqual([0, 0.5, 1, 2, 3]); // beat 3 at 1.0 then 1s spacing
    expect(cs.map((c) => `${c.bar}.${c.pulse}`).slice(0, 6)).toEqual(['0.0', '0.1', '0.2', '0.3', '1.0', '1.1']);
    expect(s.stateAt(entry + 1.5)).toMatchObject({ phase: 'conducting', bar: 0, beat: 2 });
    expect(s.stateAt(entry + 2.5)).toMatchObject({ phase: 'conducting', bar: 0, beat: 3 });
  });

  it('baton stays continuous across the change', () => {
    const s = session();
    const entry = s.allRounds[0].entryTime;
    s.changeMeter(entry + 0.6, m(70));
    let prev = s.stateAt(entry).baton;
    for (let t = entry; t < entry + 5; t += 0.002) {
      const b = s.stateAt(t).baton;
      expect(Math.hypot(b.x - prev.x, b.y - prev.y)).toBeLessThan(0.05);
      prev = b;
    }
  });

  it('during the hold: rebuilds the cue-in with the same hold, no breath doubled', () => {
    const s = session();
    const r0 = s.allRounds[0];
    s.changeMeter(r0.holdStart + 0.5, m(60));
    const r = s.allRounds[0];
    expect(r.prepStart).toBeCloseTo(r0.prepStart);
    expect(r.prepDuration).toBeCloseTo(1);
    expect(s.eventsBetween(0, 100).filter((e) => e.kind === 'breath')).toHaveLength(1);
  });

  it('during the prep beat: the cue ictus stays put, new tempo from the entry', () => {
    const s = session();
    const r0 = s.allRounds[0];
    s.changeMeter(r0.prepStart + 0.1, m(60));
    const cs = clicks(s);
    expect(cs[0].time).toBeCloseTo(r0.entryTime);
    expect(cs[1].time - cs[0].time).toBeCloseTo(1);
    expect(s.eventsBetween(0, 100).filter((e) => e.kind === 'breath')).toHaveLength(1);
  });

  it('N-bar rounds still cut off after the same number of bars', () => {
    const s = session({ length: { kind: 'bars', bars: 2 } });
    const entry = s.allRounds[0].entryTime;
    s.changeMeter(entry + 0.6, m(60));
    const cs = clicks(s);
    expect(cs.filter((c) => c.final)).toHaveLength(1);
    expect(cs.at(-1)).toMatchObject({ final: true, bar: 2, pulse: 0 });
    expect(cs).toHaveLength(9);
  });

  it('subdivision and accent changes apply from the next beat', () => {
    const s = session();
    const entry = s.allRounds[0].entryTime;
    s.changeMeter(entry + 0.1, m(120, { subdivision: 2 }));
    const cs = clicks(s, entry, entry + 1.01);
    expect(cs.map((c) => c.accent)).toEqual(['strong', 'weak', 'sub', 'weak']);
  });

  it('drill: later rounds use the new tempo and keep their order', () => {
    const s = session({ length: { kind: 'bars', bars: 1 } }, { enabled: true, rounds: 3, restSeconds: 1 });
    const entry = s.allRounds[0].entryTime;
    s.changeMeter(entry + 0.6, m(60));
    const rounds = [...new Set(s.allRounds.map((r) => r.index))];
    expect(rounds).toEqual([0, 1, 2]);
    const last = s.allRounds.at(-1)!;
    expect(last.meter.settings.bpm).toBe(60);
    expect(s.totalRounds).toBe(3);
    // stop still works after a change
    s.stop(entry + 1.2);
    expect(s.totalRounds).toBe(1);
    expect(clicks(s).at(-1)).toMatchObject({ final: true });
  });

  it('two quick changes before the same beat: the last one wins', () => {
    const s = session();
    const entry = s.allRounds[0].entryTime;
    s.changeMeter(entry + 0.6, m(60));
    s.changeMeter(entry + 0.7, m(100));
    const cs = clicks(s, entry + 0.9, entry + 3);
    expect(cs[1].time - cs[0].time).toBeCloseTo(0.6);
  });

  it('refuses a change of beats per bar', () => {
    const s = session();
    expect(() => s.changeMeter(1, m(120, { numerator: 3, grouping: [1, 1, 1], accents: defaultAccents([1, 1, 1]) }))).toThrow();
  });
});

describe('tap tempo', () => {
  it('averages taps and resets after a pause', () => {
    expect(tapTempo([0]).bpm).toBeNull();
    expect(tapTempo([0, 0.5, 1, 1.5]).bpm).toBe(120);
    const r = tapTempo([0, 0.5, 5, 6]);
    expect(r.taps).toEqual([5, 6]);
    expect(r.bpm).toBe(60);
  });
});
