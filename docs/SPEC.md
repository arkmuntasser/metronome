# Maestro Frog (working title) — Product Spec

A metronome with an animated frog conductor who cues you in, so you can practice
coming in together with a conductor the way you would in an orchestra.

The frog is an **original character** with an old-timey storybook look: autumn
colours, a waistcoat, maybe a small top hat, on a wooden podium or lily pad.
He is inspired by a vintage-folk mood, not copied from any existing show.

## Platforms

1. **Web app (v1):** React + TypeScript (Vite), installable PWA that works offline,
   hosted on GitHub Pages.
2. **Native iOS app (next):** SwiftUI + AVAudioEngine. It ports the same timing logic and
   art. It is not a wrapper.

To make the port straightforward, the web code keeps a **framework-agnostic core**
(`src/core/`): pure TypeScript with no DOM or React. It holds the meter model, the
conducting-pattern geometry, the cue-in state machine and the scheduler maths. The
same logic gets translated to Swift, and shared JSON test fixtures keep the two
implementations in step.

## Audience & usage

- Personal practice first. A free public App Store release later, with no accounts,
  ads or payments.
- Built to be read with the phone propped on a music stand: large and glanceable, hands-free
  once started, screen kept awake (Wake Lock API on web, `isIdleTimerDisabled` on iOS).
- Can be used on one shared screen by an ensemble or teacher. Syncing several devices is
  out of scope.

## Settings

| Setting | Notes |
|---|---|
| Tempo | BPM, tap-tempo; sensible range ~30–250 |
| Time signature | Simple (2/4, 3/4, 4/4, 5/4…) and compound (6/8, 9/8, 12/8) |
| Compound feel | e.g. 6/8 conducted "in 2" or "in 6", 9/8 in 3 or 9 |
| Grouping / accents | Per-beat accent level (strong / medium / none), groupings like 2+2+3 in 7/8 |
| Subdivision | None, eighths, triplets, sixteenths (audible only) |
| Pickup / entry beat | The beat (or subdivision) where the player enters, e.g. the "and" of 4. The cue targets this point |
| Start mode | **Random hold** · **Fixed hold** (exact N seconds) · **Classic count-in** (audible bar of clicks) |
| Random hold range | Default **1–5 s**, adjustable |
| Length | Run until stopped · N bars then cutoff |
| Drill mode | N rounds of: random hold → cue → play X bars → cutoff → rest → repeat. No scoring |
| Sounds | Click on/off, accent on/off, selectable click sounds (woodblock, cowbell, beep, croak…), breath sound on prep beat |
| Presets | Named presets saved locally (localStorage on web, on-device storage on iOS) |

## The cue-in (core interaction)

```
idle ──start──▶ raise baton ──▶ HOLD (random or fixed duration, silent)
     ──▶ PREP BEAT (one beat at tempo, optional soft breath sound, no click)
     ──▶ DOWNBEAT / ENTRY (clicks begin here if enabled)
     ──▶ conducting real beat patterns ...
     ──stop / N bars──▶ cutoff flourish at end of bar ──▶ lower baton ──▶ idle
```

- The cue-in itself is silent, as in a real orchestra. Clicks start at the entry.
- With a pickup entry, the prep gesture is timed so that the entry lands on the chosen
  beat or subdivision.
- Classic count-in replaces the hold and prep beat with one audible bar.
- While holding, he stays alive (blinks, settles, glances at you) so it never looks frozen.
  Fake-outs are a possible future difficulty setting, but are not in v1.

## Conducting

The frog traces **real conducting patterns**: 2 (down-up), 3 (triangle),
4 (cross), plus 1, 5, 6 and compound subdivided patterns. The baton tip follows a path
generated from the pattern geometry, with the ictus (bounce point) exactly on the
beat.

## Timing architecture

- **Audio is the clock.** On web, a Web Audio look-ahead scheduler (the "two clocks"
  pattern) schedules clicks against `AudioContext.currentTime`. On iOS, AVAudioEngine
  does the same with sample-accurate scheduling.
- **Animation follows the audio clock.** Each `requestAnimationFrame` / `CADisplayLink` frame
  works out the baton position from audio time, so visuals and sound cannot drift apart.
- The random hold is decided when start is pressed, which keeps the whole timeline
  predictable and makes it easy to test.

## Art

- v1 uses an original **SVG frog with separate layers** (body, head, eyes and lids, conducting arm
  with baton, free arm) so each part can be animated on its own and swapped for
  real artwork later without code changes.

## Out of scope for v1

Timing scoring or feedback, microphone detection, multi-device sync, accounts or cloud sync,
monetisation.
