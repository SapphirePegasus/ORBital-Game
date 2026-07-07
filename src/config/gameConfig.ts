/**
 * THE single source of truth for every gameplay-affecting number.
 * The engine contains no magic values — tune the feel of the entire game here.
 *
 * Units: world units ≈ screen px at zoom 1. Time in seconds. Angles in radians.
 */
export const gameConfig = {
  physics: {
    /** Gravitational constant. Higher = heavier universe. */
    G: 1250,
    /** Fixed simulation timestep (s). 1/120 = stable, tunneling-free at high speeds. */
    fixedDt: 1 / 120,
    /** Cap on catch-up steps per frame so a background/hitch never spiral-of-deaths. */
    maxStepsPerFrame: 8,
    /** Multiplier on circular-orbit speed while parked (game feel, not realism). */
    orbitSpeedFactor: 1.15,
    /** Gas giant atmosphere drag coefficient (velocity damping per second inside band). */
    gasDrag: 0.55,
    /** Atmosphere band thickness as a fraction of a gas giant's radius. */
    gasAtmosphereBand: 0.65,
  },

  launch: {
    /** Charge sweeps min→max speed over `chargeTime` s; upgrade slows the sweep. */
    minSpeed: 160,
    maxSpeed: 460,
    chargeTime: 1.6,
    /** Per level of the chargeControl upgrade, chargeTime is multiplied by this. */
    chargeControlPerLevel: 1.18,
    /** Trajectory preview: prediction steps × stride (dt each). */
    previewSteps: 220,
    previewStride: 2,
  },

  capture: {
    /** Capture succeeds below `speedFactor × escapeVelocity(atDistance)`. */
    speedFactor: 1.12,
    /** Snapped orbit radius is clamped to [min, max] × body radius. */
    minOrbitFactor: 1.35,
    maxOrbitFactor: 2.4,
    /** Grace period after launch before the departed body can recapture (s). */
    recaptureGrace: 0.9,
  },

  decay: {
    /** After decayTime, orbit radius shrinks at this fraction of radius per second. */
    shrinkRate: 0.22,
    /** HUD warning threshold (fraction of decayTime remaining). */
    warnAt: 0.25,
  },

  flight: {
    /** Lost in space after this many seconds without a capture. */
    maxFlightTime: 9,
    /** Lost when drifting slower than this far from any influence (dead drift). */
    minDriftSpeed: 18,
    /** Corridor half-width around the run axis; beyond it = lost in space. */
    corridorHalfWidth: 900,
  },

  steering: {
    /** Lateral thruster acceleration while holding a screen half (units/s²). */
    baseTurnAccel: 150,
    /** Boosters upgrade: turn authority multiplier is 1 + level × this. */
    turnAccelPerLevel: 0.3,
  },

  world: {
    /** Vertical gap between consecutive bodies (min/max). */
    gapMin: 380,
    gapMax: 640,
    /** Horizontal jitter of each next body relative to the previous. */
    lateralMax: 320,
    /** Bodies generated ahead of the player. */
    lookahead: 6,
    /** Bodies kept behind before pruning. */
    keepBehind: 3,
    /** Every N bodies = new galaxy (palette tint shift + difficulty step). */
    bodiesPerGalaxy: 8,
    /** Difficulty: gap and hazard chances scale by (1 + galaxy × this), capped. */
    difficultyPerGalaxy: 0.12,
    difficultyCap: 1.8,
    /** Chance of an asteroid belt spawning in a gap (scaled by difficulty). */
    beltChance: 0.28,
    beltAsteroids: { min: 5, max: 10 },
    asteroidRadius: { min: 9, max: 20 },
    asteroidSpeed: { min: 22, max: 60 },
  },

  hazards: {
    star: { flarePeriod: 6.5, flareDuration: 1.4, flareRadiusFactor: 3.1, warningLead: 1.1 },
    blackHole: { horizonFactor: 0.62, gravityMultiplier: 3.0, decayTime: 3.2 },
    supernova: { fuse: 6.0, blastFactor: 3.4, blastDuration: 1.2 },
  },

  coins: {
    /** Coins ringed on your orbit path after each capture. */
    perOrbit: 3,
    pickupRadius: 26,
    /** Extra pickup radius per magnet upgrade level. */
    magnetPerLevel: 14,
    orbitCoinValue: 1,
  },

  scoring: {
    perBody: 10,
    perGalaxy: 50,
    riskBonus: { blackHole: 40, supernova: 30, star: 15, gasGiant: 10 } as Record<string, number>,
  },

  camera: {
    followRate: 4.2,
    /** Vertical screen anchor for the rocket (0 = top, 1 = bottom). */
    anchorY: 0.62,
    /**
     * Zoom-to-fit: the camera zooms out so the current body AND the next
     * unvisited body are always on screen (the player must never lose the
     * sense of direction), clamped to [minZoom, maxZoom].
     */
    fitMarginPx: 70,
    minZoom: 0.4,
    maxZoom: 1.0,
    zoomRate: 2.5,
  },

  rocket: {
    /** Collision radius. */
    radius: 9,
    /** Base shields per run before upgrades. */
    baseShields: 0,
  },

  starfield: {
    layers: [
      { count: 46, parallax: 0.15, size: 1.1, alpha: 0.5 },
      { count: 30, parallax: 0.35, size: 1.7, alpha: 0.75 },
      { count: 16, parallax: 0.6, size: 2.4, alpha: 1.0 },
    ],
    /** Virtual tile size the starfield wraps within. */
    tile: 1024,
  },

  trail: {
    /** Flight-trail ring buffer: number of samples and seconds between them. */
    points: 48,
    interval: 0.035,
    maxAge: 1.6,
  },

  particles: {
    poolSize: 128,
    /** Exhaust emission (particles/s) while flying / charging. */
    exhaustRate: 42,
    chargeRate: 24,
    /** Extra side-thruster emission while steering. */
    steerRate: 30,
    life: { min: 0.25, max: 0.6 },
    speed: { min: 26, max: 70 },
    burstCount: 26,
    burstSpeed: { min: 60, max: 210 },
    burstLife: { min: 0.4, max: 0.9 },
  },

  shake: {
    death: 14,
    shield: 8,
    nova: 10,
    /** Amplitude decay half-life-ish rate (per second). */
    decayRate: 6,
    frequency: 34,
  },

  popups: {
    life: 1.0,
    riseDistance: 42,
    fontSize: 15,
  },

  ui: {
    /** HUD React re-render throttle (Hz) — canvas itself always runs at frame rate. */
    hudHz: 8,
    transitionMs: 420,
  },
} as const;

export type GameConfig = typeof gameConfig;
