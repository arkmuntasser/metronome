import { describe, expect, it } from 'vitest';
import { batonInBar, patternFor, readyPosition } from './patterns';

describe('patterns', () => {
  for (let n = 1; n <= 12; n++) {
    it(`${n}-beat pattern is continuous and bounces on each ictus`, () => {
      const pat = patternFor(n);
      expect(pat.ictus).toHaveLength(n);
      expect(pat.apex).toHaveLength(n);
      for (let b = 0; b < n; b++) {
        const start = batonInBar(pat, b, 0);
        const end = batonInBar(pat, b, 1);
        const next = pat.ictus[(b + 1) % n];
        expect(start).toEqual(pat.ictus[b]);
        expect(end.x).toBeCloseTo(next.x);
        expect(end.y).toBeCloseTo(next.y);
        // the baton is above its ictus between beats
        expect(batonInBar(pat, b, 0.5).y).toBeGreaterThan(Math.min(pat.ictus[b].y, next.y));
      }
      // the last beat lifts to the top before the downbeat
      expect(batonInBar(pat, n - 1, 0.5).y).toBeCloseTo(1);
      expect(readyPosition(pat, 0).y).toBeCloseTo(1);
    });
  }

  it('4/4 in the player view: beat 2 on screen right, beat 3 on screen left (right-handed conductor faces you)', () => {
    const pat = patternFor(4);
    expect(pat.ictus[1].x).toBeGreaterThan(0);
    expect(pat.ictus[2].x).toBeLessThan(0);
  });

  it('3/4: beat 2 goes to the conductor\'s right = screen left', () => {
    expect(patternFor(3).ictus[1].x).toBeLessThan(0);
  });
});
