/**
 * Pure orbital physics. Zero side effects, zero RN imports — every function
 * here is unit-tested in Node.
 *
 * Model (see docs/decisions/ADR-003):
 *  - Point-mass Newtonian gravity: a = G·M / d² toward each body within its
 *    influence radius.
 *  - Semi-implicit (symplectic) Euler at a fixed timestep — stable for
 *    orbital mechanics and immune to frame-rate variance.
 *  - Parked orbits are kinematic (angle += ω·dt) for perfectly clean circles;
 *    real integration takes over the instant the rocket launches.
 */
import { gameConfig } from '../config/gameConfig';
import type { CelestialBody } from '../core/types';

export interface GravityResult {
  ax: number;
  ay: number;
  /** Strongest single-body pull this step (for HUD + dominant-body logic). */
  dominantId: number;
  dominantPull: number;
}

/** Effective gravitational mass (black holes multiply their pull). */
export const effectiveMass = (body: CelestialBody): number =>
  body.kind === 'blackHole'
    ? body.mass * gameConfig.hazards.blackHole.gravityMultiplier
    : body.mass;

/** Escape velocity at distance d from a body's center: √(2GM/d). */
export const escapeVelocity = (body: CelestialBody, d: number): number =>
  Math.sqrt((2 * gameConfig.physics.G * effectiveMass(body)) / Math.max(d, 1e-6));

/** Circular orbit speed at distance d: √(GM/d). */
export const circularOrbitSpeed = (body: CelestialBody, d: number): number =>
  Math.sqrt((gameConfig.physics.G * effectiveMass(body)) / Math.max(d, 1e-6));

/** Surface gravity g = GM/r² — shown on the HUD so players can judge the hold. */
export const surfaceGravity = (body: CelestialBody): number =>
  (gameConfig.physics.G * effectiveMass(body)) / (body.radius * body.radius);

/** Sum gravitational acceleration from all bodies whose influence contains (x, y). */
export const gravityAt = (x: number, y: number, bodies: readonly CelestialBody[]): GravityResult => {
  let ax = 0;
  let ay = 0;
  let dominantId = -1;
  let dominantPull = 0;
  for (const b of bodies) {
    if (b.detonated) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const d2 = dx * dx + dy * dy;
    const inf = b.influenceRadius;
    if (d2 > inf * inf) continue;
    const d = Math.sqrt(Math.max(d2, 1e-9));
    const pull = (gameConfig.physics.G * effectiveMass(b)) / d2;
    ax += (pull * dx) / d;
    ay += (pull * dy) / d;
    if (pull > dominantPull) {
      dominantPull = pull;
      dominantId = b.id;
    }
  }
  return { ax, ay, dominantId, dominantPull };
};

export interface IntegrationState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * One semi-implicit Euler step, mutating `s` in place (hot path — no alloc).
 * Applies gas-giant atmospheric drag when inside an atmosphere band.
 */
export const stepIntegration = (
  s: IntegrationState,
  bodies: readonly CelestialBody[],
  dt: number,
): GravityResult => {
  const g = gravityAt(s.x, s.y, bodies);
  s.vx += g.ax * dt;
  s.vy += g.ay * dt;

  // Gas giant atmosphere: exponential velocity damping inside the band.
  for (const b of bodies) {
    if (b.kind !== 'gasGiant') continue;
    const band = b.radius * (1 + gameConfig.physics.gasAtmosphereBand);
    const dx = s.x - b.x;
    const dy = s.y - b.y;
    if (dx * dx + dy * dy < band * band) {
      const damp = Math.exp(-gameConfig.physics.gasDrag * dt);
      s.vx *= damp;
      s.vy *= damp;
    }
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  return g;
};

export interface CaptureCheck {
  captured: boolean;
  body: CelestialBody | null;
  /** Snapped circular-orbit radius when captured. */
  orbitRadius: number;
}

/**
 * Capture rule (tuned for feel, grounded in physics): the rocket is captured
 * by a body when it is inside that body's capture radius AND moving slower
 * than `speedFactor × escapeVelocity` at its current distance — i.e. it is
 * genuinely gravitationally bound. The departed body is excluded for a short
 * grace period so launches aren't instantly re-swallowed.
 */
export const checkCapture = (
  s: IntegrationState,
  bodies: readonly CelestialBody[],
  excludeId: number,
): CaptureCheck => {
  const cfg = gameConfig.capture;
  for (const b of bodies) {
    if (b.id === excludeId || b.detonated) continue;
    const dx = s.x - b.x;
    const dy = s.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d > b.captureRadius || d < b.radius) continue;
    const speed = Math.hypot(s.vx, s.vy);
    if (speed <= cfg.speedFactor * escapeVelocity(b, d)) {
      const orbitRadius = Math.min(
        Math.max(d, b.radius * cfg.minOrbitFactor),
        b.radius * cfg.maxOrbitFactor,
      );
      return { captured: true, body: b, orbitRadius };
    }
  }
  return { captured: false, body: null, orbitRadius: 0 };
};

/**
 * Predict the flight path for the trajectory preview while charging.
 * Writes (x, y) pairs into `out` (Float32Array of length ≥ steps×2) and
 * returns the number of points written. Stops early on predicted impact
 * or capture so the preview honestly shows the outcome.
 */
export const predictTrajectory = (
  startX: number,
  startY: number,
  vx: number,
  vy: number,
  bodies: readonly CelestialBody[],
  excludeId: number,
  out: Float32Array,
): number => {
  const { previewSteps, previewStride } = gameConfig.launch;
  const dt = gameConfig.physics.fixedDt * previewStride;
  const s: IntegrationState = { x: startX, y: startY, vx, vy };
  let n = 0;
  for (let i = 0; i < previewSteps && n * 2 + 1 < out.length; i++) {
    stepIntegration(s, bodies, dt);
    out[n * 2] = s.x;
    out[n * 2 + 1] = s.y;
    n++;
    // Terminate the preview on impact…
    let hit = false;
    for (const b of bodies) {
      const dx = s.x - b.x;
      const dy = s.y - b.y;
      if (dx * dx + dy * dy < b.radius * b.radius) {
        hit = true;
        break;
      }
    }
    if (hit) break;
    // …or on predicted capture (past the grace window).
    if (i * dt > gameConfig.capture.recaptureGrace) {
      if (checkCapture(s, bodies, excludeId).captured) break;
    }
  }
  return n;
};
