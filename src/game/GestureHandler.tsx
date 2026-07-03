/**
 * GestureHandler — manages all in-game touch input.
 *
 * Touch zones:
 *   Left 35%:  steer left (bias = -1)
 *   Center 30%: hold to charge launch (long-press releases)
 *   Right 35%: steer right (bias = +1)
 *
 * The center hold sets isHolding=true and accumulates launchCharge.
 * Release triggers onLaunch callback with current charge + bias.
 *
 * All shared values write on the UI thread — zero bridge crossings during play.
 */

import React, { useCallback } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { MIN_LAUNCH_CHARGE } from '../constants';

// ─── Props ────────────────────────────────────────────────────────────────────

interface GestureHandlerProps {
  launchCharge: SharedValue<number>;
  steerBias: SharedValue<number>;
  isHolding: SharedValue<boolean>;
  isOrbiting: boolean;         // Only allow charging when orbiting
  onLaunch: (charge: number, bias: number) => void;
  onPause: () => void;
  children?: React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const GameGestureHandler: React.FC<GestureHandlerProps> = ({
  launchCharge,
  steerBias,
  isHolding,
  isOrbiting,
  onLaunch,
  onPause,
  children,
}) => {
  const { width: W } = useWindowDimensions();

  const LEFT_ZONE_RIGHT = W * 0.30;
  const RIGHT_ZONE_LEFT = W * 0.70;

  // ── Main hold gesture (center zone) ───────────────────────────────────────
  const holdGesture = Gesture.LongPress()
    .minDuration(80)
    .maxDistance(60)
    .onBegin((event) => {
      'worklet';
      const x = event.absoluteX;
      // Only activate if touch is in center zone and rocket is orbiting
      if (x >= LEFT_ZONE_RIGHT && x <= RIGHT_ZONE_LEFT) {
        if (isOrbiting) {
          isHolding.value = true;
        }
      }
    })
    .onFinalize((event) => {
      'worklet';
      if (isHolding.value) {
        const charge = launchCharge.value;
        const bias = steerBias.value;
        if (charge >= MIN_LAUNCH_CHARGE) {
          runOnJS(onLaunch)(charge, bias);
        }
        isHolding.value = false;
        launchCharge.value = 0;
      }
    });

  // ── Steer gesture (left/right zones, simultaneous with hold) ─────────────
  const steerGesture = Gesture.Pan()
    .onBegin((event) => {
      'worklet';
      const x = event.absoluteX;
      if (x < LEFT_ZONE_RIGHT) {
        steerBias.value = -1;
      } else if (x > RIGHT_ZONE_LEFT) {
        steerBias.value = 1;
      }
    })
    .onEnd(() => {
      'worklet';
      steerBias.value = 0;
    })
    .onFinalize(() => {
      'worklet';
      steerBias.value = 0;
    });

  // ── Pause (double-tap anywhere) ───────────────────────────────────────────
  const pauseGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      runOnJS(onPause)();
    });

  // Compose: steer and hold run simultaneously; pause is exclusive
  const composed = Gesture.Simultaneous(
    Gesture.Exclusive(pauseGesture, holdGesture),
    steerGesture,
  );

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={StyleSheet.absoluteFill}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
};
