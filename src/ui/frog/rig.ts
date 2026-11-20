/**
 * The frog's skeleton: pure geometry, no DOM. It turns a `SessionState` (plus a wall-clock
 * for idle life like blinking) into a `FrogPose` of numbers, which `Frog.tsx` draws as SVG.
 * The iOS app can port this file directly and draw the same pose with SwiftUI/Core Animation.
 *
 * Art space: SVG units, viewBox 0 0 400 460, frog centred on x = 200, facing the player.
 * The conducting (right) arm is on screen LEFT; the free (left) arm is on screen right.
 */

import { type Point, type SessionState, REST_POSITION } from '../../core';
import { downbeatIntensity } from '../downbeat';

export const RIG = {
  viewBox: { x: 0, y: 0, w: 400, h: 460 },
  /** Where pattern (0,0), the ictus of beat 1, lands in art space, and how big a pattern unit is. */
  patternOrigin: { x: 194, y: 272 },
  patternScale: { x: 116, y: 116 },
  rightShoulder: { x: 150, y: 238 },
  leftShoulder: { x: 250, y: 238 },
  upperArm: 54,
  forearm: 52,
  baton: 74,
  /** Free hand resting on the waistcoat, and raised "ready" palm for the cue. */
  leftHandRest: { x: 234, y: 286 },
  leftHandReady: { x: 300, y: 196 },
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const smooth = (p: number) => {
  const q = clamp01(p);
  return q * q * (3 - 2 * q);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Point, b: Point, t: number): Point => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const len = (p: Point) => Math.hypot(p.x, p.y);
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
const norm = (a: Point): Point => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** Pattern space (y up, normalised) → art space (y down, SVG units). */
export function toArt(p: Point): Point {
  return { x: RIG.patternOrigin.x + p.x * RIG.patternScale.x, y: RIG.patternOrigin.y - p.y * RIG.patternScale.y };
}

export interface ArmPose {
  shoulder: Point;
  elbow: Point;
  hand: Point;
}

/**
 * Two-bone IK. `outward` = which side the elbow should bulge to (-1 screen left, +1 screen right);
 * elbows also prefer to hang downward.
 */
export function solveArm(shoulder: Point, target: Point, upper: number, fore: number, outward: -1 | 1): ArmPose {
  const toTarget = sub(target, shoulder);
  const d = clamp(len(toTarget), Math.abs(upper - fore) + 1e-3, upper + fore - 1e-3);
  const base = Math.atan2(toTarget.y, toTarget.x);
  const alpha = Math.acos(clamp((upper * upper + d * d - fore * fore) / (2 * upper * d), -1, 1));
  const candidates = [base + alpha, base - alpha].map((a) => add(shoulder, { x: Math.cos(a) * upper, y: Math.sin(a) * upper }));
  const score = (e: Point) => (e.y - shoulder.y) + outward * (e.x - shoulder.x) * 0.8;
  const elbow = score(candidates[0]) >= score(candidates[1]) ? candidates[0] : candidates[1];
  const hand = add(elbow, scale(norm(sub(target, elbow)), fore));
  return { shoulder, elbow, hand };
}

export interface ConductingArmPose extends ArmPose {
  /** Where the baton tip actually ends up (equals the requested tip whenever it is reachable). */
  tip: Point;
  /** Baton angle in degrees (SVG rotation, 0 = pointing right). */
  batonAngle: number;
}

/**
 * Pose the conducting arm so the baton tip lands on `tipPattern` (pattern space).
 * The baton points away from the shoulder, tilted upward when the arm is up,
 * and hangs down when it is lowered at rest.
 */
export function conductingArm(tipPattern: Point): ConductingArmPose {
  const tip = toArt(tipPattern);
  const radial = norm(sub(tip, RIG.rightShoulder));
  const lift = 0.55 * smooth((tipPattern.y + 0.25) / 0.4);
  const dir = norm(add(radial, { x: 0, y: -lift }));
  const handTarget = sub(tip, scale(dir, RIG.baton));
  const arm = solveArm(RIG.rightShoulder, handTarget, RIG.upperArm, RIG.forearm, -1);
  const realTip = add(arm.hand, scale(dir, RIG.baton));
  return { ...arm, tip: realTip, batonAngle: (Math.atan2(dir.y, dir.x) * 180) / Math.PI };
}

export interface BatonPose {
  /** Where the hand holds the baton. Always below the tip. */
  hand: Point;
  tip: Point;
  /** Baton angle in degrees (SVG rotation; -90 = straight up). */
  batonAngle: number;
}

/** Most the baton leans away from vertical, either way. */
export const MAX_BATON_TILT = 35;
/** Degrees of lean per art unit of horizontal distance from the pattern centre. */
const TILT_PER_UNIT = 0.3;
/** Below the ictus plane (lowering to rest) the path is squashed, so the hand stays above the podium. */
const BELOW_PLANE_SCALE = 0.12;

/**
 * The armless frog's baton: a floating hand holds it, and the baton ALWAYS points up from the
 * hand, leaning left or right by at most MAX_BATON_TILT depending on where the tip is.
 * The angle depends only on the tip's horizontal position, so it changes smoothly and can
 * never flip or spin round, whatever path the tip takes.
 */
export function floatingBaton(tipPattern: Point): BatonPose {
  const p = tipPattern.y < 0 ? { x: tipPattern.x, y: tipPattern.y * BELOW_PLANE_SCALE } : tipPattern;
  const tip = toArt(p);
  const lean = clamp((tip.x - RIG.patternOrigin.x) * TILT_PER_UNIT, -MAX_BATON_TILT, MAX_BATON_TILT);
  const batonAngle = -90 + lean;
  const rad = (batonAngle * Math.PI) / 180;
  const hand = { x: tip.x - Math.cos(rad) * RIG.baton, y: tip.y - Math.sin(rad) * RIG.baton };
  return { hand, tip, batonAngle };
}

/** Deterministic pseudo-random in [0,1) from an integer (so blinks don't need state). */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 0 = open, 1 = shut. A blink roughly every 2.5–5 s, lasting ~150 ms. */
export function blinkAmount(t: number): number {
  const period = 3.6;
  const seg = Math.floor(t / period);
  const start = seg * period + hash(seg) * (period - 0.4);
  const dt = t - start;
  if (dt < 0 || dt > 0.16) return 0;
  return Math.sin((dt / 0.16) * Math.PI);
}

export interface FrogPose {
  baton: BatonPose;
  leftArm: ArmPose;
  /** Head offset (nod) and tilt in degrees. */
  head: { dx: number; dy: number; rotate: number };
  /** Torso breathing / inflation, 1 = normal. */
  chest: number;
  /** Throat pouch inflation 0..1. */
  throat: number;
  /** Eyelid closure 0 (wide) .. 1 (shut). */
  lids: number;
  /** Pupil offset (art units) and size multiplier. */
  pupils: { dx: number; dy: number; size: number };
  /** Brow lift in art units (negative = up). */
  brows: number;
  /** Mouth opening 0..1. */
  mouth: number;
  /** Ictus flash 0..1 at the baton tip. */
  flash: number;
  /** Top hat hop on the downbeat: lift (art units, negative = up) and tilt (degrees). */
  hat: { dy: number; rotate: number };
}

/**
 * Compute the full pose.
 * @param s     session state at the audio clock (null = idle, nothing playing)
 * @param wall  wall-clock seconds, for idle life (blinks, breathing)
 */
export function poseFor(s: SessionState | null, wall: number): FrogPose {
  const phase = s && !s.finished ? s.phase : 'rest';
  const baton = floatingBaton(s?.baton ?? REST_POSITION);
  const p = s?.phaseProgress ?? 0;

  // ── free (left) hand: rests on the waistcoat; rises with an open palm to invite the entry,
  //    sweeps down with the first downbeat; joins the cutoff.
  let leftTarget: Point = RIG.leftHandRest;
  let attention = 0; // 0 relaxed .. 1 fully attentive
  switch (phase) {
    case 'raise':
      leftTarget = lerpPt(RIG.leftHandRest, RIG.leftHandReady, smooth((p - 0.25) / 0.75));
      attention = smooth(p);
      break;
    case 'hold':
      leftTarget = { x: RIG.leftHandReady.x, y: RIG.leftHandReady.y + 1.5 * Math.sin(wall * 1.3) };
      attention = 1;
      break;
    case 'prep':
      leftTarget = add(RIG.leftHandReady, { x: 4 * p, y: -14 * Math.sin(Math.PI * p * 0.8) });
      attention = 1;
      break;
    case 'conducting': {
      // Drop the invitation hand over the first beat after the cue, then follow the music lightly.
      const since = s!.sinceEntry;
      const back = smooth(since / 0.5);
      const mirrored = { x: 400 - baton.hand.x, y: baton.hand.y };
      const follow = lerpPt(RIG.leftHandRest, mirrored, 0.12);
      leftTarget = since < 0 ? RIG.leftHandReady : lerpPt(RIG.leftHandReady, follow, back);
      attention = since < 0 ? 1 : 1 - 0.6 * back;
      break;
    }
    case 'cutoff': {
      // Mirror the baton's closing loop: both hands release together.
      leftTarget = { x: 400 - baton.hand.x + 12, y: baton.hand.y - 6 };
      attention = 0.6;
      break;
    }
    case 'lower':
      leftTarget = lerpPt({ x: 400 - baton.hand.x, y: baton.hand.y }, RIG.leftHandRest, smooth(p * 1.4));
      break;
  }
  const leftArm = solveArm(RIG.leftShoulder, leftTarget, RIG.upperArm, RIG.forearm, 1);

  // ── head: nods on each ictus (deeper on the downbeat), tilts slightly with the baton.
  let nod = 0;
  if (phase === 'conducting' && s?.beatProgress !== undefined) {
    const strength = s.beat === 0 ? 5 : 2.5;
    nod = strength * Math.pow(1 - s.beatProgress, 3);
  }
  const idleBob = Math.sin(wall * 1.6) * 0.8;
  const tilt = phase === 'conducting' ? clamp((s?.baton.x ?? 0) * -3, -3, 3) : phase === 'hold' ? 1.5 : 0;

  // ── breath: the conductor inhales over the prep beat (chest + throat swell) and lets it out on the entry.
  let inhale = 0;
  if (phase === 'prep') inhale = smooth(p);
  else if (phase === 'conducting' && s && s.sinceEntry < 0.35 && s.sinceEntry > -10) inhale = s.sinceEntry < 0 ? 1 : 1 - smooth(s.sinceEntry / 0.35);
  const chest = 1 + 0.01 * Math.sin(wall * 1.6) + 0.035 * inhale;
  const throat = Math.max(inhale, 0.15 + 0.1 * Math.sin(wall * 2.3));

  // ── eyes: droopy, dignified lids when relaxed; wide open and locked on you while waiting.
  const blink = phase === 'prep' ? 0 : blinkAmount(wall);
  // ── downbeat: hat hops, eyes pop wide open (blinks are skipped so the pop is never hidden).
  const down = downbeatIntensity(s);
  const lidBase = lerp(0.32, 0.08, attention);
  const lids = down > 0 ? lerp(lidBase, 0, down) : Math.max(lidBase, blink);
  const look =
    phase === 'conducting' || phase === 'cutoff'
      ? { dx: clamp((baton.tip.x - 200) / 20, -4, 4), dy: clamp((baton.tip.y - 170) / 30, -2, 3) }
      : { dx: 0, dy: 2 * attention };
  const pupils = { ...look, size: 1 + 0.25 * attention + 0.35 * down };

  const brows = -2 * attention - 4 * inhale;
  const mouth = Math.max(0.6 * inhale, phase === 'done' ? 0 : 0);

  const flash = phase === 'conducting' && s?.beatProgress !== undefined ? Math.max(0, 1 - s.beatProgress / 0.15) : 0;

  return {
    baton,
    leftArm,
    head: { dx: 0, dy: idleBob + nod, rotate: tilt },
    chest,
    throat,
    lids,
    pupils,
    brows,
    mouth,
    flash,
    hat: { dy: -16 * down, rotate: 6 * down },
  };
}
