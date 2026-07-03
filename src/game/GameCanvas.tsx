/**
 * GameCanvas — Skia declarative rendering + Reanimated physics loop.
 *
 * Architecture:
 *   - useFrameCallback runs on UI thread at 60fps
 *   - Physics tick runs inside the callback (worklet)
 *   - Results written to shared values
 *   - useDerivedValue converts shared values to render-ready data
 *   - Canvas children are React components that read shared values via useAnimatedProps
 *     OR we use a single shared value that contains the full render snapshot
 *     and re-render via state update batched at ~30fps for UI
 *
 * Skia 1.x uses declarative JSX — no imperative canvas.drawXxx.
 * The Canvas component renders its children as a scene graph on GPU.
 *
 * Render layers:
 *   1. Background fill
 *   2. Nebula + starfield (parallax)
 *   3. Planets
 *   4. Hazards
 *   5. Asteroid rocks
 *   6. Collectibles
 *   7. Trajectory preview
 *   8. Rocket
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Fill, Group } from '@shopify/react-native-skia';
import {
  useSharedValue,
  useFrameCallback,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

import type { PhysicsState, HUDData, Vec2, RocketState } from '../types';
import {
  physicsTick,
  computeTrajectoryPreview,
  computeLaunchVelocity,
} from '../engine/physics';
import {
  PHYSICS_DT,
  MAX_PHYSICS_STEPS,
  CAMERA_SMOOTH,
  COLORS,
  LAUNCH_CHARGE_RATE,
} from '../constants';
import { useGameStore } from '../store/gameStore';
import type { CameraState } from './renderMath';

import { Starfield, NebulaBackdrop, TrajectoryPreview } from './StarfieldRenderer';
import { PlanetRenderer } from './PlanetRenderer';
import { HazardRenderer, AsteroidFieldRenderer } from './HazardRenderer';
import { CollectiblesLayer } from './CollectibleRenderer';
import { RocketRenderer } from './RocketRenderer';

// ─── Render snapshot (passed from worklet → React via setState at ~30fps) ─────

interface RenderSnapshot {
  rocket: RocketState;
  trajectoryPoints: Vec2[];
  cam: CameraState;
  orbitDecayPercent: number;
  time: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GameCanvasProps {
  initialPhysicsState: PhysicsState;
  launchCharge: SharedValue<number>;
  steerBias: SharedValue<number>;
  isHolding: SharedValue<boolean>;
  onHUDUpdate: (data: Partial<HUDData>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GameCanvas: React.FC<GameCanvasProps> = ({
  initialPhysicsState,
  launchCharge,
  steerBias,
  isHolding,
  onHUDUpdate,
}) => {
  const { width: W, height: H } = useWindowDimensions();
  const { onOrbitEntered, onCollectibleGathered, failGame } = useGameStore();

  // ── Mutable physics state (lives only on UI thread via worklet closure) ────
  // We keep a ref to the mutable state object. Worklets can mutate it freely.
  const physRef = useRef<PhysicsState>(initialPhysicsState);

  // Camera position (smoothed)
  const camX = useSharedValue(initialPhysicsState.rocket.position.x);
  const camY = useSharedValue(initialPhysicsState.rocket.position.y);
  const zoom = useSharedValue(1.0);
  const accumulator = useSharedValue(0);
  const gameTime = useSharedValue(0);

  // ── Render snapshot state (updated ~30fps for React render) ───────────────
  const [snap, setSnap] = useState<RenderSnapshot>({
    rocket: initialPhysicsState.rocket,
    trajectoryPoints: [],
    cam: {
      x: initialPhysicsState.rocket.position.x,
      y: initialPhysicsState.rocket.position.y,
      zoom: 1.0,
      screenW: W,
      screenH: H,
    },
    orbitDecayPercent: 0,
    time: 0,
  });

  // Frame counter for throttling React updates
  const frameCount = useSharedValue(0);

  // ── JS-thread callbacks (called via runOnJS) ──────────────────────────────

  const handleOrbitEntered = useCallback((planetId: string) => {
    onOrbitEntered(planetId);
  }, [onOrbitEntered]);

  const handleCollectible = useCallback((id: string, type: string, value: number) => {
    onCollectibleGathered(id, type, value);
  }, [onCollectibleGathered]);

  const handleGameOver = useCallback((reason: string) => {
    failGame(reason as any);
  }, [failGame]);

  const updateRenderSnap = useCallback((
    rocket: RocketState,
    traj: Vec2[],
    cx: number,
    cy: number,
    z: number,
    decayPct: number,
    t: number,
  ) => {
    setSnap({
      rocket,
      trajectoryPoints: traj,
      cam: { x: cx, y: cy, zoom: z, screenW: W, screenH: H },
      orbitDecayPercent: decayPct,
      time: t,
    });
  }, [W, H]);

  const updateHUD = useCallback((speed: number, decay: number, charge: number, fuel: number) => {
    onHUDUpdate({ speedMagnitude: speed, orbitDecayPercent: decay, launchChargePercent: charge * 100, fuel });
  }, [onHUDUpdate]);

  // ── Physics frame loop (runs on UI thread) ────────────────────────────────
  useFrameCallback((frameInfo) => {
    'worklet';
    const dtRaw = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;
    const dt = Math.min(dtRaw, 0.05);
    gameTime.value += dt;

    const state = physRef.current;
    if (!state) return;

    // Accumulate and step
    let acc = accumulator.value + dt;
    let stepCount = 0;

    while (acc >= PHYSICS_DT && stepCount < MAX_PHYSICS_STEPS) {
      // Update launch charge if holding and in orbit
      if (isHolding.value && state.rocket.orbitingPlanetId !== null) {
        state.rocket.launchCharge = Math.min(
          state.rocket.launchCharge + PHYSICS_DT * LAUNCH_CHARGE_RATE,
          1.0,
        );
        launchCharge.value = state.rocket.launchCharge;
      }

      const result = physicsTick(state, PHYSICS_DT);
      acc -= PHYSICS_DT;
      stepCount++;

      if (result.type === 'game_over') {
        runOnJS(handleGameOver)(result.reason);
        return;
      }

      if (result.type === 'orbit_entered') {
        runOnJS(handleOrbitEntered)(result.planetId);
      }

      if (result.type === 'collectible_gathered') {
        const c = result.state.collectibles.find(x => x.id === result.collectibleId);
        if (c) runOnJS(handleCollectible)(c.id, c.type, c.value);
      }

      // Update ref with latest state
      physRef.current = result.state;
    }

    accumulator.value = acc;

    const rocket = physRef.current.rocket;

    // Camera smooth follow
    camX.value += (rocket.position.x - camX.value) * CAMERA_SMOOTH;
    camY.value += (rocket.position.y - camY.value) * CAMERA_SMOOTH;

    // Compute trajectory preview when holding
    let traj: Vec2[] = [];
    if (isHolding.value && rocket.orbitingPlanetId !== null) {
      const planet = physRef.current.planets.find(p => p.id === rocket.orbitingPlanetId);
      if (planet) {
        const lv = computeLaunchVelocity(rocket, planet, rocket.launchCharge, steerBias.value);
        traj = computeTrajectoryPreview(
          rocket.position,
          { x: rocket.velocity.x + lv.x, y: rocket.velocity.y + lv.y },
          physRef.current.planets,
          physRef.current.hazards,
        );
      }
    }

    // Orbit decay for HUD
    let decayPct = 0;
    if (rocket.orbitingPlanetId !== null) {
      const planet = physRef.current.planets.find(p => p.id === rocket.orbitingPlanetId);
      if (planet) {
        decayPct = Math.min(
          (rocket.orbitCount * (planet.orbitDecayRate + 0.08)) * 100,
          100,
        );
      }
    }

    const speed = Math.sqrt(rocket.velocity.x ** 2 + rocket.velocity.y ** 2);

    // HUD update every ~4 frames
    frameCount.value++;
    if (frameCount.value % 4 === 0) {
      runOnJS(updateHUD)(speed, decayPct, rocket.launchCharge, rocket.fuel);
    }

    // Render snapshot update ~30fps (every 2 frames)
    if (frameCount.value % 2 === 0) {
      runOnJS(updateRenderSnap)(
        { ...rocket },
        traj,
        camX.value,
        camY.value,
        zoom.value,
        decayPct,
        gameTime.value * 1000,
      );
    }
  });

  // ── Derived data for rendering ────────────────────────────────────────────
  const { planets, hazards, asteroids, collectibles } = initialPhysicsState;
  // Note: planets/hazards/collectibles from initialPhysicsState are the same
  // reference that physRef.current mutates (collected flags etc).
  // For render we read from physRef.current directly via snap updates.

  const orbitingPlanet = snap.rocket.orbitingPlanetId
    ? planets.find(p => p.id === snap.rocket.orbitingPlanetId) ?? null
    : null;

  // Read collectibles from live state for collected status
  const liveCollectibles = physRef.current?.collectibles ?? collectibles;

  return (
    <Canvas style={[styles.canvas, { width: W, height: H }]} mode="continuous">
      {/* Background */}
      <Fill color={COLORS.background} />

      {/* Nebula backdrops */}
      <NebulaBackdrop cam={snap.cam} />

      {/* Stars */}
      <Starfield cam={snap.cam} />

      {/* Planets */}
      <Group>
        {planets.map(planet => (
          <PlanetRenderer
            key={planet.id}
            planet={planet}
            cam={snap.cam}
            orbitDecayPercent={snap.orbitDecayPercent}
            isOrbitTarget={snap.rocket.orbitingPlanetId === planet.id}
            isDestination={planet.isDestination === true}
            time={snap.time}
          />
        ))}
      </Group>

      {/* Hazards */}
      <Group>
        {hazards.map(hazard => (
          <HazardRenderer
            key={hazard.id}
            hazard={hazard}
            cam={snap.cam}
            time={snap.time}
          />
        ))}
      </Group>

      {/* Asteroid rocks */}
      <AsteroidFieldRenderer rocks={asteroids} cam={snap.cam} />

      {/* Collectibles */}
      <CollectiblesLayer
        collectibles={liveCollectibles}
        cam={snap.cam}
        time={snap.time}
      />

      {/* Trajectory preview */}
      <TrajectoryPreview points={snap.trajectoryPoints} cam={snap.cam} />

      {/* Rocket */}
      <RocketRenderer
        rocket={snap.rocket}
        cam={snap.cam}
        time={snap.time}
        launchCharge={snap.rocket.launchCharge}
      />
    </Canvas>
  );
};

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
