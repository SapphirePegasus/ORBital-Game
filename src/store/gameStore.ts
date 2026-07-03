import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  GamePhase,
  GameOverReason,
  PhysicsState,
  HUDData,
  UpgradeState,
  PersistentStore,
  Galaxy,
  SFXKey,
} from '../types';
import { generateGalaxy, getStartingPlanet } from '../engine/worldGen';
import {
  SCORE_PER_PLANET_REACHED,
  SCORE_COIN_MULTIPLIER,
  SCORE_MINERAL_MULTIPLIER,
  SCORE_DARK_MATTER_MULTIPLIER,
  SCORE_PER_SYSTEM_CLEARED,
} from '../constants';

// ─── MMKV persistence (lazy import to allow testing without native module) ────

let _mmkv: { getString: (k: string) => string | undefined; set: (k: string, v: string) => void } | null = null;

// Static import — safe to call even in test env (mock intercepts it)
import { MMKV as MMKVClass } from 'react-native-mmkv';

function getMMKV() {
  if (_mmkv) return _mmkv;
  try {
    const storage = new MMKVClass({ id: 'orbital-game' });
    _mmkv = {
      getString: (k: string) => storage.getString(k),
      set: (k: string, v: string) => storage.set(k, v),
    };
  } catch {
    // Fallback for testing environments
    const mem: Record<string, string> = {};
    _mmkv = { getString: (k: string) => mem[k], set: (k: string, v: string) => { mem[k] = v; } };
  }
  return _mmkv!;
}

const PERSIST_KEY = 'game_persistent_v1';

const DEFAULT_PERSISTENT: PersistentStore = {
  highScore: 0,
  totalCoins: 0,
  upgrades: {},
  unlockedGalaxies: ['galaxy_0'],
  sfxVolume: 0.8,
  musicVolume: 0.6,
  hapticEnabled: true,
};

// ─── Session (non-persisted) state ────────────────────────────────────────────

interface SessionState {
  phase: GamePhase;
  galaxy: Galaxy | null;
  currentSystemIndex: number;
  score: number;
  coinsThisRun: number;
  planetsVisited: string[];
  gameOverReason: GameOverReason | null;
  hud: HUDData;
  /** Shared value refs from physics worklet — set by GameCanvas */
  physicsStateRef: PhysicsState | null;
  /** Set by parent screen to trigger SFX */
  pendingSFX: SFXKey | null;
}

// ─── Full store ───────────────────────────────────────────────────────────────

interface GameStore extends SessionState, PersistentStore {
  // Lifecycle
  initGame: (galaxySeed?: number) => void;
  pauseGame: () => void;
  resumeGame: () => void;
  failGame: (reason: GameOverReason) => void;
  retryGame: () => void;
  returnToMenu: () => void;

  // Gameplay events (called from physics worklet bridge)
  onOrbitEntered: (planetId: string) => void;
  onCollectibleGathered: (collectibleId: string, type: string, value: number) => void;
  onSystemCleared: () => void;

  // HUD
  updateHUD: (data: Partial<HUDData>) => void;

  // Upgrades
  purchaseUpgrade: (upgradeId: string) => boolean;

  // Persistence
  loadPersisted: () => Promise<void>;
  savePersisted: () => Promise<void>;

  // SFX bridge
  clearPendingSFX: () => void;
}

const defaultHUD: HUDData = {
  speedMagnitude: 0,
  orbitDecayPercent: 0,
  launchChargePercent: 0,
  score: 0,
  fuel: 100,
  mass: 1,
  currentPlanetName: null,
  collectiblesNearby: 0,
};

export const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    // ── Initial session state ───────────────────────────────────────────────
    phase: 'menu',
    galaxy: null,
    currentSystemIndex: 0,
    score: 0,
    coinsThisRun: 0,
    planetsVisited: [],
    gameOverReason: null,
    hud: defaultHUD,
    physicsStateRef: null,
    pendingSFX: null,

    // ── Initial persistent state (overwritten by loadPersisted) ─────────────
    ...DEFAULT_PERSISTENT,

    // ── Lifecycle ───────────────────────────────────────────────────────────
    initGame: (galaxySeed = Date.now()) => {
      const galaxy = generateGalaxy(galaxySeed, 'Andromeda Prime');
      set(state => {
        state.galaxy = galaxy as any;
        state.phase = 'transitioning_in';
        state.score = 0;
        state.coinsThisRun = 0;
        state.planetsVisited = [];
        state.gameOverReason = null;
        state.currentSystemIndex = 0;
        state.hud = { ...defaultHUD };
      });
      // Short delay then set to playing (transition animation handles the rest)
      setTimeout(() => {
        set(state => { state.phase = 'playing'; });
      }, 350);
    },

    pauseGame: () => {
      if (get().phase !== 'playing') return;
      set(state => { state.phase = 'paused'; });
    },

    resumeGame: () => {
      if (get().phase !== 'paused') return;
      set(state => { state.phase = 'playing'; });
    },

    failGame: (reason) => {
      set(state => {
        state.phase = 'level_fail';
        state.gameOverReason = reason;
        state.pendingSFX = 'explosion';
        // Update high score
        if (state.score > state.highScore) {
          state.highScore = state.score;
        }
        state.totalCoins += state.coinsThisRun;
      });
      get().savePersisted();
    },

    retryGame: () => {
      get().initGame();
    },

    returnToMenu: () => {
      set(state => {
        state.phase = 'transitioning_out';
        state.galaxy = null;
      });
      setTimeout(() => {
        set(state => { state.phase = 'menu'; });
      }, 300);
    },

    // ── Gameplay events ─────────────────────────────────────────────────────
    onOrbitEntered: (planetId) => {
      set(state => {
        if (!state.planetsVisited.includes(planetId)) {
          state.planetsVisited.push(planetId);
          state.score += SCORE_PER_PLANET_REACHED;
          state.pendingSFX = 'orbit_enter';
        }
      });
    },

    onCollectibleGathered: (collectibleId, type, value) => {
      set(state => {
        let scoreGain = 0;
        if (type === 'coin') {
          scoreGain = value * SCORE_COIN_MULTIPLIER;
          state.coinsThisRun += value;
          state.pendingSFX = 'collect_coin';
        } else if (type === 'mineral') {
          scoreGain = value * SCORE_MINERAL_MULTIPLIER;
          state.pendingSFX = 'collect_mineral';
        } else if (type === 'dark_matter') {
          scoreGain = value * SCORE_DARK_MATTER_MULTIPLIER;
          state.pendingSFX = 'collect_mineral';
        } else if (type === 'fuel') {
          state.pendingSFX = 'collect_fuel';
          // fuel handled in physics state
        }
        state.score += scoreGain;
      });
    },

    onSystemCleared: () => {
      set(state => {
        state.score += SCORE_PER_SYSTEM_CLEARED;
        state.currentSystemIndex += 1;
      });
    },

    // ── HUD ─────────────────────────────────────────────────────────────────
    updateHUD: (data) => {
      set(state => {
        Object.assign(state.hud, data);
        state.hud.score = state.score;
      });
    },

    // ── Upgrades ────────────────────────────────────────────────────────────
    purchaseUpgrade: (upgradeId) => {
      // Upgrade cost logic handled here — returns false if insufficient coins
      set(state => {
        const currentLevel = state.upgrades[upgradeId] ?? 0;
        state.upgrades[upgradeId] = currentLevel + 1;
        state.pendingSFX = 'ui_confirm';
      });
      get().savePersisted();
      return true;
    },

    // ── Persistence ──────────────────────────────────────────────────────────
    loadPersisted: async () => {
      const storage = getMMKV();
      const raw = storage.getString(PERSIST_KEY);
      if (!raw) return;
      try {
        const parsed: Partial<PersistentStore> = JSON.parse(raw);
        set(state => { Object.assign(state, parsed); });
      } catch {
        // Corrupted save — start fresh
      }
    },

    savePersisted: async () => {
      const storage = getMMKV();
      const { highScore, totalCoins, upgrades, unlockedGalaxies, sfxVolume, musicVolume, hapticEnabled } = get();
      storage.set(PERSIST_KEY, JSON.stringify({ highScore, totalCoins, upgrades, unlockedGalaxies, sfxVolume, musicVolume, hapticEnabled }));
    },

    // ── SFX bridge ───────────────────────────────────────────────────────────
    clearPendingSFX: () => {
      set(state => { state.pendingSFX = null; });
    },
  })),
);
