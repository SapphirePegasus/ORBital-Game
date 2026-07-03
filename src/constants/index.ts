// ─── Physics constants ────────────────────────────────────────────────────────

/** Gravitational constant scaled to game units. Real G = 6.674e-11; tuned for feel. */
export const G = 0.0005;

/** Fixed physics timestep in seconds (60hz) */
export const PHYSICS_DT = 1 / 60;

/** Max physics steps per frame to avoid spiral-of-death */
export const MAX_PHYSICS_STEPS = 5;

/** Number of lookahead steps for trajectory preview */
export const TRAJECTORY_STEPS = 120;

/** Trajectory preview step size (larger = faster preview, less accurate) */
export const TRAJECTORY_DT = 1 / 20;

// ─── Rocket ───────────────────────────────────────────────────────────────────

/** Initial rocket mass in game units */
export const ROCKET_BASE_MASS = 1.0;

/** Starting fuel level */
export const ROCKET_BASE_FUEL = 100;

/** Orbit "snap" radius — within this multiplier of planet radius, rocket snaps into orbit */
export const ORBIT_CAPTURE_RADIUS_MULTIPLIER = 2.8;

/** Orbit decay rate per full revolution (planet-specific, this is the base) */
export const BASE_ORBIT_DECAY_RATE = 0.08;

/** Minimum orbit speed to maintain stable orbit (below this = decay accelerates) */
export const MIN_STABLE_ORBIT_SPEED = 0.4;

/** How many full orbits before forced crash regardless of decay */
export const MAX_ORBITS_BEFORE_CRASH = 8;

/** Charge rate per second while holding */
export const LAUNCH_CHARGE_RATE = 0.6;

/** Minimum charge to launch (prevents accidental micro-launches) */
export const MIN_LAUNCH_CHARGE = 0.1;

/** Launch velocity scale — charge (0–1) × this = launch speed in world units/s */
export const LAUNCH_VELOCITY_SCALE = 18;

// ─── Camera ───────────────────────────────────────────────────────────────────

/** Camera follow smoothing factor (lower = smoother but laggier) */
export const CAMERA_SMOOTH = 0.08;

/** Default zoom level (world units per screen height) */
export const CAMERA_DEFAULT_ZOOM = 1.0;

/** Zoom range */
export const CAMERA_MIN_ZOOM = 0.4;
export const CAMERA_MAX_ZOOM = 2.5;

// ─── World generation ─────────────────────────────────────────────────────────

/** Number of planets per solar system */
export const PLANETS_PER_SYSTEM = { min: 3, max: 7 };

/** Number of hazards per system */
export const HAZARDS_PER_SYSTEM = { min: 1, max: 4 };

/** Minimum distance between planet centers in world units */
export const MIN_PLANET_SEPARATION = 80;

/** World units between solar system centers */
export const SYSTEM_SPACING = 600;

// ─── Planet physical properties by type ──────────────────────────────────────

export const PLANET_CONFIGS = {
  terrestrial: {
    massRange: [50, 200] as [number, number],
    radiusRange: [18, 35] as [number, number],
    orbitDecayRate: 0.07,
    colors: ['#4A7C9E', '#5B8F6A', '#8E7B4A', '#7A6B9E'],
    atmosphereColors: ['#89BCE4AA', '#90C67BAA', '#D4B07AAA', '#B3A8DFAA'],
  },
  gas_giant: {
    massRange: [800, 3000] as [number, number],
    radiusRange: [55, 90] as [number, number],
    orbitDecayRate: 0.04,
    colors: ['#C88B4A', '#A85A3A', '#8A7BAA', '#6B9BAA'],
    atmosphereColors: ['#E8B57AAA', '#D4855AAA', '#C4B0DFAA', '#A0C8DFAA'],
  },
  dead: {
    massRange: [30, 120] as [number, number],
    radiusRange: [12, 28] as [number, number],
    orbitDecayRate: 0.12,
    colors: ['#6B6B6B', '#7A7060', '#857B70', '#605A55'],
    atmosphereColors: ['#88888840', '#8A826040', '#88807040', '#70686040'],
  },
  ice: {
    massRange: [40, 150] as [number, number],
    radiusRange: [15, 32] as [number, number],
    orbitDecayRate: 0.09,
    colors: ['#9BC4D8', '#A8D4E8', '#B8C8D8', '#88AAC0'],
    atmosphereColors: ['#C8E8F8AA', '#B8D8F0AA', '#D0E4F0AA', '#A0C0D8AA'],
  },
  lava: {
    massRange: [60, 250] as [number, number],
    radiusRange: [20, 40] as [number, number],
    orbitDecayRate: 0.1,
    colors: ['#8B2000', '#A03010', '#B84020', '#D06030'],
    atmosphereColors: ['#FF6030AA', '#FF4820AA', '#FF7040AA', '#FF5030AA'],
  },
  crystal: {
    massRange: [25, 100] as [number, number],
    radiusRange: [10, 24] as [number, number],
    orbitDecayRate: 0.06,
    colors: ['#A090C8', '#B8A8E0', '#88B0C8', '#C0A0B8'],
    atmosphereColors: ['#D0C8F8AA', '#E0D0FFAA', '#B8D0E8AA', '#E0C8E0AA'],
  },
} as const;

// ─── Black hole properties ────────────────────────────────────────────────────

export const BLACK_HOLE_CONFIG = {
  mass: 5000,
  radius: 20,
  influenceRadius: 200,
  eventHorizonRadius: 22,
  damage: 0, // instant death in event horizon
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

export const SCORE_PER_PLANET_REACHED = 500;
export const SCORE_PER_SYSTEM_CLEARED = 2000;
export const SCORE_COIN_MULTIPLIER = 10;
export const SCORE_MINERAL_MULTIPLIER = 50;
export const SCORE_DARK_MATTER_MULTIPLIER = 200;

// ─── UI / transitions ─────────────────────────────────────────────────────────

/** Menu → game transition duration ms */
export const TRANSITION_MENU_TO_GAME_MS = 350;

/** Pause overlay fade ms */
export const TRANSITION_PAUSE_MS = 200;

/** Fail screen appear ms */
export const TRANSITION_FAIL_MS = 300;

// ─── Colors (space theme) ────────────────────────────────────────────────────

export const COLORS = {
  background: '#04060F',
  starfield: '#FFFFFF',
  nebula1: '#1A0A3A',
  nebula2: '#0A1A3A',
  trajectoryDot: '#FFFFFF55',
  trajectoryDotTarget: '#FFD70066',
  hudText: '#E8E8FF',
  hudTextMuted: '#8888AA',
  hudBackground: '#00000066',
  orbitDecayLow: '#44FF44',
  orbitDecayMid: '#FFAA00',
  orbitDecayHigh: '#FF3300',
  chargeBar: '#00AAFF',
  chargeBarFull: '#FF6600',
  speedBar: '#AAFFAA',
  rocketFlame: '#FF8800',
  rocketBody: '#E8E8FF',
  collectibleCoin: '#FFD700',
  collectibleFuel: '#00FF88',
  collectibleMineral: '#AA44FF',
  collectibleDarkMatter: '#FF00AA',
  uiAccent: '#4488FF',
  uiDanger: '#FF3344',
  uiSuccess: '#44FF88',
};

// ─── Font sizes ───────────────────────────────────────────────────────────────

export const FONT = {
  hudSmall: 11,
  hudMedium: 14,
  hudLarge: 20,
  menuTitle: 48,
  menuSubtitle: 18,
  menuButton: 16,
};
