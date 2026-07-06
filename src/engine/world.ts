/**
 * Procedural world generation. Deterministic per seed (see src/core/rng.ts).
 *
 * The run is a vertical chain of celestial bodies climbing in -Y, with
 * lateral jitter clamped to a corridor. Difficulty (gap width, hazard
 * frequency, archetype pool) scales with galaxy index. Asteroid belts spawn
 * in some gaps. Bodies behind the player are pruned to bound memory.
 */
import { archetypeOf, bodyArchetypes } from '../config/bodies';
import { gameConfig } from '../config/gameConfig';
import { Rng } from '../core/rng';
import type { Asteroid, AsteroidBelt, BodyKind, CelestialBody } from '../core/types';
import { stabilizerMultiplier } from '../config/upgrades';

export class World {
  readonly bodies: CelestialBody[] = [];
  readonly asteroids: Asteroid[] = [];
  readonly belts: AsteroidBelt[] = [];

  private rng: Rng;
  private nextId = 0;
  private nextDepth = 0;
  private lastX = 0;
  private lastY = 0;
  private stabilizerLevel: number;

  constructor(seed: number, stabilizerLevel = 0) {
    this.rng = new Rng(seed);
    this.stabilizerLevel = stabilizerLevel;
    // Starting body: always a plain planet, centered, generous size.
    this.spawnBody('planet', 0, 0, 46);
    this.ensureAhead(0);
  }

  galaxyOf(depth: number): number {
    return Math.floor(depth / gameConfig.world.bodiesPerGalaxy);
  }

  private difficulty(depth: number): number {
    const d = 1 + this.galaxyOf(depth) * gameConfig.world.difficultyPerGalaxy;
    return Math.min(d, gameConfig.world.difficultyCap);
  }

  /** Guarantee `lookahead` bodies exist above depth `fromDepth`. */
  ensureAhead(fromDepth: number): void {
    while (this.nextDepth <= fromDepth + gameConfig.world.lookahead) {
      this.generateNext();
    }
  }

  /** Prune bodies/asteroids far below `minDepth` to keep memory flat. */
  pruneBehind(minDepth: number): void {
    const cutoff = minDepth - gameConfig.world.keepBehind;
    let i = 0;
    while (i < this.bodies.length) {
      const b = this.bodies[i];
      if (b && b.depth < cutoff) this.bodies.splice(i, 1);
      else i++;
    }
    const lowestY = this.bodies.reduce((m, b) => Math.max(m, b.y), -Infinity);
    let j = 0;
    while (j < this.asteroids.length) {
      const a = this.asteroids[j];
      if (a && a.y > lowestY + 400) this.asteroids.splice(j, 1);
      else j++;
    }
  }

  byId(id: number): CelestialBody | undefined {
    return this.bodies.find((b) => b.id === id);
  }

  private pickKind(depth: number): BodyKind {
    const eligible = bodyArchetypes.filter((a) => depth >= a.minDepth);
    const weights = eligible.map((a) => a.weight);
    return this.rng.weightedPick(eligible, weights).kind;
  }

  private spawnBody(kind: BodyKind, x: number, y: number, forcedRadius?: number): CelestialBody {
    const arch = archetypeOf(kind);
    const radius = forcedRadius ?? this.rng.range(arch.radius.min, arch.radius.max);
    const decayBase = kind === 'blackHole' ? gameConfig.hazards.blackHole.decayTime : arch.decayTime;
    const body: CelestialBody = {
      id: this.nextId++,
      kind,
      x,
      y,
      radius,
      mass: arch.density * radius * radius,
      influenceRadius: radius * arch.influenceFactor,
      captureRadius: radius * arch.captureFactor,
      decayTime: decayBase * stabilizerMultiplier(this.stabilizerLevel),
      coinReward: arch.coinReward,
      depth: this.nextDepth++,
      visualSeed: this.rng.int(0, 0xffff),
      flarePhase: this.rng.range(0, gameConfig.hazards.star.flarePeriod),
      novaCountdown: -1,
      detonated: false,
    };
    this.bodies.push(body);
    this.lastX = x;
    this.lastY = y;
    return body;
  }

  private generateNext(): void {
    const w = gameConfig.world;
    const diff = this.difficulty(this.nextDepth);
    const gap = this.rng.range(w.gapMin, w.gapMax) * diff;
    const prevX = this.lastX;
    const prevY = this.lastY;
    const x = Math.max(
      -gameConfig.flight.corridorHalfWidth * 0.6,
      Math.min(
        gameConfig.flight.corridorHalfWidth * 0.6,
        prevX + this.rng.range(-w.lateralMax, w.lateralMax),
      ),
    );
    const y = prevY - gap; // climbing upward = -Y
    const body = this.spawnBody(this.pickKind(this.nextDepth), x, y);

    // Maybe seed an asteroid belt in the gap between the two bodies.
    if (this.rng.chance(w.beltChance * diff) && this.nextDepth > 2) {
      this.spawnBelt(prevX, prevY, body);
    }
  }

  private spawnBelt(prevX: number, prevY: number, next: CelestialBody): void {
    const w = gameConfig.world;
    const midY = (prevY + next.y) / 2;
    const belt: AsteroidBelt = {
      minX: Math.min(prevX, next.x) - 240,
      maxX: Math.max(prevX, next.x) + 240,
      minY: midY - 90,
      maxY: midY + 90,
    };
    const beltIndex = this.belts.push(belt) - 1;
    const count = this.rng.int(w.beltAsteroids.min, w.beltAsteroids.max);
    for (let i = 0; i < count; i++) {
      const speed = this.rng.range(w.asteroidSpeed.min, w.asteroidSpeed.max);
      const dir = this.rng.chance(0.5) ? 1 : -1;
      this.asteroids.push({
        x: this.rng.range(belt.minX, belt.maxX),
        y: this.rng.range(belt.minY, belt.maxY),
        radius: this.rng.range(w.asteroidRadius.min, w.asteroidRadius.max),
        vx: speed * dir,
        vy: this.rng.range(-8, 8),
        spin: this.rng.range(0, Math.PI * 2),
        beltIndex,
      });
    }
  }

  /** Advance asteroid drift; wrap within their belt band. */
  updateAsteroids(dt: number): void {
    for (const a of this.asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.spin += dt * 0.6;
      const belt = this.belts[a.beltIndex];
      if (!belt) continue;
      if (a.x < belt.minX) a.x = belt.maxX;
      else if (a.x > belt.maxX) a.x = belt.minX;
      if (a.y < belt.minY) a.y = belt.maxY;
      else if (a.y > belt.maxY) a.y = belt.minY;
    }
  }
}
