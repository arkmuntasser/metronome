/**
 * A practice session: one round, or a drill of several rounds, each with its own
 * random hold, separated by a rest. Live tempo changes split rounds into segments.
 */

import { type Meter, type MeterSettings, deriveMeter } from './meter';
import {
  type AudioEvent,
  type ConductorState,
  type CueSettings,
  type Round,
  buildRound,
  conductorAt,
  holdDurationFor,
  requestStop,
  retimeRound,
  roundEvents,
} from './timeline';
import { REST_POSITION } from './patterns';

export interface DrillSettings {
  enabled: boolean;
  rounds: number;
  /** Seconds between the baton coming down and going back up. */
  restSeconds: number;
}

export interface SessionSettings {
  meter: MeterSettings;
  cue: CueSettings;
  drill: DrillSettings;
}

export interface SessionState extends ConductorState {
  /** 0-based index of the current (or upcoming) drill round. */
  round: number;
  totalRounds: number;
  finished: boolean;
  /** Stop was pressed and the conductor is finishing (cutoff at the bar line, then lowering). */
  stopping: boolean;
}

/** Default bar count for drill rounds when the length is set to "until stopped". */
export const DRILL_DEFAULT_BARS = 4;

export class Session {
  private _meter: Meter;
  private readonly cue: CueSettings;
  /** Segments in time order. Usually one per drill round; more after live tempo changes. */
  private segments: Round[] = [];
  private _totalRounds: number;
  private _stopping = false;

  constructor(
    readonly settings: SessionSettings,
    readonly startTime: number,
    random: () => number = Math.random,
  ) {
    this._meter = deriveMeter(settings.meter);
    const drill = settings.drill.enabled;
    this.cue =
      drill && settings.cue.length.kind === 'untilStopped'
        ? { ...settings.cue, length: { kind: 'bars', bars: DRILL_DEFAULT_BARS } }
        : settings.cue;
    this._totalRounds = drill ? Math.max(1, Math.floor(settings.drill.rounds)) : 1;

    let t = startTime;
    for (let i = 0; i < this._totalRounds; i++) {
      const round = { ...buildRound(this._meter, this.cue, t, holdDurationFor(this.cue, random)), index: i };
      this.segments.push(round);
      t = round.end + this.rest;
    }
  }

  private get rest(): number {
    return Math.max(0, this.settings.drill.restSeconds);
  }

  get meter(): Meter {
    return this._meter;
  }

  get allRounds(): readonly Round[] {
    return this.segments;
  }

  get totalRounds(): number {
    return this._totalRounds;
  }

  /** True once stop() or kill() has been called. */
  get stopping(): boolean {
    return this._stopping;
  }

  get end(): number {
    return this.segments[this.segments.length - 1].end;
  }

  private activeIndex(t: number): number {
    return this.segments.findIndex((r) => t < r.end);
  }

  /** Drop every segment after `i` and record how many drill rounds remain. */
  private truncateAfter(i: number): void {
    this.segments = this.segments.slice(0, i + 1);
    this._totalRounds = this.segments[i].index + 1;
  }

  /** Stop at time t: the active round cuts off (or is abandoned) and later rounds are dropped. */
  stop(t: number): void {
    const i = this.activeIndex(t);
    if (i === -1) return;
    this._stopping = true;
    const r = this.segments[i];
    if (t < r.raiseStart) {
      // Resting between drill rounds (or before the very first): don't start the next one.
      if (i === 0) {
        this.segments[0] = { ...r, abortedAt: t, cutoff: null, end: t };
        this.truncateAfter(0);
      } else {
        this.truncateAfter(i - 1);
      }
      return;
    }
    this.segments[i] = requestStop(r, t);
    this.truncateAfter(i);
  }

  /** Stop immediately: no cutoff, everything silenced now. */
  kill(t: number): void {
    const i = this.activeIndex(t);
    if (i === -1) return;
    this._stopping = true;
    this.segments[i] = { ...this.segments[i], abortedAt: t, cutoff: null, handoffAt: null, end: t };
    this.truncateAfter(i);
  }

  /**
   * Change tempo / accents / subdivision while running. Takes effect from the next beat
   * (or immediately, if the conductor hasn't started the prep beat yet).
   * The number of conducted beats per bar must not change.
   */
  changeMeter(t: number, settings: MeterSettings): void {
    const meter = deriveMeter(settings);
    if (meter.beats.length !== this._meter.beats.length) throw new Error('Cannot change beats per bar while running');
    this._meter = meter;
    const i = this.activeIndex(t);
    if (i === -1) return;
    const r = this.segments[i];

    let current: Round[];
    if (r.abortedAt !== null || (r.cutoff !== null && t >= r.cutoff)) {
      current = [r]; // already stopping: leave it alone
    } else if (t < r.prepStart && !r.continued) {
      // Still raising / holding: rebuild the cue-in at the new tempo, same start and same hold.
      current = [{ ...buildRound(meter, r.cue, r.raiseStart, r.hold), index: r.index }];
    } else {
      // If this segment was already cut for an earlier change that hasn't happened yet, re-cut it.
      const uncut = r.handoffAt !== null ? { ...r, handoffAt: null } : r;
      current = retimeRound(uncut, t, meter) ?? [r];
    }

    // Rebuild the drill rounds that haven't started yet, keeping their holds.
    const later: Round[] = [];
    let prev = current[current.length - 1];
    let lastIndex = prev.index;
    for (const seg of this.segments.slice(i + 1)) {
      if (seg.index === lastIndex) continue; // stale continuation of the current round
      const next = { ...buildRound(meter, this.cue, prev.end + this.rest, seg.hold), index: seg.index };
      later.push(next);
      prev = next;
      lastIndex = seg.index;
    }
    this.segments = [...this.segments.slice(0, i), ...current, ...later];
  }

  eventsBetween(from: number, to: number): AudioEvent[] {
    const out: AudioEvent[] = [];
    for (const r of this.segments) {
      if (r.end <= from || r.raiseStart >= to) continue;
      out.push(...roundEvents(r, from, to));
    }
    return out.sort((a, b) => a.time - b.time);
  }

  stateAt(t: number): SessionState {
    const totalRounds = this._totalRounds;
    let i = this.activeIndex(t);
    const finished = i === -1;
    if (finished) i = this.segments.length - 1;
    const seg = this.segments[i];
    const base: ConductorState =
      finished || t < seg.raiseStart
        ? { phase: finished ? 'done' : 'rest', baton: REST_POSITION, entered: false, sinceEntry: -Infinity }
        : conductorAt(seg, t);
    return { ...base, round: seg.index, totalRounds, finished, stopping: this._stopping && !finished };
  }
}
