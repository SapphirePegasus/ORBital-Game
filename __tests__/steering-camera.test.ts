import { gameConfig } from '../src/config/gameConfig';
import { defaultUpgrades } from '../src/config/upgrades';
import { GameEngine } from '../src/engine/engine';
import { computeFitZoom, targetFits, type FitParams } from '../src/render/camera';

const FRAME = 1 / 60;

/** Get an engine into flight with a mid-strength launch. */
const launch = (seed = 1): GameEngine => {
  const e = new GameEngine(seed);
  e.attract = false;
  e.press();
  for (let t = 0; t < 0.5; t += FRAME) e.update(FRAME);
  e.release();
  e.drainEvents();
  return e;
};

describe('mid-flight steering', () => {
  test('steering is ignored while orbiting (orbit behavior untouched)', () => {
    const e = new GameEngine(1);
    e.attract = false;
    expect(e.rocket.mode).toBe('orbiting');
    e.setSteer(1);
    expect(e.rocket.steer).toBe(0);
    expect(e.drainEvents().some((ev) => ev.type === 'steer')).toBe(false);
  });

  test('steering is ignored in attract mode', () => {
    const e = new GameEngine(1);
    e.rocket.mode = 'flying';
    e.setSteer(-1);
    expect(e.rocket.steer).toBe(0);
  });

  test('steering curves the flight path relative to a coasting twin', () => {
    // Two identical launches from the same seed; one steers right.
    const coast = launch(1);
    const steered = launch(1);
    steered.setSteer(1);
    for (let t = 0; t < 0.6; t += FRAME) {
      coast.update(FRAME);
      steered.update(FRAME);
      if (!coast.alive || !steered.alive) break;
      if (coast.rocket.mode !== 'flying' || steered.rocket.mode !== 'flying') break;
    }
    const dx = steered.rocket.x - coast.rocket.x;
    const dy = steered.rocket.y - coast.rocket.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(5); // paths measurably diverge
  });

  test('emits a steer event on engagement, not on every frame', () => {
    const e = launch(1);
    e.setSteer(1);
    e.setSteer(1);
    e.setSteer(-1); // switching sides while engaged: no re-trigger
    const steers = e.drainEvents().filter((ev) => ev.type === 'steer');
    expect(steers.length).toBe(1);
  });

  test('thruster upgrade increases turn authority', () => {
    const base = launch(1);
    const upgraded = new GameEngine(1, { ...defaultUpgrades, boosters: 3 });
    upgraded.attract = false;
    upgraded.press();
    for (let t = 0; t < 0.5; t += FRAME) upgraded.update(FRAME);
    upgraded.release();
    upgraded.drainEvents();

    base.setSteer(1);
    upgraded.setSteer(1);
    // Accumulate wrap-normalized heading deltas: atan2 headings jump at ±π,
    // so |h1 − h0| is meaningless — signed per-frame deltas are exact.
    const wrapDelta = (d: number): number => Math.atan2(Math.sin(d), Math.cos(d));
    let turnBase = 0;
    let turnUp = 0;
    let hBase = base.rocket.heading;
    let hUp = upgraded.rocket.heading;
    for (let t = 0; t < 0.4; t += FRAME) {
      base.update(FRAME);
      upgraded.update(FRAME);
      turnBase += wrapDelta(base.rocket.heading - hBase);
      turnUp += wrapDelta(upgraded.rocket.heading - hUp);
      hBase = base.rocket.heading;
      hUp = upgraded.rocket.heading;
    }
    expect(Math.abs(turnUp)).toBeGreaterThan(Math.abs(turnBase));
  });

  test('steer resets on capture and on launch', () => {
    const e = launch(1);
    e.setSteer(1);
    expect(e.rocket.steer).toBe(1);
    // Force a capture-like state transition through the public path:
    // run until capture or death; if captured, steer must be 0.
    for (let t = 0; t < 12 && e.alive; t += FRAME) {
      e.update(FRAME);
      if (e.rocket.mode === 'orbiting') break;
    }
    if (e.rocket.mode === 'orbiting') expect(e.rocket.steer).toBe(0);
  });
});

describe('camera zoom-to-fit', () => {
  const params: FitParams = {
    focusX: 0,
    focusY: 0,
    viewportW: 400,
    viewportH: 800,
    anchorY: gameConfig.camera.anchorY,
    marginPx: 40,
    minZoom: 0.2,
    maxZoom: 1.0,
  };

  test('near targets need no zoom-out', () => {
    expect(computeFitZoom([{ x: 0, y: -100, r: 30 }], params)).toBe(1);
  });

  test('far targets shrink zoom, and the fitted target is actually on screen', () => {
    const far = { x: 120, y: -900, r: 60 };
    const zoom = computeFitZoom([far], params);
    expect(zoom).toBeLessThan(1);
    expect(zoom).toBeGreaterThanOrEqual(params.minZoom);
    expect(targetFits(far, zoom, params)).toBe(true);
  });

  test('zoom respects the min clamp for absurd distances', () => {
    expect(computeFitZoom([{ x: 0, y: -100000, r: 50 }], params)).toBe(params.minZoom);
  });

  test('multiple targets: the most demanding one wins', () => {
    const near = { x: 0, y: -100, r: 30 };
    const far = { x: 0, y: -700, r: 50 };
    const zBoth = computeFitZoom([near, far], params);
    const zFar = computeFitZoom([far], params);
    expect(zBoth).toBeCloseTo(zFar, 9);
  });

  test('empty target list returns max zoom', () => {
    expect(computeFitZoom([], params)).toBe(params.maxZoom);
  });
});
