import { gameConfig } from '../src/config/gameConfig';
import { archetypeOf } from '../src/config/bodies';
import { World } from '../src/engine/world';

describe('world generation', () => {
  test('same seed produces an identical universe', () => {
    const a = new World(1234);
    const b = new World(1234);
    expect(a.bodies.length).toBe(b.bodies.length);
    for (let i = 0; i < a.bodies.length; i++) {
      expect(a.bodies[i]?.kind).toBe(b.bodies[i]?.kind);
      expect(a.bodies[i]?.x).toBeCloseTo(b.bodies[i]?.x ?? NaN, 9);
      expect(a.bodies[i]?.y).toBeCloseTo(b.bodies[i]?.y ?? NaN, 9);
      expect(a.bodies[i]?.radius).toBeCloseTo(b.bodies[i]?.radius ?? NaN, 9);
    }
  });

  test('different seeds diverge', () => {
    const a = new World(1);
    const b = new World(2);
    const same = a.bodies.every(
      (body, i) => body.x === b.bodies[i]?.x && body.y === b.bodies[i]?.y,
    );
    expect(same).toBe(false);
  });

  test('starts with a plain planet and generates lookahead', () => {
    const w = new World(99);
    expect(w.bodies[0]?.kind).toBe('planet');
    expect(w.bodies.length).toBeGreaterThanOrEqual(gameConfig.world.lookahead);
  });

  test('bodies climb upward (-Y) with bounded lateral drift', () => {
    const w = new World(42);
    w.ensureAhead(20);
    for (let i = 1; i < w.bodies.length; i++) {
      const prev = w.bodies[i - 1];
      const cur = w.bodies[i];
      expect(cur && prev ? cur.y < prev.y : false).toBe(true);
      expect(Math.abs(cur?.x ?? Infinity)).toBeLessThanOrEqual(
        gameConfig.flight.corridorHalfWidth,
      );
    }
  });

  test('advanced hazards never spawn before their minimum depth', () => {
    for (let seed = 0; seed < 25; seed++) {
      const w = new World(seed);
      w.ensureAhead(30);
      for (const b of w.bodies) {
        expect(b.depth).toBeGreaterThanOrEqual(archetypeOf(b.kind).minDepth);
      }
    }
  });

  test('mass derives from density × radius²', () => {
    const w = new World(7);
    for (const b of w.bodies) {
      expect(b.mass).toBeCloseTo(archetypeOf(b.kind).density * b.radius * b.radius, 6);
    }
  });

  test('pruning removes far-behind bodies but keeps the recent trail', () => {
    const w = new World(5);
    w.ensureAhead(20);
    const before = w.bodies.length;
    w.pruneBehind(15);
    expect(w.bodies.length).toBeLessThan(before);
    expect(w.bodies.some((b) => b.depth >= 15)).toBe(true);
    expect(w.bodies.every((b) => b.depth >= 15 - gameConfig.world.keepBehind)).toBe(true);
  });
});
