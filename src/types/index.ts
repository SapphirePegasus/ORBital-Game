// ─── Core math types ─────────────────────────────────────────────────────────

export interface Vec2 {
  x: number;
  y: number;
}

// ─── Game entity types ────────────────────────────────────────────────────────

export type PlanetType =
  | 'terrestrial'
  | 'gas_giant'
  | 'dead'
  | 'ice'
  | 'lava'
  | 'crystal';

export type HazardType =
  | 'asteroid_field'
  | 'solar_flare'
  | 'black_hole'
  | 'supernova'
  | 'nebula';

export type CollectibleType = 'coin' | 'fuel' | 'mineral' | 'dark_matter';

export type UpgradeId =
  | 'shield'
  | 'fuel_tank'
  | 'thruster'
  | 'mass_reducer'
  | 'gravity_lens'
  | 'heat_shield';

export interface Planet {
  id: string;
  position: Vec2;
  /** kg — drives gravity calculation */
  mass: number;
  /** display + collision radius in world units */
  radius: number;
  type: PlanetType;
  /** 0–1, decays per orbit revolution */
  orbitDecayRate: number;
  /** cached escape velocity m/s equivalent in game units */
  escapeVelocity: number;
  color: string;
  atmosphereColor: string;
  resources: CollectibleType[];
  isDestination?: boolean;
}

export interface Hazard {
  id: string;
  type: HazardType;
  position: Vec2;
  radius: number;
  /** gravitational influence range — only black holes exert gravity */
  influenceRadius: number;
  /** effective mass for gravity — 0 for most hazards */
  mass: number;
  /** damage per physics tick if inside radius */
  damage: number;
  /** for asteroid fields: individual rocks */
  children?: AsteroidRock[];
  /** for solar flares: direction vector */
  direction?: Vec2;
  /** for black holes: event horizon radius (instant death) */
  eventHorizonRadius?: number;
}

export interface AsteroidRock {
  id: string;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  mass: number;
}

export interface Collectible {
  id: string;
  type: CollectibleType;
  position: Vec2;
  radius: number;
  value: number;
  collected: boolean;
}

export interface RocketState {
  position: Vec2;
  velocity: Vec2;
  /** kg */
  mass: number;
  /** 0–100 */
  fuel: number;
  /** 0–100, 0 = dead */
  integrity: number;
  /** currently orbiting planet id, null if in transit */
  orbitingPlanetId: string | null;
  /** radians from planet center, increments per tick */
  orbitAngle: number;
  /** current orbit radius in world units */
  orbitRadius: number;
  /** how many full orbits completed on current planet */
  orbitCount: number;
  /** 0–1, how charged the launch is */
  launchCharge: number;
  isLaunching: boolean;
  isAlive: boolean;
}

// ─── World / level ────────────────────────────────────────────────────────────

export interface Galaxy {
  id: string;
  name: string;
  seed: number;
  systems: SolarSystem[];
}

export interface SolarSystem {
  id: string;
  center: Vec2;
  planets: Planet[];
  hazards: Hazard[];
  collectibles: Collectible[];
  /** world-unit radius of this system's boundary */
  radius: number;
}

// ─── Camera ──────────────────────────────────────────────────────────────────

export interface Camera {
  /** world-space center the camera tracks */
  focus: Vec2;
  zoom: number;
  /** smoothed position for rendering */
  smoothedFocus: Vec2;
}

// ─── Physics simulation state ─────────────────────────────────────────────────

export interface PhysicsState {
  rocket: RocketState;
  planets: Planet[];
  hazards: Hazard[];
  asteroids: AsteroidRock[];
  collectibles: Collectible[];
  /** world-space trajectory preview dots (computed on hold) */
  trajectoryPreview: Vec2[];
  /** accumulated time for fixed-step integration */
  accumulator: number;
}

// ─── HUD data (passed to React side from worklet) ────────────────────────────

export interface HUDData {
  speedMagnitude: number;
  orbitDecayPercent: number;
  launchChargePercent: number;
  score: number;
  fuel: number;
  mass: number;
  currentPlanetName: string | null;
  collectiblesNearby: number;
}

// ─── Game screen state machine ────────────────────────────────────────────────

export type GamePhase =
  | 'menu'
  | 'transitioning_in'
  | 'playing'
  | 'paused'
  | 'level_fail'
  | 'upgrading'
  | 'transitioning_out';

export type GameOverReason =
  | 'orbital_decay'
  | 'lost_in_space'
  | 'planet_collision'
  | 'asteroid_collision'
  | 'black_hole'
  | 'solar_flare';

// ─── Upgrade system ───────────────────────────────────────────────────────────

export interface Upgrade {
  id: UpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  costPerLevel: number[];
  effect: (level: number) => Record<string, number>;
}

export interface UpgradeState {
  [key: string]: number; // upgradeId → current level
}

// ─── Persistent store shape ───────────────────────────────────────────────────

export interface PersistentStore {
  highScore: number;
  totalCoins: number;
  upgrades: UpgradeState;
  unlockedGalaxies: string[];
  sfxVolume: number;
  musicVolume: number;
  hapticEnabled: boolean;
}

// ─── Audio ────────────────────────────────────────────────────────────────────

export type SFXKey =
  | 'launch'
  | 'orbit_enter'
  | 'orbit_exit'
  | 'collect_coin'
  | 'collect_fuel'
  | 'collect_mineral'
  | 'charge_loop'
  | 'explosion'
  | 'black_hole_pull'
  | 'solar_flare'
  | 'ui_tap'
  | 'ui_confirm'
  | 'ui_back';

export type MusicTrack = 'menu_ambient' | 'game_calm' | 'game_tense' | 'game_danger';
