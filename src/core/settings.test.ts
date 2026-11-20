import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  STARTER_PRESETS,
  describeSettings,
  meterOf,
  sanitizePresets,
  sanitizeSettings,
  sessionSettingsOf,
  withTimeSignature,
} from './settings';
import { validateMeter } from './meter';
import { Session } from './session';
import { TIME_SIGNATURE_PRESETS } from './presets';

describe('settings', () => {
  it('defaults round-trip unchanged', () => {
    expect(sanitizeSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))).toEqual(DEFAULT_SETTINGS);
  });

  it('garbage becomes defaults', () => {
    for (const junk of [null, 42, 'x', [], { bpm: 'fast', cue: 3, accents: ['loud'] }]) {
      const s = sanitizeSettings(junk);
      expect(validateMeter(meterOf(s))).toEqual([]);
      expect(s.bpm).toBe(DEFAULT_SETTINGS.bpm);
    }
  });

  it('clamps and repairs', () => {
    const s = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      bpm: 9999,
      accents: ['strong'], // wrong length for 4/4
      cue: { ...DEFAULT_SETTINGS.cue, holdMin: 8, holdMax: 2, entry: { pulse: 12, offset: 0.5 } },
    });
    expect(s.bpm).toBe(300);
    expect(s.accents).toHaveLength(4);
    expect([s.cue.holdMin, s.cue.holdMax]).toEqual([2, 8]);
    expect(s.cue.entry).toEqual({ pulse: 3, offset: 0.5 });
  });

  it('changing time signature resets accents and keeps entry in range', () => {
    const s = { ...DEFAULT_SETTINGS, cue: { ...DEFAULT_SETTINGS.cue, entry: { pulse: 3, offset: 0 } } };
    const t = withTimeSignature(s, TIME_SIGNATURE_PRESETS.find((p) => p.label === '3/4')!.id);
    expect(t.accents).toHaveLength(3);
    expect(t.cue.entry.pulse).toBe(0);
  });

  it('every starter preset builds a working session', () => {
    for (const p of STARTER_PRESETS) {
      expect(() => new Session(sessionSettingsOf(p.settings), 0)).not.toThrow();
      expect(describeSettings(p.settings).length).toBeGreaterThan(5);
    }
  });

  it('sanitizes stored presets', () => {
    const list = sanitizePresets([{ id: 'a', name: '  Mozart  ', settings: { bpm: 72 } }, { name: '' }, 'junk']);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', name: 'Mozart' });
    expect(list[0].settings.bpm).toBe(72);
  });
});
