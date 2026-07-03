/**
 * MenuScreen — main menu with animated star background and smooth game start.
 *
 * Transition: radial scale + fade. No navigation push — the game canvas
 * mounts underneath and the menu fades out over the top.
 */

import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { useGameStore } from '../store/gameStore';
import { audioManager } from '../audio/AudioManager';
import { COLORS, TRANSITION_MENU_TO_GAME_MS } from '../constants';

// ─── Animated star layer ──────────────────────────────────────────────────────

const AnimatedStar: React.FC<{ x: number; y: number; delay: number; size: number }> = ({
  x, y, delay, size,
}) => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: delay }),
        withTiming(0.9, { duration: 800, easing: Easing.out(Easing.quad) }),
        withTiming(0.2, { duration: 1200 + Math.random() * 800 }),
      ),
      -1,
      true,
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.star,
        { left: x, top: y, width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    />
  );
};

// ─── Generate star positions ──────────────────────────────────────────────────

const MENU_STARS = Array.from({ length: 80 }, (_, i) => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  delay: Math.random() * 3000,
  size: Math.random() * 2.5 + 0.5,
}));

// ─── Main component ───────────────────────────────────────────────────────────

export const MenuScreen: React.FC = () => {
  const { width: W, height: H } = useWindowDimensions();
  const { initGame, highScore } = useGameStore();

  // Entrance animation
  const contentOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.94);
  const titleGlow = useSharedValue(0);
  const subtitleOffset = useSharedValue(12);

  // Exit animation
  const exitOpacity = useSharedValue(1);
  const exitScale = useSharedValue(1);

  useEffect(() => {
    audioManager.playMusic('menu_ambient');

    // Staggered entrance
    contentOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) });
    contentScale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.1)) });
    subtitleOffset.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) });

    // Pulsing title glow
    titleGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 }),
      ),
      -1,
      true,
    );
  }, []);

  const handleStart = async () => {
    await audioManager.playSFX('ui_confirm');
    await audioManager.playMusic('game_calm');

    // Exit animation then init
    exitOpacity.value = withTiming(0, { duration: TRANSITION_MENU_TO_GAME_MS });
    exitScale.value = withTiming(1.08, { duration: TRANSITION_MENU_TO_GAME_MS });

    setTimeout(() => {
      initGame();
    }, TRANSITION_MENU_TO_GAME_MS - 50);
  };

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ scale: contentScale.value }],
  }));

  const exitStyle = useAnimatedStyle(() => ({
    opacity: exitOpacity.value,
    transform: [{ scale: exitScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    textShadowRadius: interpolate(titleGlow.value, [0, 1], [4, 20]),
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: subtitleOffset.value }],
    opacity: interpolate(subtitleOffset.value, [12, 0], [0, 1]),
  }));

  return (
    <Animated.View style={[styles.root, { width: W, height: H }, exitStyle]}>
      {/* Animated starfield */}
      <View style={StyleSheet.absoluteFill}>
        {MENU_STARS.map((s, i) => (
          <AnimatedStar
            key={i}
            x={(s.x / 100) * W}
            y={(s.y / 100) * H}
            delay={s.delay}
            size={s.size}
          />
        ))}
      </View>

      {/* Content */}
      <Animated.View style={[styles.content, contentStyle]}>
        {/* Title */}
        <Animated.Text style={[styles.title, titleStyle]}>
          ORBITAL
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          navigate the cosmos
        </Animated.Text>

        {/* High score */}
        {highScore > 0 && (
          <View style={styles.highScoreRow}>
            <Text style={styles.highScoreLabel}>BEST</Text>
            <Text style={styles.highScoreValue}>{highScore.toLocaleString()}</Text>
          </View>
        )}

        {/* CTA */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStart}
          activeOpacity={0.7}
        >
          <Text style={styles.startButtonText}>TAP TO LAUNCH</Text>
        </TouchableOpacity>

        {/* Controls hint */}
        <View style={styles.controlsHint}>
          <View style={styles.controlRow}>
            <View style={styles.controlIcon}><Text style={styles.controlIconText}>◀</Text></View>
            <Text style={styles.controlDesc}>steer left in orbit</Text>
          </View>
          <View style={styles.controlRow}>
            <View style={styles.controlIcon}><Text style={styles.controlIconText}>●</Text></View>
            <Text style={styles.controlDesc}>hold center to charge · release to launch</Text>
          </View>
          <View style={styles.controlRow}>
            <View style={styles.controlIcon}><Text style={styles.controlIconText}>▶</Text></View>
            <Text style={styles.controlDesc}>steer right in orbit</Text>
          </View>
        </View>
      </Animated.View>

      {/* Version */}
      <Text style={styles.version}>v0.1.0</Text>
    </Animated.View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  title: {
    fontSize: 56,
    color: '#EEEEFF',
    fontWeight: '100',
    letterSpacing: 18,
    textShadowColor: '#4488FF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.hudTextMuted,
    letterSpacing: 4,
    marginTop: 8,
    marginBottom: 40,
    fontWeight: '300',
  },
  highScoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 32,
  },
  highScoreLabel: {
    fontSize: 10,
    color: COLORS.hudTextMuted,
    letterSpacing: 3,
  },
  highScoreValue: {
    fontSize: 22,
    color: '#FFD700',
    fontWeight: '200',
  },
  startButton: {
    borderWidth: 1,
    borderColor: '#FFFFFF40',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 30,
    marginBottom: 48,
  },
  startButtonText: {
    color: '#EEEEFF',
    fontSize: 14,
    letterSpacing: 4,
    fontWeight: '300',
  },
  controlsHint: {
    gap: 12,
    width: '100%',
    maxWidth: 300,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  controlIcon: {
    width: 32,
    alignItems: 'center',
  },
  controlIconText: {
    color: COLORS.hudTextMuted,
    fontSize: 14,
  },
  controlDesc: {
    color: COLORS.hudTextMuted,
    fontSize: 12,
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  version: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    color: '#FFFFFF20',
    fontSize: 10,
    letterSpacing: 1,
  },
});
