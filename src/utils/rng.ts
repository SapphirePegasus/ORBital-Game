/**
 * Mulberry32 — fast, good-quality 32-bit seeded PRNG.
 * Returns a factory so each galaxy/system gets its own independent stream.
 */
export const createRNG = (seed: number) => {
  let s = seed | 0;
  return {
    /** Returns float in [0, 1) */
    next(): number {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Returns integer in [min, max] inclusive */
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    /** Returns float in [min, max) */
    float(min: number, max: number): number {
      return this.next() * (max - min) + min;
    },
    /** Picks a random element from an array */
    pick<T>(arr: readonly T[]): T {
      const item = arr[this.int(0, arr.length - 1)];
      if (item === undefined) throw new Error('pick called on empty array');
      return item;
    },
  };
};

export type RNG = ReturnType<typeof createRNG>;
