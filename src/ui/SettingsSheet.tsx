import { useEffect, useRef, useState } from 'react';
import {
  type Accent,
  type PracticeSettings,
  type Preset,
  type StartMode,
  type Subdivision,
  CLICK_SOUNDS,
  MAX_HOLD_SECONDS,
  TIME_SIGNATURE_PRESETS,
  describeSettings,
  timeSignatureOf,
  withTimeSignature,
} from '../core';
import { entryOptions } from './format';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: PracticeSettings;
  update: (fn: (s: PracticeSettings) => PracticeSettings) => void;
  running: boolean;
  presets: Preset[];
  onSavePreset: (name: string) => void;
  onLoadPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
  onPreviewSound: () => void;
  wakeLockSupported: boolean;
}

const NEXT_ACCENT: Record<Accent, Accent> = { strong: 'medium', medium: 'weak', weak: 'strong' };
const ACCENT_NAME: Record<Accent, string> = { strong: 'strong', medium: 'medium', weak: 'soft' };
const MODES: [StartMode, string, string][] = [
  ['random', 'Random wait', 'He holds the baton up for an unpredictable time, then cues you in.'],
  ['fixed', 'Exact wait', 'Always the same wait before the cue — predictable.'],
  ['countIn', 'Count-in', 'A classic audible bar of clicks before you come in.'],
];

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  const commit = () => {
    const v = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(v)) props.onChange(Math.min(props.max, Math.max(props.min, v)));
    else setDraft(String(props.value));
  };
  return (
    <label className="field">
      <span>{props.label}</span>
      <span className="with-suffix">
        <input
          type="number"
          inputMode="decimal"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        {props.suffix && <span className="suffix">{props.suffix}</span>}
      </span>
    </label>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsSheet(p: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { settings: s, update, running: locked } = p;
  const ts = timeSignatureOf(s);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (p.open && !d.open) {
      d.showModal();
      d.scrollTop = 0;
    }
    if (!p.open && d.open) d.close();
  }, [p.open]);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmDelete]);

  const setCue = (patch: Partial<PracticeSettings['cue']>) => update((x) => ({ ...x, cue: { ...x.cue, ...patch } }));
  const setDrill = (patch: Partial<PracticeSettings['drill']>) => update((x) => ({ ...x, drill: { ...x.drill, ...patch } }));
  const save = () => {
    if (!name.trim()) return;
    p.onSavePreset(name.trim());
    setName('');
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={p.onClose}
      onClick={(e) => {
        if (e.target === ref.current) p.onClose(); // backdrop
      }}
      aria-labelledby="sheet-title"
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="sheet-title">Settings</h2>
          <button type="button" className="text-btn" onClick={p.onClose} autoFocus>
            Done
          </button>
        </header>

        {locked && (
          <p className="notice">
            Playing now: tempo, accents, subdivision and sound change live. Stop to change the rest.
          </p>
        )}

        <section>
          <h3>Presets</h3>
          <ul className="presets">
            {p.presets.length === 0 && <li className="empty">No presets yet. Save your current settings below.</li>}
            {p.presets.map((preset) => (
              <li key={preset.id}>
                <button type="button" className="preset-load" disabled={locked} onClick={() => p.onLoadPreset(preset.id)}>
                  <strong>{preset.name}</strong>
                  <small>{describeSettings(preset.settings)}</small>
                </button>
                <button
                  type="button"
                  className={`text-btn danger ${confirmDelete === preset.id ? 'confirm' : ''}`}
                  aria-label={confirmDelete === preset.id ? `Really delete ${preset.name}` : `Delete ${preset.name}`}
                  onClick={() => {
                    if (confirmDelete === preset.id) {
                      p.onDeletePreset(preset.id);
                      setConfirmDelete(null);
                    } else setConfirmDelete(preset.id);
                  }}
                >
                  {confirmDelete === preset.id ? 'Delete?' : '✕'}
                </button>
              </li>
            ))}
          </ul>
          <div className="save-row">
            <input
              type="text"
              placeholder="Name these settings…"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              aria-label="Preset name"
            />
            <button type="button" className="pill" disabled={!name.trim()} onClick={save}>
              {p.presets.some((x) => x.name.toLowerCase() === name.trim().toLowerCase()) ? 'Update' : 'Save'}
            </button>
          </div>
        </section>

        <section>
          <h3>Meter</h3>
          <label className="field">
            <span>Time signature</span>
            <select value={s.timeSignature} disabled={locked} onChange={(e) => update((x) => withTimeSignature(x, e.target.value))}>
              {TIME_SIGNATURE_PRESETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Subdivision</span>
            <select value={s.subdivision} onChange={(e) => update((x) => ({ ...x, subdivision: +e.target.value as Subdivision }))}>
              <option value={1}>None</option>
              <option value={2}>2 per {ts.denominator === 8 ? 'eighth' : 'beat'}</option>
              <option value={3}>3 per {ts.denominator === 8 ? 'eighth' : 'beat'} (triplets)</option>
              <option value={4}>4 per {ts.denominator === 8 ? 'eighth' : 'beat'}</option>
            </select>
          </label>
          <div className="field wide">
            <span>Accents — tap a beat to change it</span>
            <div className="accents">
              {s.accents.map((a, i) => (
                <button
                  key={i}
                  type="button"
                  className={`accent accent-${a}`}
                  aria-label={`Pulse ${i + 1}: ${ACCENT_NAME[a]}`}
                  onClick={() => update((x) => ({ ...x, accents: x.accents.map((v, j) => (j === i ? NEXT_ACCENT[v] : v)) }))}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <small className="legend">
              <i className="dot accent-strong" /> strong <i className="dot accent-medium" /> medium <i className="dot accent-weak" /> soft
            </small>
          </div>
        </section>

        <section>
          <h3>Cue-in</h3>
          <div className="modes" role="radiogroup" aria-label="How he starts">
            {MODES.map(([m, label, hint]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={s.cue.startMode === m}
                disabled={locked}
                className="mode"
                onClick={() => setCue({ startMode: m })}
              >
                <strong>{label}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </div>
          {s.cue.startMode === 'random' && (
            <div className="pair">
              <fieldset disabled={locked} className="plain">
                <NumberField label="Wait at least" suffix="s" step={0.5} min={0} max={MAX_HOLD_SECONDS} value={s.cue.holdMin} onChange={(v) => setCue({ holdMin: v, holdMax: Math.max(v, s.cue.holdMax) })} />
              </fieldset>
              <fieldset disabled={locked} className="plain">
                <NumberField label="At most" suffix="s" step={0.5} min={0} max={MAX_HOLD_SECONDS} value={s.cue.holdMax} onChange={(v) => setCue({ holdMax: v, holdMin: Math.min(v, s.cue.holdMin) })} />
              </fieldset>
            </div>
          )}
          {s.cue.startMode === 'fixed' && (
            <fieldset disabled={locked} className="plain">
              <NumberField label="Wait" suffix="s" step={0.5} min={0} max={MAX_HOLD_SECONDS} value={s.cue.fixedHold} onChange={(v) => setCue({ fixedHold: v })} />
            </fieldset>
          )}
          <label className="field">
            <span>Come in on</span>
            <select
              value={`${s.cue.entry.pulse}:${s.cue.entry.offset}`}
              disabled={locked}
              onChange={(e) => {
                const [pulse, offset] = e.target.value.split(':').map(Number);
                setCue({ entry: { pulse, offset } });
              }}
            >
              {entryOptions(s, ts.numerator, ts.grouping).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h3>Length</h3>
          <label className="field">
            <span>Play for</span>
            <select
              value={s.cue.length.kind === 'bars' ? s.cue.length.bars : 0}
              disabled={locked}
              onChange={(e) => {
                const n = +e.target.value;
                setCue({ length: n === 0 ? { kind: 'untilStopped' } : { kind: 'bars', bars: n } });
              }}
            >
              <option value={0}>{s.drill.enabled ? 'Until I stop (4 bars per round)' : 'Until I stop'}</option>
              {[1, 2, 4, 8, 12, 16, 32].map((n) => (
                <option key={n} value={n}>
                  {n} bar{n > 1 ? 's' : ''}, then cut off
                </option>
              ))}
            </select>
          </label>
          <Toggle
            label="Drill mode"
            hint="Several cue-ins in a row, each with a new wait."
            checked={s.drill.enabled}
            disabled={locked}
            onChange={(v) => setDrill({ enabled: v })}
          />
          {s.drill.enabled && (
            <div className="pair">
              <fieldset disabled={locked} className="plain">
                <NumberField label="Rounds" min={1} max={99} value={s.drill.rounds} onChange={(v) => setDrill({ rounds: Math.round(v) })} />
              </fieldset>
              <fieldset disabled={locked} className="plain">
                <NumberField label="Rest between" suffix="s" step={0.5} min={0} max={60} value={s.drill.restSeconds} onChange={(v) => setDrill({ restSeconds: v })} />
              </fieldset>
            </div>
          )}
        </section>

        <section>
          <h3>Sound</h3>
          <Toggle label="Click track" hint="Off = watch the frog only." checked={s.cue.clicks} disabled={locked} onChange={(v) => setCue({ clicks: v })} />
          <Toggle label="Breath on the prep beat" hint="A soft inhale as he gives the cue." checked={s.cue.breath} disabled={locked} onChange={(v) => setCue({ breath: v })} />
          <div className="sound-row">
            <label className="field">
              <span>Click sound</span>
              <select value={s.sound} onChange={(e) => update((x) => ({ ...x, sound: e.target.value as PracticeSettings['sound'] }))}>
                {CLICK_SOUNDS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="pill" onClick={p.onPreviewSound} disabled={locked}>
              ▶ Hear it
            </button>
          </div>
          <label className="field">
            <span>Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => update((x) => ({ ...x, volume: +e.target.value }))} />
          </label>
        </section>

        <section>
          <h3>Display</h3>
          <Toggle label="Show the beat pattern" hint="Faint guide of the conducting shape." checked={s.showGuide} onChange={(v) => update((x) => ({ ...x, showGuide: v }))} />
          <Toggle
            label="Keep screen awake"
            hint={p.wakeLockSupported ? 'Always on while the app is open. (It is always kept awake while playing.)' : "This browser can't keep the screen awake."}
            checked={s.keepAwake}
            disabled={!p.wakeLockSupported}
            onChange={(v) => update((x) => ({ ...x, keepAwake: v }))}
          />
        </section>
      </div>
    </dialog>
  );
}
