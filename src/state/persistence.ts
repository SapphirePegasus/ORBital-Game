/**
 * Persistence for player progress (coins, upgrades, best score, settings).
 *
 * Security & robustness posture (see docs/decisions and README):
 *  - Versioned envelope → forward migrations instead of silent corruption.
 *  - Full structural validation of every field before use — a tampered or
 *    corrupted blob can never crash the game or smuggle unexpected types in.
 *    Values are re-clamped to sane ranges (defense in depth).
 *  - FNV-1a checksum detects accidental corruption. NOTE: this is an
 *    integrity check, not tamper-proofing — nothing stored on-device can be
 *    made tamper-proof without a server. There is no PII in this payload.
 *  - All storage APIs are wrapped: a storage failure degrades to defaults,
 *    never to a crash.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { catalogIds, FREE_DEFAULTS, type CosmeticKind } from '../config/cosmetics';
import { defaultFeatures, featureIds, type FeatureId } from '../config/features';
import { defaultUpgrades, upgradeDefs } from '../config/upgrades';
import type { UpgradeLevels } from '../core/types';

const STORAGE_KEY = 'space-hopper/progress';
const SCHEMA_VERSION = 1;

export interface Progress {
  coins: number;
  bestScore: number;
  bestDepth: number;
  totalRuns: number;
  upgrades: UpgradeLevels;
  musicEnabled: boolean;
  sfxEnabled: boolean;
  hapticsEnabled: boolean;
  /** First-run tutorial completed (hold → release → steer). */
  tutorialDone: boolean;
  /** Owned cosmetic ids per kind. Free defaults are always members. */
  unlocked: Record<CosmeticKind, string[]>;
  /** Currently equipped cosmetic per kind. Must be an unlocked, valid id. */
  equipped: Record<CosmeticKind, string>;
  /** Shader-heavy rendering on/off (low-end device escape hatch). */
  graphicsQuality: 'high' | 'low';
  /** User feature toggles. Keys are validated against the feature catalog. */
  features: Record<FeatureId, boolean>;
}

export const defaultProgress: Progress = {
  coins: 0,
  bestScore: 0,
  bestDepth: 0,
  totalRuns: 0,
  upgrades: { ...defaultUpgrades },
  musicEnabled: true,
  sfxEnabled: true,
  hapticsEnabled: true,
  tutorialDone: false,
  unlocked: {
    skin: [FREE_DEFAULTS.skin],
    scheme: [FREE_DEFAULTS.scheme],
    trail: [FREE_DEFAULTS.trail],
  },
  equipped: { ...FREE_DEFAULTS },
  graphicsQuality: 'high',
  features: { ...defaultFeatures },
};

interface Envelope {
  v: number;
  checksum: string;
  data: Progress;
}

/** FNV-1a 32-bit — fast, dependency-free corruption check. */
export const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const clampInt = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(v)));

/**
 * Validate + sanitize an unknown blob into a Progress object.
 * Unknown fields are dropped; bad fields fall back to defaults; numeric
 * fields are clamped to sane ranges. Never throws.
 */
export const sanitizeProgress = (raw: unknown): Progress => {
  const out: Progress = {
    ...defaultProgress,
    upgrades: { ...defaultUpgrades },
    unlocked: {
      skin: [...defaultProgress.unlocked.skin],
      scheme: [...defaultProgress.unlocked.scheme],
      trail: [...defaultProgress.unlocked.trail],
    },
    equipped: { ...defaultProgress.equipped },
    features: { ...defaultFeatures },
  };
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;

  if (isFiniteNumber(r.coins)) out.coins = clampInt(r.coins, 0, 1_000_000_000);
  if (isFiniteNumber(r.bestScore)) out.bestScore = clampInt(r.bestScore, 0, 1_000_000_000);
  if (isFiniteNumber(r.bestDepth)) out.bestDepth = clampInt(r.bestDepth, 0, 1_000_000);
  if (isFiniteNumber(r.totalRuns)) out.totalRuns = clampInt(r.totalRuns, 0, 1_000_000_000);
  if (typeof r.musicEnabled === 'boolean') out.musicEnabled = r.musicEnabled;
  if (typeof r.sfxEnabled === 'boolean') out.sfxEnabled = r.sfxEnabled;
  if (typeof r.hapticsEnabled === 'boolean') out.hapticsEnabled = r.hapticsEnabled;
  if (typeof r.tutorialDone === 'boolean') out.tutorialDone = r.tutorialDone;
  if (r.graphicsQuality === 'low' || r.graphicsQuality === 'high') {
    out.graphicsQuality = r.graphicsQuality;
  }

  // Cosmetics: every stored id must exist in the catalog; free defaults are
  // always owned; equipped must be owned — otherwise fall back to defaults.
  const kinds: CosmeticKind[] = ['skin', 'scheme', 'trail'];
  const unlockedRaw =
    typeof r.unlocked === 'object' && r.unlocked !== null
      ? (r.unlocked as Record<string, unknown>)
      : {};
  const equippedRaw =
    typeof r.equipped === 'object' && r.equipped !== null
      ? (r.equipped as Record<string, unknown>)
      : {};
  for (const kind of kinds) {
    const valid = new Set<string>(catalogIds[kind]);
    const list = Array.isArray(unlockedRaw[kind]) ? (unlockedRaw[kind] as unknown[]) : [];
    const owned = new Set<string>([FREE_DEFAULTS[kind]]);
    for (const id of list) {
      if (typeof id === 'string' && valid.has(id)) owned.add(id);
    }
    out.unlocked[kind] = [...owned];
    const eq = equippedRaw[kind];
    out.equipped[kind] =
      typeof eq === 'string' && owned.has(eq) ? eq : FREE_DEFAULTS[kind];
  }

  // Feature toggles: only known ids, only booleans — anything else keeps
  // its default. Unknown keys in the blob are dropped entirely.
  if (typeof r.features === 'object' && r.features !== null) {
    const f = r.features as Record<string, unknown>;
    for (const id of featureIds) {
      if (typeof f[id] === 'boolean') out.features[id] = f[id];
    }
  }

  if (typeof r.upgrades === 'object' && r.upgrades !== null) {
    const u = r.upgrades as Record<string, unknown>;
    for (const def of upgradeDefs) {
      const v = u[def.id];
      if (isFiniteNumber(v)) out.upgrades[def.id] = clampInt(v, 0, def.maxLevel);
    }
  }
  return out;
};

export const loadProgress = async (): Promise<Progress> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return sanitizeProgress(null); // deep-cloned defaults
    const envelope = JSON.parse(raw) as Partial<Envelope>;
    if (envelope.v !== SCHEMA_VERSION || typeof envelope.data !== 'object') {
      // Future: run migrations keyed on envelope.v. For v1, fall back safely.
      return sanitizeProgress(envelope.data);
    }
    const expected = fnv1a(JSON.stringify(envelope.data));
    if (envelope.checksum !== expected) {
      if (__DEV__) console.warn('[persistence] checksum mismatch — sanitizing save');
    }
    return sanitizeProgress(envelope.data);
  } catch (err) {
    if (__DEV__) console.warn('[persistence] load failed, using defaults', err);
    return sanitizeProgress(null); // deep-cloned defaults
  }
};

export const saveProgress = async (progress: Progress): Promise<void> => {
  try {
    const data = sanitizeProgress(progress); // never persist unvetted shapes
    const envelope: Envelope = {
      v: SCHEMA_VERSION,
      checksum: fnv1a(JSON.stringify(data)),
      data,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (err) {
    if (__DEV__) console.warn('[persistence] save failed', err);
  }
};
