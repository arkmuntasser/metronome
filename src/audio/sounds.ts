/**
 * Synthesised click sounds (no audio files to load, works offline, tiny bundle).
 * Each voice schedules its nodes at an exact AudioContext time and returns the source
 * nodes so they can be cancelled if the user stops.
 */

import type { Accent, ClickSound } from '../core';

export type Level = Accent | 'sub';

const LEVEL_GAIN: Record<Level, number> = { strong: 1, medium: 0.75, weak: 0.55, sub: 0.3 };
const LEVEL_PITCH: Record<Level, number> = { strong: 1.5, medium: 1.25, weak: 1, sub: 0.9 };

type Stoppable = AudioScheduledSourceNode;

function envelope(ctx: BaseAudioContext, dest: AudioNode, time: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  g.connect(dest);
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, dest: AudioNode, time: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, time);
  o.connect(dest);
  o.start(time);
  o.stop(time + dur);
  return o;
}

const noiseCache: WeakMap<BaseAudioContext, AudioBuffer> = new WeakMap();
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = b.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

function noise(ctx: BaseAudioContext, dest: AudioNode, time: number, dur: number): AudioBufferSourceNode {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx);
  n.connect(dest);
  n.start(time, Math.random());
  n.stop(time + dur);
  return n;
}

export function playClick(ctx: BaseAudioContext, dest: AudioNode, sound: ClickSound, level: Level, time: number): Stoppable[] {
  const gain = LEVEL_GAIN[level];
  const pitch = LEVEL_PITCH[level];
  switch (sound) {
    case 'woodblock': {
      const body = envelope(ctx, dest, time, 0.9 * gain, 0.001, 0.06);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500 * pitch;
      bp.Q.value = 3;
      const tick = envelope(ctx, bp, time, 0.6 * gain, 0.0005, 0.015);
      bp.connect(dest);
      return [osc(ctx, 'sine', 800 * pitch, body, time, 0.1), osc(ctx, 'triangle', 1900 * pitch, body, time, 0.05), noise(ctx, tick, time, 0.03)];
    }
    case 'beep': {
      const e = envelope(ctx, dest, time, 0.5 * gain, 0.002, 0.05);
      return [osc(ctx, 'sine', 880 * pitch, e, time, 0.08)];
    }
    case 'cowbell': {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 800 * pitch;
      bp.Q.value = 1.5;
      bp.connect(dest);
      const e = envelope(ctx, bp, time, 0.8 * gain, 0.001, level === 'sub' ? 0.08 : 0.25);
      return [osc(ctx, 'square', 540 * pitch, e, time, 0.3), osc(ctx, 'square', 800 * pitch, e, time, 0.3)];
    }
    case 'croak': {
      // A short "rbbt": low buzzy saw, pitch dropping, with a fast tremolo.
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900 * pitch;
      lp.connect(dest);
      const trem = ctx.createGain();
      trem.gain.value = 0.5;
      trem.connect(lp);
      const e = envelope(ctx, trem, time, 1.2 * gain, 0.005, 0.11);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140 * pitch, time);
      o.frequency.exponentialRampToValueAtTime(95 * pitch, time + 0.12);
      o.connect(e);
      o.start(time);
      o.stop(time + 0.13);
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 38;
      lfoGain.gain.value = 0.5;
      lfo.connect(lfoGain).connect(trem.gain);
      lfo.start(time);
      lfo.stop(time + 0.13);
      return [o, lfo];
    }
  }
}

/** A soft inhale across the prep beat: band-passed noise swelling in, then cut. */
export function playBreath(ctx: BaseAudioContext, dest: AudioNode, time: number, duration: number): Stoppable[] {
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(900, time);
  bp.frequency.linearRampToValueAtTime(1600, time + duration);
  bp.Q.value = 0.8;
  bp.connect(dest);
  const g = ctx.createGain();
  const len = Math.max(0.2, duration * 0.9);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.18, time + len * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, time + len);
  g.connect(bp);
  return [noise(ctx, g, time, len + 0.02)];
}
