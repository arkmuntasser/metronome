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
| `src/ui/` | React views. `BatonView` is a temporary stand-in for the frog. |

**Timing model:** the audio clock is the source of truth. The scheduler queues clicks ~150 ms ahead
at exact `AudioContext` times. Each animation frame asks `Session.stateAt(audioTime)` where the
baton is, so sound and picture can't drift apart.

## Deploy

Pushing to `main` runs the tests and deploys to GitHub Pages via `.github/workflows/deploy.yml`.
One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
