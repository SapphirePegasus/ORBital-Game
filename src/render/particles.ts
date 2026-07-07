/**
 * Visual-only particle system and flight trail. Both use fixed preallocated
 * buffers (the renderer's zero-GC budget, ADR-001): dead particles are
 * recycled in place; the trail is a ring buffer.
 */
import { gameConfig } from '../config/gameConfig';

// ------------------------------------------------------------------ particles

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** 0 = exhaust (accent), 1 = debris (danger), 2 = spark (text). */
  tint: 0 | 1 | 2;
}

export class ParticleSystem {
  readonly pool: Particle[];
  private cursor = 0;
  private emitAccum = 0;

  constructor(size = gameConfig.particles.poolSize) {
    this.pool = Array.from({ length: size }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      life: 1,
      size: 2,
      tint: 0 as const,
    }));
  }

  private next(): Particle {
    const p = this.pool[this.cursor % this.pool.length] as Particle;
    this.cursor++;
    return p; // oldest slot is simply overwritten — pool never grows
  }

  private spawn(
    x: number,
    y: number,
    angle: number,
    speed: number,
    life: number,
    size: number,
    tint: Particle['tint'],
  ): void {
    const p = this.next();
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.age = 0;
    p.life = life;
    p.size = size;
    p.tint = tint;
  }

  /** Continuous emission (exhaust / steering puffs). rate in particles/s. */
  emit(
    dt: number,
    rate: number,
    x: number,
    y: number,
    baseAngle: number,
    spread: number,
    tint: Particle['tint'] = 0,
  ): void {
    const cfg = gameConfig.particles;
    this.emitAccum += rate * dt;
    while (this.emitAccum >= 1) {
      this.emitAccum -= 1;
      const angle = baseAngle + (Math.random() - 0.5) * spread;
      const speed = cfg.speed.min + Math.random() * (cfg.speed.max - cfg.speed.min);
      const life = cfg.life.min + Math.random() * (cfg.life.max - cfg.life.min);
      this.spawn(x, y, angle, speed, life, 1.4 + Math.random() * 1.6, tint);
    }
  }

  /** One-shot radial burst (death, shield hit). */
  burst(x: number, y: number, tint: Particle['tint'] = 1): void {
    const cfg = gameConfig.particles;
    for (let i = 0; i < cfg.burstCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed =
        cfg.burstSpeed.min + Math.random() * (cfg.burstSpeed.max - cfg.burstSpeed.min);
      const life = cfg.burstLife.min + Math.random() * (cfg.burstLife.max - cfg.burstLife.min);
      this.spawn(x, y, angle, speed, life, 1.6 + Math.random() * 2.2, tint);
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
    this.emitAccum = 0;
  }
}

// ---------------------------------------------------------------------- trail

export class Trail {
  /** x, y, age triplets in a ring buffer. */
  readonly data: Float32Array;
  readonly capacity: number;
  private head = 0;
  count = 0;
  private sampleAccum = 0;

  constructor(capacity = gameConfig.trail.points) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * 3);
  }

  /** Push samples at the configured interval while the rocket is flying. */
  sample(dt: number, x: number, y: number): void {
    this.sampleAccum += dt;
    if (this.sampleAccum < gameConfig.trail.interval) return;
    this.sampleAccum = 0;
    const i = this.head * 3;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = 0;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Age all samples; expired samples are skipped by the renderer. */
  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      const idx = i * 3 + 2;
      this.data[idx] = (this.data[idx] ?? 0) + dt;
    }
  }

  clear(): void {
    this.count = 0;
    this.head = 0;
    this.sampleAccum = 0;
  }
}
