# ADR-003: Semi-implicit Euler at fixed timestep; kinematic parked orbits

**Date:** 2026-07-06
**Status:** Accepted

## Context
Flight must feel like real gravity (inverse-square, escape velocities,
slingshots) yet stay deterministic across devices and frame rates.

## Decision
- Newtonian point-mass gravity with per-body influence cutoffs.
- Semi-implicit (symplectic) Euler at fixed dt = 1/120 s via an accumulator
  with a max-steps cap.
- Parked orbits are kinematic circles (angle += ω·dt with ω = √(GM/r)/r);
  true integration takes over at launch.
- Capture rule: inside a body's capture radius AND slower than the local
  escape velocity → gravitationally bound → snap to a clamped circular orbit,
  preserving the sign of angular momentum.

## Alternatives Considered
1. Velocity Verlet / RK4 — rejected: more cost, no gameplay-visible benefit
   at 1/120 s for these speeds.
2. Fully integrated parked orbits — rejected: numeric drift makes idle orbits
   visibly wobble; kinematic circles look and feel perfect.
3. Variable timestep — rejected: non-deterministic feel across devices;
   tunneling risk at high launch speeds.

## Consequences
- Positive: deterministic, stable, cheap; trajectory preview reuses the same
  integrator so the preview never lies.
- Negative: parked orbits are idealized (accepted stylization).
