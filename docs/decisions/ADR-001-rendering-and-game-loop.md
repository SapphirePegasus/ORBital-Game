# ADR-001: Skia SkPicture rendering with a JS-thread fixed-timestep loop

**Date:** 2026-07-06
**Status:** Accepted

## Context
The game needs 60+ fps rendering of a few dozen procedural entities, a
trajectory preview, and seamless phase transitions on Expo SDK 56. React's
render cycle is far too slow for per-frame updates.

## Decision
A single `requestAnimationFrame` loop on the JS thread advances a
fixed-timestep engine (1/120 s accumulator) and records the whole scene into
one `SkPicture` stored in a Reanimated shared value. The Skia `<Picture>`
redraws on the UI thread with zero React re-renders. HUD text mirrors engine
stats at only 8 Hz through a tiny external store.

## Alternatives Considered
1. React state per frame — rejected: full reconciliation at 60 fps.
2. Declarative Skia components bound to dozens of shared values — rejected:
   value-per-entity bookkeeping scales poorly with procedural spawning.
3. Full UI-thread simulation in worklets — rejected: engine complexity
   (events, stores, audio) doesn't fit worklet constraints; entity counts
   are small enough that the JS thread has huge headroom.

## Consequences
- Positive: classic game-engine architecture; renderer is one pure function;
  pause = skip a frame update (free).
- Negative: a saturated JS thread could stutter the sim; mitigated by the
  accumulator cap and keeping React work at 8 Hz.
