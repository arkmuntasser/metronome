import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type ConductorView,
  type PracticeSettings,
  type Preset,
  type SessionState,
  MAX_BPM,
  MIN_BPM,
  applyPreset,
  meterOf,
  sessionSettingsOf,
  timeSignatureOf,
} from './core';
import { AudioEngine } from './audio/engine';
import { BatonView } from './ui/BatonView';
import { Frog } from './ui/frog/Frog';
import { SettingsSheet } from './ui/SettingsSheet';
import { TempoControl } from './ui/TempoControl';
import { tempoUnitLabel } from './ui/format';
import { loadPresets, loadSettings, savePresets, saveSettings } from './ui/storage';
import { useWakeLock } from './ui/useWakeLock';

const engine = new AudioEngine();

const PHASE_TEXT: Record<SessionState['phase'], string> = {
  rest: 'Ready when you are',
  raise: 'Raising the baton…',
  hold: 'Watch the baton…',
  prep: 'Breathe…',
  conducting: 'Play!',
  cutoff: 'And… release',
  lower: 'Bravo',
  done: 'Bravo',
};

const clampBpm = (v: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, v));

function summary(s: PracticeSettings): string[] {
  const c = s.cue;
  const wait =
    c.startMode === 'random' ? `Random wait ${c.holdMin}–${c.holdMax} s` : c.startMode === 'fixed' ? `Wait ${c.fixedHold} s` : 'Count-in bar';
  const entry = c.entry.pulse === 0 && c.entry.offset === 0 ? 'In on 1' : `In on ${c.entry.pulse + 1}${c.entry.offset ? '+' : ''}`;
  const len = s.drill.enabled
    ? `Drill ×${s.drill.rounds}`
    : c.length.kind === 'bars'
      ? `${c.length.bars} bar${c.length.bars > 1 ? 's' : ''}`
      : 'Until stopped';
  return [timeSignatureOf(s).label, wait, entry, len];
}

export default function App() {
  const [settings, setSettings] = useState<PracticeSettings>(loadSettings);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [live, setLive] = useState<SessionState | null>(null);
  const running = live !== null && !live.finished;

  const update = useCallback((fn: (s: PracticeSettings) => PracticeSettings) => setSettings(fn), []);
  const meter = useMemo(() => meterOf(settings), [settings]);

  // Persist (lightly debounced: sliders fire a lot), and flush when the page is hidden or closed.
  const latest = useRef(settings);
  latest.current = settings;
  useEffect(() => {
    const t = window.setTimeout(() => saveSettings(settings), 250);
    return () => window.clearTimeout(t);
  }, [settings]);
  useEffect(() => {
    const flush = () => saveSettings(latest.current);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  useEffect(() => savePresets(presets), [presets]);

  // Sound settings apply immediately.
  useEffect(() => {
    engine.sound = settings.sound;
  }, [settings.sound]);
  useEffect(() => {
    engine.volume = settings.volume;
  }, [settings.volume]);

  // Tempo / accents / subdivision apply live, from the next beat.
  const meterKey = `${meter.bpm}|${meter.subdivision}|${meter.accents.join(',')}`;
  const lastMeterKey = useRef(meterKey);
  useEffect(() => {
    if (meterKey === lastMeterKey.current) return;
    lastMeterKey.current = meterKey;
    if (engine.running) engine.updateMeter(meter);
  }, [meterKey, meter]);

  const wake = useWakeLock(running || settings.keepAwake);

  const toggle = useCallback(async () => {
    if (engine.running && !engine.state()?.finished) engine.stop();
    else await engine.start(sessionSettingsOf(settings));
  }, [settings]);

  const setBpm = useCallback((bpm: number) => update((s) => ({ ...s, bpm: clampBpm(bpm) })), [update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheetOpen) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, dialog')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void toggle();
      } else if (e.code === 'Escape') {
        engine.kill();
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const d = (e.code === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 1);
        update((s) => ({ ...s, bpm: clampBpm(s.bpm + d) }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, sheetOpen, update]);

  const getState = useCallback(() => engine.state(), []);

  const savePreset = (name: string) =>
    setPresets((list) => {
      const existing = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) return list.map((p) => (p === existing ? { ...p, name, settings: structuredClone(settings) } : p));
      return [...list, { id: `preset-${Date.now()}`, name, settings: structuredClone(settings) }];
    });
  const loadPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (p) setSettings((current) => applyPreset(current, p.settings));
  };
  const deletePreset = (id: string) => setPresets((list) => list.filter((p) => p.id !== id));

  const active = live && !live.finished ? live : null;
  const status = active ? (active.phase === 'conducting' && !active.entered ? 'Count-in…' : PHASE_TEXT[active.phase]) : PHASE_TEXT.rest;
  const counter =
    active?.phase === 'conducting' && active.bar !== undefined && active.beat !== undefined
      ? active.bar < 0
        ? `count-in · ${active.beat + 1}`
        : `bar ${active.bar + 1} · beat ${active.beat + 1}`
      : '';
  const round = active && active.totalRounds > 1 ? `round ${active.round + 1} of ${active.totalRounds}` : '';

  return (
    <div className="app">
      <header className="topbar">
        <h1>Maestro Frog</h1>
        <div className="topbar-actions">
          <div className="view-switch" role="group" aria-label="Conductor view">
            {(
              [
                ['frog', 'Frog'],
                ['minimal', 'Minimal'],
              ] as [ConductorView, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={settings.view === v} onClick={() => update((s) => ({ ...s, view: v }))}>
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" onClick={() => setSheetOpen(true)} aria-label="Settings and presets">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          <span>Settings</span>
          </button>
        </div>
      </header>

      <main className="stage-area">
        <div className="stage" onClick={() => void toggle()} aria-hidden="true">
          {settings.view === 'frog' ? (
            <Frog beatsPerBar={meter.grouping.length} showGuide={settings.showGuide} getState={getState} onStateChange={setLive} />
          ) : (
            <BatonView beatsPerBar={meter.grouping.length} showGuide={settings.showGuide} getState={getState} onStateChange={setLive} />
          )}
        </div>
        <div className="status" aria-live="polite">
          <div className={`phase phase-${active ? active.phase : 'rest'}`}>{status}</div>
          <div className="counter">{[counter, round].filter(Boolean).join(' · ') || ' '}</div>
        </div>
      </main>

      <section className="dock" aria-label="Controls">
        <TempoControl bpm={settings.bpm} unit={tempoUnitLabel(meter)} onChange={setBpm} />
        <button className={`go ${running ? 'stop' : ''}`} onClick={() => void toggle()}>
          {running ? 'Stop' : 'Start'}
        </button>
        <button type="button" className="chips" onClick={() => setSheetOpen(true)} aria-label={`Cue-in settings: ${summary(settings).join(', ')}. Change.`}>
          {summary(settings).map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </button>
        <p className="hint">
          Tap the frog or press Space to start / stop · ↑ ↓ tempo · Esc stops at once
          {wake.held ? ' · screen kept awake' : ''}
        </p>
      </section>

      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        settings={settings}
        update={update}
        running={running}
        presets={presets}
        onSavePreset={savePreset}
        onLoadPreset={loadPreset}
        onDeletePreset={deletePreset}
        onPreviewSound={() => void engine.preview(settings.sound)}
        wakeLockSupported={wake.supported}
      />
    </div>
  );
}
