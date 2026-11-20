/**
 * A practice session: one round, or a drill of several rounds, each with its own
 * random hold, separated by a rest.
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
  /** 0-based index of the current (or upcoming) round. */
  round: number;
  totalRounds: number;
  finished: boolean;
}

/** Default bar count for drill rounds when the length is set to "until stopped". */
export const DRILL_DEFAULT_BARS = 4;

export class Session {
  readonly meter: Meter;
  private rounds: Round[] = [];

  constructor(
    readonly settings: SessionSettings,
    readonly startTime: number,
    random: () => number = Math.random,
  ) {
    this.meter = deriveMeter(settings.meter);
    const drill = settings.drill.enabled;
    const cue: CueSettings =
      drill && settings.cue.length.kind === 'untilStopped'
        ? { ...settings.cue, length: { kind: 'bars', bars: DRILL_DEFAULT_BARS } }
        : settings.cue;
    const count = drill ? Math.max(1, Math.floor(settings.drill.rounds)) : 1;

    let t = startTime;
    for (let i = 0; i < count; i++) {
      const round = buildRound(this.meter, cue, t, holdDurationFor(cue, random));
      this.rounds.push(round);
      t = round.end + Math.max(0, settings.drill.restSeconds);
    }
  }

  get allRounds(): readonly Round[] {
    return this.rounds;
  }

  get end(): number {
    return this.rounds[this.rounds.length - 1].end;
  }

  /** Stop at time t: the active round cuts off (or is abandoned) and later rounds are dropped. */
  stop(t: number): void {
    const i = this.rounds.findIndex((r) => t < r.end);
    if (i === -1) return;
    if (t < this.rounds[i].raiseStart) {
      // Resting between drill rounds: just don't start the next one.
      this.rounds = this.rounds.slice(0, Math.max(1, i));
      if (i === 0) this.rounds[0] = { ...this.rounds[0], abortedAt: t, cutoff: null, end: t };
      return;
    }
    this.rounds = [...this.rounds.slice(0, i), requestStop(this.rounds[i], t)];
  }

  /** Stop immediately: no cutoff, everything silenced now. */
  kill(t: number): void {
    const i = this.rounds.findIndex((r) => t < r.end);
    if (i === -1) return;
    this.rounds = [...this.rounds.slice(0, i), { ...this.rounds[i], abortedAt: t, cutoff: null, end: t }];
  }

  eventsBetween(from: number, to: number): AudioEvent[] {
    const out: AudioEvent[] = [];
    for (const r of this.rounds) {
      if (r.end <= from || r.raiseStart >= to) continue;
      out.push(...roundEvents(r, from, to));
    }
    return out.sort((a, b) => a.time - b.time);
  }

  stateAt(t: number): SessionState {
    const totalRounds = this.rounds.length;
    let i = this.rounds.findIndex((r) => t < r.end);
    const finished = i === -1;
    if (finished) i = totalRounds - 1;
    const round = this.rounds[i];
    const base: ConductorState =
      finished || t < round.raiseStart ? { phase: finished ? 'done' : 'rest', baton: REST_POSITION, entered: false } : conductorAt(round, t);
    return { ...base, round: i, totalRounds, finished };
  }
}
