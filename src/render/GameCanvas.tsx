/**
 * GameCanvas — the living heart of the app. Mounted once and never unmounted,
 * which is what makes every transition seamless: menu, play, pause, death and
 * retry are all states of this one persistent canvas (no navigation stack,
 * no loading screens).
 *
 * Loop design (ADR-001): a requestAnimationFrame loop advances the engine,
 * drains its events, and records the scene into an SkPicture stored in a
 * Reanimated shared value. React never re-renders per frame; the HUD mirrors
 * stats at gameConfig.ui.hudHz instead.
 */
import {
  Canvas,
  Picture,
  createPicture,
  type SkPicture,
} from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { audioManager } from '../audio/audioManager';
import { gameConfig } from '../config/gameConfig';
import { palette } from '../config/palette';
import { smoothDamp, clamp } from '../core/math';
import { GameEngine, type HudInfo } from '../engine/engine';
import { gameActions, gameStore } from '../state/gameStore';
import { progressActions, progressStore } from '../state/progressStore';
import { renderScene, type Camera, type Effect } from './renderer';

export interface GameCanvasHandle {
  startRun: () => void;
  getHud: () => HudInfo | null;
}

interface Props {
  handleRef: React.MutableRefObject<GameCanvasHandle | null>;
}

export const GameCanvas: React.FC<Props> = ({ handleRef }) => {
  const { width, height } = useWindowDimensions();
  const picture = useSharedValue<SkPicture>(createPicture(() => undefined));

  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) engineRef.current = new GameEngine();
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const effectsRef = useRef<Effect[]>([]);

  // ---------------------------------------------------------------- helpers

  const haptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    if (!progressStore.get().hapticsEnabled) return;
    void Haptics.impactAsync(style).catch(() => undefined);
  }, []);

  const spawnEffect = useCallback((e: Omit<Effect, 'age'>) => {
    effectsRef.current.push({ ...e, age: 0 });
  }, []);

  /** Route engine events to audio / haptics / stores / visual effects. */
  const processEvents = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const ev of engine.drainEvents()) {
      switch (ev.type) {
        case 'launched':
          audioManager.play('launch');
          haptic(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'boost':
          audioManager.play('boost');
          haptic(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'coin':
          audioManager.play('coin');
          break;
        case 'captured':
          audioManager.play('capture');
          haptic(Haptics.ImpactFeedbackStyle.Light);
          spawnEffect({
            kind: 'ring',
            x: ev.body.x,
            y: ev.body.y,
            life: 0.6,
            color: palette.accent,
            maxRadius: ev.body.radius * 2.2,
          });
          break;
        case 'shieldHit':
          audioManager.play('warning');
          haptic(Haptics.ImpactFeedbackStyle.Heavy);
          spawnEffect({
            kind: 'ring',
            x: engine.rocket.x,
            y: engine.rocket.y,
            life: 0.5,
            color: palette.shield,
            maxRadius: 60,
          });
          break;
        case 'flareWarning':
        case 'novaArmed':
          audioManager.play('warning');
          haptic(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'died': {
          audioManager.play('explosion');
          haptic(Haptics.ImpactFeedbackStyle.Heavy);
          spawnEffect({
            kind: 'burst',
            x: engine.rocket.x,
            y: engine.rocket.y,
            life: 0.9,
            color: palette.danger,
            maxRadius: 90,
          });
          const isNewBest = progressActions.bankRun(
            engine.score,
            engine.coinsCollected,
            engine.bodiesVisited,
          );
          gameActions.syncRunStats(engine.score, engine.coinsCollected, engine.bodiesVisited);
          gameActions.endRun(ev.cause, isNewBest);
          break;
        }
      }
    }
  }, [haptic, spawnEffect]);

  // ------------------------------------------------------------------- loop

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let hudAccum = 0;

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const engine = engineRef.current;
      if (!engine) return;
      const dt = last === 0 ? 0 : clamp((now - last) / 1000, 0, 0.05);
      last = now;

      const phase = gameStore.get().phase;

      if (phase === 'paused') return; // frozen frame — cheapest pause there is

      if (phase === 'playing' || phase === 'menu') {
        engine.attract = phase === 'menu';
        engine.update(dt);
        processEvents();
      }

      // Effects age even during game-over so the final explosion completes.
      const effects = effectsRef.current;
      for (const e of effects) e.age += dt;
      effectsRef.current = effects.filter((e) => e.age < e.life);

      // Camera: follow the rocket; ease zoom out with speed for readability.
      const cam = camRef.current;
      const r = engine.rocket;
      const rate = gameConfig.camera.followRate;
      cam.x = smoothDamp(cam.x, r.x, rate, dt);
      cam.y = smoothDamp(cam.y, r.y, rate, dt);
      const speed = Math.hypot(r.vx, r.vy);
      const targetZoom =
        r.mode === 'flying'
          ? clamp(
              gameConfig.camera.zoomMax -
                (speed / gameConfig.launch.maxSpeed) *
                  (gameConfig.camera.zoomMax - gameConfig.camera.zoomMin),
              gameConfig.camera.zoomMin,
              gameConfig.camera.zoomMax,
            )
          : gameConfig.camera.zoomMax;
      cam.zoom = smoothDamp(cam.zoom, targetZoom, gameConfig.camera.zoomRate, dt);

      // HUD mirror at low frequency — keeps React work off the hot path.
      hudAccum += dt;
      if (phase === 'playing' && hudAccum >= 1 / gameConfig.ui.hudHz) {
        hudAccum = 0;
        gameActions.syncRunStats(engine.score, engine.coinsCollected, engine.bodiesVisited);
      }

      picture.value = createPicture((canvas) => {
        renderScene(canvas, {
          engine,
          cam,
          width,
          height,
          effects: effectsRef.current,
        });
      });
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, picture, processEvents]);

  // ------------------------------------------------------------ public API

  useEffect(() => {
    handleRef.current = {
      startRun: () => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.reset(progressStore.get().upgrades);
        engine.attract = false;
        effectsRef.current = [];
        camRef.current = { x: engine.rocket.x, y: engine.rocket.y, zoom: 1 };
        gameActions.startRun();
      },
      getHud: () => engineRef.current?.hudInfo() ?? null,
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  // ---------------------------------------------------------------- input

  const press = useCallback(() => engineRef.current?.press(), []);
  const release = useCallback(() => engineRef.current?.release(), []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin(() => {
          'worklet';
          runOnJS(press)();
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(release)();
        }),
    [press, release],
  );

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={[styles.canvas, { backgroundColor: palette.space }]}>
        <Picture picture={picture} />
      </Canvas>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  canvas: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
