# ADR-002: Hand-rolled useSyncExternalStore instead of a state library

**Date:** 2026-07-06
**Status:** Accepted

## Context
UI state is small (phase machine, wallet, upgrades, settings). Project policy:
avoid npm packages that aren't clearly needed; minimize third-party risk
surface.

## Decision
A ~40-line typed store built on React 19's `useSyncExternalStore` with
selector-based subscriptions.

## Alternatives Considered
1. Zustand — excellent, but adds a dependency for functionality React ships.
2. Redux Toolkit — rejected: massively over-scoped for this state.
3. Context + useReducer — rejected: no selector granularity; overlay
   re-render fan-out.

## Consequences
- Positive: zero added dependencies; concurrent-safe; API mirrors Zustand so
  migration later is mechanical.
- Negative: no devtools/middleware ecosystem.
