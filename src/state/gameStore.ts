/**
 * Session state: the phase machine (menu → playing ⇄ paused → gameOver) and
 * live run stats mirrored from the engine at HUD frequency. The engine owns
 * the truth; this store exists so React overlays re-render cheaply.
 */
import type { DeathCause, GamePhase } from '../core/types';
import { createStore } from './store';

export type TutorialHint = 'hold' | 'release' | 'steer' | null;

export interface GameState {
  phase: GamePhase;
  /** Which overlay panel is open on top of menu/gameOver (upgrades shop). */
  shopOpen: boolean;
  /** Customize (cosmetics) overlay open on top of menu/gameOver. */
  customizeOpen: boolean;
  /** Contextual first-run hint currently shown on the HUD. */
  hint: TutorialHint;
  score: number;
  runCoins: number;
  depth: number;
  deathCause: DeathCause | null;
  isNewBest: boolean;
}

export const gameStore = createStore<GameState>({
  phase: 'menu',
  shopOpen: false,
  customizeOpen: false,
  hint: null,
  score: 0,
  runCoins: 0,
  depth: 0,
  deathCause: null,
  isNewBest: false,
});

export const gameActions = {
  startRun(): void {
    gameStore.set({
      phase: 'playing',
      shopOpen: false,
      customizeOpen: false,
      score: 0,
      runCoins: 0,
      depth: 0,
      deathCause: null,
      isNewBest: false,
    });
  },
  pause(): void {
    if (gameStore.get().phase === 'playing') gameStore.set({ phase: 'paused' });
  },
  resume(): void {
    if (gameStore.get().phase === 'paused') gameStore.set({ phase: 'playing' });
  },
  endRun(cause: DeathCause, isNewBest: boolean): void {
    gameStore.set({ phase: 'gameOver', deathCause: cause, isNewBest });
  },
  toMenu(): void {
    gameStore.set({ phase: 'menu', shopOpen: false, customizeOpen: false });
  },
  setShopOpen(open: boolean): void {
    gameStore.set({ shopOpen: open, customizeOpen: false });
  },
  setCustomizeOpen(open: boolean): void {
    gameStore.set({ customizeOpen: open, shopOpen: false });
  },
  setHint(hint: TutorialHint): void {
    gameStore.set({ hint });
  },
  syncRunStats(score: number, runCoins: number, depth: number): void {
    gameStore.set({ score, runCoins, depth });
  },
};

export const deathMessages: Record<DeathCause, string> = {
  crashed: 'Hull breached on impact.',
  orbitDecayed: 'Orbit decayed. Gravity always wins.',
  lostInSpace: 'Lost in the dark between stars.',
  asteroid: 'Shredded by the asteroid field.',
  solarFlare: 'Vaporized by a solar flare.',
  blackHole: 'Beyond the event horizon, nothing returns.',
  supernova: 'The star did not wait.',
};
