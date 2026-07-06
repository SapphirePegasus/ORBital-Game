/**
 * Deterministic, seedable PRNG (mulberry32).
 *
 * Why not Math.random(): world generation must be reproducible so that
 * (a) a run can be replayed/debugged from its seed, and (b) unit tests of
 * the generator are deterministic. mulberry32 is a well-known 32-bit
 * generator with good statistical quality for game purposes.
 * NOT cryptographically secure — never use for security-sensitive values.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Force into uint32 space; avoid the degenerate all-zero state.
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a random element. Throws on empty input (programmer error). */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[this.int(0, items.length - 1)] as T;
  }

  /**
   * Weighted pick. `weights[i]` corresponds to `items[i]`.
   * Zero/negative weights are treated as zero.
   */
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0 || items.length !== weights.length) {
      throw new Error('Rng.weightedPick: invalid input');
    }
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= Math.max(0, weights[i] ?? 0);
      if (roll <= 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }
}

/** Non-security seed source for new runs. */
export const randomSeed = (): number => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
