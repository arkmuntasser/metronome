import { useEffect, useRef } from 'react';
import type { SessionState } from '../core';
import { downbeatIntensity } from './downbeat';

/**
 * A warm glow around the edges of the whole screen on every downbeat, visible out of the
 * corner of your eye while you read the music. Driven by the audio clock, like the conductor.
 */
export function DownbeatPulse({ getState, enabled }: { getState: () => SessionState | null; enabled: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = -1;
    const frame = () => {
      const v = Math.round(downbeatIntensity(getState()) * 1000) / 1000;
      if (v !== last && el.current) {
        el.current.style.opacity = String(v);
        last = v;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [getState, enabled]);
  if (!enabled) return null;
  return <div ref={el} className="downbeat-pulse" aria-hidden="true" style={{ opacity: 0 }} />;
}
