/**
 * FailScreen — appears after game over with contextual death message,
 * shake animation, score summary, and retry/menu actions.
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useGameStore } from '../store/gameStore';
import { audioManager } from '../audio/AudioManager';
import { COLORS, TRANSITION_FAIL_MS } from '../constants';
import type { GameOverReason } from '../types';

// ─── Reason copy ──────────────────────────────────────────────────────────────

const REASON_COPY: Record<GameOverReason, { headline: string; sub: string }> = {
  orbital_decay: {
    headline: 'ORBITAL DECAY',
    sub: 'Too many revolutions. The planet claimed you.',
  },
  lost_in_space: {
    headline: 'LOST IN THE VOID',
    sub: 'Wrong trajectory. The darkness swallowed you.',
  },
  planet_collision: {
    headline: 'IMPACT',
    sub: 'You flew straight into a planet.',
  },
  asteroid_collision: {
    headline: 'ASTEROID STRIKE',
    sub: 'The field was denser than it looked.',
  },
  black_hole: {
    headline: 'EVENT HORIZON',
    sub: 'No escape. The singularity wins.',
  },
  solar_flare: {
    headline: 'SOLAR FLARE',
    sub: 'Radiation overwhelmed your hull.',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface FailScreenProps {
  visible: boolean;
}

export const FailScreen: React.FC<FailScreenProps> = ({ visible }) => {
  const { width: W, height: H } = useWindowDimensions();
  const { retryGame, returnToMenu, score, highScore, gameOverReason, coinsThisRun } = useGameStore();

  const opacity = useSharedValue(0);
  const cardScale = useSharedValue(0.85);
  const shakeX = useSharedValue(0);
  const newBest = score > 0 && score >= highScore;

  useEffect(() => {
    if (!visible) return;
    audioManager.stopAllMusic();

    // Shake then reveal
    shakeX.value = withSequence(
      withTiming(-12, { duration: 60 }),
      withTiming(12, { duration: 60 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 40 }),
    );

    setTimeout(() => {
      opacity.value = withTiming(1, { duration: TRANSITION_FAIL_MS });
      cardScale.value = withSpring(1, { damping: 14, stiffness: 100 });

      if (newBest) {
        audioManager.playSFX('ui_confirm');
      }
    }, 200);
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }, { translateX: shakeX.value }],
  }));

  const reason = gameOverReason ?? 'lost_in_space';
  const copy = REASON_COPY[reason];

  if (!visible) return null;

  return (
    <Animated.View style={[styles.root, { width: W, height: H }, overlayStyle]}>
      <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />

      <Animated.View style={[styles.card, cardStyle]}>
        {/* Death reason */}
        <View style={styles.reasonBlock}>
          <Text style={styles.headline}>{copy.headline}</Text>
          <Text style={styles.sub}>{copy.sub}</Text>
        </View>

        {/* Score summary */}
        <View style={styles.scoreBlock}>
          {newBest && (
            <View style={styles.newBestBadge}>
              <Text style={styles.newBestText}>NEW BEST</Text>
            </View>
          )}
          <Text style={styles.scoreBig}>{score.toLocaleString()}</Text>
          <Text style={styles.scoreLabel}>SCORE</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{coinsThisRun}</Text>
              <Text style={styles.statLabel}>COINS</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{highScore.toLocaleString()}</Text>
              <Text style={styles.statLabel}>BEST</Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[styles.button, styles.buttonRetry]}
          onPress={() => { audioManager.playSFX('ui_confirm'); retryGame(); }}
        >
          <Text style={[styles.buttonText, styles.buttonTextRetry]}>TRY AGAIN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => { audioManager.playSFX('ui_back'); returnToMenu(); }}
        >
          <Text style={styles.buttonText}>MAIN MENU</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#08091866',
    borderWidth: 1,
    borderColor: '#FFFFFF18',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 36,
    alignItems: 'center',
    minWidth: 280,
    gap: 24,
  },
  reasonBlock: {
    alignItems: 'center',
    gap: 8,
  },
  headline: {
    fontSize: 20,
    color: '#FF6644',
    letterSpacing: 5,
    fontWeight: '200',
  },
  sub: {
    fontSize: 13,
    color: COLORS.hudTextMuted,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '300',
    maxWidth: 240,
  },
  scoreBlock: {
    alignItems: 'center',
    gap: 4,
  },
  newBestBadge: {
    backgroundColor: '#FFD70022',
    borderWidth: 1,
    borderColor: '#FFD70044',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 4,
  },
  newBestText: {
    color: '#FFD700',
    fontSize: 9,
    letterSpacing: 3,
    fontWeight: '600',
  },
  scoreBig: {
    fontSize: 44,
    color: COLORS.hudText,
    fontWeight: '100',
    letterSpacing: 2,
  },
  scoreLabel: {
    fontSize: 9,
    color: COLORS.hudTextMuted,
    letterSpacing: 3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    marginTop: 12,
  },
  stat: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    color: COLORS.hudText,
    fontWeight: '200',
  },
  statLabel: {
    fontSize: 8,
    color: COLORS.hudTextMuted,
    letterSpacing: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#FFFFFF20',
  },
  button: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF25',
    alignItems: 'center',
  },
  buttonRetry: {
    backgroundColor: '#4488FF18',
    borderColor: '#4488FF55',
  },
  buttonText: {
    color: COLORS.hudText,
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '300',
  },
  buttonTextRetry: {
    color: COLORS.uiAccent,
  },
});
