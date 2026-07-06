import { gameConfig } from '../src/config/gameConfig';
import type { CelestialBody } from '../src/core/types';
import {
  checkCapture,
  circularOrbitSpeed,
  escapeVelocity,
  gravityAt,
  predictTrajectory,
  stepIntegration,
} from '../src/engine/physics';

const makeBody = (partial: Partial<CelestialBody> = {}): CelestialBody => ({
  id: 1,
  kind: 'planet',
  x: 0,
  y: 0,
  radius: 40,
  mass: 1600,
  influenceRadius: 300,
  captureRadius: 120,
  decayTime: 8,
  coinReward: 2,
  depth: 0,
  visualSeed: 7,
  flarePhase: 0,
  novaCountdown: -1,
  detonated: false,
  ...partial,
});

describe('physics', () => {
  test('escape velocity is √2 × circular orbit speed', () => {
    const b = makeBody();
    const d = 100;
    expect(escapeVelocity(b, d)).toBeCloseTo(circularOrbitSpeed(b, d) * Math.SQRT2, 6);
  });

  test('escape velocity decreases with distance', () => {
    const b = makeBody();
    expect(escapeVelocity(b, 60)).toBeGreaterThan(escapeVelocity(b, 200));
  });

  test('gravity is zero outside a body influence radius', () => {
    const b = makeBody({ influenceRadius: 100 });
    const g = gravityAt(500, 0, [b]);
    expect(g.ax).toBe(0);
    expect(g.ay).toBe(0);
    expect(g.dominantId).toBe(-1);
  });

  test('gravity points toward the body and follows inverse-square falloff', () => {
    const b = makeBody();
    const near = gravityAt(100, 0, [b]);
    const far = gravityAt(200, 0, [b]);
    expect(near.ax).toBeLessThan(0); // pulled toward origin
    expect(Math.abs(near.ax) / Math.abs(far.ax)).toBeCloseTo(4, 5); // 2× distance → ¼ pull
  });

  test('detonated bodies exert no gravity', () => {
    const b = makeBody({ detonated: true });
    const g = gravityAt(100, 0, [b]);
    expect(g.ax).toBe(0);
  });

  test('a circular orbit is stable under integration (energy sanity)', () => {
    const b = makeBody();
    const r0 = 100;
    const v = circularOrbitSpeed(b, r0);
    const s = { x: r0, y: 0, vx: 0, vy: v };
    const dt = gameConfig.physics.fixedDt;
    for (let i = 0; i < 4000; i++) stepIntegration(s, [b], dt);
    const r = Math.hypot(s.x, s.y);
    expect(r).toBeGreaterThan(r0 * 0.9);
    expect(r).toBeLessThan(r0 * 1.1);
  });

  test('capture succeeds when bound, fails when faster than escape velocity', () => {
    const b = makeBody();
    const d = 100;
    const vEsc = escapeVelocity(b, d);
    const slow = { x: d, y: 0, vx: 0, vy: vEsc * 0.7 };
    const fast = { x: d, y: 0, vx: 0, vy: vEsc * 1.5 };
    expect(checkCapture(slow, [b], -1).captured).toBe(true);
    expect(checkCapture(fast, [b], -1).captured).toBe(false);
  });

  test('capture excludes the departed body and clamps orbit radius', () => {
    const b = makeBody();
    const s = { x: 100, y: 0, vx: 0, vy: 1 };
    expect(checkCapture(s, [b], b.id).captured).toBe(false);
    const cap = checkCapture({ x: b.radius * 1.05, y: 0, vx: 0, vy: 1 }, [b], -1);
    expect(cap.captured).toBe(true);
    expect(cap.orbitRadius).toBeGreaterThanOrEqual(b.radius * gameConfig.capture.minOrbitFactor);
  });

  test('trajectory prediction terminates on impact', () => {
    const b = makeBody();
    const out = new Float32Array(gameConfig.launch.previewSteps * 2);
    // Fired straight at the planet from just outside it: must hit fast.
    const n = predictTrajectory(150, 0, -300, 0, [b], -1, out);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(gameConfig.launch.previewSteps);
    const lastX = out[(n - 1) * 2] ?? Infinity;
    expect(Math.abs(lastX)).toBeLessThanOrEqual(b.radius + 20);
  });
});
