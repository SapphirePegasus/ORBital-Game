/**
 * AudioManager — singleton service for music + SFX.
 *
 * Architecture:
 *  - Music: up to 2 concurrent tracks for crossfading (calm ↔ tense ↔ danger)
 *  - SFX: pooled Audio objects to avoid loading latency on rapid sounds
 *
 * All audio assets are listed as requires so Expo bundles them at build time.
 * Replace the placeholder `require()` paths once actual assets are added.
 */

import { Audio } from 'expo-av';
import type { AVPlaybackSource } from 'expo-av';
import type { MusicTrack, SFXKey } from '../types';

// ─── Asset map ───────────────────────────────────────────────────────────────
// These paths will resolve once you add actual audio files under src/assets/audio/.
// Placeholders prevent TS errors; runtime will warn if file is missing.

const MUSIC_ASSETS: Record<MusicTrack, AVPlaybackSource> = {
  menu_ambient: require('../assets/audio/music_menu.mp3'),
  game_calm:    require('../assets/audio/music_game_calm.mp3'),
  game_tense:   require('../assets/audio/music_game_tense.mp3'),
  game_danger:  require('../assets/audio/music_game_danger.mp3'),
};

const SFX_ASSETS: Record<SFXKey, AVPlaybackSource> = {
  launch:          require('../assets/audio/sfx_launch.mp3'),
  orbit_enter:     require('../assets/audio/sfx_orbit_enter.mp3'),
  orbit_exit:      require('../assets/audio/sfx_orbit_exit.mp3'),
  collect_coin:    require('../assets/audio/sfx_collect_coin.mp3'),
  collect_fuel:    require('../assets/audio/sfx_collect_fuel.mp3'),
  collect_mineral: require('../assets/audio/sfx_collect_mineral.mp3'),
  charge_loop:     require('../assets/audio/sfx_charge_loop.mp3'),
  explosion:       require('../assets/audio/sfx_explosion.mp3'),
  black_hole_pull: require('../assets/audio/sfx_black_hole.mp3'),
  solar_flare:     require('../assets/audio/sfx_solar_flare.mp3'),
  ui_tap:          require('../assets/audio/sfx_ui_tap.mp3'),
  ui_confirm:      require('../assets/audio/sfx_ui_confirm.mp3'),
  ui_back:         require('../assets/audio/sfx_ui_back.mp3'),
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface MusicPlayer {
  sound: Audio.Sound;
  track: MusicTrack;
  volume: number;
}

// ─── Manager class ────────────────────────────────────────────────────────────

class AudioManager {
  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private isInitialized = false;

  private activeMusic: MusicPlayer | null = null;
  private fadingOutMusic: MusicPlayer | null = null;

  /** Preloaded SFX pool — key → Sound object */
  private sfxPool: Partial<Record<SFXKey, Audio.Sound>> = {};

  /** SFX keys to preload eagerly */
  private EAGER_SFX: SFXKey[] = [
    'launch', 'orbit_enter', 'collect_coin', 'explosion', 'ui_tap', 'ui_confirm',
  ];

  async init(musicVol: number, sfxVol: number): Promise<void> {
    if (this.isInitialized) return;
    this.musicVolume = musicVol;
    this.sfxVolume = sfxVol;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (e) {
      console.warn('[AudioManager] setAudioModeAsync failed', e);
    }

    // Preload hot SFX
    for (const key of this.EAGER_SFX) {
      this.preloadSFX(key).catch(() => {});
    }

    this.isInitialized = true;
  }

  private async preloadSFX(key: SFXKey): Promise<void> {
    try {
      const { sound } = await Audio.Sound.createAsync(SFX_ASSETS[key], {
        volume: this.sfxVolume,
        shouldPlay: false,
      });
      this.sfxPool[key] = sound;
    } catch (e) {
      console.warn(`[AudioManager] Failed to preload SFX: ${key}`, e);
    }
  }

  // ── Music ─────────────────────────────────────────────────────────────────

  async playMusic(track: MusicTrack, fadeDuration = 800): Promise<void> {
    if (this.activeMusic?.track === track) return;

    // Begin fading out current track
    if (this.activeMusic) {
      const outgoing = this.activeMusic;
      this.fadingOutMusic = outgoing;
      this.activeMusic = null;
      this.fadeVolume(outgoing.sound, outgoing.volume, 0, fadeDuration).then(() => {
        outgoing.sound.unloadAsync().catch(() => {});
        if (this.fadingOutMusic === outgoing) this.fadingOutMusic = null;
      });
    }

    try {
      const { sound } = await Audio.Sound.createAsync(MUSIC_ASSETS[track], {
        volume: 0,
        isLooping: true,
        shouldPlay: true,
      });
      const player: MusicPlayer = { sound, track, volume: this.musicVolume };
      this.activeMusic = player;
      await this.fadeVolume(sound, 0, this.musicVolume, fadeDuration);
    } catch (e) {
      console.warn(`[AudioManager] Failed to play music: ${track}`, e);
    }
  }

  async pauseMusic(): Promise<void> {
    if (this.activeMusic) {
      await this.activeMusic.sound.setVolumeAsync(0);
      await this.activeMusic.sound.pauseAsync();
    }
  }

  async resumeMusic(): Promise<void> {
    if (this.activeMusic) {
      await this.activeMusic.sound.playAsync();
      await this.activeMusic.sound.setVolumeAsync(this.musicVolume);
    }
  }

  async stopAllMusic(): Promise<void> {
    for (const player of [this.activeMusic, this.fadingOutMusic]) {
      if (player) {
        await player.sound.stopAsync().catch(() => {});
        await player.sound.unloadAsync().catch(() => {});
      }
    }
    this.activeMusic = null;
    this.fadingOutMusic = null;
  }

  // ── SFX ──────────────────────────────────────────────────────────────────

  async playSFX(key: SFXKey): Promise<void> {
    try {
      const pooled = this.sfxPool[key];
      if (pooled) {
        // Rewind and play from pool
        await pooled.replayAsync();
        return;
      }
      // Load on demand for non-pooled sounds
      const { sound } = await Audio.Sound.createAsync(SFX_ASSETS[key], {
        volume: this.sfxVolume,
        shouldPlay: true,
      });
      // Auto-unload when done
      sound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (e) {
      console.warn(`[AudioManager] Failed to play SFX: ${key}`, e);
    }
  }

  // ── Volume control ────────────────────────────────────────────────────────

  setMusicVolume(vol: number): void {
    this.musicVolume = vol;
    this.activeMusic?.sound.setVolumeAsync(vol).catch(() => {});
  }

  setSFXVolume(vol: number): void {
    this.sfxVolume = vol;
    for (const sound of Object.values(this.sfxPool)) {
      sound?.setVolumeAsync(vol).catch(() => {});
    }
  }

  /** Adaptive music: ramps tension based on danger proximity (0=calm, 1=danger) */
  async setTensionLevel(level: number): Promise<void> {
    if (level > 0.7) {
      await this.playMusic('game_danger', 600);
    } else if (level > 0.3) {
      await this.playMusic('game_tense', 800);
    } else {
      await this.playMusic('game_calm', 1200);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async fadeVolume(
    sound: Audio.Sound,
    from: number,
    to: number,
    durationMs: number,
  ): Promise<void> {
    const steps = 20;
    const stepMs = durationMs / steps;
    const delta = (to - from) / steps;
    let current = from;

    for (let i = 0; i < steps; i++) {
      current += delta;
      await sound.setVolumeAsync(Math.max(0, Math.min(1, current)));
      await new Promise(resolve => setTimeout(resolve, stepMs));
    }
  }

  async destroy(): Promise<void> {
    await this.stopAllMusic();
    for (const sound of Object.values(this.sfxPool)) {
      await sound?.unloadAsync().catch(() => {});
    }
    this.sfxPool = {};
    this.isInitialized = false;
  }
}

export const audioManager = new AudioManager();
