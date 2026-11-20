/**
 * Conducting pattern geometry.
 *
 * The tables below are written in the conductor's own frame, the way conducting
 * textbooks describe them (4/4: down, LEFT, RIGHT, up for a right-handed conductor).
 * The conductor faces the player, so `patternFor` mirrors them into the player's view:
 *   x ∈ [-1, 1]  screen left → right, as the player sees the conductor
 *   y ≥ 0        0 = the "ictus plane" where each beat bounces; 1 = the top of the pattern
 *
 * Every beat is an ictus point. Between two ictuses the baton travels on a parabola,
 * like a bouncing ball: fastest at the ictus and slowest at the top of the rebound.
 * That gives each beat a clear, readable "click" point.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Pattern {
  /** Ictus position for each conducted beat. */
  ictus: Point[];
  /** Height of the rebound after each beat (the last one is the big lift back to the top). */
  apex: number[];
}

const PATTERNS: Record<number, Pattern> = {
  1: { ictus: [{ x: 0, y: 0 }], apex: [1] },
  2: {
    ictus: [
      { x: 0, y: 0 },
      { x: 0.2, y: 0.08 },
    ],
    apex: [0.5, 1],
  },
  3: {
    ictus: [
      { x: 0, y: 0 },
      { x: 0.7, y: 0.05 },
      { x: 0.35, y: 0.22 },
    ],
    apex: [0.35, 0.35, 1],
  },
  4: {
    ictus: [
      { x: 0, y: 0 },
      { x: -0.65, y: 0.05 },
      { x: 0.7, y: 0.05 },
      { x: 0.3, y: 0.22 },
    ],
    apex: [0.3, 0.3, 0.4, 1],
  },
};

/**
 * Generic pattern for 5+ beats: down, then a run of beats to the left,
 * a run to the right, and a final up-beat (6 → down, left, left, right, right, up).
 */
function genericPattern(n: number): Pattern {
  const middle = n - 2;
  const lefts = Math.ceil(middle / 2);
  const rights = middle - lefts;
  const ictus: Point[] = [{ x: 0, y: 0 }];
  const apex: number[] = [0.3];
  for (let i = 0; i < lefts; i++) {
    ictus.push({ x: -0.35 - (0.5 * i) / Math.max(1, lefts - 1), y: 0.05 + 0.04 * i });
    apex.push(0.25);
  }
  for (let i = 0; i < rights; i++) {
    ictus.push({ x: 0.4 + (0.45 * i) / Math.max(1, rights - 1), y: 0.05 + 0.04 * i });
    apex.push(0.25);
  }
  ictus.push({ x: 0.3, y: 0.22 });
  apex.push(1);
  apex[lefts] = 0.35; // crossing from the left side to the right side needs a bigger arc
  return { ictus, apex };
}

/** Conducting pattern for a bar of `beatsPerBar` beats, in the player's (viewer's) frame. */
export function patternFor(beatsPerBar: number): Pattern {
  if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1) throw new Error('beatsPerBar must be a positive integer');
  const conductorFrame = PATTERNS[beatsPerBar] ?? genericPattern(beatsPerBar);
  return {
    ictus: conductorFrame.ictus.map((pt) => ({ x: 0 - pt.x || 0, y: pt.y })),
    apex: [...conductorFrame.apex],
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Ballistic arc from `a` to `b` that passes `apex` height at its midpoint.
 * x moves linearly; y is a parabola. p ∈ [0, 1].
 */
export function arc(a: Point, b: Point, apex: number, p: number): Point {
  const h = Math.max(0, apex - (a.y + b.y) / 2);
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) + 4 * h * p * (1 - p) };
}

/** Baton position during beat `beat`, `p` ∈ [0,1) of the way to the next ictus. */
export function batonInBar(pattern: Pattern, beat: number, p: number): Point {
  const n = pattern.ictus.length;
  const a = pattern.ictus[beat % n];
  const b = pattern.ictus[(beat + 1) % n];
  return arc(a, b, pattern.apex[beat % n], p);
}

/**
 * Where the conductor holds the baton before the preparatory beat that leads into
 * ictus `beat`: the top of the arc that normally arrives at that beat.
 */
export function readyPosition(pattern: Pattern, beat: number): Point {
  const n = pattern.ictus.length;
  const prev = (beat - 1 + n) % n;
  return batonInBar(pattern, prev, 0.5);
}

/** Resting pose: baton lowered by the conductor's right side (screen left, player's view). */
export const REST_POSITION: Point = { x: -0.55, y: -0.45 };
