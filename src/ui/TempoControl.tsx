import { useEffect, useRef, useState } from 'react';
import { MAX_BPM, MIN_BPM, tapTempo } from '../core';
import { tempoName } from './format';

interface Props {
  bpm: number;
  unit: string;
  onChange: (bpm: number) => void;
}

const clampBpm = (v: number) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(v)));

/** Press-and-hold to repeat: one step now, then faster steps after a short pause. */
function useRepeat(step: () => void) {
  const timers = useRef<number[]>([]);
  const stepRef = useRef(step);
  stepRef.current = step;
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
  };
  useEffect(() => stop, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      stop();
      stepRef.current();
      timers.current.push(
        window.setTimeout(() => {
          timers.current.push(window.setInterval(() => stepRef.current(), 70));
        }, 420),
      );
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Keyboard users: Enter/Space fire click without pointer events.
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        stepRef.current();
      }
    },
  };
}

export function TempoControl({ bpm, unit, onChange }: Props) {
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const change = (d: number) => onChange(clampBpm(bpmRef.current + d));
  const down = useRepeat(() => change(-1));
  const up = useRepeat(() => change(+1));
  const taps = useRef<number[]>([]);
  const [tapped, setTapped] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(bpm));

  const tap = () => {
    const r = tapTempo([...taps.current, performance.now() / 1000]);
    taps.current = r.taps;
    if (r.bpm !== null) onChange(r.bpm);
    setTapped(true);
    window.setTimeout(() => setTapped(false), 90);
  };

  const commit = () => {
    const v = Number(draft);
    if (Number.isFinite(v) && draft.trim() !== '') onChange(clampBpm(v));
    setEditing(false);
  };

  return (
    <div className="tempo">
      <div className="tempo-row">
        <button type="button" className="round-btn" aria-label="Slower" {...down}>
          −
        </button>
        <div className="tempo-readout">
          {editing ? (
            <input
              className="tempo-input"
              type="number"
              inputMode="numeric"
              min={MIN_BPM}
              max={MAX_BPM}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(false);
              }}
              aria-label="Tempo in beats per minute"
            />
          ) : (
            <button
              type="button"
              className="tempo-value"
              onClick={() => {
                setDraft(String(bpm));
                setEditing(true);
              }}
              aria-label={`Tempo ${bpm} beats per minute. Tap to type a tempo.`}
            >
              <span className="tempo-unit">{unit} =</span> {bpm}
            </button>
          )}
          <div className="tempo-name">{tempoName(bpm)}</div>
        </div>
        <button type="button" className="round-btn" aria-label="Faster" {...up}>
          +
        </button>
        <button type="button" className={`tap-btn ${tapped ? 'tapped' : ''}`} onClick={tap} aria-label="Tap tempo">
          Tap
        </button>
      </div>
      <input
        className="tempo-slider"
        type="range"
        min={MIN_BPM}
        max={MAX_BPM}
        value={bpm}
        onChange={(e) => onChange(+e.target.value)}
        aria-label="Tempo"
      />
    </div>
  );
}
