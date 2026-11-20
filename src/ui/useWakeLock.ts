import { useEffect, useState } from 'react';

/**
 * Keep the screen on while `active` (the phone is propped on a music stand).
 * Uses the Screen Wake Lock API; the browser drops the lock whenever the page is hidden,
 * so it is re-requested when the page becomes visible again.
 * iOS equivalent: UIApplication.shared.isIdleTimerDisabled = true.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!supported || !active) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setHeld(true);
        sentinel.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false); // e.g. battery saver, or not allowed in this context
      }
    };
    const onVisible = () => void acquire();

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
      setHeld(false);
    };
  }, [supported, active]);

  return { supported, held };
}
