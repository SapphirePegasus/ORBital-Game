jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  catalogIds,
  colorSchemes,
  cosmeticCost,
  FREE_DEFAULTS,
  rocketSkins,
  trailStyles,
} from '../src/config/cosmetics';
import { defaultProgress, sanitizeProgress } from '../src/state/persistence';
import { progressActions, progressStore } from '../src/state/progressStore';

describe('cosmetics catalog invariants', () => {
  test('ids are unique within each kind', () => {
    for (const ids of [catalogIds.skin, catalogIds.scheme, catalogIds.trail]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('free defaults exist and cost zero', () => {
    expect(cosmeticCost('skin', FREE_DEFAULTS.skin)).toBe(0);
    expect(cosmeticCost('scheme', FREE_DEFAULTS.scheme)).toBe(0);
    expect(cosmeticCost('trail', FREE_DEFAULTS.trail)).toBe(0);
  });

  test('all costs are non-negative integers', () => {
    for (const def of [...rocketSkins, ...colorSchemes, ...trailStyles]) {
      expect(def.cost).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(def.cost)).toBe(true);
    }
  });

  test('every skin hull is a drawable polygon (≥3 points)', () => {
    for (const skin of rocketSkins) {
      expect(skin.hull.length).toBeGreaterThanOrEqual(3);
      for (const fin of skin.fins ?? []) expect(fin.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('cosmetics persistence validation', () => {
  test('defaults own exactly the free cosmetics', () => {
    const p = sanitizeProgress(null);
    expect(p.unlocked.skin).toEqual([FREE_DEFAULTS.skin]);
    expect(p.equipped).toEqual(FREE_DEFAULTS);
    expect(p.graphicsQuality).toBe('high');
  });

  test('tampered saves cannot own or equip nonexistent cosmetics', () => {
    const p = sanitizeProgress({
      unlocked: { skin: ['hacked-skin', 'dart', 42], scheme: 'not-an-array', trail: ['comet'] },
      equipped: { skin: 'hacked-skin', scheme: 'ember', trail: 'comet' },
    });
    expect(p.unlocked.skin.sort()).toEqual(['dart', FREE_DEFAULTS.skin].sort());
    expect(p.equipped.skin).toBe(FREE_DEFAULTS.skin); // hacked id → default
    expect(p.equipped.scheme).toBe(FREE_DEFAULTS.scheme); // 'ember' valid but NOT owned
    expect(p.equipped.trail).toBe('comet'); // valid AND owned → kept
  });

  test('graphics quality only accepts the two valid values', () => {
    expect(sanitizeProgress({ graphicsQuality: 'ultra' }).graphicsQuality).toBe('high');
    expect(sanitizeProgress({ graphicsQuality: 'low' }).graphicsQuality).toBe('low');
  });
});

describe('cosmetics economy (store actions)', () => {
  beforeEach(() => {
    progressStore.set({
      ...defaultProgress,
      coins: 100,
      unlocked: {
        skin: [FREE_DEFAULTS.skin],
        scheme: [FREE_DEFAULTS.scheme],
        trail: [FREE_DEFAULTS.trail],
      },
      equipped: { ...FREE_DEFAULTS },
      loaded: true,
    });
  });

  test('buying deducts coins exactly once and unlocks', () => {
    expect(progressActions.buyCosmetic('skin', 'dart')).toBe(true); // cost 80
    const s = progressStore.get();
    expect(s.coins).toBe(20);
    expect(s.unlocked.skin).toContain('dart');
    expect(progressActions.buyCosmetic('skin', 'dart')).toBe(false); // re-buy blocked
    expect(progressStore.get().coins).toBe(20);
  });

  test('cannot buy without funds or outside the catalog', () => {
    expect(progressActions.buyCosmetic('skin', 'saucer')).toBe(false); // 200 > 100
    expect(progressActions.buyCosmetic('skin', 'nonexistent')).toBe(false);
    expect(progressStore.get().coins).toBe(100);
  });

  test('equip rejects unowned ids by falling back to the default', () => {
    progressActions.equipCosmetic('scheme', 'gold'); // valid but unowned
    expect(progressStore.get().equipped.scheme).toBe(FREE_DEFAULTS.scheme);
    progressActions.buyCosmetic('scheme', 'ember');
    progressActions.equipCosmetic('scheme', 'ember');
    expect(progressStore.get().equipped.scheme).toBe('ember');
  });
});
