# Maestro Frog (working title)

A metronome with a frog conductor who raises his baton, waits, and cues you in, so you can
practise coming in with a conductor the way you would in an orchestra. See [docs/SPEC.md](docs/SPEC.md).

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # core timing / pattern tests
npm run build      # type-check + production build (PWA, works offline)
```

## Layout

| Path | What |
|---|---|
| `src/core/` | Platform-independent logic: meter model, conducting patterns, cue-in timeline, drill sessions. Pure TS, no DOM. This is what gets ported to Swift for iOS. |
| `src/audio/` | Web Audio look-ahead scheduler and synthesised click / breath sounds. |
| `src/ui/frog/rig.ts` | The frog's skeleton: maps the baton position to arm IK, head nods, breathing, blinks and eye contact. Pure geometry, so it can be ported to Swift. |
| `src/ui/frog/Frog.tsx` | The layered SVG frog, redrawn each frame from the rig's pose. Replace the static shapes here to swap in hand-drawn art. |

| `src/core/settings.ts` | All user settings as one serialisable object, with validation and starter presets (→ `Codable` on iOS). |
| `src/ui/SettingsSheet.tsx`, `TempoControl.tsx` | Settings sheet (presets, meter, cue-in, length/drill, sound, display) and the live tempo control. |

**Live changes:** tempo, accents and subdivision can change while playing; they take effect from the
next beat (`Session.changeMeter`). Everything else is locked until you stop.

**Timing model:** the audio clock is the source of truth. The scheduler queues clicks ~150 ms ahead
at exact `AudioContext` times. Each animation frame asks `Session.stateAt(audioTime)` where the
baton is, so sound and picture can't drift apart.

## Deploy

Pushing to `main` runs the tests and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
