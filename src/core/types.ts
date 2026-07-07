/**
 * Shared domain types. Pure TypeScript — no React Native imports so the
 * engine layer stays platform-independent and unit-testable in Node.
 */

/** Celestial body archetypes. Each has distinct physical behavior. */
export type BodyKind =
  | 'planet'
  | 'deadPlanet'
  | 'gasGiant'
  | 'star'
  | 'blackHole'
  | 'supernova';

export interface CelestialBody {
  id: number;
  kind: BodyKind;
  x: number;
  y: number;
  radius: number;
  /** Derived from radius² × archetype density. Drives gravity + escape velocity. */
  mass: number;
  /** Gravity influence cutoff (world units) — bodies beyond this don't pull the rocket. */
  influenceRadius: number;
  /** Max distance at which an orbital capture can occur. */
  captureRadius: number;
  /** Seconds of stable orbit before decay begins. Scaled by stabilizer upgrade. */
  decayTime: number;
  /** Coins awarded on first capture. */
  coinReward: number;
  /** Index along the run (0 = start body). Used for scoring and galaxy shifts. */
  depth: number;
  /** Deterministic per-body seed for visual detail (craters, bands, hue jitter). */
  visualSeed: number;

  // ---- hazard state (only used by relevant kinds) ----
  /** star: flare cycle phase offset in seconds. */
  flarePhase: number;
  /** supernova: seconds until detonation once the countdown is armed; -1 = not armed. */
  novaCountdown: number;
  /** supernova: true after detonation (body becomes lethal debris zone briefly). */
  detonated: boolean;
}

export interface Asteroid {
  x: number;
  y: number;
  radius: number;
  /** Drift velocity (world units / s). */
  vx: number;
  vy: number;
  /** Spin for rendering only. */
  spin: number;
  /** Belt-local bounds for wrap-around drift. */
  beltIndex: number;
}

export interface AsteroidBelt {
  /** Axis-aligned band the asteroids drift within. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

export type RocketMode = 'orbiting' | 'charging' | 'flying';

export type DeathCause =
  | 'crashed'
  | 'orbitDecayed'
  | 'lostInSpace'
  | 'asteroid'
  | 'solarFlare'
  | 'blackHole'
  | 'supernova';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameOver';

export interface RocketState {
  mode: RocketMode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Facing angle (radians) for rendering. */
  heading: number;
  /** Body currently orbited (id), or -1 while flying. */
  bodyId: number;
  /** Current orbital radius / angle / direction while orbiting. */
  orbitRadius: number;
  orbitAngle: number;
  orbitDir: 1 | -1;
  /** Seconds spent in the current orbit (drives decay). */
  orbitTime: number;
  /** Charged launch speed while holding. */
  chargeSpeed: number;
  /** 0..1 normalized charge for the HUD bar. */
  chargeT: number;
  /** Seconds spent in the current flight (drives lost-in-space timeout). */
  flightTime: number;
  /** Active steering input while flying: -1 left, 0 none, 1 right. */
  steer: -1 | 0 | 1;
  /** Shield charges remaining this run. */
  shields: number;
}

/** Engine → app events, consumed once per frame. */
export type EngineEvent =
  | { type: 'launched'; speed: number }
  | { type: 'steer' }
  | { type: 'captured'; body: CelestialBody; coins: number }
  | { type: 'coin'; x: number; y: number }
  | { type: 'shieldHit' }
  | { type: 'flareWarning' }
  | { type: 'novaArmed' }
  | { type: 'died'; cause: DeathCause };

export interface RunStats {
  score: number;
  coinsEarned: number;
  bodiesVisited: number;
  bestSpeed: number;
  seed: number;
}

export type UpgradeId = 'chargeControl' | 'boosters' | 'shield' | 'stabilizers' | 'magnet';

export type UpgradeLevels = Record<UpgradeId, number>;
