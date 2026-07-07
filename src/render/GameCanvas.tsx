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
 *
 * Input contract (one Pan gesture, role decided at press time):
 *  - Parked (orbiting): press = charge, release = launch. Unchanged.
 *  - Flying: press-and-hold on the LEFT half = steer left, RIGHT half =
 *    steer right; sliding across the midline switches sides; release stops.
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
import { featureEnabled, progressActions, progressStore } from '../state/progressStore';
import { computeFitZoom, type FitTarget } from './camera';
import { ParticleSystem, Trail } from './particles';
import { breadcrumb } from '../observability/errorReporter';
import { applyCosmetics, renderScene, type Camera, type Effect, type Popup } from './renderer';

export interface GameCanvasHandle {
  startRun: () => void;
  getHud: () => HudInfo | null;
}

interface Props {
  handleRef: React.MutableRefObject<GameCanvasHandle | null>;
}

/** Reused per-frame scratch array for camera fit targets (no per-frame alloc). */
const fitTargets: FitTarget[] = [];

export const GameCanvas: React.FC<Props> = ({ handleRef }) => {
  const { width, height } = useWindowDimensions();
  const picture = useSharedValue<SkPicture>(createPicture(() => undefined));

  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) engineRef.current = new GameEngine();
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const effectsRef = useRef<Effect[]>([]);
  const popupsRef = useRef<Popup[]>([]);
  const particlesRef = useRef(new ParticleSystem());
  const trailRef = useRef(new Trail());
  const shakeRef = useRef({ amp: 0, t: 0 });
  /** Role of the current press: charging launch vs steering. */
  const pressRoleRef = useRef<'charge' | 'steer' | null>(null);
  /** Tutorial progress within the current run (hold seen → release seen…). */
  const tutorialStageRef = useRef<'hold' | 'release' | 'steer' | 'done'>('done');

  // ---------------------------------------------------------------- helpers

  const haptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    if (!progressStore.get().hapticsEnabled) return;
    void Haptics.impactAsync(style).catch(() => undefined);
  }, []);

  const spawnEffect = useCallback((e: Omit<Effect, 'age'>) => {
    effectsRef.current.push({ ...e, age: 0 });
  }, []);

  const spawnPopup = useCallback((x: number, y: number, text: string, color: string) => {
    popupsRef.current.push({ x, y, text, color, age: 0, life: gameConfig.popups.life });
  }, []);

  const shake = useCallback((amp: number) => {
    if (!featureEnabled('screenShake')) return;
    const s = shakeRef.current;
    s.amp = Math.max(s.amp, amp);
    s.t = 0;
  }, []);

  const advanceTutorial = useCallback((stage: 'hold' | 'release' | 'steer' | 'done') => {
    tutorialStageRef.current = stage;
    gameActions.setHint(stage === 'done' ? null : stage);
    if (stage === 'done') progressActions.markTutorialDone();
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
          trailRef.current.clear();
          if (tutorialStageRef.current === 'release') {
            advanceTutorial(featureEnabled('steering') ? 'steer' : 'done');
          } else if (tutorialStageRef.current === 'steer') gameActions.setHint('steer');
          break;
        case 'steer':
          audioManager.play('boost');
          if (tutorialStageRef.current === 'steer') advanceTutorial('done');
          break;
        case 'coin':
          audioManager.play('coin');
          spawnPopup(ev.x, ev.y, '+1', palette.accent); // plain ASCII: Skia matchFont glyph coverage is narrower than RN text
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
          if (ev.coins > 0) {
            spawnPopup(
              ev.body.x,
              ev.body.y - ev.body.radius - 18,
              `+${gameConfig.scoring.perBody + (gameConfig.scoring.riskBonus[ev.body.kind] ?? 0)}`,
              palette.text,
            );
          }
          // Ending a hop with the tutorial's steer hint still up is fine —
          // it re-appears on the next flight until steering is used once.
          if (tutorialStageRef.current === 'steer') gameActions.setHint(null);
          break;
        case 'shieldHit':
          audioManager.play('warning');
          haptic(Haptics.ImpactFeedbackStyle.Heavy);
          shake(gameConfig.shake.shield);
          if (featureEnabled('particles')) {
            particlesRef.current.burst(engine.rocket.x, engine.rocket.y, 2);
          }
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
          shake(gameConfig.shake.nova);
          break;
        case 'died': {
          audioManager.play('explosion');
          haptic(Haptics.ImpactFeedbackStyle.Heavy);
          shake(gameConfig.shake.death);
          if (featureEnabled('particles')) {
            particlesRef.current.burst(engine.rocket.x, engine.rocket.y, 1);
          }
          spawnEffect({
            kind: 'burst',
            x: engine.rocket.x,
            y: engine.rocket.y,
            life: 0.9,
            color: palette.danger,
            maxRadius: 90,
          });
          gameActions.setHint(null);
          breadcrumb('run-ended', {
            cause: ev.cause,
            score: engine.score,
            depth: engine.bodiesVisited,
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
  }, [haptic, spawnEffect, spawnPopup, shake, advanceTutorial]);

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

      const r = engine.rocket;

      // Visual-only systems (age even during game-over so bursts complete).
      const effects = effectsRef.current;
      for (const e of effects) e.age += dt;
      effectsRef.current = effects.filter((e) => e.age < e.life);
      const popups = popupsRef.current;
      for (const p of popups) p.age += dt;
      popupsRef.current = popups.filter((p) => p.age < p.life);

      const particles = particlesRef.current;
      const trail = trailRef.current;
      if (engine.alive && !engine.attract) {
        const back = r.heading + Math.PI;
        const emitParticles = featureEnabled('particles'); // one read per frame
        if (r.mode === 'flying') {
          trail.sample(dt, r.x, r.y); // trail is a core visual — never gated
          if (emitParticles) {
            particles.emit(dt, gameConfig.particles.exhaustRate, r.x, r.y, back, 0.55);
            if (r.steer !== 0) {
              particles.emit(
                dt,
                gameConfig.particles.steerRate,
                r.x,
                r.y,
                back - r.steer * 1.2,
                0.5,
              );
            }
          }
        } else if (r.mode === 'charging' && emitParticles) {
          particles.emit(
            dt,
            gameConfig.particles.chargeRate * (0.4 + r.chargeT),
            r.x,
            r.y,
            back,
            0.7,
          );
        }
      }
      particles.update(dt);
      trail.update(dt);

      // Screen shake: decaying dual-axis oscillation.
      const s = shakeRef.current;
      let shakeX = 0;
      let shakeY = 0;
      if (s.amp > 0.1) {
        s.t += dt;
        const decay = Math.exp(-gameConfig.shake.decayRate * s.t);
        const f = gameConfig.shake.frequency;
        shakeX = Math.sin(s.t * f) * s.amp * decay;
        shakeY = Math.cos(s.t * f * 1.3) * s.amp * decay;
        if (decay < 0.02) s.amp = 0;
      }

      // Camera: follow the rocket…
      const cam = camRef.current;
      const rate = gameConfig.camera.followRate;
      cam.x = smoothDamp(cam.x, r.x, rate, dt);
      cam.y = smoothDamp(cam.y, r.y, rate, dt);

      // …and zoom-to-fit so the current AND next body are always visible —
      // the player must never lose the sense of direction.
      fitTargets.length = 0;
      const current = r.bodyId >= 0 ? engine.world.byId(r.bodyId) : undefined;
      if (current) {
        fitTargets.push({ x: current.x, y: current.y, r: current.captureRadius });
      }
      const next = engine.world.bodies.find((b) => b.depth === engine.bodiesVisited + 1);
      if (next) fitTargets.push({ x: next.x, y: next.y, r: next.captureRadius });
      const targetZoom = computeFitZoom(fitTargets, {
        focusX: cam.x,
        focusY: cam.y,
        viewportW: width,
        viewportH: height,
        anchorY: gameConfig.camera.anchorY,
        marginPx: gameConfig.camera.fitMarginPx,
        minZoom: gameConfig.camera.minZoom,
        maxZoom: gameConfig.camera.maxZoom,
      });
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
          popups: popupsRef.current,
          particles,
          trail,
          shakeX,
          shakeY,
          quality: progressStore.get().graphicsQuality,
        });
      });
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, picture, processEvents]);

  // ---------------------------------------------------- equipped cosmetics
  useEffect(() => {
    const apply = (): void => {
      const eq = progressStore.get().equipped;
      applyCosmetics(eq.skin, eq.scheme, eq.trail);
    };
    apply();
    return progressStore.subscribe(apply);
  }, []);

  // ------------------------------------------------------------ public API

  useEffect(() => {
    handleRef.current = {
      startRun: () => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.reset(progressStore.get().upgrades);
        engine.attract = false;
        effectsRef.current = [];
        popupsRef.current = [];
        particlesRef.current.clear();
        trailRef.current.clear();
        shakeRef.current = { amp: 0, t: 0 };
        pressRoleRef.current = null;
        camRef.current = { x: engine.rocket.x, y: engine.rocket.y, zoom: 1 };
        gameActions.startRun();
        if (!progressStore.get().tutorialDone && featureEnabled('tutorialHints')) {
          tutorialStageRef.current = 'hold';
          gameActions.setHint('hold');
        } else {
          tutorialStageRef.current = 'done';
        }
      },
      getHud: () => engineRef.current?.hudInfo() ?? null,
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  // ---------------------------------------------------------------- input

  const sideForX = useCallback((x: number): -1 | 1 => (x < width / 2 ? -1 : 1), [width]);

  const onPress = useCallback(
    (x: number) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (engine.rocket.mode === 'flying') {
        if (!featureEnabled('steering')) return; // feature off: inert press
        pressRoleRef.current = 'steer';
        engine.setSteer(sideForX(x));
      } else {
        pressRoleRef.current = 'charge';
        engine.press();
        if (tutorialStageRef.current === 'hold') advanceTutorial('release');
      }
    },
    [sideForX, advanceTutorial],
  );

  const onMove = useCallback(
    (x: number) => {
      // Sliding across the midline while steering switches thrusters.
      if (pressRoleRef.current === 'steer') engineRef.current?.setSteer(sideForX(x));
    },
    [sideForX],
  );

  const onRelease = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (pressRoleRef.current === 'steer') engine.setSteer(0);
    else engine.release();
    pressRoleRef.current = null;
  }, []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin((e) => {
          'worklet';
          runOnJS(onPress)(e.x);
        })
        .onUpdate((e) => {
          'worklet';
          runOnJS(onMove)(e.x);
        })
        .onFinalize(() => {
          'worklet';
          runOnJS(onRelease)();
        }),
    [onPress, onMove, onRelease],
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
