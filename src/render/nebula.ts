/**
 * Nebula background pipeline (the No-Man's-Sky-style sky).
 *
 * Three-tier hybrid, in priority order per layer:
 *   1. USER IMAGE ASSET — if a file is registered in `backgroundManifest`
 *      (see assets/backgrounds/README.md for the exact files to drop in).
 *   2. PROCEDURAL BAKE — the nebula RuntimeEffect rendered ONCE into an
 *      offscreen surface and cached as a texture. Full shader quality at
 *      per-frame cost of a single image blit.
 *   3. NOTHING — until a bake finishes (or if Surface/shader support is
 *      missing), the existing tint + starfield stands alone. Backgrounds are
 *      an enhancement, never a dependency.
 *
 * Baking is spread one layer per frame through `pump()` (called by the game
 * loop) so a galaxy transition never hitches. The cache keeps only the
 * neighborhood of the current galaxy; evicted textures are disposed.
 */
import { Asset } from 'expo-asset';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import { Rng } from '../core/rng';
import { reportError } from '../observability/errorReporter';
import { effects, hexToRgb01 } from './shaders';

/** Baked texture size. Height doubled for seamless vertical scroll wrap. */
export const NEBULA_TEX_W = 512;
export const NEBULA_TEX_H = 1024;
/** Parallax depth per layer (far → near). Layer count derives from this. */
export const NEBULA_LAYERS: readonly { parallax: number; density: number; scale: number; alpha: number }[] = [
  { parallax: 0.06, density: 0.85, scale: 2.2, alpha: 0.55 },
  { parallax: 0.14, density: 0.6, scale: 3.4, alpha: 0.45 },
  { parallax: 0.26, density: 0.4, scale: 5.0, alpha: 0.4 },
];

/** Curated nebula palettes cycled per galaxy (pairs: colorA, colorB). */
export const NEBULA_PALETTES: readonly (readonly [string, string])[] = [
  ['#1B2A5E', '#7A3FA0'], // indigo → violet
  ['#5E1B3C', '#C0533F'], // wine → ember
  ['#0F3D4A', '#3FA08C'], // deep teal → jade
  ['#3A1B5E', '#A03F7C'], // violet → magenta
  ['#123A2A', '#3F7CA0'], // forest → steel blue
];

/**
 * USER ASSET SLOTS — drop PNG/WebP files into assets/backgrounds/ and
 * register them here (see the README in that folder for specs). Key format:
 * `g{galaxyPaletteIndex}_l{layerIndex}`. Unregistered slots bake procedurally.
 *
 * Example after adding art:
 *   'g0_l0': require('../../assets/backgrounds/nebula_g0_l0.png'),
 */
export const backgroundManifest: Partial<Record<string, number>> = {};

interface Layer {
  image: SkImage;
  parallax: number;
  alpha: number;
  /** True when sourced from a user asset (drawn opaque-ish, no tint mix). */
  isAsset: boolean;
}

interface BakeJob {
  galaxy: number;
  layerIndex: number;
}

const bakePaint = Skia.Paint();

export class NebulaCache {
  private layersByGalaxy = new Map<number, (Layer | null)[]>();
  private queue: BakeJob[] = [];
  private assetLoads = new Set<string>();

  /** Ensure a galaxy's layers exist or are queued. Cheap; call every frame. */
  ensure(galaxy: number): void {
    for (const g of [galaxy, galaxy + 1]) {
      if (g < 0 || this.layersByGalaxy.has(g)) continue;
      this.layersByGalaxy.set(g, NEBULA_LAYERS.map(() => null));
      for (let i = 0; i < NEBULA_LAYERS.length; i++) {
        this.queue.push({ galaxy: g, layerIndex: i });
      }
    }
    this.evictFar(galaxy);
  }

  /** Process at most one bake/asset job. Call once per frame from the loop. */
  pump(): void {
    const job = this.queue.shift();
    if (!job) return;
    const slots = this.layersByGalaxy.get(job.galaxy);
    if (!slots) return;

    const paletteIndex = job.galaxy % NEBULA_PALETTES.length;
    const assetKey = `g${paletteIndex}_l${job.layerIndex}`;
    const assetModule = backgroundManifest[assetKey];
    if (assetModule !== undefined) {
      this.loadAsset(assetKey, assetModule, job);
      return;
    }
    slots[job.layerIndex] = this.bake(job.galaxy, job.layerIndex);
  }

  layers(galaxy: number): readonly (Layer | null)[] {
    return this.layersByGalaxy.get(galaxy) ?? [];
  }

  // ------------------------------------------------------------------ bake

  private bake(galaxy: number, layerIndex: number): Layer | null {
    const spec = NEBULA_LAYERS[layerIndex];
    if (!spec || !effects.nebula) return null;
    try {
      const surface =
        Skia.Surface.MakeOffscreen(NEBULA_TEX_W, NEBULA_TEX_H) ??
        Skia.Surface.Make(NEBULA_TEX_W, NEBULA_TEX_H);
      if (!surface) return null;

      const paletteIndex = galaxy % NEBULA_PALETTES.length;
      const pal = NEBULA_PALETTES[paletteIndex] ?? NEBULA_PALETTES[0]!;
      const seed = new Rng((galaxy + 1) * 7919 + layerIndex * 104729).range(0, 100);
      // Uniform order mirrors NEBULA_SRC: size(2), seed, colA(3), colB(3), density, scale.
      const shader = effects.nebula.makeShader([
        NEBULA_TEX_W,
        NEBULA_TEX_H,
        seed,
        ...hexToRgb01(pal[0]),
        ...hexToRgb01(pal[1]),
        spec.density,
        spec.scale,
      ]);
      bakePaint.setShader(shader);
      const canvas = surface.getCanvas();
      canvas.drawRect(Skia.XYWHRect(0, 0, NEBULA_TEX_W, NEBULA_TEX_H), bakePaint);
      const snapshot = surface.makeImageSnapshot();
      // Cross-context safety: GPU-backed snapshots must be detached to raster
      // before use on another canvas.
      const image = snapshot.makeNonTextureImage() ?? snapshot;
      return { image, parallax: spec.parallax, alpha: spec.alpha, isAsset: false };
    } catch (err) {
      reportError(err, { where: 'nebula-bake', galaxy, layerIndex });
      return null;
    }
  }

  // ----------------------------------------------------------- user assets

  private loadAsset(key: string, moduleId: number, job: BakeJob): void {
    if (this.assetLoads.has(key)) return;
    this.assetLoads.add(key);
    void (async () => {
      try {
        const asset = Asset.fromModule(moduleId);
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        const data = await Skia.Data.fromURI(uri);
        const image = Skia.Image.MakeImageFromEncoded(data);
        const spec = NEBULA_LAYERS[job.layerIndex];
        const slots = this.layersByGalaxy.get(job.galaxy);
        if (image && spec && slots) {
          slots[job.layerIndex] = {
            image,
            parallax: spec.parallax,
            alpha: 1,
            isAsset: true,
          };
        } else if (slots && spec) {
          slots[job.layerIndex] = this.bake(job.galaxy, job.layerIndex); // fallback
        }
      } catch (err) {
        reportError(err, { where: 'nebula-asset', key });
        const slots = this.layersByGalaxy.get(job.galaxy);
        if (slots) slots[job.layerIndex] = this.bake(job.galaxy, job.layerIndex);
      } finally {
        this.assetLoads.delete(key);
      }
    })();
  }

  // --------------------------------------------------------------- cleanup

  private evictFar(current: number): void {
    for (const [g, slots] of this.layersByGalaxy) {
      if (Math.abs(g - current) <= 1) continue;
      for (const layer of slots) layer?.image.dispose();
      this.layersByGalaxy.delete(g);
    }
    this.queue = this.queue.filter((j) => Math.abs(j.galaxy - current) <= 1);
  }

  dispose(): void {
    for (const slots of this.layersByGalaxy.values()) {
      for (const layer of slots) layer?.image.dispose();
    }
    this.layersByGalaxy.clear();
    this.queue = [];
  }
}

/** Module singleton — one background cache for the app lifetime. */
export const nebulaCache = new NebulaCache();
