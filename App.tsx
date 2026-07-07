/**
 * App root. Composition:
 *
 *   GestureHandlerRootView
 *   └─ SafeAreaProvider
 *      ├─ GameCanvas   (mounted once, forever — the world never unloads)
 *      ├─ Hud          (playing)
 *      ├─ MenuOverlay  (menu)
 *      ├─ PauseOverlay (paused)
 *      ├─ GameOverOverlay (gameOver)
 *      ├─ UpgradesOverlay (shop)
 *      └─ CustomizeOverlay (cosmetics)
 *      (all overlays inside an ErrorBoundary — a UI crash never kills the game)
 *
 * Boot: keep the native splash up until saved progress + audio are ready,
 * then fade it away — the first thing the player sees is the live starfield.
 * AppState listener auto-pauses mid-run and flushes saves on background.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { audioManager } from './src/audio/audioManager';
import { applyCrashReportPreference } from './src/observability/sentry';
import { loadSprites } from './src/render/imageAssets';
import { palette } from './src/config/palette';
import { gameActions, gameStore } from './src/state/gameStore';
import { progressActions, progressStore } from './src/state/progressStore';
import { useStore } from './src/state/store';
import { GameCanvas, type GameCanvasHandle } from './src/render/GameCanvas';
import { Hud } from './src/ui/Hud';
import { GameOverOverlay, MenuOverlay, PauseOverlay, UpgradesOverlay } from './src/ui/overlays';
import { CustomizeOverlay } from './src/ui/CustomizeOverlay';
import { UiErrorBoundary as ErrorBoundary } from './src/ui/ErrorBoundary';

// Hold the splash until we're truly ready — no intermediate loading screen.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void SystemUI.setBackgroundColorAsync(palette.space).catch(() => undefined);

export default function App(): React.JSX.Element {
  const [booted, setBooted] = useState(false);
  const canvasRef = useRef<GameCanvasHandle | null>(null);

  const phase = useStore(gameStore, (s) => s.phase);
  const shopOpen = useStore(gameStore, (s) => s.shopOpen);
  const customizeOpen = useStore(gameStore, (s) => s.customizeOpen);

  // ------------------------------------------------------------------- boot
  useEffect(() => {
    let mounted = true;
    void (async () => {
      await progressActions.init();
      applyCrashReportPreference(progressStore.get().features.crashReports);
      void loadSprites(); // decode any registered skin art; never blocks boot
      await audioManager.init();
      if (!mounted) return;
      setBooted(true);
      audioManager.startMusic();
      await SplashScreen.hideAsync().catch(() => undefined);
    })();
    return () => {
      mounted = false;
      audioManager.dispose();
    };
  }, []);

  // -------------------------------------------------- background protection
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        gameActions.pause(); // never let the run die off-screen
        progressActions.flush(); // and never lose progress
        audioManager.stopMusic();
      } else {
        audioManager.applyMusicSetting();
      }
    });
    return () => sub.remove();
  }, []);

  // ---------------------------------------------------------------- actions
  const startRun = useCallback(() => {
    canvasRef.current?.startRun();
  }, []);

  const quitToMenu = useCallback(() => {
    gameActions.toMenu();
  }, []);

  const engineHud = useCallback(() => canvasRef.current?.getHud() ?? null, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar style="light" hidden={phase === 'playing'} />
          <GameCanvas handleRef={canvasRef} />
          {booted && (
            <ErrorBoundary>
              <Hud visible={phase === 'playing'} getHud={engineHud} />
              <MenuOverlay
                visible={phase === 'menu' && !shopOpen && !customizeOpen}
                onStart={startRun}
              />
              <PauseOverlay visible={phase === 'paused'} onQuit={quitToMenu} />
              <GameOverOverlay
                visible={phase === 'gameOver' && !shopOpen && !customizeOpen}
                onRetry={startRun}
                onMenu={quitToMenu}
              />
              <UpgradesOverlay visible={shopOpen} />
              <CustomizeOverlay visible={customizeOpen} />
            </ErrorBoundary>
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.space },
});
