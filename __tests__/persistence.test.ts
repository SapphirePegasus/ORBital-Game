jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  defaultProgress,
  fnv1a,
  loadProgress,
  sanitizeProgress,
  saveProgress,
} from '../src/state/persistence';

describe('persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('fnv1a is stable and hex-shaped', () => {
    expect(fnv1a('space-hopper')).toBe(fnv1a('space-hopper'));
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
    expect(fnv1a('{}')).toMatch(/^[0-9a-f]{8}$/);
  });

  test('sanitize rejects garbage shapes without throwing', () => {
    expect(sanitizeProgress(null)).toEqual(defaultProgress);
    expect(sanitizeProgress('hax')).toEqual(defaultProgress);
    expect(sanitizeProgress(42)).toEqual(defaultProgress);
    expect(sanitizeProgress([])).toEqual(defaultProgress);
  });

  test('sanitize clamps hostile numeric values', () => {
    const evil = {
      coins: -999,
      bestScore: Number.POSITIVE_INFINITY,
      bestDepth: NaN,
      totalRuns: 1e18,
      upgrades: { chargeControl: 999, boosters: -5, bogusField: 3 },
      musicEnabled: 'yes', // wrong type → default
    };
    const clean = sanitizeProgress(evil);
    expect(clean.coins).toBe(0);
    expect(clean.bestScore).toBe(0); // Infinity is not finite → default
    expect(clean.bestDepth).toBe(0);
    expect(clean.totalRuns).toBe(1_000_000_000); // clamped to ceiling
    expect(clean.upgrades.chargeControl).toBe(5); // clamped to maxLevel
    expect(clean.upgrades.boosters).toBe(0);
    expect('bogusField' in clean.upgrades).toBe(false);
    expect(clean.musicEnabled).toBe(true);
  });

  test('round-trips a valid save', async () => {
    const progress = {
      ...defaultProgress,
      coins: 123,
      bestScore: 456,
      upgrades: { ...defaultProgress.upgrades, magnet: 2 },
    };
    await saveProgress(progress);
    const loaded = await loadProgress();
    expect(loaded.coins).toBe(123);
    expect(loaded.bestScore).toBe(456);
    expect(loaded.upgrades.magnet).toBe(2);
  });

  test('corrupted storage degrades to defaults instead of crashing', async () => {
    await AsyncStorage.setItem('space-hopper/progress', '{not json!!');
    const loaded = await loadProgress();
    expect(loaded).toEqual(defaultProgress);
  });

  test('tampered payloads are still sanitized on load', async () => {
    await AsyncStorage.setItem(
      'space-hopper/progress',
      JSON.stringify({ v: 1, checksum: 'ffffffff', data: { coins: 1e15, upgrades: { shield: 99 } } }),
    );
    const loaded = await loadProgress();
    expect(loaded.coins).toBe(1_000_000_000);
    expect(loaded.upgrades.shield).toBe(3); // clamped to shield maxLevel
  });
});
