/**
 * PauseOverlay — appears over the frozen game canvas with blur background.
 *
 * Mounting strategy: always rendered, opacity/scale animated in/out.
 * Double-tap anywhere to pause (registered in GestureHandler).
 */

import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useGameStore } from '../store/gameStore';
import { audioManager } from '../audio/AudioManager';
import { COLORS, TRANSITION_PAUSE_MS } from '../constants';

interface PauseOverlayProps {
  visible: boolean;
}

export const PauseOverlay: React.FC<PauseOverlayProps> = ({ visible }) => {
  const { width: W, height: H } = useWindowDimensions();
  const { resumeGame, retryGame, returnToMenu, score, highScore } = useGameStore();

  const opacity = useSharedValue(0);
  const contentScale = useSharedValue(0.92);

  useEffect(() => {
    if (visible) {
      audioManager.pauseMusic();
      opacity.value = withTiming(1, { duration: TRANSITION_PAUSE_MS });
      contentScale.value = withTiming(1, { duration: TRANSITION_PAUSE_MS, easing: Easing.out(Easing.back(1.05)) });
    } else {
      opacity.value = withTiming(0, { duration: TRANSITION_PAUSE_MS });
      contentScale.value = withTiming(0.92, { duration: TRANSITION_PAUSE_MS });
    }
  }, [visible]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    pointerEvents: opacity.value > 0.05 ? 'auto' : 'none',
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: contentScale.value }],
  }));

  const handleResume = async () => {
    await audioManager.playSFX('ui_tap');
    await audioManager.resumeMusic();
    resumeGame();
  };

  const handleRetry = async () => {
    await audioManager.playSFX('ui_confirm');
    retryGame();
  };

  const handleMenu = async () => {
    await audioManager.playSFX('ui_back');
    returnToMenu();
  };

  if (!visible && opacity.value === 0) return null;

  return (
    <Animated.View style={[styles.root, { width: W, height: H }, overlayStyle]}>
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />

      <Animated.View style={[styles.card, contentStyle]}>
        <Text style={styles.title}>PAUSED</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>SCORE</Text>
            <Text style={styles.statValue}>{score.toLocaleString()}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>BEST</Text>
            <Text style={styles.statValue}>{highScore.toLocaleString()}</Text>
          </View>
        </View>

        <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleResume}>
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>RESUME</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleRetry}>
          <Text style={styles.buttonText}>RETRY</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.buttonDanger]} onPress={handleMenu}>
          <Text style={[styles.buttonText, styles.buttonTextDanger]}>MAIN MENU</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>double-tap to pause / resume</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#08091844',
    borderWidth: 1,
    borderColor: '#FFFFFF18',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 40,
    alignItems: 'center',
    minWidth: 260,
    gap: 16,
  },
  title: {
    fontSize: 13,
    color: COLORS.hudTextMuted,
    letterSpacing: 6,
    fontWeight: '300',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 8,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.hudTextMuted,
    letterSpacing: 2,
  },
  statValue: {
    fontSize: 22,
    color: COLORS.hudText,
    fontWeight: '200',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
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
  buttonPrimary: {
    backgroundColor: '#4488FF22',
    borderColor: '#4488FF66',
  },
  buttonDanger: {
    borderColor: '#FF334422',
  },
  buttonText: {
    color: COLORS.hudText,
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '400',
  },
  buttonTextPrimary: {
    color: COLORS.uiAccent,
  },
  buttonTextDanger: {
    color: '#FF334488',
  },
  hint: {
    fontSize: 10,
    color: '#FFFFFF25',
    letterSpacing: 1,
    marginTop: 4,
  },
});
