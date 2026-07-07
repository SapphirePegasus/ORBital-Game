/**
 * Sprite registry invariants. Skia and expo-asset are mocked: these tests
 * exercise the pure contract (key conventions, catalog wiring, variant
 * fallback) — decoding is guarded runtime behavior, not unit-testable logic.
 */
jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    Data: { fromURI: jest.fn() },
    Image: { MakeImageFromEncoded: jest.fn() },
  },
}));
jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn() } }));

import { rocketSkins, trailStyles } from '../src/config/cosmetics';
import {
  __injectSpriteForTest,
  getPlanetSprite,
  getSprite,
  PLANET_SPRITE_VARIANTS,
  SPRITE_KEY_PATTERN,
  spriteManifest,
} from '../src/render/imageAssets';

const fakeEntry = { image: {} as never, src: {} as never };

describe('sprite key conventions', () => {
  test('every registered manifest key follows the naming contract', () => {
    for (const key of Object.keys(spriteManifest)) {
      expect(key).toMatch(SPRITE_KEY_PATTERN);
    }
  });

  test('catalog sprite slots, when set, use the canonical key for their id', () => {
    for (const skin of rocketSkins) {
      if (skin.sprite !== undefined) expect(skin.sprite).toBe(`rocket_${skin.id}`);
    }
    for (const trail of trailStyles) {
      if (trail.sprite !== undefined) expect(trail.sprite).toBe(`trail_${trail.id}`);
    }
  });

  test('the pattern rejects malformed keys', () => {
    for (const bad of ['planet_planet_9', 'rocket_', 'trail_Foo', 'weird', 'planet_star']) {
      expect(bad).not.toMatch(SPRITE_KEY_PATTERN);
    }
  });
});

describe('planet sprite variant fallback', () => {
  afterEach(() => {
    for (let v = 0; v < PLANET_SPRITE_VARIANTS; v++) {
      __injectSpriteForTest(`planet_planet_${v}`, null);
    }
  });

  test('unregistered kinds resolve to null (procedural fallback)', () => {
    expect(getPlanetSprite('planet', 5)).toBeNull();
    expect(getSprite('rocket_interceptor')).toBeNull();
  });

  test('seed selects its own variant when present', () => {
    __injectSpriteForTest('planet_planet_1', fakeEntry);
    expect(getPlanetSprite('planet', 1)).toBe(fakeEntry);
    expect(getPlanetSprite('planet', 1 + PLANET_SPRITE_VARIANTS)).toBe(fakeEntry);
  });

  test('missing variant falls back to variant 0, then to null', () => {
    expect(getPlanetSprite('planet', 2)).toBeNull();
    __injectSpriteForTest('planet_planet_0', fakeEntry);
    expect(getPlanetSprite('planet', 2)).toBe(fakeEntry); // 2 missing → 0
    __injectSpriteForTest('planet_planet_2', { ...fakeEntry });
    expect(getPlanetSprite('planet', 2)).not.toBe(fakeEntry); // own variant wins
  });
});
