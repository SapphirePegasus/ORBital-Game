# Background image assets — drop-in specification

The nebula background is a **3-tier hybrid**: any layer you provide as an
image is used verbatim; anything you don't provide is procedurally baked by
the in-app shader. You can ship v1 with zero files here and add art gradually.

## The layer model

Each galaxy uses one of **5 palettes** (cycling: galaxy 0→palette 0, galaxy
5→palette 0 again, …) and **3 parallax layers**:

| Layer | Role                     | Parallax | Suggested content                          |
|-------|--------------------------|----------|--------------------------------------------|
| `l0`  | Far backdrop             | 0.06     | Dense soft nebula wash, dim, low contrast  |
| `l1`  | Mid clouds               | 0.14     | Distinct cloud structures, medium contrast |
| `l2`  | Near wisps               | 0.26     | Sparse bright wisps / dust lanes           |

## Files to create (15 total for full coverage)

```
assets/backgrounds/
  nebula_g0_l0.png   nebula_g0_l1.png   nebula_g0_l2.png   # indigo → violet
  nebula_g1_l0.png   nebula_g1_l1.png   nebula_g1_l2.png   # wine → ember
  nebula_g2_l0.png   nebula_g2_l1.png   nebula_g2_l2.png   # deep teal → jade
  nebula_g3_l0.png   nebula_g3_l1.png   nebula_g3_l2.png   # violet → magenta
  nebula_g4_l0.png   nebula_g4_l1.png   nebula_g4_l2.png   # forest → steel blue
```

Partial sets are fine — e.g. provide only the three `g0_*` files, or only the
`*_l0` backdrops; every missing slot bakes procedurally.

## Technical specs

- **Size:** 512 × 1024 px (portrait, 1:2). Larger works (1024 × 2048 max
  recommended) but mind the APK: 15 full-res layers add up — prefer **WebP**
  (lossy, ~80 quality) over PNG for photographic nebulae.
- **Format:** PNG or WebP. `l1`/`l2` should have a **transparent background**
  (they composite over `l0`); `l0` may be opaque.
- **Seamless vertical tiling is REQUIRED** — the layer scrolls and wraps
  vertically. The top edge must blend perfectly into the bottom edge.
  (Horizontal tiling is not required; the game scrolls vertically.)
- Keep overall brightness low (the game reads on near-black); the starfield
  and gameplay draw on top.

## Registering a file (one line each)

Open `src/render/nebula.ts` and add the file to `backgroundManifest`:

```ts
export const backgroundManifest: Partial<Record<string, number>> = {
  g0_l0: require('../../assets/backgrounds/nebula_g0_l0.webp'),
  g0_l1: require('../../assets/backgrounds/nebula_g0_l1.webp'),
  // …
};
```

Key format is `g{paletteIndex}_l{layerIndex}` (`g0`–`g4`, `l0`–`l2`).
Unregistered keys keep baking procedurally — no other change needed.

## Tuning

Layer parallax/alpha/density live in `NEBULA_LAYERS`, palettes in
`NEBULA_PALETTES` (both in `src/render/nebula.ts`). Adding a 6th palette or a
4th layer is data-only.
