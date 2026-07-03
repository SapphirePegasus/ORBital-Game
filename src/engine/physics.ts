/**
 * Physics engine — runs exclusively in Reanimated UI-thread worklets.
 * All functions are 'worklet'-annotated and allocation-minimal.
 *
 * Integration: Runge-Kutta 4th order for numerical stability.
 * Gravity:     F = G * M * m / r²  applied per planet + black holes.
 * Orbit:       Rocket snaps into circular orbit on capture; decays each revolution.
 */

'worklet';

import type {
  Vec2,
  RocketState,
  Planet,
  Hazard,
  PhysicsState,
  AsteroidRock,
} from '../types';
import {
  G,
  PHYSICS_DT,
  TRAJECTORY_STEPS,
  TRAJECTORY_DT,
  ORBIT_CAPTURE_RADIUS_MULTIPLIER,
  LAUNCH_VELOCITY_SCALE,
  MIN_LAUNCH_CHARGE,
  MAX_ORBITS_BEFORE_CRASH,
  BASE_ORBIT_DECAY_RATE,
} from '../constants';

// ─── Reusable scratch vectors (avoid allocation in hot loop) ──────────────────

const _scratch1: Vec2 = { x: 0, y: 0 };
const _scratch2: Vec2 = { x: 0, y: 0 };

// ─── Gravity ──────────────────────────────────────────────────────────────────

/**
 * Accumulates gravitational acceleration on `pos` from all planets and
 * massive hazards. Writes result into `accOut`.
 */
function accumulateGravity(
  pos: Vec2,
  planets: Planet[],
  hazards: Hazard[],
  accOut: Vec2,
): void {
  'worklet';
  accOut.x = 0;
  accOut.y = 0;

  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (!p) continue;
    const dx = p.position.x - pos.x;
    const dy = p.position.y - pos.y;
    const rSq = dx * dx + dy * dy;
    if (rSq < 0.01) continue;
    const r = Math.sqrt(rSq);
    const forceMag = (G * p.mass) / rSq;
    accOut.x += (forceMag * dx) / r;
    accOut.y += (forceMag * dy) / r;
  }

  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i]; if (!h) continue;
    if (h.mass === 0) continue; // non-gravitational hazard
    const dx = h.position.x - pos.x;
    const dy = h.position.y - pos.y;
    const rSq = dx * dx + dy * dy;
    if (rSq < 0.01) continue;
    const r = Math.sqrt(rSq);
    const forceMag = (G * h.mass) / rSq;
    accOut.x += (forceMag * dx) / r;
    accOut.y += (forceMag * dy) / r;
  }
}

// ─── RK4 integration ─────────────────────────────────────────────────────────

interface RK4State {
  px: number; py: number;
  vx: number; vy: number;
}

function rk4Step(
  state: RK4State,
  dt: number,
  planets: Planet[],
  hazards: Hazard[],
): RK4State {
  'worklet';

  const evalDerivative = (s: RK4State, dtOff: number, k: { ax: number; ay: number }) => {
    _scratch1.x = s.px + s.vx * dtOff;
    _scratch1.y = s.py + s.vy * dtOff;
    accumulateGravity(_scratch1, planets, hazards, _scratch2);
    k.ax = _scratch2.x;
    k.ay = _scratch2.y;
  };

  const k1 = { ax: 0, ay: 0 };
  const k2 = { ax: 0, ay: 0 };
  const k3 = { ax: 0, ay: 0 };
  const k4 = { ax: 0, ay: 0 };

  // k1 — derivative at current state
  accumulateGravity({ x: state.px, y: state.py }, planets, hazards, _scratch2);
  k1.ax = _scratch2.x; k1.ay = _scratch2.y;

  // k2 — midpoint using k1
  evalDerivative(
    { px: state.px + state.vx * (dt / 2), py: state.py + state.vy * (dt / 2), vx: state.vx + k1.ax * (dt / 2), vy: state.vy + k1.ay * (dt / 2) },
    0, k2,
  );

  // k3 — midpoint using k2
  evalDerivative(
    { px: state.px + state.vx * (dt / 2), py: state.py + state.vy * (dt / 2), vx: state.vx + k2.ax * (dt / 2), vy: state.vy + k2.ay * (dt / 2) },
    0, k3,
  );

  // k4 — endpoint using k3
  evalDerivative(
    { px: state.px + state.vx * dt, py: state.py + state.vy * dt, vx: state.vx + k3.ax * dt, vy: state.vy + k3.ay * dt },
    0, k4,
  );

  return {
    px: state.px + (dt / 6) * (state.vx + 2 * state.vx + 2 * state.vx + state.vx),
    py: state.py + (dt / 6) * (state.vy + 2 * state.vy + 2 * state.vy + state.vy),
    vx: state.vx + (dt / 6) * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax),
    vy: state.vy + (dt / 6) * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay),
  };
}

// ─── Orbit mechanics ──────────────────────────────────────────────────────────

/**
 * Computes the circular orbit velocity for a given orbit radius around a planet.
 * v_orbit = sqrt(G * M / r)
 */
export function orbitalVelocity(planetMass: number, orbitRadius: number): number {
  'worklet';
  return Math.sqrt((G * planetMass) / orbitRadius);
}

/**
 * Computes escape velocity from a planet surface.
 * v_escape = sqrt(2 * G * M / r)
 */
export function escapeVelocity(planetMass: number, radius: number): number {
  'worklet';
  return Math.sqrt((2 * G * planetMass) / radius);
}

/**
 * Attempts to capture the rocket into orbit around any planet within
 * capture radius. Returns the captured planet id or null.
 */
function tryOrbitCapture(
  rocket: RocketState,
  planets: Planet[],
): Planet | null {
  'worklet';
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (!p) continue;
    const dx = rocket.position.x - p.position.x;
    const dy = rocket.position.y - p.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const captureR = p.radius * ORBIT_CAPTURE_RADIUS_MULTIPLIER;

    if (dist <= captureR && dist > p.radius) {
      // Only capture if rocket is heading roughly tangentially (not straight in)
      const radialDir: Vec2 = { x: dx / dist, y: dy / dist };
      const radialSpeed = rocket.velocity.x * radialDir.x + rocket.velocity.y * radialDir.y;
      const speed = Math.sqrt(rocket.velocity.x ** 2 + rocket.velocity.y ** 2);
      const radialFraction = Math.abs(radialSpeed) / (speed + 0.001);

      // Accept capture if less than 70% radial (i.e. has some tangential component)
      if (radialFraction < 0.7) {
        return p ?? null;
      }
    }
  }
  return null;
}

/**
 * Advances rocket angle around its orbit planet by one physics tick.
 * Returns updated orbit data and whether the rocket survived.
 */
function advanceOrbit(
  rocket: RocketState,
  planet: Planet,
  dt: number,
): { angle: number; decayProgress: number; orbitCount: number; crashed: boolean } {
  'worklet';

  const orbitSpeed = orbitalVelocity(planet.mass, rocket.orbitRadius);
  const angularVelocity = orbitSpeed / rocket.orbitRadius;
  const newAngle = rocket.orbitAngle + angularVelocity * dt;
  const newOrbitCount = newAngle / (2 * Math.PI);

  // Decay accumulates per orbit revolution
  const decayProgress =
    newOrbitCount * (planet.orbitDecayRate + BASE_ORBIT_DECAY_RATE);

  const crashed =
    decayProgress >= 1.0 || newOrbitCount > MAX_ORBITS_BEFORE_CRASH;

  return {
    angle: newAngle,
    decayProgress: Math.min(decayProgress, 1.0),
    orbitCount: newOrbitCount,
    crashed,
  };
}

// ─── Collision detection ──────────────────────────────────────────────────────

function checkPlanetCollisions(
  pos: Vec2,
  planets: Planet[],
): Planet | null {
  'worklet';
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (!p) continue;
    const dx = pos.x - p.position.x;
    const dy = pos.y - p.position.y;
    if (dx * dx + dy * dy <= p.radius * p.radius) {
      return p ?? null;
    }
  }
  return null;
}

function checkHazardCollisions(
  pos: Vec2,
  hazards: Hazard[],
): Hazard | null {
  'worklet';
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i]; if (!h) continue;
    const dx = pos.x - h.position.x;
    const dy = pos.y - h.position.y;
    const r =
      h.type === 'black_hole'
        ? (h.eventHorizonRadius ?? h.radius)
        : h.radius;
    if (dx * dx + dy * dy <= r * r) {
      return h ?? null;
    }
  }
  return null;
}

function checkAsteroidCollisions(
  pos: Vec2,
  rocketRadius: number,
  asteroids: AsteroidRock[],
): AsteroidRock | null {
  'worklet';
  for (let i = 0; i < asteroids.length; i++) {
    const a = asteroids[i];
    if (!a) continue;
    const dx = pos.x - a.position.x;
    const dy = pos.y - a.position.y;
    const minDist = rocketRadius + a.radius;
    if (dx * dx + dy * dy <= minDist * minDist) {
      return a ?? null;
    }
  }
  return null;
}

// ─── Launch ───────────────────────────────────────────────────────────────────

/**
 * Converts launch charge + orbit tangent direction into an initial velocity vector.
 * Direction is tangent to the current orbit, rocket exits in the "forward" direction.
 */
export function computeLaunchVelocity(
  rocket: RocketState,
  planet: Planet,
  charge: number,
  steerBias: number, // -1 (left) to +1 (right)
): Vec2 {
  'worklet';
  if (charge < MIN_LAUNCH_CHARGE) return { x: 0, y: 0 };

  const clampedCharge = Math.min(charge, 1.0);
  const speed = clampedCharge * LAUNCH_VELOCITY_SCALE;

  // Tangent direction (perpendicular to radial, CCW)
  const dx = rocket.position.x - planet.position.x;
  const dy = rocket.position.y - planet.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const radialX = dx / dist;
  const radialY = dy / dist;

  // CCW tangent
  const tangentX = -radialY;
  const tangentY = radialX;

  // Apply steering bias as a slight radial component
  const biasStrength = 0.3;
  const vx = tangentX * speed + radialX * steerBias * biasStrength * speed;
  const vy = tangentY * speed + radialY * steerBias * biasStrength * speed;

  return { x: vx, y: vy };
}

// ─── Trajectory preview ───────────────────────────────────────────────────────

/**
 * Computes N future positions for the trajectory preview dots.
 * Runs the RK4 integrator forward in time from launch position/velocity.
 */
export function computeTrajectoryPreview(
  startPos: Vec2,
  startVel: Vec2,
  planets: Planet[],
  hazards: Hazard[],
): Vec2[] {
  'worklet';

  const points: Vec2[] = [];
  let state: RK4State = {
    px: startPos.x,
    py: startPos.y,
    vx: startVel.x,
    vy: startVel.y,
  };

  for (let i = 0; i < TRAJECTORY_STEPS; i++) {
    state = rk4Step(state, TRAJECTORY_DT, planets, hazards);
    points.push({ x: state.px, y: state.py });

    // Stop preview if it would hit a planet
    let hit = false;
    for (let j = 0; j < planets.length; j++) {
      const p = planets[j];
      if (!p) continue;
      const dx = state.px - p.position.x;
      const dy = state.py - p.position.y;
      if (dx * dx + dy * dy <= p.radius * p.radius) {
        hit = true;
        break;
      }
    }
    if (hit) break;
  }

  return points;
}

// ─── Main physics tick ───────────────────────────────────────────────────────

export type PhysicsTickResult =
  | { type: 'ok'; state: PhysicsState }
  | { type: 'orbit_entered'; planetId: string; state: PhysicsState }
  | { type: 'collectible_gathered'; collectibleId: string; state: PhysicsState }
  | { type: 'game_over'; reason: 'orbital_decay' | 'lost_in_space' | 'planet_collision' | 'asteroid_collision' | 'black_hole' | 'solar_flare' }

/**
 * Advances the full physics simulation by one fixed timestep.
 * Call this from a Reanimated worklet via `useFrameCallback`.
 */
export function physicsTick(
  state: PhysicsState,
  dt: number,
): PhysicsTickResult {
  'worklet';

  const rocket = state.rocket;

  // ── Orbiting mode ─────────────────────────────────────────────────────────
  if (rocket.orbitingPlanetId !== null) {
    const planet = state.planets.find(p => p.id === rocket.orbitingPlanetId);
    if (!planet) {
      // Planet gone — treat as lost in space
      return { type: 'game_over', reason: 'lost_in_space' };
    }

    const orbitResult = advanceOrbit(rocket, planet, dt);

    if (orbitResult.crashed) {
      return { type: 'game_over', reason: 'orbital_decay' };
    }

    // Update rocket position along circular orbit
    rocket.orbitAngle = orbitResult.angle;
    rocket.orbitCount = orbitResult.orbitCount;
    rocket.position.x = planet.position.x + Math.cos(rocket.orbitAngle) * rocket.orbitRadius;
    rocket.position.y = planet.position.y + Math.sin(rocket.orbitAngle) * rocket.orbitRadius;

    // Update velocity to be tangential (used for HUD display)
    const orbitSpd = orbitalVelocity(planet.mass, rocket.orbitRadius);
    rocket.velocity.x = -Math.sin(rocket.orbitAngle) * orbitSpd;
    rocket.velocity.y = Math.cos(rocket.orbitAngle) * orbitSpd;

    return { type: 'ok', state };
  }

  // ── Free flight mode (RK4) ────────────────────────────────────────────────
  const rk4State = rk4Step(
    { px: rocket.position.x, py: rocket.position.y, vx: rocket.velocity.x, vy: rocket.velocity.y },
    dt,
    state.planets,
    state.hazards,
  );

  // Sanity check: rocket hasn't gone to infinity
  if (
    Math.abs(rk4State.px) > 1e6 ||
    Math.abs(rk4State.py) > 1e6 ||
    isNaN(rk4State.px)
  ) {
    return { type: 'game_over', reason: 'lost_in_space' };
  }

  // Update position
  rocket.position.x = rk4State.px;
  rocket.position.y = rk4State.py;
  rocket.velocity.x = rk4State.vx;
  rocket.velocity.y = rk4State.vy;

  // ── Collision detection ───────────────────────────────────────────────────

  // Planet surface collision
  const hitPlanet = checkPlanetCollisions(rocket.position, state.planets);
  if (hitPlanet) {
    return { type: 'game_over', reason: 'planet_collision' };
  }

  // Hazard collision
  const hitHazard = checkHazardCollisions(rocket.position, state.hazards);
  if (hitHazard) {
    const reason =
      hitHazard.type === 'black_hole'
        ? 'black_hole'
        : hitHazard.type === 'solar_flare'
        ? 'solar_flare'
        : 'asteroid_collision';
    return { type: 'game_over', reason };
  }

  // Asteroid collision (radius = 3 for rocket)
  const hitAsteroid = checkAsteroidCollisions(rocket.position, 3, state.asteroids);
  if (hitAsteroid) {
    return { type: 'game_over', reason: 'asteroid_collision' };
  }

  // ── Orbit capture check ───────────────────────────────────────────────────
  const capturePlanet = tryOrbitCapture(rocket, state.planets);
  if (capturePlanet) {
    const dx = rocket.position.x - capturePlanet.position.x;
    const dy = rocket.position.y - capturePlanet.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    rocket.orbitingPlanetId = capturePlanet.id;
    rocket.orbitRadius = dist;
    rocket.orbitAngle = Math.atan2(dy, dx);
    rocket.orbitCount = 0;
    rocket.launchCharge = 0;

    return { type: 'orbit_entered', planetId: capturePlanet.id, state };
  }

  // ── Collectible pickup ────────────────────────────────────────────────────
  for (let i = 0; i < state.collectibles.length; i++) {
    const c = state.collectibles[i];
    if (!c) continue;
    if (c.collected) continue;
    const dx = rocket.position.x - c.position.x;
    const dy = rocket.position.y - c.position.y;
    const pickupR = c.radius + 5;
    if (dx * dx + dy * dy <= pickupR * pickupR) {
      c.collected = true;
      return { type: 'collectible_gathered', collectibleId: c.id, state };
    }
  }

  return { type: 'ok', state };
}
