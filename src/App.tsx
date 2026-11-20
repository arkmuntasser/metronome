import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type Accent,
  type CueSettings,
  type DrillSettings,
  type MeterSettings,
  type SessionSettings,
  type SessionState,
  type StartMode,
  type Subdivision,
  MAX_BPM,
  MIN_BPM,
  TIME_SIGNATURE_PRESETS,
  defaultAccents,
  tempoRefersToBeat,
} from './core';
import { AudioEngine } from './audio/engine';
import { CLICK_SOUNDS, type ClickSound } from './audio/sounds';
import { BatonView } from './ui/BatonView';

const engine = new AudioEngine();

const NEXT_ACCENT: Record<Accent, Accent> = { strong: 'medium', medium: 'weak', weak: 'strong' };
const NOTE: Record<number, string> = { 1: '𝅝', 2: '𝅗𝅥', 4: '♩', 8: '♪', 16: '𝅘𝅥𝅯' };

function tempoUnitLabel(m: MeterSettings): string {
  const beat = tempoRefersToBeat(m.grouping);
  const size = beat ? m.grouping[0] : 1;
  const base = NOTE[m.denominator] ?? '♩';
  if (size === 1) return base;
  if (size === 3) return `${NOTE[m.denominator / 2] ?? base}.`;
  return `${size}×${base}`;
}

function entryLabel(pulse: number, offset: number): string {
  const n = String(pulse + 1);
  if (offset === 0) return pulse === 0 ? `${n} (downbeat)` : n;
  return `${n} &`;
}

const PHASE_TEXT: Record<SessionState['phase'], string> = {
  rest: 'Ready when you are',
  raise: 'Raising the baton…',
  hold: 'Watch the baton…',
  prep: 'Breathe…',
  conducting: 'Play!',
  cutoff: 'And… release',
  lower: '',
  done: 'Bravo',
};

export default function App() {
  const [presetId, setPresetId] = useState(TIME_SIGNATURE_PRESETS[0].id);
  const preset = TIME_SIGNATURE_PRESETS.find((p) => p.id === presetId) ?? TIME_SIGNATURE_PRESETS[0];
  const [bpm, setBpm] = useState(90);
  const [subdivision, setSubdivision] = useState<Subdivision>(1);
  const [accents, setAccents] = useState<Accent[]>(() => defaultAccents(preset.grouping));
  const [cue, setCue] = useState<CueSettings>({
    startMode: 'random',
    holdMin: 1,
    holdMax: 5,
    fixedHold: 3,
    entry: { pulse: 0, offset: 0 },
    length: { kind: 'untilStopped' },
    clicks: true,
    breath: true,
  });
  const [drill, setDrill] = useState<DrillSettings>({ enabled: false, rounds: 5, restSeconds: 3 });
  const [sound, setSound] = useState<ClickSound>('woodblock');
  const [volume, setVolume] = useState(0.8);
  const [live, setLive] = useState<SessionState | null>(null);
  const running = live !== null && !live.finished;

  const meter: MeterSettings = useMemo(
    () => ({ bpm, numerator: preset.numerator, denominator: preset.denominator, grouping: preset.grouping, accents, subdivision }),
    [bpm, preset, accents, subdivision],
  );

  useEffect(() => {
    engine.sound = sound;
  }, [sound]);
  useEffect(() => {
    engine.volume = volume;
  }, [volume]);

  const choosePreset = (id: string) => {
    const p = TIME_SIGNATURE_PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setAccents(defaultAccents(p.grouping));
    setCue((c) => ({ ...c, entry: { pulse: c.entry.pulse < p.numerator ? c.entry.pulse : 0, offset: c.entry.offset } }));
  };

  const toggle = useCallback(async () => {
    if (engine.running && !engine.state()?.finished) {
      engine.stop();
    } else {
      const settings: SessionSettings = { meter, cue, drill };
      await engine.start(settings);
    }
  }, [meter, cue, drill]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, select, textarea')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void toggle();
      } else if (e.code === 'Escape') {
        engine.kill();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const getState = useCallback(() => engine.state(), []);

  const entryOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let p = 0; p < meter.numerator; p++)
      for (const o of [0, 0.5]) opts.push({ value: `${p}:${o}`, label: entryLabel(p, o) });
    return opts;
  }, [meter]);

  const status = live && !live.finished ? PHASE_TEXT[live.phase] : PHASE_TEXT.rest;
  const showEntered = live?.phase === 'conducting' && !live.entered ? 'Count-in…' : status;
  const counter =
    live?.phase === 'conducting' && live.bar !== undefined && live.beat !== undefined
      ? `${live.bar < 0 ? 'count' : `bar ${live.bar + 1}`} · ${live.beat + 1}`
      : ' ';

  return (
    <div className="app">
      <header>
        <h1>Maestro Frog</h1>
        <span className="tempo-badge">
          {tempoUnitLabel(meter)} = {bpm} · {preset.label}
        </span>
      </header>

      <main className="stage">
        <BatonView beatsPerBar={meter.grouping.length} getState={getState} onStateChange={setLive} />
        <div className="status" aria-live="polite">
          <div className={`phase phase-${live?.phase ?? 'rest'}`}>{showEntered}</div>
          <div className="counter">
            {counter}
            {live && live.totalRounds > 1 && !live.finished ? ` · round ${live.round + 1}/${live.totalRounds}` : ''}
          </div>
        </div>
        <button className={`go ${running ? 'stop' : ''}`} onClick={() => void toggle()}>
          {running ? 'Stop' : 'Start'}
        </button>
        <p className="hint">Space = start / stop · Esc = stop immediately</p>
      </main>

      <section className="controls" aria-disabled={running}>
        <fieldset disabled={running}>
          <legend>Tempo &amp; meter</legend>
          <label className="wide">
            Tempo ({tempoUnitLabel(meter)} = {bpm})
            <input type="range" min={MIN_BPM} max={MAX_BPM} value={bpm} onChange={(e) => setBpm(+e.target.value)} />
          </label>
          <label>
            BPM
            <input
              type="number"
              min={MIN_BPM}
              max={MAX_BPM}
              value={bpm}
              onChange={(e) => setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, +e.target.value || MIN_BPM)))}
            />
          </label>
          <label>
            Time signature
            <select value={presetId} onChange={(e) => choosePreset(e.target.value)}>
              {TIME_SIGNATURE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subdivision
            <select value={subdivision} onChange={(e) => setSubdivision(+e.target.value as Subdivision)}>
              <option value={1}>None</option>
              <option value={2}>2 per pulse</option>
              <option value={3}>3 per pulse (triplets)</option>
              <option value={4}>4 per pulse</option>
            </select>
          </label>
          <div className="wide">
            Accents (tap to change)
            <div className="accents">
              {accents.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className={`accent accent-${a}`}
                  onClick={() => setAccents((xs) => xs.map((x, j) => (j === i ? NEXT_ACCENT[x] : x)))}
                  title={a}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset disabled={running}>
          <legend>Cue-in</legend>
          <div className="wide segmented" role="radiogroup">
            {(
              [
                ['random', 'Random wait'],
                ['fixed', 'Exact wait'],
                ['countIn', 'Count-in bar'],
              ] as [StartMode, string][]
            ).map(([m, label]) => (
              <button key={m} type="button" aria-pressed={cue.startMode === m} onClick={() => setCue({ ...cue, startMode: m })}>
                {label}
              </button>
            ))}
          </div>
          {cue.startMode === 'random' && (
            <>
              <label>
                Wait at least (s)
                <input type="number" step={0.5} min={0} max={30} value={cue.holdMin} onChange={(e) => setCue({ ...cue, holdMin: Math.max(0, +e.target.value) })} />
              </label>
              <label>
                At most (s)
                <input type="number" step={0.5} min={0} max={30} value={cue.holdMax} onChange={(e) => setCue({ ...cue, holdMax: Math.max(0, +e.target.value) })} />
              </label>
            </>
          )}
          {cue.startMode === 'fixed' && (
            <label>
              Wait (s)
              <input type="number" step={0.5} min={0} max={30} value={cue.fixedHold} onChange={(e) => setCue({ ...cue, fixedHold: Math.max(0, +e.target.value) })} />
            </label>
          )}
          <label>
            Come in on
            <select
              value={`${cue.entry.pulse}:${cue.entry.offset}`}
              onChange={(e) => {
                const [p, o] = e.target.value.split(':').map(Number);
                setCue({ ...cue, entry: { pulse: p, offset: o } });
              }}
            >
              {entryOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Play for
            <select
              value={cue.length.kind === 'bars' ? cue.length.bars : 0}
              onChange={(e) => {
                const n = +e.target.value;
                setCue({ ...cue, length: n === 0 ? { kind: 'untilStopped' } : { kind: 'bars', bars: n } });
              }}
            >
              <option value={0}>Until I stop</option>
              {[1, 2, 4, 8, 16, 32].map((n) => (
                <option key={n} value={n}>
                  {n} bar{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={drill.enabled} onChange={(e) => setDrill({ ...drill, enabled: e.target.checked })} />
            Drill (repeat cue-ins)
          </label>
          {drill.enabled && (
            <>
              <label>
                Rounds
                <input type="number" min={1} max={50} value={drill.rounds} onChange={(e) => setDrill({ ...drill, rounds: Math.max(1, +e.target.value) })} />
              </label>
              <label>
                Rest between (s)
                <input type="number" min={0} max={30} step={0.5} value={drill.restSeconds} onChange={(e) => setDrill({ ...drill, restSeconds: Math.max(0, +e.target.value) })} />
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Sound</legend>
          <label className="check">
            <input type="checkbox" checked={cue.clicks} disabled={running} onChange={(e) => setCue({ ...cue, clicks: e.target.checked })} />
            Click track
          </label>
          <label className="check">
            <input type="checkbox" checked={cue.breath} disabled={running} onChange={(e) => setCue({ ...cue, breath: e.target.checked })} />
            Breath on the prep beat
          </label>
          <label>
            Click sound
            <select value={sound} onChange={(e) => setSound(e.target.value as ClickSound)}>
              {CLICK_SOUNDS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Volume
            <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(+e.target.value)} />
          </label>
        </fieldset>
      </section>
    </div>
  );
}
