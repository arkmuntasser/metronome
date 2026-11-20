/**
 * iOS Safari audio quirks.
 *
 * 1. The ring/silent switch mutes Web Audio by default, because WebKit treats it as "ambient"
 *    sound. A metronome must play anyway, like a music app. Safari 17+ (iOS 17+) lets a page
 *    ask for the "playback" audio session, which ignores the switch. Older iOS has no API,
 *    but playing an <audio> element switches the page's session to playback for Web Audio too,
 *    so we start a looping, silent one.
 * 2. iOS only lets audio start inside a user gesture, and is most reliable when a sound is
 *    actually played in that gesture, so we play a one-sample silent buffer when unlocking.
 *
 * Everything here must be called synchronously inside the tap/click handler.
 * (Native iOS app equivalent: AVAudioSession.sharedInstance().setCategory(.playback).)
 */

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** A tiny WAV file of silence (0.25 s, 8 kHz, 8-bit mono) as a blob URL. */
function silentWavUrl(): string {
  const samples = 2000;
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128); // 8-bit silence is 128
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

let silentEl: HTMLAudioElement | null = null;

/** Ask for a playback audio session so the silent switch doesn't mute the clicks. Call before creating the AudioContext. */
export function requestPlaybackSession(): void {
  const nav = navigator as AudioSessionNavigator;
  if (nav.audioSession) {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      /* ignore */
    }
    return;
  }
  if (!isIOS()) return;
  try {
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.src = silentWavUrl();
      silentEl.loop = true;
      silentEl.preload = 'auto';
      silentEl.setAttribute('playsinline', '');
      silentEl.setAttribute('x-webkit-airplay', 'deny');
    }
    void silentEl.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/** Play one sample of silence through the context, inside the user gesture. */
export function primeContext(ctx: AudioContext): void {
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}
