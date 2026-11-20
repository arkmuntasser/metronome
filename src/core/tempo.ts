import { MAX_BPM, MIN_BPM } from './meter';

/** Taps further apart than this start a new measurement. */
export const TAP_RESET_SECONDS = 2;

/**
 * Tap tempo. Pass the tap history (seconds, ascending) including the new tap.
 * Returns the trimmed history to keep and the bpm (null until there are two taps).
 */
export function tapTempo(taps: number[]): { taps: number[]; bpm: number | null } {
  let kept = taps.slice(-8);
  for (let i = kept.length - 1; i > 0; i--) {
    if (kept[i] - kept[i - 1] > TAP_RESET_SECONDS) {
      kept = kept.slice(i);
      break;
    }
  }
  if (kept.length < 2) return { taps: kept, bpm: null };
  const avg = (kept[kept.length - 1] - kept[0]) / (kept.length - 1);
  const bpm = Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, 60 / avg)));
  return { taps: kept, bpm };
}
