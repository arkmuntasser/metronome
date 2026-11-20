/**
 * Audio engine: a Web Audio look-ahead scheduler ("a tale of two clocks").
 *
 * A JS timer wakes up every ~25 ms and schedules every event in the next ~150 ms at its exact
 * time on the AudioContext clock. The timer can be late or jittery without affecting what you hear.
 * The renderer reads the same clock (`visualTime()`), adjusted for output latency, so the baton
 * lines up with the sound rather than with the moment the sound was scheduled.
 *
 * iOS equivalent: AVAudioEngine + AVAudioPlayerNode.scheduleBuffer(at: AVAudioTime).
 */

import { type ClickSound, type MeterSettings, Session, type SessionSettings, type SessionState } from '../core';
import { primeContext, requestPlaybackSession } from './ios';
import { playBreath, playClick } from './sounds';

const TICK_MS = 25;
const LOOKAHEAD_S = 0.15;
/** Delay between pressing start and the conductor starting to move. */
const START_DELAY_S = 0.12;

interface Scheduled {
  time: number;
  nodes: AudioScheduledSourceNode[];
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private session: Session | null = null;
  private timer: number | null = null;
  private scheduledUntil = 0;
  private scheduled: Scheduled[] = [];
  private _sound: ClickSound = 'woodblock';
  private _volume = 0.8;

  set sound(s: ClickSound) {
    this._sound = s;
  }

  set volume(v: number) {
    this._volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /**
   * Must be called from a user gesture (tap/click), or browsers keep audio muted.
   * Everything up to the first `await` runs synchronously inside the gesture, which iOS requires.
   */
  async unlock(): Promise<AudioContext> {
    // iOS: use the "playback" audio session so the silent switch doesn't mute the clicks.
    requestPlaybackSession();
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this._volume;
      this.master.connect(this.ctx.destination);
    }
    const ctx = this.ctx;
    // iOS can also leave the context 'interrupted' after a call or after the app was in the background.
    if (ctx.state !== 'running') {
      primeContext(ctx);
      const resumed = ctx.resume().catch(() => undefined);
      await Promise.race([resumed, new Promise((r) => window.setTimeout(r, 1000))]);
    }
    return ctx;
  }

  get running(): boolean {
    return this.session !== null;
  }

  /** Audio-clock time of what is coming out of the speakers right now. */
  visualTime(): number {
    if (!this.ctx) return 0;
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return this.ctx.currentTime - latency;
  }

  state(): SessionState | null {
    return this.session ? this.session.stateAt(this.visualTime()) : null;
  }

  async start(settings: SessionSettings): Promise<void> {
    const ctx = await this.unlock();
    this.cancelAll();
    this.session = new Session(settings, ctx.currentTime + START_DELAY_S);
    this.scheduledUntil = ctx.currentTime;
    this.tick();
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** Graceful stop: cutoff at the next bar line, or lower the baton if the music hasn't started. */
  stop(): void {
    if (!this.session || !this.ctx) return;
    this.session.stop(this.ctx.currentTime);
    this.rescheduleFromNow();
  }

  /** Change tempo / accents / subdivision while playing: applies from the next beat. */
  updateMeter(meter: MeterSettings): void {
    if (!this.session || !this.ctx) return;
    try {
      this.session.changeMeter(this.ctx.currentTime, meter);
    } catch {
      return; // e.g. beats-per-bar changed: ignored until the next start
    }
    this.rescheduleFromNow();
  }

  /** A short sound to preview the click choice. */
  async preview(sound: ClickSound): Promise<void> {
    const ctx = await this.unlock();
    if (!this.master || this.session) return;
    const t = ctx.currentTime + 0.05;
    playClick(ctx, this.master, sound, 'strong', t);
    playClick(ctx, this.master, sound, 'weak', t + 0.3);
  }

  /** Immediate stop: silence now, baton drops. */
  kill(): void {
    if (!this.session || !this.ctx) return;
    this.session.kill(this.ctx.currentTime);
    this.cancelAll();
    this.finish();
  }

  private rescheduleFromNow(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const keep: Scheduled[] = [];
    for (const s of this.scheduled) {
      if (s.time > now + 0.005) s.nodes.forEach((n) => safeStop(n));
      else keep.push(s);
    }
    this.scheduled = keep;
    this.scheduledUntil = now + 0.005;
    this.tick();
  }

  private cancelAll(): void {
    this.scheduled.forEach((s) => s.nodes.forEach((n) => safeStop(n)));
    this.scheduled = [];
  }

  private tick(): void {
    const ctx = this.ctx;
    const session = this.session;
    if (!ctx || !session || !this.master) return;
    const now = ctx.currentTime;
    const to = now + LOOKAHEAD_S;
    if (to > this.scheduledUntil) {
      for (const e of session.eventsBetween(this.scheduledUntil, to)) {
        const time = Math.max(e.time, now);
        const nodes =
          e.kind === 'click'
            ? playClick(ctx, this.master, this._sound, e.accent, time)
            : playBreath(ctx, this.master, time, e.duration);
        this.scheduled.push({ time, nodes });
      }
      this.scheduledUntil = to;
    }
    this.scheduled = this.scheduled.filter((s) => s.time > now - 1);
    if (this.visualTime() > session.end + 0.2) this.finish();
  }

  private finish(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.session = null;
  }
}

function safeStop(n: AudioScheduledSourceNode) {
  try {
    n.stop(0);
  } catch {
    /* already stopped */
  }
}
