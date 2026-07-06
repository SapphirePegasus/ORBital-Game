/**
 * GameEngine — the authoritative simulation. Plain TypeScript, no RN imports.
 *
 * Runs a fixed-timestep loop (accumulator pattern): rendering may happen at
 * any frame rate; physics always steps at gameConfig.physics.fixedDt, so the
 * game feels identical on a 60 Hz phone and a 120 Hz one, and long frames
 * can never tunnel the rocket through a planet.
 *
 * The engine communicates outward only through a drained event queue; it
 * never touches React, stores, audio, or rendering directly.
 */
import { gameConfig } from '../config/gameConfig';
import { lerp, TWO_PI, wrapAngle, crossSign } from '../core/math';
import { Rng, randomSeed } from '../core/rng';
import type {
  CelestialBody,
  Coin,
  DeathCause,
  EngineEvent,
  RocketState,
  UpgradeLevels,
} from '../core/types';
import { defaultUpgrades } from '../config/upgrades';
import {
  checkCapture,
  circularOrbitSpeed,
  escapeVelocity,
  predictTrajectory,
  stepIntegration,
  surfaceGravity,
} from './physics';
import { World } from './world';

export interface HudInfo {
  speed: number;
  bodyKind: string;
  bodyGravity: number;
  bodyMass: number;
  escapeVelocity: number;
  chargeT: number;
  /** 1 → full stable time left, 0 → decaying now. */
  decayRemaining: number;
  boostsLeft: number;
  shields: number;
  mode: RocketState['mode'];
}

export class GameEngine {
  world: World;
  rocket: RocketState;
  coins: Coin[] = [];
  /** Trajectory preview buffer (x,y pairs) + count, rebuilt while charging. */
  readonly previewBuffer = new Float32Array(gameConfig.launch.previewSteps * 2);
  previewCount = 0;

  elapsed = 0;
  alive = true;
  attract = true;
  seed: number;

  score = 0;
  coinsCollected = 0;
  bodiesVisited = 0;
  bestSpeed = 0;

  private upgrades: UpgradeLevels = { ...defaultUpgrades };
  private accumulator = 0;
  private events: EngineEvent[] = [];
  private coinRng: Rng;
  private lastDepartedId = -1;
  private departTime = -Infinity;
  private flareWarnedCycle = new Map<number, number>();

  constructor(seed: number = randomSeed(), upgrades?: UpgradeLevels) {
    this.seed = seed;
    if (upgrades) this.upgrades = { ...upgrades };
    this.coinRng = new Rng(seed ^ 0x5f3759df);
    this.world = new World(seed, this.upgrades.stabilizers);
    this.rocket = this.initialRocket();
  }

  private initialRocket(): RocketState {
    const start = this.world.bodies[0];
    if (!start) throw new Error('World generated no start body');
    const orbitRadius = start.radius * 1.9;
    return {
      mode: 'orbiting',
      x: start.x + orbitRadius,
      y: start.y,
      vx: 0,
      vy: 0,
      heading: Math.PI / 2,
      bodyId: start.id,
      orbitRadius,
      orbitAngle: 0,
      orbitDir: 1,
      orbitTime: 0,
      chargeSpeed: gameConfig.launch.minSpeed,
      chargeT: 0,
      flightTime: 0,
      boostsLeft: gameConfig.rocket.baseBoosts + this.upgrades.boosters,
      shields: gameConfig.rocket.baseShields + this.upgrades.shield,
    };
  }

  /** Full restart with a fresh (or given) seed and current upgrade levels. */
  reset(upgrades: UpgradeLevels, seed: number = randomSeed()): void {
    this.seed = seed;
    this.upgrades = { ...upgrades };
    this.coinRng = new Rng(seed ^ 0x5f3759df);
    this.world = new World(seed, this.upgrades.stabilizers);
    this.rocket = this.initialRocket();
    this.coins = [];
    this.elapsed = 0;
    this.accumulator = 0;
    this.alive = true;
    this.score = 0;
    this.coinsCollected = 0;
    this.bodiesVisited = 0;
    this.bestSpeed = 0;
    this.previewCount = 0;
    this.events = [];
    this.lastDepartedId = -1;
    this.departTime = -Infinity;
    this.flareWarnedCycle.clear();
  }

  // ------------------------------------------------------------------ input

  /** Finger down: start charging (orbiting) or fire a boost (flying). */
  press(): void {
    if (this.attract || !this.alive) return;
    const r = this.rocket;
    if (r.mode === 'orbiting') {
      r.mode = 'charging';
      r.chargeT = 0;
      r.chargeSpeed = gameConfig.launch.minSpeed;
    } else if (r.mode === 'flying' && r.boostsLeft > 0) {
      const speed = Math.hypot(r.vx, r.vy);
      if (speed > 1e-3) {
        const k = gameConfig.flight.boostImpulse / speed;
        r.vx += r.vx * k;
        r.vy += r.vy * k;
        r.boostsLeft--;
        this.emit({ type: 'boost' });
      }
    }
  }

  /** Finger up: launch if charging. */
  release(): void {
    if (this.attract || !this.alive) return;
    const r = this.rocket;
    if (r.mode !== 'charging') return;
    const body = this.world.byId(r.bodyId);
    r.mode = 'flying';
    r.flightTime = 0;
    // Tangential launch, preserving orbital direction.
    const tx = -Math.sin(r.orbitAngle) * r.orbitDir;
    const ty = Math.cos(r.orbitAngle) * r.orbitDir;
    r.vx = tx * r.chargeSpeed;
    r.vy = ty * r.chargeSpeed;
    r.heading = Math.atan2(r.vy, r.vx);
    this.lastDepartedId = r.bodyId;
    this.departTime = this.elapsed;
    r.bodyId = -1;
    this.previewCount = 0;
    if (body?.kind === 'supernova' && body.novaCountdown >= 0) {
      // Leaving disarms nothing — the star still blows; you just need distance.
    }
    this.emit({ type: 'launched', speed: r.chargeSpeed });
  }

  // ----------------------------------------------------------------- update

  /** Advance the simulation by real elapsed seconds (variable). */
  update(frameDt: number): void {
    if (!this.alive) return;
    const { fixedDt, maxStepsPerFrame } = gameConfig.physics;
    this.accumulator = Math.min(this.accumulator + frameDt, fixedDt * maxStepsPerFrame);
    while (this.accumulator >= fixedDt) {
      this.accumulator -= fixedDt;
      this.step(fixedDt);
      if (!this.alive) return;
    }
  }

  private step(dt: number): void {
    this.elapsed += dt;
    this.world.updateAsteroids(dt);
    this.updateNovae(dt);

    const r = this.rocket;
    if (r.mode === 'orbiting' || r.mode === 'charging') this.stepOrbit(r, dt);
    else this.stepFlight(r, dt);

    if (!this.attract && this.alive) {
      this.checkHazards(r);
      this.collectCoins(r);
    }
  }

  private stepOrbit(r: RocketState, dt: number): void {
    const body = this.world.byId(r.bodyId);
    if (!body) {
      this.die('lostInSpace');
      return;
    }

    // Orbital decay (paused in attract mode so the menu stays serene).
    if (!this.attract) {
      r.orbitTime += dt;
      if (r.orbitTime > body.decayTime) {
        r.orbitRadius -= gameConfig.decay.shrinkRate * body.radius * dt;
        if (r.orbitRadius <= body.radius + gameConfig.rocket.radius) {
          this.die('orbitDecayed');
          return;
        }
      }
    }

    // Kinematic circular motion — perfectly clean parked orbits.
    const omega =
      (circularOrbitSpeed(body, r.orbitRadius) * gameConfig.physics.orbitSpeedFactor) /
      r.orbitRadius;
    r.orbitAngle = wrapAngle(r.orbitAngle + omega * r.orbitDir * dt);
    r.x = body.x + Math.cos(r.orbitAngle) * r.orbitRadius;
    r.y = body.y + Math.sin(r.orbitAngle) * r.orbitRadius;
    r.heading = r.orbitAngle + (Math.PI / 2) * r.orbitDir;

    if (r.mode === 'charging') {
      const chargeTime =
        gameConfig.launch.chargeTime *
        Math.pow(gameConfig.launch.chargeControlPerLevel, this.upgrades.chargeControl);
      r.chargeT = Math.min(1, r.chargeT + dt / chargeTime);
      r.chargeSpeed = lerp(gameConfig.launch.minSpeed, gameConfig.launch.maxSpeed, r.chargeT);
      this.rebuildPreview(r);
    }
  }

  private rebuildPreview(r: RocketState): void {
    const tx = -Math.sin(r.orbitAngle) * r.orbitDir;
    const ty = Math.cos(r.orbitAngle) * r.orbitDir;
    this.previewCount = predictTrajectory(
      r.x,
      r.y,
      tx * r.chargeSpeed,
      ty * r.chargeSpeed,
      this.world.bodies,
      r.bodyId,
      this.previewBuffer,
    );
  }

  private stepFlight(r: RocketState, dt: number): void {
    r.flightTime += dt;
    stepIntegration(r, this.world.bodies, dt);
    const speed = Math.hypot(r.vx, r.vy);
    if (speed > this.bestSpeed) this.bestSpeed = speed;
    if (speed > 1) r.heading = Math.atan2(r.vy, r.vx);

    // Surface impact.
    for (const b of this.world.bodies) {
      if (b.detonated) continue;
      const dx = r.x - b.x;
      const dy = r.y - b.y;
      const hitR = b.radius + gameConfig.rocket.radius;
      if (dx * dx + dy * dy < hitR * hitR) {
        this.die(b.kind === 'blackHole' ? 'blackHole' : 'crashed');
        return;
      }
    }

    // Capture (after the recapture grace window for the departed body).
    const excludeId =
      this.elapsed - this.departTime < gameConfig.capture.recaptureGrace
        ? this.lastDepartedId
        : -1;
    const cap = checkCapture(r, this.world.bodies, excludeId);
    if (cap.captured && cap.body) {
      this.capture(r, cap.body, cap.orbitRadius);
      return;
    }

    // Lost in space: out of corridor, timed out, or dead drift beyond all pull.
    const lost =
      Math.abs(r.x) > gameConfig.flight.corridorHalfWidth ||
      r.flightTime > gameConfig.flight.maxFlightTime ||
      (speed < gameConfig.flight.minDriftSpeed && r.flightTime > 1.5);
    if (lost) this.die('lostInSpace');
  }

  private capture(r: RocketState, body: CelestialBody, orbitRadius: number): void {
    r.mode = 'orbiting';
    r.bodyId = body.id;
    r.orbitRadius = orbitRadius;
    r.orbitAngle = Math.atan2(r.y - body.y, r.x - body.x);
    // Preserve rotational direction from the sign of angular momentum.
    r.orbitDir = crossSign(r.x - body.x, r.y - body.y, r.vx, r.vy);
    r.orbitTime = 0;
    r.vx = 0;
    r.vy = 0;
    r.boostsLeft = gameConfig.rocket.baseBoosts + this.upgrades.boosters;

    const firstVisit = body.depth >= this.bodiesVisited;
    let coins = 0;
    if (firstVisit && !this.attract) {
      this.bodiesVisited = body.depth;
      coins = body.coinReward;
      this.coinsCollected += coins;
      this.score += gameConfig.scoring.perBody;
      this.score += gameConfig.scoring.riskBonus[body.kind] ?? 0;
      if (body.depth % gameConfig.world.bodiesPerGalaxy === 0 && body.depth > 0) {
        this.score += gameConfig.scoring.perGalaxy;
      }
      this.spawnOrbitCoins(body, orbitRadius);
      this.world.ensureAhead(body.depth);
      this.world.pruneBehind(body.depth);
    }

    if (body.kind === 'supernova' && body.novaCountdown < 0) {
      body.novaCountdown = gameConfig.hazards.supernova.fuse;
      this.emit({ type: 'novaArmed' });
    }

    this.emit({ type: 'captured', body, coins });
  }

  private spawnOrbitCoins(body: CelestialBody, orbitRadius: number): void {
    const base = this.coinRng.range(0, TWO_PI);
    for (let i = 0; i < gameConfig.coins.perOrbit; i++) {
      const a = base + (TWO_PI / gameConfig.coins.perOrbit) * i + this.coinRng.range(-0.3, 0.3);
      this.coins.push({
        x: body.x + Math.cos(a) * orbitRadius,
        y: body.y + Math.sin(a) * orbitRadius,
        collected: false,
      });
    }
  }

  private collectCoins(r: RocketState): void {
    const radius =
      gameConfig.coins.pickupRadius + gameConfig.coins.magnetPerLevel * this.upgrades.magnet;
    for (const c of this.coins) {
      if (c.collected) continue;
      const dx = c.x - r.x;
      const dy = c.y - r.y;
      if (dx * dx + dy * dy < radius * radius) {
        c.collected = true;
        this.coinsCollected += gameConfig.coins.orbitCoinValue;
        this.emit({ type: 'coin' });
      }
    }
  }

  // ---------------------------------------------------------------- hazards

  isFlareActive(body: CelestialBody): boolean {
    const { flarePeriod, flareDuration } = gameConfig.hazards.star;
    return (this.elapsed + body.flarePhase) % flarePeriod < flareDuration;
  }

  /** 0..1 progress toward the next flare (for the renderer's warning glow). */
  flareCycleT(body: CelestialBody): number {
    const { flarePeriod } = gameConfig.hazards.star;
    return ((this.elapsed + body.flarePhase) % flarePeriod) / flarePeriod;
  }

  private updateNovae(dt: number): void {
    for (const b of this.world.bodies) {
      if (b.kind !== 'supernova' || b.novaCountdown < 0 || b.detonated) continue;
      b.novaCountdown -= dt;
      if (b.novaCountdown <= 0) {
        b.detonated = true;
        b.novaCountdown = 0;
        const blast = b.radius * gameConfig.hazards.supernova.blastFactor;
        const r = this.rocket;
        const dx = r.x - b.x;
        const dy = r.y - b.y;
        const inBlast = dx * dx + dy * dy < blast * blast;
        const orbitingIt = r.bodyId === b.id;
        if (!this.attract && (inBlast || orbitingIt)) this.die('supernova');
      }
    }
  }

  private checkHazards(r: RocketState): void {
    const { star, blackHole } = gameConfig.hazards;

    for (const b of this.world.bodies) {
      const dx = r.x - b.x;
      const dy = r.y - b.y;
      const d2 = dx * dx + dy * dy;

      if (b.kind === 'star') {
        const cycle = Math.floor((this.elapsed + b.flarePhase) / star.flarePeriod);
        const untilFlare =
          star.flarePeriod - ((this.elapsed + b.flarePhase) % star.flarePeriod);
        const flareR = b.radius * star.flareRadiusFactor;
        if (
          untilFlare < star.warningLead &&
          d2 < flareR * flareR &&
          this.flareWarnedCycle.get(b.id) !== cycle
        ) {
          this.flareWarnedCycle.set(b.id, cycle);
          this.emit({ type: 'flareWarning' });
        }
        if (this.isFlareActive(b) && d2 < flareR * flareR) {
          if (!this.absorbWithShield()) {
            this.die('solarFlare');
            return;
          }
          this.flareWarnedCycle.set(b.id, cycle); // shield spent; don't re-hit this cycle
        }
      }

      if (b.kind === 'blackHole') {
        const horizon = b.radius * blackHole.horizonFactor + b.radius; // horizon sits above the visual disc
        if (d2 < horizon * horizon) {
          this.die('blackHole'); // no shield saves you from an event horizon
          return;
        }
      }
    }

    // Asteroid impacts (flight only — parked orbits sit outside belts by design).
    if (r.mode === 'flying') {
      for (const a of this.world.asteroids) {
        const dx = r.x - a.x;
        const dy = r.y - a.y;
        const hitR = a.radius + gameConfig.rocket.radius;
        if (dx * dx + dy * dy < hitR * hitR) {
          if (this.absorbWithShield()) {
            a.x = 1e9; // knock the asteroid out of play
          } else {
            this.die('asteroid');
            return;
          }
        }
      }
    }
  }

  /** Consume one shield if available. Emits shieldHit. */
  private absorbWithShield(): boolean {
    if (this.rocket.shields <= 0) return false;
    this.rocket.shields--;
    this.emit({ type: 'shieldHit' });
    return true;
  }

  private die(cause: DeathCause): void {
    if (!this.alive) return;
    this.alive = false;
    this.emit({ type: 'died', cause });
  }

  // ----------------------------------------------------------------- output

  private emit(e: EngineEvent): void {
    this.events.push(e);
  }

  /** Drain queued events (called once per frame by the app layer). */
  drainEvents(): EngineEvent[] {
    if (this.events.length === 0) return this.events;
    const out = this.events;
    this.events = [];
    return out;
  }

  hudInfo(): HudInfo {
    const r = this.rocket;
    const body =
      r.bodyId >= 0
        ? this.world.byId(r.bodyId)
        : undefined;
    const decayRemaining = body
      ? Math.max(0, 1 - r.orbitTime / body.decayTime)
      : 1;
    return {
      speed:
        r.mode === 'flying'
          ? Math.hypot(r.vx, r.vy)
          : r.mode === 'charging'
            ? r.chargeSpeed
            : body
              ? circularOrbitSpeed(body, r.orbitRadius)
              : 0,
      bodyKind: body?.kind ?? '—',
      bodyGravity: body ? surfaceGravity(body) : 0,
      bodyMass: body ? body.mass : 0,
      escapeVelocity: body ? escapeVelocity(body, r.orbitRadius) : 0,
      chargeT: r.mode === 'charging' ? r.chargeT : 0,
      decayRemaining,
      boostsLeft: r.boostsLeft,
      shields: r.shields,
      mode: r.mode,
    };
  }
}
