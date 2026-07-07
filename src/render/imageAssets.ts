/**
 * Sprite asset registry — optional PNG art for rockets, trails and planets.
 * Same three-tier philosophy as the nebula pipeline (nebula.ts):
 *
 *   1. USER IMAGE ASSET — a file registered in `spriteManifest` below
 *      (see assets/skins/README.md for exact names, sizes and orientation).
 *   2. PROCEDURAL — the existing vector/shader rendering. Sprites are an
 *      enhancement, never a dependency: an unregistered or failed sprite
 *      simply renders the procedural version.
 *
 * All decoding happens once at boot (`loadSprites()`, guarded — a bad file
 * can never crash the game). Lookups are a Map read; src rects are cached at
 * decode time so the render hot path allocates nothing.
 *
 * Key conventions (validated by __tests__/imageAssets.test.ts):
 *   rocket_<skinId>          e.g. rocket_interceptor  (256×256, nose → +X)
 *   trail_<trailId>          e.g. trail_plasma        (128×128 soft particle)
 *   planet_<kind>_<variant>  e.g. planet_planet_0     (1024×1024, disc fills image)
 */
import { Asset } from 'expo-asset';
import { Skia, type SkImage, type SkRect } from '@shopify/react-native-skia';
import { reportError } from '../observability/errorReporter';

/**
 * USER ASSET SLOTS — drop PNG/WebP files into assets/skins/ and register
 * them here. Unregistered keys fall back to procedural rendering.
 *
 * Example after adding art:
 *   rocket_interceptor: require('../../assets/skins/rocket_interceptor.png'),
 *   trail_plasma: require('../../assets/skins/trail_plasma.png'),
 *   planet_planet_0: require('../../assets/skins/planet_planet_0.png'),
 */
export const spriteManifest: Partial<Record<string, number>> = {};

/** Key naming contract — kept in lockstep with the README and tests. */
export const SPRITE_KEY_PATTERN = /^(rocket|trail)_[a-z][a-z0-9-]*$|^planet_[a-zA-Z]+_[0-3]$/;

/** Max sprite variants per planet kind (planet_<kind>_0 … _3). */
export const PLANET_SPRITE_VARIANTS = 4;

interface SpriteEntry {
  image: SkImage;
  /** Full-image source rect, cached so the hot path never allocates. */
  src: SkRect;
}

const loadedSprites = new Map<string, SpriteEntry>();
let loadStarted = false;

/**
 * Decode every registered sprite once. Failures are reported and skipped —
 * that slot just keeps its procedural fallback.
 */
export const loadSprites = async (): Promise<void> => {
  if (loadStarted) return;
  loadStarted = true;
  const keys = Object.keys(spriteManifest);
  await Promise.all(
    keys.map(async (key) => {
      const moduleId = spriteManifest[key];
      if (moduleId === undefined) return;
      try {
        const asset = Asset.fromModule(moduleId);
        await asset.downloadAsync();
        const data = await Skia.Data.fromURI(asset.localUri ?? asset.uri);
        const image = Skia.Image.MakeImageFromEncoded(data);
        if (image) {
          loadedSprites.set(key, {
            image,
            src: Skia.XYWHRect(0, 0, image.width(), image.height()),
          });
        }
      } catch (err) {
        reportError(err, { where: 'sprite-load', key });
      }
    }),
  );
};

/** Registry lookup — null until loaded (or when the slot has no art). */
export const getSprite = (key: string): SpriteEntry | null => loadedSprites.get(key) ?? null;

/**
 * Pick the sprite for a planet, deterministic per body. Tries the seed's
 * variant first, then variant 0, then gives up (procedural fallback).
 */
export const getPlanetSprite = (kind: string, visualSeed: number): SpriteEntry | null =>
  getSprite(`planet_${kind}_${visualSeed % PLANET_SPRITE_VARIANTS}`) ??
  getSprite(`planet_${kind}_0`);

/** Test seam: inject a decoded entry without touching disk. */
export const __injectSpriteForTest = (key: string, entry: SpriteEntry | null): void => {
  if (entry) loadedSprites.set(key, entry);
  else loadedSprites.delete(key);
};
