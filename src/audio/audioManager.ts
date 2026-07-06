/**
 * Audio manager built on expo-audio (expo-av is deprecated as of SDK 56).
 *
 * - One looping ambient music player.
 * - A small round-robin pool per SFX so rapid triggers (coin streaks) can
 *   overlap without cutting each other off.
 * - Every call is guarded: audio must never crash gameplay. If an asset is
 *   missing or the platform denies playback, the game continues silently.
 *
 * All bundled sounds are synthesized by scripts/generate-audio.mjs (license
 * clean). Replace any file in assets/audio/ to reskin the soundscape.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { progressStore } from '../state/progressStore';

export type SfxName =
  | 'launch'
  | 'boost'
  | 'coin'
  | 'capture'
  | 'explosion'
  | 'warning'
  | 'ui';

/* eslint-disable @typescript-eslint/no-require-imports */
const sfxSources: Record<SfxName, number> = {
  launch: require('../../assets/audio/launch.wav'),
  boost: require('../../assets/audio/boost.wav'),
  coin: require('../../assets/audio/coin.wav'),
  capture: require('../../assets/audio/capture.wav'),
  explosion: require('../../assets/audio/explosion.wav'),
  warning: require('../../assets/audio/warning.wav'),
  ui: require('../../assets/audio/ui.wav'),
};
const musicSource: number = require('../../assets/audio/ambient-loop.wav');
/* eslint-enable @typescript-eslint/no-require-imports */

const POOL_SIZE = 3;

class AudioManager {
  private pools = new Map<SfxName, AudioPlayer[]>();
  private poolIndex = new Map<SfxName, number>();
  private music: AudioPlayer | null = null;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
      });
      for (const name of Object.keys(sfxSources) as SfxName[]) {
        const players: AudioPlayer[] = [];
        for (let i = 0; i < POOL_SIZE; i++) {
          players.push(createAudioPlayer(sfxSources[name]));
        }
        this.pools.set(name, players);
        this.poolIndex.set(name, 0);
      }
      this.music = createAudioPlayer(musicSource);
      this.music.loop = true;
      this.music.volume = 0.55;
      this.ready = true;
    } catch (err) {
      if (__DEV__) console.warn('[audio] init failed — continuing silently', err);
    }
  }

  play(name: SfxName): void {
    if (!this.ready || !progressStore.get().sfxEnabled) return;
    try {
      const pool = this.pools.get(name);
      if (!pool || pool.length === 0) return;
      const i = (this.poolIndex.get(name) ?? 0) % pool.length;
      this.poolIndex.set(name, i + 1);
      const player = pool[i];
      if (!player) return;
      player.seekTo(0);
      player.play();
    } catch {
      /* never let audio break gameplay */
    }
  }

  startMusic(): void {
    if (!this.ready || !progressStore.get().musicEnabled || !this.music) return;
    try {
      this.music.play();
    } catch {
      /* noop */
    }
  }

  stopMusic(): void {
    try {
      this.music?.pause();
    } catch {
      /* noop */
    }
  }

  /** React to the settings toggle without restarting the app. */
  applyMusicSetting(): void {
    if (progressStore.get().musicEnabled) this.startMusic();
    else this.stopMusic();
  }

  dispose(): void {
    try {
      for (const pool of this.pools.values()) pool.forEach((p) => p.remove());
      this.pools.clear();
      this.music?.remove();
      this.music = null;
      this.ready = false;
    } catch {
      /* noop */
    }
  }
}

export const audioManager = new AudioManager();
