/**
 * The cue-in timeline for one "round": raise → hold → prep beat → entry → conducting → cutoff → lower.
 *
 * Everything is a pure function of (meter, cue settings, start time, hold duration), so the whole
 * round is known the moment start is pressed. The audio scheduler asks it for clicks, and the
 * renderer asks it for the baton position at any instant. Both use the same audio clock, so sound
 * and picture can never drift apart.
 */

import { type Accent, type Meter, beatOfPulse, previousBeat } from './meter';
import { type Point, type Pattern, REST_POSITION, arc, batonInBar, patternFor, readyPosition } from './patterns';

export type StartMode = 'random' | 'fixed' | 'countIn';

export type RoundLength = { kind: 'untilStopped' } | { kind: 'bars'; bars: number };

export interface CueSettings {
  startMode: StartMode;
  /** Random hold range, seconds. */
  holdMin: number;
  holdMax: number;
  /** Hold for 'fixed' mode, seconds. */
  fixedHold: number;
  /** Where the player comes in: a pulse of the bar (0-based) plus a fraction of a pulse (0, 0.5 = "and", …). */
  entry: { pulse: number; offset: number };
  length: RoundLength;
  /** Play an audible click track (the conductor still conducts when off). */
  clicks: boolean;
  /** Soft breath sound during the prep beat. */
  breath: boolean;
}

/** Gesture timings, seconds. Slow on purpose: he takes his time. */
export const RAISE_DURATION = 1.4;
export const COUNT_IN_HOLD = 0.6;
export const CUTOFF_DURATION = 0.6;
export const LOWER_DURATION = 1.1;
/** Extra lift above the ready position during the prep beat (the conductor's "breath"). */
export const PREP_LIFT = 0.12;

export interface Round {
  meter: Meter;
  cue: CueSettings;
  pattern: Pattern;
  raiseStart: number;
  holdStart: number;
  prepStart: number;
  prepDuration: number;
  /** The beat whose ictus ends the prep beat. */
  cueBeat: number;
  /** Time of that ictus. */
  cueIctus: number;
  /** When the player comes in. */
  entryTime: number;
  /** Time of the first audible click (entry, or the start of the count-in bar). */
  clickStart: number;
  /** Time of the downbeat of bar 0, the bar containing the entry. Bars are numbered from here. */
  barZero: number;
  ready: Point;
  /** Bar line at which the conductor cuts off, or null if still running. */
  cutoff: number | null;
  /** If stopped before the entry: the time it was abandoned. */
  abortedAt: number | null;
  /** When the baton is back at rest (Infinity while running). */
  end: number;
  /** The hold this round was built with, seconds. */
  hold: number;
  /** Drill round number this segment belongs to (set by Session). */
  index: number;
  /**
   * Live changes (e.g. tempo) split a round into segments: the old segment is cut off at a beat
   * (`handoffAt`) and a `continued` segment carries on from that beat with the new meter.
   */
  handoffAt: number | null;
  continued: boolean;
}

export type Phase = 'rest' | 'raise' | 'hold' | 'prep' | 'conducting' | 'cutoff' | 'lower' | 'done';

export interface ConductorState {
  phase: Phase;
  baton: Point;
  /** While conducting: bar number (0 = entry bar, negative = count-in), beat index, and progress 0..1 through the beat. */
  bar?: number;
  beat?: number;
  beatProgress?: number;
  /** True once the entry time has passed. */
  entered: boolean;
  /**
   * 0..1 progress through timed gestures (raise, prep, cutoff, lower).
   * Deliberately absent during the hold, so nothing can hint at when it ends.
   */
  phaseProgress?: number;
  /** Seconds since the entry (negative before it). Lets the renderer react to the first downbeat. */
  sinceEntry: number;
}

export type AudioEvent =
  | {
      kind: 'click';
      time: number;
      accent: Accent | 'sub';
      bar: number;
      pulse: number;
      /** The release click on the cutoff. */
      final: boolean;
    }
  | { kind: 'breath'; time: number; duration: number };

const EPS = 1e-9;

export function holdDurationFor(cue: CueSettings, random: () => number): number {
  switch (cue.startMode) {
    case 'random': {
      const lo = Math.min(cue.holdMin, cue.holdMax);
      const hi = Math.max(cue.holdMin, cue.holdMax);
      return lo + (hi - lo) * random();
    }
    case 'fixed':
      return cue.fixedHold;
    case 'countIn':
      return COUNT_IN_HOLD;
  }
}

export function buildRound(meter: Meter, cue: CueSettings, startTime: number, hold: number): Round {
  const { pulse: entryPulse, offset: entryOffset } = entryOf(meter, cue);
  const pattern = patternFor(meter.beats.length);

  // Count-in: the conductor cues the downbeat of the bar *before* the entry bar and counts it aloud.
  // Otherwise: he cues the beat containing the entry directly.
  const cueBeat = cue.startMode === 'countIn' ? 0 : beatOfPulse(meter, entryPulse).index;
  const prepDuration = previousBeat(meter, cueBeat).duration;

  const raiseStart = startTime;
  const holdStart = raiseStart + RAISE_DURATION;
  const prepStart = holdStart + Math.max(0, hold);
  const cueIctus = prepStart + prepDuration;

  const barZero =
    cue.startMode === 'countIn' ? cueIctus + meter.barDuration : cueIctus - meter.beats[cueBeat].offset;
  const entryTime = barZero + (entryPulse + entryOffset) * meter.pulseDuration;
  const clickStart = cue.startMode === 'countIn' ? cueIctus : entryTime;

  let cutoff: number | null = null;
  if (cue.length.kind === 'bars') {
    const firstFullBar = Math.abs(entryTime - barZero) < EPS ? 0 : 1;
    cutoff = barZero + (firstFullBar + Math.max(1, Math.floor(cue.length.bars))) * meter.barDuration;
  }

  return {
    meter,
    cue,
    pattern,
    raiseStart,
    holdStart,
    prepStart,
    prepDuration,
    cueBeat,
    cueIctus,
    entryTime,
    clickStart,
    barZero,
    ready: readyPosition(pattern, cueBeat),
    cutoff,
    abortedAt: null,
    end: cutoff === null ? Infinity : cutoff + CUTOFF_DURATION + LOWER_DURATION,
    hold,
    index: 0,
    handoffAt: null,
    continued: false,
  };
}

function entryOf(meter: Meter, cue: CueSettings): { pulse: number; offset: number } {
  const n = meter.settings.numerator;
  return {
    pulse: ((Math.floor(cue.entry.pulse) % n) + n) % n,
    offset: Math.min(Math.max(cue.entry.offset, 0), 0.999),
  };
}

/**
 * The first beat boundary strictly after `t`, as (time, bar, beat), once the prep beat has begun.
 * Returns null during the raise/hold (no beat grid is running yet).
 */
export function nextBeatAfter(round: Round, t: number): { time: number; bar: number; beat: number } | null {
  if (t < round.prepStart) return null;
  const { meter } = round;
  if (t < round.cueIctus - EPS) {
    const bar = Math.floor((round.cueIctus - round.barZero) / meter.barDuration + EPS);
    return { time: round.cueIctus, bar, beat: round.cueBeat };
  }
  let bar = Math.floor((t - round.barZero) / meter.barDuration + EPS);
  for (let guard = 0; guard < 64; guard++) {
    const barStart = round.barZero + bar * meter.barDuration;
    for (const b of meter.beats) {
      const time = barStart + b.offset;
      if (time > t + EPS) return { time, bar, beat: b.index };
    }
    bar++;
  }
  return null;
}

/**
 * Change the meter (tempo, accents, subdivision) of a round that is already running, from the
 * next beat on. Returns [old segment cut at that beat, continuation], or null if nothing can
 * change (stopping, finished, or the round ends before the next beat).
 * The number of conducted beats per bar must stay the same (the pattern can't change mid-bar).
 */
export function retimeRound(round: Round, t: number, meter: Meter): [Round, Round] | null {
  if (round.abortedAt !== null || round.handoffAt !== null) return null;
  if (meter.beats.length !== round.meter.beats.length) throw new Error('Cannot change beats per bar while running');
  const nb = nextBeatAfter(round, t);
  if (!nb) return null;
  if (round.cutoff !== null && nb.time >= round.cutoff - EPS) return null;

  // Align the new grid so that beat `nb.beat` of bar `nb.bar` falls exactly on nb.time:
  // bar numbers, the entry point and the cutoff bar all stay where they were.
  const barZero = nb.time - meter.beats[nb.beat].offset - nb.bar * meter.barDuration;
  const entry = entryOf(meter, round.cue);
  const entryTime = barZero + (entry.pulse + entry.offset) * meter.pulseDuration;
  const firstClick = round.cue.startMode === 'countIn' ? barZero - meter.barDuration : entryTime;
  let cutoff: number | null = null;
  if (round.cutoff !== null) {
    const cutoffBar = Math.round((round.cutoff - round.barZero) / round.meter.barDuration);
    cutoff = barZero + cutoffBar * meter.barDuration;
  }
  const continuation: Round = {
    ...round,
    meter,
    raiseStart: nb.time,
    holdStart: nb.time,
    prepStart: nb.time,
    prepDuration: previousBeat(meter, nb.beat).duration,
    cueBeat: nb.beat,
    cueIctus: nb.time,
    entryTime,
    clickStart: Math.max(nb.time, firstClick),
    barZero,
    cutoff,
    end: cutoff === null ? Infinity : cutoff + CUTOFF_DURATION + LOWER_DURATION,
    handoffAt: null,
    continued: true,
  };
  return [{ ...round, handoffAt: nb.time, end: nb.time }, continuation];
}

/**
 * Ask the conductor to stop at time `t`.
 * - Before the music starts (raise, hold, prep, count-in): he simply lowers the baton.
 * - While conducting: he cuts off at the next bar line.
 * - Already cutting off / lowering / done: no change.
 */
export function requestStop(round: Round, t: number): Round {
  if (round.abortedAt !== null || t >= round.end) return round;
  if (round.cutoff !== null && t >= round.cutoff) return round;
  if (t < round.entryTime) {
    return { ...round, cutoff: null, abortedAt: t, end: t + LOWER_DURATION };
  }
  const barsSinceZero = Math.floor((t - round.barZero) / round.meter.barDuration + EPS) + 1;
  const nextBarLine = round.barZero + barsSinceZero * round.meter.barDuration;
  const cutoff = round.cutoff === null ? nextBarLine : Math.min(round.cutoff, nextBarLine);
  return { ...round, cutoff, end: cutoff + CUTOFF_DURATION + LOWER_DURATION };
}

/** All audio events with `from <= time < to`. */
export function roundEvents(round: Round, from: number, to: number): AudioEvent[] {
  const events: AudioEvent[] = [];
  const { meter, cue } = round;

  const segmentEnd = round.handoffAt ?? Infinity;
  if (
    cue.breath &&
    !round.continued &&
    round.prepStart >= from &&
    round.prepStart < to &&
    Math.min(round.abortedAt ?? Infinity, segmentEnd) > round.prepStart
  ) {
    events.push({ kind: 'breath', time: round.prepStart, duration: round.prepDuration });
  }
  if (!cue.clicks) return events;

  const clickEnd = Math.min(round.abortedAt ?? round.cutoff ?? Infinity, segmentEnd); // exclusive
  const lo = Math.max(from, round.clickStart);
  const hi = Math.min(to, clickEnd);
  const { numerator, subdivision, accents } = meter.settings;
  const subDur = meter.pulseDuration / subdivision;

  if (hi > lo) {
    let n = Math.ceil((lo - round.barZero) / subDur - EPS);
    for (;;) {
      const time = round.barZero + n * subDur;
      if (time >= hi - EPS) break;
      if (time >= lo - EPS) {
        const globalPulse = Math.floor(n / subdivision);
        const sub = n - globalPulse * subdivision;
        const bar = Math.floor(globalPulse / numerator);
        const pulse = globalPulse - bar * numerator;
        events.push({ kind: 'click', time, accent: sub === 0 ? accents[pulse] : 'sub', bar, pulse, final: false });
      }
      n++;
    }
  }

  if (round.cutoff !== null && round.abortedAt === null && round.handoffAt === null && round.cutoff >= from && round.cutoff < to) {
    const bar = Math.round((round.cutoff - round.barZero) / meter.barDuration);
    events.push({ kind: 'click', time: round.cutoff, accent: 'strong', bar, pulse: 0, final: true });
  }
  return events;
}

const smooth = (p: number) => p * p * (3 - 2 * p);
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
const lerpPt = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Where the baton is, and what the conductor is doing, at time `t`. */
export function conductorAt(round: Round, t: number): ConductorState {
  const entered = t >= round.entryTime && round.abortedAt === null;
  const sinceEntry = t - round.entryTime;

  if (round.abortedAt !== null && t >= round.abortedAt) {
    if (t >= round.end) return { phase: 'done', baton: REST_POSITION, entered: false, sinceEntry };
    const from = conductorAt({ ...round, abortedAt: null }, round.abortedAt).baton;
    const p = clamp01((t - round.abortedAt) / LOWER_DURATION);
    return { phase: 'lower', baton: lerpPt(from, REST_POSITION, smooth(p)), entered: false, phaseProgress: p, sinceEntry };
  }

  if (t < round.raiseStart) return { phase: 'rest', baton: REST_POSITION, entered, sinceEntry };

  if (t < round.holdStart) {
    const raw = (t - round.raiseStart) / RAISE_DURATION;
    const p = smooth(raw);
    // Lift up and over rather than straight across, like bringing the arm up.
    const base = lerpPt(REST_POSITION, round.ready, p);
    return { phase: 'raise', baton: { x: base.x, y: base.y + 0.15 * Math.sin(Math.PI * p) }, entered, phaseProgress: raw, sinceEntry };
  }

  if (t < round.prepStart) {
    // Poised, with a tiny bit of life so it never looks frozen.
    const dt = t - round.holdStart;
    const settle = Math.exp(-dt * 3) * 0.04 * Math.sin(dt * 9);
    const sway = 0.008 * Math.sin(dt * 1.7);
    return { phase: 'hold', baton: { x: round.ready.x + sway, y: round.ready.y + settle }, entered, sinceEntry };
  }

  if (t < round.cueIctus) {
    const p = (t - round.prepStart) / round.prepDuration;
    const target = round.pattern.ictus[round.cueBeat];
    return { phase: 'prep', baton: arc(round.ready, target, round.ready.y + PREP_LIFT, p), entered, phaseProgress: p, sinceEntry };
  }

  if (round.cutoff === null || t < round.cutoff) {
    const { meter } = round;
    const sinceZero = t - round.barZero;
    const bar = Math.floor(sinceZero / meter.barDuration + EPS);
    const inBar = Math.max(0, sinceZero - bar * meter.barDuration);
    let beat = meter.beats[meter.beats.length - 1];
    for (const b of meter.beats) if (inBar >= b.offset - EPS) beat = b;
    const beatProgress = clamp01((inBar - beat.offset) / beat.duration);
    return {
      phase: 'conducting',
      baton: batonInBar(round.pattern, beat.index, beatProgress),
      bar,
      beat: beat.index,
      beatProgress,
      entered,
      sinceEntry,
    };
  }

  const down = round.pattern.ictus[0];
  const cutoffEnd = round.cutoff + CUTOFF_DURATION;
  if (t < cutoffEnd) {
    // Release: a small closing loop that ends just above the ictus.
    const raw = (t - round.cutoff) / CUTOFF_DURATION;
    const p = smooth(raw);
    const r = 0.18;
    const ang = p * 1.6 * Math.PI;
    const dir = down.x <= 0 ? 1 : -1;
    return {
      phase: 'cutoff',
      baton: { x: down.x + dir * r * Math.sin(ang), y: down.y + r * (1 - Math.cos(ang)) * 0.8 + 0.1 * p },
      entered,
      phaseProgress: raw,
      sinceEntry,
    };
  }
  if (t < round.end) {
    const from = conductorAt(round, cutoffEnd - EPS).baton;
    const p = (t - cutoffEnd) / LOWER_DURATION;
    return { phase: 'lower', baton: lerpPt(from, REST_POSITION, smooth(p)), entered, phaseProgress: p, sinceEntry };
  }
  return { phase: 'done', baton: REST_POSITION, entered, sinceEntry };
}
