import { describe, expect, it } from 'vitest';
import { REST_POSITION, batonInBar, patternFor } from '../../core';
import { RIG, blinkAmount, conductingArm, solveArm, toArt } from './rig';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('frog rig', () => {
  it('IK keeps bone lengths', () => {
    const arm = solveArm({ x: 0, y: 0 }, { x: 60, y: 30 }, 50, 50, -1);
    expect(dist(arm.shoulder, arm.elbow)).toBeCloseTo(50);
    expect(dist(arm.elbow, arm.hand)).toBeCloseTo(50);
    expect(dist(arm.hand, { x: 60, y: 30 })).toBeLessThan(0.01);
  });

  it('baton tip reaches every point of every conducting pattern exactly', () => {
    for (let n = 1; n <= 12; n++) {
      const pat = patternFor(n);
      for (let b = 0; b < n; b++)
        for (let i = 0; i <= 20; i++) {
          const want = batonInBar(pat, b, i / 20);
          const pose = conductingArm(want);
          expect(dist(pose.tip, toArt(want))).toBeLessThan(0.5);
        }
    }
  });

  it('rest pose and the prep lift above the pattern top are reachable', () => {
    for (const p of [REST_POSITION, { x: 0, y: 1.15 }, { x: -0.3, y: 1.12 }]) {
      expect(dist(conductingArm(p).tip, toArt(p))).toBeLessThan(0.5);
    }
  });

  it('elbow of the conducting arm hangs below the hand, never flipping above the shoulder', () => {
    for (const p of [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: -0.6, y: 0.05 }, { x: 0.7, y: 0.05 }]) {
      const pose = conductingArm(p);
      expect(pose.elbow.y).toBeGreaterThan(pose.hand.y - 1);
      expect(pose.elbow.y).toBeGreaterThan(RIG.rightShoulder.y - 10);
    }
  });

  it('blinks are brief and occasional', () => {
    let shut = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (blinkAmount(i * 0.005) > 0.5) shut++;
    const fraction = shut / N;
    expect(fraction).toBeGreaterThan(0.005);
    expect(fraction).toBeLessThan(0.05);
  });
});
