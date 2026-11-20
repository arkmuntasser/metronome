import { useEffect, useMemo, useRef } from 'react';
import { type Point, type SessionState, batonInBar, patternFor } from '../../core';
import { RIG, poseFor, toArt } from './rig';

/**
 * The conductor. An original old-timey frog: ochre waistcoat, bow tie and a small top hat,
 * on a wooden podium. Every moving part is its own layer, driven each frame by `poseFor()`.
 *
 * He has no arms on purpose: swinging arms made the beat hard to follow, so only a small
 * floating hand holds the baton, and the baton tip is the one thing that moves on the beat.
 * (The rig still solves the arms, so they could come back as an option.)
 */

interface Props {
  beatsPerBar: number;
  showGuide: boolean;
  getState: () => SessionState | null;
  onStateChange?: (s: SessionState | null) => void;
}

const TRAIL_LEN = 28;
const f = (n: number) => n.toFixed(1);

// Eye geometry (art space).
const EYES = [
  { cx: 158, cy: 128 },
  { cx: 242, cy: 128 },
] as const;
const EYE_R = 19;

export function Frog({ beatsPerBar, showGuide, getState, onStateChange }: Props) {
  const els = useRef<Record<string, SVGElement | null>>({});
  const ref = (name: string) => (el: SVGElement | null) => {
    els.current[name] = el;
  };
  const set = (name: string, attr: string, value: string | number) => els.current[name]?.setAttribute(attr, String(value));
  const trail = useRef<Point[]>([]);
  const lastKey = useRef('');
  const onChange = useRef(onStateChange);
  onChange.current = onStateChange;

  const pattern = useMemo(() => patternFor(beatsPerBar), [beatsPerBar]);
  const guide = useMemo(() => {
    const pts: string[] = [];
    for (let b = 0; b < beatsPerBar; b++)
      for (let i = 0; i < 24; i++) {
        const p = toArt(batonInBar(pattern, b, i / 24));
        pts.push(`${f(p.x)},${f(p.y)}`);
      }
    const first = toArt(pattern.ictus[0]);
    pts.push(`${f(first.x)},${f(first.y)}`);
    return pts.join(' ');
  }, [pattern, beatsPerBar]);

  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      const s = getState();
      const pose = poseFor(s, now / 1000);

      // Body breathing (anchored at the feet).
      const sy = 1 + (pose.chest - 1) * 0.6;
      set('body', 'transform', `translate(200 372) scale(${pose.chest.toFixed(4)} ${sy.toFixed(4)}) translate(-200 -372)`);
      set('head', 'transform', `translate(${f(pose.head.dx)} ${f(pose.head.dy - (pose.chest - 1) * 60)}) rotate(${f(pose.head.rotate)} 200 190)`);
      set('throat', 'ry', f(7 + 9 * pose.throat));
      set('throat', 'cy', f(210 + 3 * pose.throat));

      // Eyes.
      EYES.forEach((e, i) => {
        set(`pupil${i}`, 'cx', f(e.cx + pose.pupils.dx));
        set(`pupil${i}`, 'cy', f(e.cy + 2 + pose.pupils.dy));
        set(`pupil${i}`, 'rx', f(8 * pose.pupils.size));
        set(`pupil${i}`, 'ry', f(6.5 * pose.pupils.size));
        set(`glint${i}`, 'cx', f(e.cx - 3 + pose.pupils.dx));
        set(`glint${i}`, 'cy', f(e.cy - 1 + pose.pupils.dy));
        const lidY = e.cy - EYE_R + 2 * EYE_R * pose.lids;
        set(`lid${i}`, 'height', f(Math.max(0, lidY - (e.cy - EYE_R - 2))));
        set(`lidline${i}`, 'y1', f(lidY));
        set(`lidline${i}`, 'y2', f(lidY));
        set(`brow${i}`, 'transform', `translate(0 ${f(pose.brows)})`);
      });
      set('mouthOpen', 'ry', f(9 * pose.mouth));

      // Baton, held by a floating hand.
      const b = pose.baton;
      set('baton', 'transform', `translate(${f(b.hand.x)} ${f(b.hand.y)}) rotate(${f(b.batonAngle)})`);
      set('flash', 'cx', f(b.tip.x));
      set('flash', 'cy', f(b.tip.y));
      set('flash', 'opacity', (0.55 * pose.flash).toFixed(3));

      const t = trail.current;
      t.push(b.tip);
      if (t.length > TRAIL_LEN) t.shift();
      set('trail', 'points', t.map((p) => `${f(p.x)},${f(p.y)}`).join(' '));

      const key = s ? `${s.phase}|${s.round}|${s.bar}|${s.beat}|${s.entered}|${s.finished}|${s.stopping}` : 'idle';
      if (key !== lastKey.current) {
        lastKey.current = key;
        onChange.current?.(s);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getState]);

  return (
    <svg className="frog" viewBox={`0 0 ${RIG.viewBox.w} ${RIG.viewBox.h}`} role="img" aria-label="Frog conductor">
      <defs>
        <radialGradient id="spot" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="var(--spot)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--spot)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a5a32" />
          <stop offset="100%" stopColor="#5c3a1f" />
        </linearGradient>
        <linearGradient id="vest" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c58f36" />
          <stop offset="100%" stopColor="#9c6c25" />
        </linearGradient>
        {EYES.map((e, i) => (
          <clipPath id={`eyeclip${i}`} key={i}>
            <circle cx={e.cx} cy={e.cy} r={EYE_R} />
          </clipPath>
        ))}
      </defs>

      {/* Stage */}
      <ellipse cx="200" cy="240" rx="200" ry="230" fill="url(#spot)" />
      <ellipse cx="200" cy="452" rx="150" ry="9" fill="#000" opacity="0.18" />
      <g className="podium">
        <path d="M86 374 L314 374 L328 452 L72 452 Z" fill="url(#wood)" stroke="var(--frog-ink)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M140 378 L136 450 M200 378 L200 450 M260 378 L264 450" stroke="#4a2e17" strokeWidth="2" opacity="0.6" />
        <rect x="78" y="364" width="244" height="13" rx="4" fill="#6e4524" stroke="var(--frog-ink)" strokeWidth="3" />
        <rect x="174" y="398" width="52" height="26" rx="5" fill="#d9b25a" stroke="#5c3a1f" strokeWidth="2" />
        <text x="200" y="418" textAnchor="middle" fontSize="18" fill="#5c3a1f" fontFamily="Georgia, serif">
          ♫
        </text>
      </g>

      {/* Feet and haunches */}
      <g fill="#5d7a2f" stroke="var(--frog-ink)" strokeWidth="3">
        <ellipse cx="146" cy="342" rx="36" ry="30" />
        <ellipse cx="254" cy="342" rx="36" ry="30" />
        <path d="M112 368 q-8 -10 4 -12 q4 -10 14 -4 q8 -8 16 2 q10 0 8 12 Z" />
        <path d="M288 368 q8 -10 -4 -12 q-4 -10 -14 -4 q-8 -8 -16 2 q-10 0 -8 12 Z" />
      </g>

      {/* Body */}
      <g ref={ref('body')}>
        <path
          d="M200 205 C150 205 128 240 126 290 C122 340 142 372 200 372 C258 372 278 340 274 290 C272 240 250 205 200 205 Z"
          fill="#6f8f3a"
          stroke="var(--frog-ink)"
          strokeWidth="3.5"
        />
        <path d="M176 218 L224 218 L212 292 L200 304 L188 292 Z" fill="#f4ecd8" />
        <g fill="url(#vest)" stroke="var(--frog-ink)" strokeWidth="3" strokeLinejoin="round">
          <path d="M131 258 C133 234 150 221 176 217 L200 304 L200 356 L184 364 C162 360 144 350 137 336 C128 312 129 282 131 258 Z" />
          <path d="M269 258 C267 234 250 221 224 217 L200 304 L200 356 L216 364 C238 360 256 350 263 336 C272 312 271 282 269 258 Z" />
        </g>
        <path d="M152 300 h18 M230 300 h18" stroke="#6b4716" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M168 300 C176 318 192 318 200 312" fill="none" stroke="#e2c46a" strokeWidth="2" strokeDasharray="3 2" />
        <g fill="#e8cd78" stroke="#6b4716" strokeWidth="1.5">
          <circle cx="200" cy="316" r="3.8" />
          <circle cx="200" cy="333" r="3.8" />
          <circle cx="200" cy="350" r="3.8" />
        </g>
      </g>

      {/* Head */}
      <g ref={ref('head')}>
        <ellipse ref={ref('throat')} cx="200" cy="212" rx="34" ry="9" fill="#e5dfaa" stroke="var(--frog-ink)" strokeWidth="3" />
        {/* union outline: ink pass, then fill pass */}
        <g fill="var(--frog-ink)" stroke="var(--frog-ink)" strokeWidth="7">
          <ellipse cx="200" cy="170" rx="88" ry="48" />
          <circle cx={EYES[0].cx} cy={EYES[0].cy} r="29" />
          <circle cx={EYES[1].cx} cy={EYES[1].cy} r="29" />
        </g>
        <g fill="#7a9a40">
          <ellipse cx="200" cy="170" rx="88" ry="48" />
          <circle cx={EYES[0].cx} cy={EYES[0].cy} r="29" />
          <circle cx={EYES[1].cx} cy={EYES[1].cy} r="29" />
        </g>
        <ellipse cx="200" cy="192" rx="62" ry="20" fill="#c9cc86" opacity="0.55" />

        {/* Top hat, cocked */}
        <g transform="rotate(-9 200 104)" stroke="var(--frog-ink)" strokeWidth="3">
          <rect x="180" y="58" width="40" height="46" rx="4" fill="#2e2622" />
          <rect x="180" y="90" width="40" height="8" fill="#9b2f1f" />
          <ellipse cx="200" cy="104" rx="30" ry="6.5" fill="#2e2622" />
        </g>

        {EYES.map((e, i) => (
          <g key={i}>
            <circle cx={e.cx} cy={e.cy} r={EYE_R} fill="#fbf6e6" stroke="var(--frog-ink)" strokeWidth="3" />
            <ellipse ref={ref(`pupil${i}`)} cx={e.cx} cy={e.cy + 2} rx="8" ry="6.5" fill="#1d150d" />
            <circle ref={ref(`glint${i}`)} cx={e.cx - 3} cy={e.cy - 1} r="2.4" fill="#fff" />
            <g clipPath={`url(#eyeclip${i})`}>
              <rect ref={ref(`lid${i}`)} x={e.cx - EYE_R - 2} y={e.cy - EYE_R - 2} width={2 * EYE_R + 4} height="10" fill="#7a9a40" />
              <line ref={ref(`lidline${i}`)} x1={e.cx - EYE_R} x2={e.cx + EYE_R} y1={e.cy} y2={e.cy} stroke="var(--frog-ink)" strokeWidth="3" />
            </g>
            <circle cx={e.cx} cy={e.cy} r={EYE_R} fill="none" stroke="var(--frog-ink)" strokeWidth="3" />
            <path
              ref={ref(`brow${i}`)}
              d={i === 0 ? 'M141 104 Q156 96 172 102' : 'M228 102 Q244 96 259 104'}
              fill="none"
              stroke="var(--frog-ink)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        ))}

        <circle cx="191" cy="158" r="2.6" fill="var(--frog-ink)" />
        <circle cx="209" cy="158" r="2.6" fill="var(--frog-ink)" />
        <ellipse cx="138" cy="184" rx="12" ry="6" fill="#d98a6a" opacity="0.4" />
        <ellipse cx="262" cy="184" rx="12" ry="6" fill="#d98a6a" opacity="0.4" />
        <ellipse ref={ref('mouthOpen')} cx="200" cy="186" rx="13" ry="0" fill="#5a1f14" />
        <path d="M136 176 Q200 200 264 176" fill="none" stroke="var(--frog-ink)" strokeWidth="4" strokeLinecap="round" />
      </g>

      {/* Bow tie */}
      <g fill="#9b2f1f" stroke="var(--frog-ink)" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M200 222 L181 211 L181 233 Z" />
        <path d="M200 222 L219 211 L219 233 Z" />
        <circle cx="200" cy="222" r="5" />
      </g>

      {showGuide && (
        <g className="guide" pointerEvents="none">
          <polyline points={guide} />
          {pattern.ictus.map((p, i) => {
            const q = toArt(p);
            return (
              <text key={i} x={q.x} y={q.y + 14} textAnchor="middle">
                {i + 1}
              </text>
            );
          })}
        </g>
      )}

      <polyline ref={ref('trail')} className="trail" points="" />
      <circle ref={ref('flash')} className="flash" r="16" opacity="0" />

      <g ref={ref('baton')}>
        <line x1="8" y1="0" x2={RIG.baton} y2="0" stroke="var(--frog-ink)" strokeWidth="5.5" strokeLinecap="round" />
        <line x1="8" y1="0" x2={RIG.baton} y2="0" stroke="#fffaf0" strokeWidth="3" strokeLinecap="round" />
        <line x1="-6" y1="0" x2="12" y2="0" stroke="var(--frog-ink)" strokeWidth="9" strokeLinecap="round" />
        <line x1="-6" y1="0" x2="12" y2="0" stroke="#7a4a24" strokeWidth="6" strokeLinecap="round" />
        <g fill="#7a9a40" stroke="var(--frog-ink)" strokeWidth="2.5">
          <circle cx="0" cy="0" r="9.5" />
          <circle cx="5" cy="-6" r="4" />
          <circle cx="7" cy="2" r="4" />
        </g>
      </g>
    </svg>
  );
}
