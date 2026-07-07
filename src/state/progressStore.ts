/**
 * Persisted player progress: wallet, upgrades, bests, and audio/haptic
 * settings. Loaded once at boot; every mutation schedules a debounced save
 * so rapid shop purchases don't thrash AsyncStorage.
 */
import { cosmeticCost, FREE_DEFAULTS, type CosmeticKind } from '../config/cosmetics';
import type { FeatureId } from '../config/features';
import { breadcrumb } from '../observability/errorReporter';
import { upgradeCost, upgradeDefs } from '../config/upgrades';
import type { UpgradeId } from '../core/types';
import { defaultProgress, loadProgress, saveProgress, type Progress } from './persistence';
import { createStore } from './store';

export interface ProgressState extends Progress {
  loaded: boolean;
}

export const progressStore = createStore<ProgressState>({
  ...defaultProgress,
  upgrades: { ...defaultProgress.upgrades },
  features: { ...defaultProgress.features },
  loaded: false,
});

/** Read a feature toggle from anywhere (render loop, engine glue, boot). */
export const featureEnabled = (id: FeatureId): boolean => progressStore.get().features[id];

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleSave = (): void => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { loaded: _loaded, ...progress } = progressStore.get();
    void saveProgress(progress);
  }, 300);
};

export const progressActions = {
  async init(): Promise<void> {
    const progress = await loadProgress();
    progressStore.set({ ...progress, loaded: true });
  },

  /** Bank a finished run. Returns whether it set a new best score. */
  bankRun(score: number, coinsEarned: number, depth: number): boolean {
    const s = progressStore.get();
    const isNewBest = score > s.bestScore;
    progressStore.set({
      coins: s.coins + coinsEarned,
      bestScore: Math.max(s.bestScore, score),
      bestDepth: Math.max(s.bestDepth, depth),
      totalRuns: s.totalRuns + 1,
    });
    scheduleSave();
    return isNewBest;
  },

  /** Attempt a purchase. Returns true on success. */
  buyUpgrade(id: UpgradeId): boolean {
    const s = progressStore.get();
    const def = upgradeDefs.find((d) => d.id === id);
    if (!def) return false;
    const level = s.upgrades[id];
    if (level >= def.maxLevel) return false;
    const cost = upgradeCost(def, level);
    if (s.coins < cost) return false;
    progressStore.set({
      coins: s.coins - cost,
      upgrades: { ...s.upgrades, [id]: level + 1 },
    });
    breadcrumb('upgrade-bought', { id, level: level + 1 });
    scheduleSave();
    return true;
  },

  markTutorialDone(): void {
    if (progressStore.get().tutorialDone) return;
    progressStore.set({ tutorialDone: true });
    scheduleSave();
  },

  /** Buy a cosmetic with coins. Returns true on success. Idempotent-safe. */
  buyCosmetic(kind: CosmeticKind, id: string): boolean {
    const s = progressStore.get();
    const cost = cosmeticCost(kind, id);
    if (cost === undefined) return false; // not in catalog
    if (s.unlocked[kind].includes(id)) return false; // already owned
    if (s.coins < cost) return false;
    progressStore.set({
      coins: s.coins - cost,
      unlocked: { ...s.unlocked, [kind]: [...s.unlocked[kind], id] },
    });
    breadcrumb('cosmetic-bought', { kind, id });
    scheduleSave();
    return true;
  },

  /** Equip an owned cosmetic. Unknown/unowned ids fall back to the default. */
  equipCosmetic(kind: CosmeticKind, id: string): void {
    const s = progressStore.get();
    const safe = s.unlocked[kind].includes(id) ? id : FREE_DEFAULTS[kind];
    if (s.equipped[kind] === safe) return;
    progressStore.set({ equipped: { ...s.equipped, [kind]: safe } });
    scheduleSave();
  },

  toggleFeature(id: FeatureId): void {
    progressStore.set((s) => ({ features: { ...s.features, [id]: !s.features[id] } }));
    if (id === 'crashReports') {
      // Lazy import breaks the store↔observability dependency cycle.
      void import('../observability/sentry').then((m) =>
        m.applyCrashReportPreference(progressStore.get().features.crashReports),
      );
    }
    scheduleSave();
  },

  setGraphicsQuality(quality: 'high' | 'low'): void {
    progressStore.set({ graphicsQuality: quality });
    scheduleSave();
  },

  toggleSetting(key: 'musicEnabled' | 'sfxEnabled' | 'hapticsEnabled'): void {
    progressStore.set((s) => ({ [key]: !s[key] }));
    scheduleSave();
  },

  /** Flush any pending debounced save immediately (e.g. app backgrounded). */
  flush(): void {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const { loaded: _loaded, ...progress } = progressStore.get();
    void saveProgress(progress);
  },
};
