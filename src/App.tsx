/**
 * App root — phase-driven screen stack.
 *
 * No React Navigation. Screens are composited in a single View tree.
 * Transitions are animated with Reanimated opacity/scale.
 *
 * Stack (back → front):
 *   GameScreen  (always mounted once game starts, stays for pause/fail)
 *   MenuScreen  (fades out on game start, fades in on return)
 */

import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useGameStore } from './store/gameStore';
import { audioManager } from './audio/AudioManager';
import { MenuScreen } from './screens/MenuScreen';
import { GameScreen } from './screens/GameScreen';

export default function App() {
  const { phase, loadPersisted, sfxVolume, musicVolume } = useGameStore();

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await loadPersisted();
      await audioManager.init(
        useGameStore.getState().musicVolume,
        useGameStore.getState().sfxVolume,
      );
    })();

    return () => {
      audioManager.destroy();
    };
  }, []);

  // ── Volume changes ───────────────────────────────────────────────────────
  useEffect(() => {
    audioManager.setMusicVolume(musicVolume);
  }, [musicVolume]);

  useEffect(() => {
    audioManager.setSFXVolume(sfxVolume);
  }, [sfxVolume]);

  // ── Determine what's visible ─────────────────────────────────────────────
  const showMenu = phase === 'menu' || phase === 'transitioning_out';
  const showGame =
    phase === 'playing' ||
    phase === 'paused' ||
    phase === 'level_fail' ||
    phase === 'upgrading' ||
    phase === 'transitioning_in';

  const menuOpacity = useSharedValue(1);
  const gameOpacity = useSharedValue(0);

  useEffect(() => {
    if (showGame && !showMenu) {
      menuOpacity.value = withTiming(0, { duration: 300 });
      gameOpacity.value = withTiming(1, { duration: 300 });
    } else if (showMenu && !showGame) {
      menuOpacity.value = withTiming(1, { duration: 350 });
      gameOpacity.value = withTiming(0, { duration: 250 });
    } else if (showMenu && showGame) {
      // Transitioning — both visible, menu fades out
      menuOpacity.value = withTiming(0, { duration: 350 });
    }
  }, [phase]);

  const menuStyle = useAnimatedStyle(() => ({ opacity: menuOpacity.value }));
  const gameStyle = useAnimatedStyle(() => ({ opacity: gameOpacity.value }));

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={styles.root}>
        <StatusBar hidden />

        {/* Game canvas (underneath) */}
        {showGame && (
          <Animated.View style={[StyleSheet.absoluteFill, gameStyle]}>
            <GameScreen />
          </Animated.View>
        )}

        {/* Menu (on top, fades out) */}
        {(showMenu || phase === 'transitioning_in') && (
          <Animated.View style={[StyleSheet.absoluteFill, menuStyle]} pointerEvents={showMenu ? 'auto' : 'none'}>
            <MenuScreen />
          </Animated.View>
        )}

      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#04060F',
  },
});
