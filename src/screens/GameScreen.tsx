/**
 * GameScreen — top-level game coordinator.
 *
 * Owns:
 *   - PhysicsState initialization from the generated galaxy
 *   - Shared values for gesture → physics bridge
 *   - Renders: GameCanvas (Skia) + GestureHandler + HUD + PauseOverlay + FailScreen
 *
 * All game screens are stacked in this single view tree — no navigation push/pop.
 * Phase transitions are pure animation (opacity, scale, blur).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PhysicsState, HUDData, RocketState, Galaxy } from '../types';
import { useGameStore } from '../store/gameStore';
import { audioManager } from '../audio/AudioManager';
import { getStartingPlanet } from '../engine/worldGen';
import { computeLaunchVelocity } from '../engine/physics';
import { ROCKET_BASE_MASS, ROCKET_BASE_FUEL } from '../constants';

import { GameCanvas } from '../game/GameCanvas';
import { GameGestureHandler } from '../game/GestureHandler';
import { HUD } from '../game/HUD';
import { PauseOverlay } from './PauseOverlay';
import { FailScreen } from './FailScreen';

// ─── Build initial PhysicsState from generated galaxy ────────────────────────

function buildInitialPhysicsState(galaxy: Galaxy): PhysicsState {
  const startPlanet = getStartingPlanet(galaxy);
  const system = galaxy.systems[0];
  if (!system) throw new Error('Galaxy has no systems');

  // Place rocket in orbit above starting planet
  const orbitRadius = startPlanet.radius * 1.8;
  const startAngle = -Math.PI / 2; // top of planet

  const rocket: RocketState = {
    position: {
      x: startPlanet.position.x + Math.cos(startAngle) * orbitRadius,
      y: startPlanet.position.y + Math.sin(startAngle) * orbitRadius,
    },
    velocity: { x: 0, y: 0 },
    mass: ROCKET_BASE_MASS,
    fuel: ROCKET_BASE_FUEL,
    integrity: 100,
    orbitingPlanetId: startPlanet.id,
    orbitAngle: startAngle,
    orbitRadius,
    orbitCount: 0,
    launchCharge: 0,
    isLaunching: false,
    isAlive: true,
  };

  const allAsteroids = system.hazards.flatMap((h: { children?: typeof system.hazards[0]['children'] }) => h.children ?? []);

  return {
    rocket,
    planets: system.planets,
    hazards: system.hazards,
    asteroids: allAsteroids,
    collectibles: system.collectibles,
    trajectoryPreview: [],
    accumulator: 0,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GameScreen: React.FC = () => {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { phase, galaxy, hud, updateHUD, pauseGame, failGame, pendingSFX, clearPendingSFX } = useGameStore();

  // ── Gesture shared values (bridge to physics worklet) ─────────────────────
  const launchCharge = useSharedValue(0);
  const steerBias = useSharedValue(0);
  const isHolding = useSharedValue(false);

  // ── Local HUD state (read from worklet via runOnJS) ───────────────────────
  const [hudData, setHudData] = useState<HUDData>(hud);
  const [isOrbiting, setIsOrbiting] = useState(true);
  const [holdingLocal, setHoldingLocal] = useState(false);

  // ── Physics state (memoized per game session) ─────────────────────────────
  const initialPhysicsState = useMemo(() => {
    if (!galaxy) return null;
    return buildInitialPhysicsState(galaxy);
  }, [galaxy?.id]);

  // ── SFX bridge ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pendingSFX) {
      audioManager.playSFX(pendingSFX);
      clearPendingSFX();
    }
  }, [pendingSFX]);

  // ── Launch handler (called from gesture release) ───────────────────────────
  const handleLaunch = useCallback((charge: number, bias: number) => {
    audioManager.playSFX('launch');
    // The physics worklet reads launchCharge + steerBias to compute velocity
    // on the next tick when isHolding goes false — this is handled inside GameCanvas
    isHolding.value = false;
    launchCharge.value = charge;
    steerBias.value = bias;
    setHoldingLocal(false);
  }, []);

  const handleHUDUpdate = useCallback((data: Partial<HUDData>) => {
    setHudData(prev => ({ ...prev, ...data }));
    if (data.orbitDecayPercent !== undefined) {
      setIsOrbiting(data.currentPlanetName !== null);
      // Adaptive music tension
      if (data.orbitDecayPercent > 70) {
        audioManager.setTensionLevel(1.0);
      } else if (data.orbitDecayPercent > 40) {
        audioManager.setTensionLevel(0.5);
      } else {
        audioManager.setTensionLevel(0.0);
      }
    }
  }, []);

  if (!galaxy || !initialPhysicsState) return null;

  const isPlaying = phase === 'playing';
  const isPaused = phase === 'paused';
  const isFailed = phase === 'level_fail';

  return (
    <GestureHandlerRootView style={[styles.root, { width: W, height: H }]}>

      {/* Layer 1: Skia canvas (always mounted while in game) */}
      <GameCanvas
        initialPhysicsState={initialPhysicsState}
        launchCharge={launchCharge}
        steerBias={steerBias}
        isHolding={isHolding}
        onHUDUpdate={handleHUDUpdate}
      />

      {/* Layer 2: Gesture capture (only active during play) */}
      {isPlaying && (
        <GameGestureHandler
          launchCharge={launchCharge}
          steerBias={steerBias}
          isHolding={isHolding}
          isOrbiting={isOrbiting}
          onLaunch={handleLaunch}
          onPause={pauseGame}
        />
      )}

      {/* Layer 3: HUD */}
      {(isPlaying || isPaused) && (
        <HUD
          data={hudData}
          isOrbiting={isOrbiting}
          isHolding={holdingLocal}
        />
      )}

      {/* Layer 4: Pause overlay */}
      <PauseOverlay visible={isPaused} />

      {/* Layer 5: Fail screen */}
      <FailScreen visible={isFailed} />

    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#04060F',
    overflow: 'hidden',
  },
});
