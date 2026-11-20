/**
 * Everything the user can set, as one plain serialisable object (→ localStorage on web,
 * Codable on iOS). `sanitizeSettings` accepts anything (old versions, hand-edited storage,
 * garbage) and always returns valid settings.
 */

import { type Accent, type MeterSettings, type Subdivision, MAX_BPM, MIN_BPM, defaultAccents } from './meter';
import { TIME_SIGNATURE_PRESETS, type TimeSignaturePreset } from './presets';
import type { CueSettings, RoundLength, StartMode } from './timeline';
import type { DrillSettings, SessionSettings } from './session';

export type ClickSound = 'woodblock' | 'beep' | 'cowbell' | 'croak';
export const CLICK_SOUNDS: { id: ClickSound; label: string }[] = [
  { id: 'woodblock', label: 'Woodblock' },
  { id: 'beep', label: 'Beep' },
  { id: 'cowbell', label: 'Cowbell' },
  { id: 'croak', label: 'Frog croak' },
];

export interface PracticeSettings {
  version: 1;
  timeSignature: string;
  bpm: number;
  subdivision: Subdivision;
  accents: Accent[];
  cue: CueSettings;
  drill: DrillSettings;
  sound: ClickSound;
  volume: number;
  showGuide: boolean;
  /** Keep the screen awake while the app is open, not just while playing. */
  keepAwake: boolean;
}

export interface Preset {
  id: string;
  name: string;
  settings: PracticeSettings;
}

export const MAX_HOLD_SECONDS = 30;

export const DEFAULT_SETTINGS: PracticeSettings = {
  version: 1,
  timeSignature: TIME_SIGNATURE_PRESETS[0].id,
  bpm: 90,
  subdivision: 1,
  accents: defaultAccents(TIME_SIGNATURE_PRESETS[0].grouping),
  cue: {
    startMode: 'random',
    holdMin: 1,
    holdMax: 5,
    fixedHold: 3,
    entry: { pulse: 0, offset: 0 },
    length: { kind: 'untilStopped' },
    clicks: true,
    breath: true,
  },
  drill: { enabled: false, rounds: 5, restSeconds: 3 },
  sound: 'woodblock',
  volume: 0.8,
  showGuide: true,
  keepAwake: false,
};

export function timeSignatureOf(s: PracticeSettings): TimeSignaturePreset {
  return TIME_SIGNATURE_PRESETS.find((p) => p.id === s.timeSignature) ?? TIME_SIGNATURE_PRESETS[0];
}

export function meterOf(s: PracticeSettings): MeterSettings {
  const ts = timeSignatureOf(s);
  return {
    bpm: s.bpm,
    numerator: ts.numerator,
    denominator: ts.denominator,
    grouping: [...ts.grouping],
    accents: [...s.accents],
    subdivision: s.subdivision,
  };
}

export function sessionSettingsOf(s: PracticeSettings): SessionSettings {
  return { meter: meterOf(s), cue: s.cue, drill: s.drill };
}

/** Switch time signature, resetting accents and keeping the entry inside the bar. */
export function withTimeSignature(s: PracticeSettings, id: string): PracticeSettings {
  const ts = TIME_SIGNATURE_PRESETS.find((p) => p.id === id);
  if (!ts) return s;
  const entry = s.cue.entry.pulse < ts.numerator ? s.cue.entry : { pulse: 0, offset: 0 };
  return { ...s, timeSignature: id, accents: defaultAccents(ts.grouping), cue: { ...s.cue, entry } };
}

// ── sanitising ────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string | number>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

const ACCENTS: Accent[] = ['strong', 'medium', 'weak'];
const MODES: StartMode[] = ['random', 'fixed', 'countIn'];
const SUBS: Subdivision[] = [1, 2, 3, 4];

export function sanitizeSettings(raw: unknown): PracticeSettings {
  const d = DEFAULT_SETTINGS;
  const r = isObj(raw) ? raw : {};
  const ts = TIME_SIGNATURE_PRESETS.find((p) => p.id === r.timeSignature) ?? TIME_SIGNATURE_PRESETS[0];

  const rawAccents = Array.isArray(r.accents) ? r.accents : [];
  const accents =
    rawAccents.length === ts.numerator && rawAccents.every((a) => ACCENTS.includes(a as Accent))
      ? (rawAccents as Accent[])
      : defaultAccents(ts.grouping);

  const c = isObj(r.cue) ? r.cue : {};
  const entryRaw = isObj(c.entry) ? c.entry : {};
  const pulse = Math.floor(num(entryRaw.pulse, 0, 0, ts.numerator - 1));
  const offset = num(entryRaw.offset, 0, 0, 0.99);
  const lengthRaw = isObj(c.length) ? c.length : {};
  const length: RoundLength =
    lengthRaw.kind === 'bars' ? { kind: 'bars', bars: Math.floor(num(lengthRaw.bars, 4, 1, 999)) } : { kind: 'untilStopped' };
  const holdMin = num(c.holdMin, d.cue.holdMin, 0, MAX_HOLD_SECONDS);
  const holdMax = num(c.holdMax, d.cue.holdMax, 0, MAX_HOLD_SECONDS);

  const dr = isObj(r.drill) ? r.drill : {};

  return {
    version: 1,
    timeSignature: ts.id,
    bpm: Math.round(num(r.bpm, d.bpm, MIN_BPM, MAX_BPM)),
    subdivision: oneOf(r.subdivision, SUBS, d.subdivision),
    accents,
    cue: {
      startMode: oneOf(c.startMode, MODES, d.cue.startMode),
      holdMin: Math.min(holdMin, holdMax),
      holdMax: Math.max(holdMin, holdMax),
      fixedHold: num(c.fixedHold, d.cue.fixedHold, 0, MAX_HOLD_SECONDS),
      entry: { pulse, offset },
      length,
      clicks: bool(c.clicks, d.cue.clicks),
      breath: bool(c.breath, d.cue.breath),
    },
    drill: {
      enabled: bool(dr.enabled, d.drill.enabled),
      rounds: Math.floor(num(dr.rounds, d.drill.rounds, 1, 99)),
      restSeconds: num(dr.restSeconds, d.drill.restSeconds, 0, 60),
    },
    sound: oneOf(r.sound, CLICK_SOUNDS.map((s) => s.id), d.sound),
    volume: num(r.volume, d.volume, 0, 1),
    showGuide: bool(r.showGuide, d.showGuide),
    keepAwake: bool(r.keepAwake, d.keepAwake),
  };
}

export function sanitizePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObj)
    .filter((p) => typeof p.name === 'string' && p.name.trim() !== '')
    .map((p, i) => ({
      id: typeof p.id === 'string' && p.id ? p.id : `preset-${Date.now()}-${i}`,
      name: String(p.name).trim().slice(0, 60),
      settings: sanitizeSettings(p.settings),
    }));
}

// ── starter presets ──────────────────────────────────────────────────────────

const starter = (id: string, name: string, over: (s: PracticeSettings) => PracticeSettings): Preset => ({
  id,
  name,
  settings: sanitizeSettings(over(structuredClone(DEFAULT_SETTINGS))),
});

const tsId = (label: string) => TIME_SIGNATURE_PRESETS.find((p) => p.label === label)!.id;

export const STARTER_PRESETS: Preset[] = [
  starter('starter-downbeat', 'Downbeat entry, random wait', (s) => s),
  starter('starter-waltz', 'Waltz, pickup on 3', (s) => ({
    ...withTimeSignature(s, tsId('3/4')),
    bpm: 132,
    cue: { ...s.cue, entry: { pulse: 2, offset: 0 } },
  })),
  starter('starter-68-drill', '6/8 in 2, entry drill', (s) => ({
    ...withTimeSignature(s, tsId('6/8 in 2')),
    bpm: 60,
    cue: { ...s.cue, holdMin: 1.5, holdMax: 6, length: { kind: 'bars', bars: 4 } },
    drill: { enabled: true, rounds: 8, restSeconds: 3 },
  })),
  starter('starter-countin', 'Classic count-in, 4/4', (s) => ({
    ...s,
    bpm: 100,
    cue: { ...s.cue, startMode: 'countIn', breath: false },
  })),
];

/** A short human summary, e.g. "3/4 · ♩ = 132 · random 1–5 s · in on 3". */
export function describeSettings(s: PracticeSettings): string {
  const ts = timeSignatureOf(s);
  const parts = [ts.label, `${s.bpm} bpm`];
  const c = s.cue;
  parts.push(
    c.startMode === 'random' ? `wait ${c.holdMin}–${c.holdMax} s` : c.startMode === 'fixed' ? `wait ${c.fixedHold} s` : 'count-in',
  );
  if (c.entry.pulse !== 0 || c.entry.offset !== 0) parts.push(`in on ${c.entry.pulse + 1}${c.entry.offset ? '+' : ''}`);
  if (s.drill.enabled) parts.push(`drill ×${s.drill.rounds}`);
  else if (c.length.kind === 'bars') parts.push(`${c.length.bars} bars`);
  return parts.join(' · ');
}
