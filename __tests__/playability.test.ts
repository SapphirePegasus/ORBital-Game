/**
 * Playability verification: a search-based "bot" proves that, with the
 * default config, a player can actually chain hops. Because worldgen and the
 * engine are fully deterministic per seed, a run can be replayed from scratch
 * with a planned sequence of hold-durations — no engine cloning needed.
 *
 * The planner is a bounded DFS with backtracking: a hold that works for hop N
 * but strands hop N+1 gets discarded, exactly like a human learning a route.
 *
 * If a config change breaks the game's core loop (gaps too wide, capture too
 * strict, decay too fast), this suite fails before a human ever notices.
 */
import { GameEngine } from '../src/engine/engine';

const FRAME = 1 / 60;
/** Candidate hold durations (s): 0.10 → 1.60 in 50 ms steps. */
const HOLDS = Array.from({ length: 31 }, (_, i) => 0.1 + i * 0.05);
/** Max seconds to wait for each hop to resolve. */
const HOP_TIMEOUT = 14;
/** DFS breadth cap per depth (successful branches explored). */
const BRANCH_CAP = 6;

interface ReplayResult {
  captures: number;
  died: boolean;
}

/** Replay a full run from scratch executing the given hold plan. */
const replay = (seed: number, plan: readonly number[]): ReplayResult => {
  const engine = new GameEngine(seed);
  engine.attract = false;
  let captures = 0;

  for (const hold of plan) {
    engine.press();
    for (let t = 0; t < hold && engine.alive; t += FRAME) engine.update(FRAME);
    engine.release();

    let resolved = false;
    for (let t = 0; t < HOP_TIMEOUT && engine.alive; t += FRAME) {
      engine.update(FRAME);
      if (engine.drainEvents().some((e) => e.type === 'captured')) {
        captures++;
        resolved = true;
        break;
      }
    }
    if (!engine.alive || !resolved) return { captures, died: !engine.alive };
  }
  return { captures, died: !engine.alive };
};

/** Bounded DFS: find a plan reaching `targetHops` captures. Null if none. */
const search = (seed: number, targetHops: number, plan: number[] = []): number[] | null => {
  if (plan.length === targetHops) return plan;
  let branches = 0;
  for (const hold of HOLDS) {
    const candidate = [...plan, hold];
    const result = replay(seed, candidate);
    if (!result.died && result.captures === candidate.length) {
      const full = search(seed, targetHops, candidate);
      if (full) return full;
      if (++branches >= BRANCH_CAP) break;
    }
  }
  return null;
};

describe('playability (default tuning)', () => {
  test('the first hop is achievable on a spread of seeds', () => {
    for (const seed of [1, 7, 42, 1234, 99999]) {
      expect(search(seed, 1)).not.toBeNull();
    }
  });

  test('a 3-hop chain is achievable (core loop is viable)', () => {
    const seeds = [1, 7, 42, 1234, 99999];
    const viable = seeds.filter((s) => search(s, 3) !== null);
    // The loop must be viable on the clear majority of universes.
    expect(viable.length).toBeGreaterThanOrEqual(3);
  });
});
