/**
 * Shared UI primitives. FadeView is the entire "screen transition" system:
 * overlays fade/drift over the always-live canvas, so moving between menu,
 * game, pause and game-over is one 420 ms crossfade — no navigator, no
 * loading, no layout jumps.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { audioManager } from '../audio/audioManager';
import { gameConfig } from '../config/gameConfig';
import { palette } from '../config/palette';

export const FadeView: React.FC<{
  visible: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  /** Vertical drift distance during the fade, for a weightless feel. */
  drift?: number;
}> = ({ visible, children, style, drift = 14 }) => {
  const t = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    t.value = withTiming(visible ? 1 : 0, {
      duration: gameConfig.ui.transitionMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, t]);

  const animated = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * drift }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, animated, style]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
};

export const MinimalButton: React.FC<{
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}> = ({ label, onPress, primary = false, disabled = false }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    disabled={disabled}
    onPress={() => {
      audioManager.play('ui');
      onPress();
    }}
    style={({ pressed }) => [
      styles.button,
      primary && styles.buttonPrimary,
      disabled && styles.buttonDisabled,
      pressed && styles.buttonPressed,
    ]}
  >
    <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
  </Pressable>
);

export const StatChip: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.chip}>
    <Text style={styles.chipLabel}>{label}</Text>
    <Text style={styles.chipValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 42,
    marginVertical: 6,
    alignItems: 'center',
    minWidth: 220,
  },
  buttonPrimary: {
    borderColor: palette.accent,
  },
  buttonDisabled: { opacity: 0.35 },
  buttonPressed: { opacity: 0.6 },
  buttonText: {
    color: palette.text,
    fontSize: 15,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  buttonTextPrimary: { color: palette.accent },
  chip: { alignItems: 'center', minWidth: 78 },
  chipLabel: {
    color: palette.textDim,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  chipValue: {
    color: palette.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
});
