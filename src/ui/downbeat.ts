import type { SessionState } from '../core';

/** How much of beat 1 the downbeat emphasis lasts (fraction of the beat). */
export const DOWNBEAT_DECAY = 0.4;

/**
 * Downbeat emphasis, 0..1: jumps to 1 exactly on the ictus of beat 1 (every bar, including
 * the count-in bar and the cutoff) and fades out over the first part of the beat.
 * Shared by the screen pulse and the frog, so they hit together, on the audio clock.
 */
export function downbeatIntensity(s: SessionState | null): number {
  if (!s || s.finished) return 0;
  if (s.phase === 'conducting' && s.beat === 0 && s.beatProgress !== undefined) {
    return decay(s.beatProgress / DOWNBEAT_DECAY);
  }
  if (s.phase === 'cutoff' && s.phaseProgress !== undefined) {
    // The cutoff lands on a bar line too: one last, slightly gentler pulse.
    return 0.8 * decay(s.phaseProgress / 0.5);
  }
  return 0;
}

const decay = (x: number) => (x >= 1 ? 0 : (1 - Math.max(0, x)) ** 2);
