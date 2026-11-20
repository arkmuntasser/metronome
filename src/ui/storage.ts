import { type PracticeSettings, type Preset, DEFAULT_SETTINGS, STARTER_PRESETS, sanitizePresets, sanitizeSettings } from '../core';

/**
 * Local persistence. Storage can be unavailable (private mode, blocked site data), so every
 * access is guarded and the app works without it.
 */

const KEY_SETTINGS = 'maestro-frog:settings';
const KEY_PRESETS = 'maestro-frog:presets';

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: settings just won't persist */
  }
}

export function loadSettings(): PracticeSettings {
  const raw = read(KEY_SETTINGS);
  return raw === undefined ? structuredClone(DEFAULT_SETTINGS) : sanitizeSettings(raw);
}

export function saveSettings(s: PracticeSettings): void {
  write(KEY_SETTINGS, s);
}

/** First run gets the starter presets; after that, whatever the user kept. */
export function loadPresets(): Preset[] {
  const raw = read(KEY_PRESETS);
  return raw === undefined ? structuredClone(STARTER_PRESETS) : sanitizePresets(raw);
}

export function savePresets(list: Preset[]): void {
  write(KEY_PRESETS, list);
}
