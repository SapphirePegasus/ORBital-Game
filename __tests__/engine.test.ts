import { gameConfig } from '../src/config/gameConfig';
import { defaultUpgrades } from '../src/config/upgrades';
import type { CelestialBody, EngineEvent } from '../src/core/types';
import { GameEngine } from '../src/engine/engine';

const play = (engine: GameEngine): void => {
  engine.attract = false;
};

const collectEvents = (engine: GameEngine, seconds: number, step = 1 / 60): EngineEvent[] => {
  const events: EngineEvent[] = [];
  const steps = Math.ceil(seconds / step);
  for (let i = 0; i < steps; i++) {
    engine.update(step);
    events.push(...engine.drainEvents());
    if (!engine.alive) break;
  }
  return events;
};

describe('GameEngine', () => {
  test('starts alive, orbiting the first body', () => {
    const e = new GameEngine(1);
    expect(e.alive).toBe(true);
    expect(e.rocket.mode).toBe('orbiting');
    expect(e.rocket.bodyId).toBe(e.world.bodies[0]?.id);
  });

  test('attract mode ignores input and never decays', () => {
    const e = new GameEngine(1);
    e.press();
    expect(e.rocket.mode).toBe('orbiting'); // press ignored in attract
    collectEvents(e, 30);
    expect(e.alive).toBe(true); // 30 s parked in menu, still fine
  });

  test('charge sweeps min→max and clamps', () => {
    const e = new GameEngine(1);
    play(e);
    e.press();
    expect(e.rocket.mode).toBe('charging');
    const mid = e.rocket.chargeSpeed;
    collectEvents(e, gameConfig.launch.chargeTime * 2); // frame-sized steps
    expect(e.rocket.chargeSpeed).toBeGreaterThan(mid);
    expect(e.rocket.chargeT).toBe(1);
    expect(e.rocket.chargeSpeed).toBeCloseTo(gameConfig.launch.maxSpeed, 4);
  });

  test('release launches tangentially with the charged speed', () => {
    const e = new GameEngine(1);
    play(e);
    e.press();
    e.update(0.5);
    e.release();
    const events = e.drainEvents();
    expect(e.rocket.mode).toBe('flying');
    const launched = events.find((ev) => ev.type === 'launched');
    expect(launched?.type).toBe('launched');
    const speed = Math.hypot(e.rocket.vx, e.rocket.vy);
    expect(speed).toBeGreaterThanOrEqual(gameConfig.launch.minSpeed - 1);
    expect(speed).toBeLessThanOrEqual(gameConfig.launch.maxSpeed + 1);
  });

  test('parking forever ends in orbital decay death', () => {
    const e = new GameEngine(1);
    play(e);
    const events = collectEvents(e, 60);
    const death = events.find((ev) => ev.type === 'died');
    expect(death).toBeDefined();
    expect(death?.type === 'died' && death.cause).toBe('orbitDecayed');
    expect(e.alive).toBe(false);
  });

  test('stabilizer upgrade extends survivable orbit time', () => {
    const base = new GameEngine(1);
    play(base);
    let baseDeath = 0;
    collectEvents(base, 120);
    baseDeath = base.elapsed;

    const upgraded = new GameEngine(1, { ...defaultUpgrades, stabilizers: 5 });
    play(upgraded);
    collectEvents(upgraded, 120);
    expect(upgraded.elapsed).toBeGreaterThan(baseDeath);
  });

  test('an armed supernova detonates and kills a rocket parked on it', () => {
    const e = new GameEngine(1);
    play(e);
    const nova: CelestialBody = {
      id: 9999,
      kind: 'supernova',
      x: 5000,
      y: 5000,
      radius: 50,
      mass: 3000,
      influenceRadius: 400,
      captureRadius: 150,
      decayTime: 60,
      coinReward: 8,
      depth: 99,
      visualSeed: 1,
      flarePhase: 0,
      novaCountdown: 0.5,
      detonated: false,
    };
    e.world.bodies.push(nova);
    // Park the rocket in orbit around the doomed star.
    e.rocket.mode = 'orbiting';
    e.rocket.bodyId = nova.id;
    e.rocket.orbitRadius = 100;
    e.rocket.orbitTime = 0;
    const events = collectEvents(e, 2);
    expect(nova.detonated).toBe(true);
    const death = events.find((ev) => ev.type === 'died');
    expect(death?.type === 'died' && death.cause).toBe('supernova');
  });

  test('reset restores a fresh, alive run and clears score', () => {
    const e = new GameEngine(1);
    play(e);
    collectEvents(e, 60); // die of decay
    expect(e.alive).toBe(false);
    e.reset(defaultUpgrades, 777);
    expect(e.alive).toBe(true);
    expect(e.score).toBe(0);
    expect(e.rocket.mode).toBe('orbiting');
    expect(e.seed).toBe(777);
  });

  test('fixed-timestep accumulator caps runaway frames', () => {
    const e = new GameEngine(1);
    play(e);
    // A 5-second frame hitch must not simulate 5 s of decay in one call.
    const before = e.elapsed;
    e.update(5);
    const simulated = e.elapsed - before;
    expect(simulated).toBeLessThanOrEqual(
      gameConfig.physics.fixedDt * gameConfig.physics.maxStepsPerFrame + 1e-9,
    );
  });
});
