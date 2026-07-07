jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { defaultFeatures, featureDefs, featureIds } from '../src/config/features';
import { defaultProgress, sanitizeProgress } from '../src/state/persistence';
import { featureEnabled, progressActions, progressStore } from '../src/state/progressStore';

describe('feature catalog invariants', () => {
  test('ids are unique and defaults cover every id', () => {
    expect(new Set(featureIds).size).toBe(featureIds.length);
    for (const id of featureIds) {
      expect(typeof defaultFeatures[id]).toBe('boolean');
    }
    expect(Object.keys(defaultFeatures).sort()).toEqual([...featureIds].sort());
  });

  test('every feature has a user-facing name and hint', () => {
    for (const def of featureDefs) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.hint.length).toBeGreaterThan(0);
    }
  });
});

describe('feature persistence sanitization', () => {
  test('valid boolean overrides are kept', () => {
    const out = sanitizeProgress({ features: { upgrades: false, screenShake: false } });
    expect(out.features.upgrades).toBe(false);
    expect(out.features.screenShake).toBe(false);
    expect(out.features.customize).toBe(defaultFeatures.customize);
  });

  test('unknown ids are dropped and non-booleans fall back to defaults', () => {
    const out = sanitizeProgress({
      features: { bogus: true, steering: 'yes', particles: 1, upgrades: null },
    });
    expect(Object.keys(out.features).sort()).toEqual([...featureIds].sort());
    expect(out.features.steering).toBe(defaultFeatures.steering);
    expect(out.features.particles).toBe(defaultFeatures.particles);
    expect(out.features.upgrades).toBe(defaultFeatures.upgrades);
    expect((out.features as Record<string, unknown>).bogus).toBeUndefined();
  });

  test('a hostile features blob can never crash or change shape', () => {
    for (const blob of [null, 42, 'features', [], { features: [] }, { features: 7 }]) {
      const out = sanitizeProgress(blob);
      expect(Object.keys(out.features).sort()).toEqual([...featureIds].sort());
    }
  });

  test('sanitize returns fresh copies — defaults are never aliased', () => {
    const a = sanitizeProgress(null);
    expect(a.features).not.toBe(defaultProgress.features);
    a.features.upgrades = false;
    expect(defaultProgress.features.upgrades).toBe(true);
    expect(sanitizeProgress(null).features.upgrades).toBe(true);
  });
});

describe('feature store actions', () => {
  test('toggleFeature flips exactly one flag', () => {
    // crashReports is deliberately not toggled here: its action lazily loads
    // the Sentry adapter, which has no place in a unit test.
    const before = { ...progressStore.get().features };
    progressActions.toggleFeature('screenShake');
    const after = progressStore.get().features;
    expect(after.screenShake).toBe(!before.screenShake);
    for (const id of featureIds) {
      if (id !== 'screenShake') expect(after[id]).toBe(before[id]);
    }
    expect(featureEnabled('screenShake')).toBe(after.screenShake);
    progressActions.toggleFeature('screenShake'); // restore for other tests
  });
});
