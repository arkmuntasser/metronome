import { describe, expect, it } from 'vitest';
import { REST_POSITION, Session, batonInBar, defaultAccents, patternFor } from '../../core';
import { MAX_BATON_TILT, RIG, blinkAmount, conductingArm, floatingBaton, poseFor, solveArm, toArt } from './rig';

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

  describe('floating baton (armless frog)', () => {
    it('lands the tip exactly on every pattern point', () => {
      for (let n = 1; n <= 12; n++) {
        const pat = patternFor(n);
        for (let b = 0; b < n; b++)
          for (let i = 0; i <= 20; i++) {
            const want = batonInBar(pat, b, i / 20);
            expect(dist(floatingBaton(want).tip, toArt(want))).toBeLessThan(0.01);
          }
      }
    });

    it('never spins: through a whole session the hand stays below the tip, the lean is bounded and changes smoothly', () => {
      for (const [num, grouping] of [
        [4, [1, 1, 1, 1]],
        [3, [1, 1, 1]],
        [2, [1, 1]],
        [6, [1, 1, 1, 1, 1, 1]],
        [7, [2, 2, 3]],
      ] as [number, number[]][]) {
        const s = new Session(
          {
            meter: { bpm: 120, numerator: num, denominator: grouping.length === num ? 4 : 8, grouping, accents: defaultAccents(grouping), subdivision: 1 },
            cue: {
              startMode: 'fixed',
              holdMin: 1,
              holdMax: 1,
              fixedHold: 1,
              entry: { pulse: 0, offset: 0 },
              length: { kind: 'bars', bars: 2 },
              clicks: true,
              breath: false,
            },
            drill: { enabled: false, rounds: 1, restSeconds: 0 },
          },
          0,
        );
        let prev: number | null = null;
        for (let t = 0; t < s.end + 0.5; t += 1 / 120) {
          const pose = poseFor(s.stateAt(t), t);
          const { hand, tip, batonAngle } = pose.baton;
          expect(hand.y).toBeGreaterThan(tip.y); // hand always at the bottom (SVG y grows downward)
          expect(Math.abs(batonAngle + 90)).toBeLessThanOrEqual(MAX_BATON_TILT + 1e-9);
          if (prev !== null) expect(Math.abs(batonAngle - prev)).toBeLessThan(6); // per 1/120 s frame
          prev = batonAngle;
        }
      }
    });

    it('rest pose keeps the hand above the podium', () => {
      expect(floatingBaton(REST_POSITION).hand.y).toBeLessThan(364);
    });
  });
});
