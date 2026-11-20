import { useEffect, useMemo, useRef } from 'react';
import { type Point, type SessionState, REST_POSITION, batonInBar, patternFor } from '../core';

/**
 * Temporary stand-in for the frog: draws the conducting pattern and the baton tip moving
 * along it, driven by the audio clock. Step 4 replaces this with the animated frog,
 * which consumes the same `SessionState`.
 */

const S = 100; // normalised units → SVG units
const toSvg = (p: Point) => ({ x: p.x * S, y: -p.y * S });
const TRAIL_LEN = 36;

interface Props {
  beatsPerBar: number;
  getState: () => SessionState | null;
  onStateChange?: (s: SessionState | null) => void;
}

export function BatonView({ beatsPerBar, getState, onStateChange }: Props) {
  const tipRef = useRef<SVGCircleElement>(null);
  const trailRef = useRef<SVGPolylineElement>(null);
  const stickRef = useRef<SVGLineElement>(null);
  const flashRef = useRef<SVGCircleElement>(null);
  const trail = useRef<{ x: number; y: number }[]>([]);
  const lastKey = useRef('');
  const onChange = useRef(onStateChange);
  onChange.current = onStateChange;

  const pattern = useMemo(() => patternFor(beatsPerBar), [beatsPerBar]);
  const guide = useMemo(() => {
    const pts: string[] = [];
    for (let b = 0; b < beatsPerBar; b++)
      for (let i = 0; i < 24; i++) {
        const p = toSvg(batonInBar(pattern, b, i / 24));
        pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
      }
    const first = toSvg(pattern.ictus[0]);
    pts.push(`${first.x},${first.y}`);
    return pts.join(' ');
  }, [pattern, beatsPerBar]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const s = getState();
      const pos = toSvg(s?.baton ?? REST_POSITION);
      tipRef.current?.setAttribute('cx', String(pos.x));
      tipRef.current?.setAttribute('cy', String(pos.y));
      stickRef.current?.setAttribute('x2', String(pos.x));
      stickRef.current?.setAttribute('y2', String(pos.y));

      const t = trail.current;
      t.push(pos);
      if (t.length > TRAIL_LEN) t.shift();
      trailRef.current?.setAttribute('points', t.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));

      // Flash on each ictus (the first ~80 ms of a beat).
      const flashing = s?.phase === 'conducting' && (s.beatProgress ?? 1) < 0.12;
      flashRef.current?.setAttribute('opacity', flashing ? '0.35' : '0');
      if (flashing) {
        flashRef.current?.setAttribute('cx', String(pos.x));
        flashRef.current?.setAttribute('cy', String(pos.y));
      }

      const key = s ? `${s.phase}|${s.round}|${s.bar}|${s.beat}|${s.entered}|${s.finished}` : 'idle';
      if (key !== lastKey.current) {
        lastKey.current = key;
        onChange.current?.(s);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [getState]);

  // The baton "hand" pivot sits above and slightly to the conductor's right (screen left).
  const pivot = { x: -40, y: -160 };

  return (
    <svg className="baton-view" viewBox="-140 -175 280 240" role="img" aria-label="Conductor's baton">
      <polyline points={guide} className="guide" />
      {pattern.ictus.map((p, i) => {
        const q = toSvg(p);
        return (
          <g key={i} className="ictus">
            <circle cx={q.x} cy={q.y} r={3} />
            <text x={q.x} y={q.y + 16} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        );
      })}
      <line ref={stickRef} className="stick" x1={pivot.x} y1={pivot.y} x2={0} y2={0} />
      <polyline ref={trailRef} className="trail" points="" />
      <circle ref={flashRef} className="flash" r={22} opacity={0} />
      <circle ref={tipRef} className="tip" r={6} />
    </svg>
  );
}
