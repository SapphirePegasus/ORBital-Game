# Skin sprites — drop-in art for rockets, trails and planets

Every slot here is **optional**. Anything you don't provide keeps its
procedural rendering (vector rockets, SkSL shader planets). A registered
file that fails to decode is reported and skipped — never a crash.

## How to add art (2 steps)

1. Drop the file in this folder using the exact names below (PNG or WebP,
   transparent background unless noted).
2. Register it in `spriteManifest` in `src/render/imageAssets.ts`:

```ts
export const spriteManifest: Partial<Record<string, number>> = {
  rocket_interceptor: require('../../assets/skins/rocket_interceptor.png'),
  trail_plasma: require('../../assets/skins/trail_plasma.png'),
  planet_planet_0: require('../../assets/skins/planet_planet_0.png'),
};
```

That's it — the registry decodes once at boot; the renderer picks it up
automatically (also in the Customize preview, since it uses the same
resolved cosmetics).

## Rocket sprites — `rocket_<skinId>.png`

| Property | Spec |
|---|---|
| File names | `rocket_interceptor` `rocket_dart` `rocket_hawk` `rocket_saucer` `rocket_retro` (one per catalog skin id) |
| Size | 256×256 (any square power-of-two works) |
| Orientation | **Nose pointing right (+X)** — the renderer rotates to heading |
| Framing | Hull drawn across the middle ~60% of the canvas; it maps onto a 4×4 unit box where the collision radius is 1 unit |
| Colors | Author-colored. Color schemes then affect only flame + trail (documented behavior) |
| Background | Fully transparent |

Adding a **new** skin: add a `RocketSkinDef` in `src/config/cosmetics.ts`
with `sprite: 'rocket_<newId>'` (keep a vector `hull` too — it is the
fallback and the Customize silhouette before art loads).

## Trail sprites — `trail_<trailId>.png`

| Property | Spec |
|---|---|
| File names | `trail_classic` `trail_comet` `trail_plasma` `trail_embers` |
| Size | 128×128 |
| Content | A single soft, centered particle (radial glow, spark, petal…) — it is stamped once per trail point, fading and shrinking with age |
| Background | Fully transparent |

Enable per style by setting `sprite: 'trail_<id>'` on the `TrailStyleDef`.

## Planet sprites — `planet_<kind>_<variant>.png`

| Property | Spec |
|---|---|
| Kinds | `planet` `deadPlanet` `gasGiant` `star` `blackHole` `supernova` |
| Variants | `0`–`3` per kind (`planet_gasGiant_0` … `planet_gasGiant_3`). Bodies pick `visualSeed % 4`, falling back to variant `0`, then to procedural |
| Size | 1024×1024 (512 fine for small kinds) |
| Framing | The disc **fills the full image** edge-to-edge; corners are cropped by the circular clip (art is overscanned ×√2 so rotation never shows a corner) |
| Rotation | Applied by the renderer (per-kind speed) — bake no motion in |
| Atmosphere | The renderer overlays fresnel rim lighting per kind — don't bake rim glow in, it would double up |
| Background | Opaque disc; corners can be anything (clipped) |

## Backgrounds

Nebula parallax layers live separately in `assets/backgrounds/` — see the
README there (`nebula_g{0-4}_l{0-2}`, 512×1024, seamless vertical tiling).
