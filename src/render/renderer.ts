/**
 * Immediate-mode scene renderer. Called once per frame by GameCanvas to draw
 * the whole world into an SkPicture (ADR-001). Paints, shaders, paths and
 * fonts are created once at module load and reused — the per-frame
 * allocation budget here is ~zero.
 *
 * Everything is drawn procedurally: the minimal-majestic look needs no image
 * assets, ships tiny, and scales crisply on any DPI.
 */
import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  TileMode,
  matchFont,
  vec,
  type SkCanvas,
  type SkPaint,
  type SkShader,
} from '@shopify/react-native-skia';
import { Platform } from 'react-native';
import { gameConfig } from '../config/gameConfig';
import { palette } from '../config/palette';
import { Rng } from '../core/rng';
import type { BodyKind, CelestialBody } from '../core/types';
import type { GameEngine } from '../engine/engine';
import { TWO_PI } from '../core/math';
import type { ParticleSystem, Trail } from './particles';
import { resolveCosmetics, trailPaintFor, type ResolvedCosmetics } from './cosmeticsRuntime';
import { FREE_DEFAULTS } from '../config/cosmetics';
import { nebulaCache } from './nebula';
import { getPlanetSprite, getSprite } from './imageAssets';
import { effects as shaderEffects, hexToRgb01, makeBodyShader } from './shaders';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Effect {
  kind: 'ring' | 'burst';
  x: number;
  y: number;
  age: number;
  life: number;
  color: string;
  maxRadius: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  age: number;
  life: number;
  color: string;
}

export interface SceneContext {
  engine: GameEngine;
  cam: Camera;
  width: number;
  height: number;
  effects: Effect[];
  popups: Popup[];
  particles: ParticleSystem;
  trail: Trail;
  shakeX: number;
  shakeY: number;
  quality: 'high' | 'low';
}

const mkPaint = (color: string, style: PaintStyle, strokeWidth = 1): SkPaint => {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setStyle(style);
  if (style === PaintStyle.Stroke) p.setStrokeWidth(strokeWidth);
  return p;
};

// ---------------------------------------------------------- reusable paints
const paints = {
  star: mkPaint(palette.star, PaintStyle.Fill),
  bodyFill: mkPaint('#ffffff', PaintStyle.Fill), // color/shader set per body
  bodyDetail: mkPaint('rgba(0,0,0,0.22)', PaintStyle.Fill),
  bandStroke: mkPaint('rgba(0,0,0,0.18)', PaintStyle.Stroke, 4),
  orbitRing: mkPaint(palette.orbitRing, PaintStyle.Stroke, 1.5),
  captureRing: mkPaint('rgba(232,236,244,0.07)', PaintStyle.Stroke, 1),
  trajectory: mkPaint(palette.trajectory, PaintStyle.Fill),
  rocket: mkPaint(palette.text, PaintStyle.Fill),
  flame: mkPaint(palette.accent, PaintStyle.Fill),
  shield: mkPaint(palette.shield, PaintStyle.Stroke, 1.5),
  coin: mkPaint(palette.accent, PaintStyle.Fill),
  coinRing: mkPaint(palette.accentDim, PaintStyle.Stroke, 1.5),
  asteroid: mkPaint('#8A8F9E', PaintStyle.Fill),
  glow: (() => {
    const p = mkPaint(palette.bodies.star, PaintStyle.Fill);
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 14, true));
    return p;
  })(),
  corona: (() => {
    const p = mkPaint('rgba(255,217,138,0.14)', PaintStyle.Fill);
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 34, true));
    return p;
  })(),
  flare: (() => {
    const p = mkPaint('rgba(255,180,90,0.32)', PaintStyle.Fill);
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 22, true));
    return p;
  })(),
  danger: mkPaint(palette.danger, PaintStyle.Stroke, 1.5),
  accretion: mkPaint(palette.accent, PaintStyle.Stroke, 2.5),
  photonRing: mkPaint('rgba(255,214,150,0.9)', PaintStyle.Stroke, 1.5),
  novaCore: (() => {
    const p = mkPaint('rgba(255,246,230,0.95)', PaintStyle.Fill);
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 8, true));
    return p;
  })(),
  decayArc: mkPaint(palette.accent, PaintStyle.Stroke, 2.5),
  effectRing: mkPaint('#ffffff', PaintStyle.Stroke, 2),
  particle: mkPaint(palette.accent, PaintStyle.Fill),
  trail: mkPaint(palette.accentDim, PaintStyle.Fill),
  popup: mkPaint(palette.text, PaintStyle.Fill),
  tint: mkPaint(palette.galaxyTints[0] ?? '#0A0C1C', PaintStyle.Fill),
};
paints.captureRing.setPathEffect(Skia.PathEffect.MakeDash([4, 9], 0));

const popupFont = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
  fontSize: gameConfig.popups.fontSize,
  fontWeight: '500',
});

const particleTints = [palette.accent, palette.danger, palette.text] as const;

// ---------------------------------------------- unit-radius body shaders
// One radial gradient per kind, built at radius 1 around the origin; bodies
// are drawn via translate+scale, so a single shader lights every instance
// (soft key light upper-left, shaded terminator lower-right).
const unitShade = (base: string, light: string, dark: string): SkShader =>
  Skia.Shader.MakeRadialGradient(
    vec(-0.35, -0.35),
    1.6,
    [Skia.Color(light), Skia.Color(base), Skia.Color(dark)],
    [0, 0.45, 1],
    TileMode.Clamp,
  );

const bodyShaders: Partial<Record<BodyKind, SkShader>> = {
  planet: unitShade(palette.bodies.planet, '#A8D4C9', '#3E5F58'),
  deadPlanet: unitShade(palette.bodies.deadPlanet, '#9BA0AF', '#3A3D47'),
  gasGiant: unitShade(palette.bodies.gasGiant, '#DFB3E6', '#5E3F66'),
  star: unitShade(palette.bodies.star, '#FFF2CF', '#E2A94F'),
  supernova: unitShade(palette.bodies.supernova, '#FFD3BE', '#C4552F'),
};

// Runtime-shader tier: per-kind effect + palette + rotation speed. Colors are
// packed to rgb01 once at module load; the only per-frame cost is one small
// uniform array per *visible* shader body (bounded, ~6-10), which is the
// unavoidable Skia contract for animated RuntimeEffects.
const shaderTier: Partial<
  Record<
    BodyKind,
    {
      effect: (typeof shaderEffects)['rocky'];
      base: readonly [number, number, number];
      dark: readonly [number, number, number];
      rim: readonly [number, number, number];
      rotSpeed: number;
    }
  >
> = {
  planet: {
    effect: shaderEffects.rocky,
    base: hexToRgb01('#8FC7B8'),
    dark: hexToRgb01('#2E4A44'),
    rim: hexToRgb01('#6FD8FF'),
    rotSpeed: 0.06,
  },
  deadPlanet: {
    effect: shaderEffects.rocky,
    base: hexToRgb01('#9BA0AF'),
    dark: hexToRgb01('#33363F'),
    rim: hexToRgb01('#5A6070'),
    rotSpeed: 0.03,
  },
  gasGiant: {
    effect: shaderEffects.gas,
    base: hexToRgb01('#D9A8E3'),
    dark: hexToRgb01('#4E3159'),
    rim: hexToRgb01('#FF9ED2'),
    rotSpeed: 0.1,
  },
  star: {
    effect: shaderEffects.star,
    base: hexToRgb01('#FFD98A'),
    dark: hexToRgb01('#C46A2B'),
    rim: hexToRgb01('#FFF2CF'),
    rotSpeed: 0.15,
  },
  supernova: {
    effect: shaderEffects.star,
    base: hexToRgb01('#FF9E7A'),
    dark: hexToRgb01('#8C2F1F'),
    rim: hexToRgb01('#FFE0C4'),
    rotSpeed: 0.25,
  },
};

// ------------------------------------------------------------- sprite tier
// Cached unit-space destination rects + reusable paints so sprite drawing
// stays allocation-free per frame (transforms position them, not new rects).

const unitCirclePath = Skia.PathBuilder.Make().addCircle(0, 0, 1).build();

/** Rocket sprite maps onto a 4×4 unit box centered on the hull origin. */
const ROCKET_SPRITE_DST = Skia.XYWHRect(-2, -2, 4, 4);
/** Trail stamps and planet discs map onto a 2×2 unit box (radius 1). */
const UNIT_SPRITE_DST = Skia.XYWHRect(-1, -1, 2, 2);
const spritePaint = mkPaint('#ffffff', PaintStyle.Fill);
const trailStampPaint = mkPaint('#ffffff', PaintStyle.Fill);

/** Per-kind fresnel-style rim overlay for sprite planets (unit radius). */
const spriteRimShaders: Partial<Record<BodyKind, SkShader>> = {};
const spriteRimPaint = mkPaint('#ffffff', PaintStyle.Fill);
const rimShaderFor = (kind: BodyKind): SkShader | null => {
  const cached = spriteRimShaders[kind];
  if (cached) return cached;
  const tier = shaderTier[kind];
  if (!tier) return null;
  const [rr, rg, rb] = tier.rim;
  const rgb = `${Math.round(rr * 255)},${Math.round(rg * 255)},${Math.round(rb * 255)}`;
  const shader = Skia.Shader.MakeRadialGradient(
    vec(0, 0),
    1,
    [
      Skia.Color('rgba(0,0,0,0)'),
      Skia.Color(`rgba(${rgb},0)`),
      Skia.Color(`rgba(${rgb},0.55)`),
    ],
    [0, 0.78, 1],
    TileMode.Clamp,
  );
  spriteRimShaders[kind] = shader;
  return shader;
};

/**
 * Sprite tier for bodies: draw registered planet art (rotating, clipped to
 * the disc) with a cheap gradient rim for the atmosphere. Returns false when
 * no art is registered so the shader/gradient tiers take over.
 */
const drawBodySprite = (
  canvas: SkCanvas,
  kind: BodyKind,
  x: number,
  y: number,
  r: number,
  visualSeed: number,
  elapsed: number,
): boolean => {
  const entry = getPlanetSprite(kind, visualSeed);
  if (!entry) return false;
  const rotSpeed = shaderTier[kind]?.rotSpeed ?? 0.1;
  canvas.save();
  canvas.translate(x, y);
  canvas.scale(r, r);
  canvas.save();
  canvas.clipPath(unitCirclePath, ClipOp.Intersect, true);
  canvas.rotate(((elapsed * rotSpeed + visualSeed) * 180) / Math.PI, 0, 0);
  // Rotation sweeps the square art's corners through the disc: overscan by
  // √2 so the clip circle never shows an empty corner.
  canvas.scale(Math.SQRT2, Math.SQRT2);
  canvas.drawImageRect(entry.image, entry.src, UNIT_SPRITE_DST, spritePaint);
  canvas.restore();
  const rim = rimShaderFor(kind);
  if (rim) {
    spriteRimPaint.setShader(rim);
    canvas.drawCircle(0, 0, 1, spriteRimPaint);
    spriteRimPaint.setShader(null);
  }
  canvas.restore();
  return true;
};

/**
 * Fill a body disc. Tier 1 (quality 'high'): animated RuntimeEffect surface —
 * rotating detail, bands, rim lighting. Tier 2 fallback (quality 'low', or
 * shader compile failure): the static radial-gradient sphere.
 * Returns true when the shader tier drew, so callers can skip vector detail
 * the shader already provides (gas bands, craters).
 */
const drawShadedDisc = (
  canvas: SkCanvas,
  kind: BodyKind,
  x: number,
  y: number,
  r: number,
  visualSeed: number,
  elapsed: number,
  quality: 'high' | 'low',
): boolean => {
  // Tier 0: user sprite art (both quality levels — a texture blit is cheap).
  if (drawBodySprite(canvas, kind, x, y, r, visualSeed, elapsed)) return true;
  if (quality === 'high') {
    const tier = shaderTier[kind];
    if (tier?.effect) {
      const shader = makeBodyShader(
        tier.effect,
        x,
        y,
        r,
        (visualSeed % 97) * 0.73,
        elapsed * tier.rotSpeed + visualSeed,
        tier.base,
        tier.dark,
        tier.rim,
      );
      if (shader) {
        paints.bodyFill.setShader(shader);
        canvas.drawCircle(x, y, r, paints.bodyFill);
        paints.bodyFill.setShader(null);
        return true;
      }
    }
  }
  const shader = bodyShaders[kind];
  canvas.save();
  canvas.translate(x, y);
  canvas.scale(r, r);
  if (shader) paints.bodyFill.setShader(shader);
  canvas.drawCircle(0, 0, 1, paints.bodyFill);
  paints.bodyFill.setShader(null);
  canvas.restore();
  return false;
};

// -------------------------------------------------------------- star layers
interface StarLayer {
  xs: Float32Array;
  ys: Float32Array;
  size: number;
  alpha: number;
  parallax: number;
}

const starLayers: StarLayer[] = gameConfig.starfield.layers.map((layer, li) => {
  const rng = new Rng(0xbeef + li * 101);
  const xs = new Float32Array(layer.count);
  const ys = new Float32Array(layer.count);
  for (let i = 0; i < layer.count; i++) {
    xs[i] = rng.range(0, gameConfig.starfield.tile);
    ys[i] = rng.range(0, gameConfig.starfield.tile);
  }
  return { xs, ys, size: layer.size, alpha: layer.alpha, parallax: layer.parallax };
});

const drawStarfield = (canvas: SkCanvas, ctx: SceneContext): void => {
  const { cam, width, height } = ctx;
  const tile = gameConfig.starfield.tile;
  for (const layer of starLayers) {
    paints.star.setAlphaf(layer.alpha * 0.9);
    const offX = cam.x * layer.parallax;
    const offY = cam.y * layer.parallax;
    const t0x = Math.floor(offX / tile) - 1;
    const t0y = Math.floor(offY / tile) - 1;
    const tilesX = Math.ceil(width / tile) + 2;
    const tilesY = Math.ceil(height / tile) + 2;
    for (let tx = t0x; tx < t0x + tilesX; tx++) {
      for (let ty = t0y; ty < t0y + tilesY; ty++) {
        for (let i = 0; i < layer.xs.length; i++) {
          const sx = tx * tile + (layer.xs[i] ?? 0) - offX;
          const sy = ty * tile + (layer.ys[i] ?? 0) - offY;
          if (sx < -4 || sx > width + 4 || sy < -4 || sy > height + 4) continue;
          canvas.drawCircle(sx, sy, layer.size, paints.star);
        }
      }
    }
  }
};

// -------------------------------------------------------------- body detail

const drawBody = (canvas: SkCanvas, b: CelestialBody, engine: GameEngine, quality: 'high' | 'low'): void => {
  // Faint dashed capture ring — the player's aiming aid.
  if (!b.detonated) {
    canvas.drawCircle(b.x, b.y, b.captureRadius, paints.captureRing);
  }

  switch (b.kind) {
    case 'star': {
      const cycleT = engine.flareCycleT(b);
      const active = engine.isFlareActive(b);
      canvas.drawCircle(b.x, b.y, b.radius * 1.7, paints.corona);
      paints.glow.setColor(Skia.Color(palette.bodies.star));
      canvas.drawCircle(b.x, b.y, b.radius * 1.25, paints.glow);
      drawShadedDisc(canvas, 'star', b.x, b.y, b.radius, b.visualSeed, engine.elapsed, quality);
      const flareR = b.radius * gameConfig.hazards.star.flareRadiusFactor;
      if (active) {
        canvas.drawCircle(b.x, b.y, flareR, paints.flare);
        paints.danger.setAlphaf(0.8);
        canvas.drawCircle(b.x, b.y, flareR, paints.danger);
      } else if (cycleT > 0.82) {
        // pre-flare warning shimmer
        paints.danger.setAlphaf(0.25 + 0.5 * ((cycleT - 0.82) / 0.18));
        canvas.drawCircle(b.x, b.y, flareR, paints.danger);
      }
      paints.danger.setAlphaf(1);
      break;
    }
    case 'blackHole': {
      const horizon = b.radius * (1 + gameConfig.hazards.blackHole.horizonFactor);
      paints.bodyFill.setColor(Skia.Color(palette.bodies.blackHole));
      canvas.drawCircle(b.x, b.y, b.radius, paints.bodyFill);
      // Photon ring: the thin bright circle of lensed light hugging the disc.
      const shimmer = 0.75 + 0.2 * Math.sin(engine.elapsed * 4 + b.visualSeed);
      paints.photonRing.setAlphaf(shimmer);
      canvas.drawCircle(b.x, b.y, b.radius * 1.06, paints.photonRing);
      // Two counter-rotating accretion arcs.
      canvas.save();
      canvas.translate(b.x, b.y);
      canvas.rotate((engine.elapsed * 55) % 360, 0, 0);
      const rect = Skia.XYWHRect(-b.radius * 1.45, -b.radius * 1.45, b.radius * 2.9, b.radius * 2.9);
      paints.accretion.setAlphaf(0.85);
      canvas.drawArc(rect, 0, 250, false, paints.accretion);
      canvas.rotate((-engine.elapsed * 90) % 360, 0, 0);
      const rect2 = Skia.XYWHRect(-b.radius * 1.7, -b.radius * 1.7, b.radius * 3.4, b.radius * 3.4);
      paints.accretion.setAlphaf(0.35);
      canvas.drawArc(rect2, 40, 160, false, paints.accretion);
      canvas.restore();
      paints.danger.setAlphaf(0.55);
      canvas.drawCircle(b.x, b.y, horizon, paints.danger);
      paints.danger.setAlphaf(1);
      break;
    }
    case 'supernova': {
      if (b.detonated) {
        const blast = b.radius * gameConfig.hazards.supernova.blastFactor;
        paints.flare.setColor(Skia.Color('rgba(255,120,90,0.4)'));
        canvas.drawCircle(b.x, b.y, blast, paints.flare);
        paints.flare.setColor(Skia.Color('rgba(255,180,90,0.32)'));
        break;
      }
      const armed = b.novaCountdown >= 0;
      const pulse = armed
        ? 1 + 0.12 * Math.sin(engine.elapsed * (16 - b.novaCountdown))
        : 1 + 0.04 * Math.sin(engine.elapsed * 2);
      paints.glow.setColor(Skia.Color(palette.bodies.supernova));
      canvas.drawCircle(b.x, b.y, b.radius * 1.25 * pulse, paints.glow);
      drawShadedDisc(canvas, 'supernova', b.x, b.y, b.radius * pulse, b.visualSeed, engine.elapsed, quality);
      // White-hot unstable core.
      const coreT = armed ? 1 - b.novaCountdown / gameConfig.hazards.supernova.fuse : 0.12;
      canvas.drawCircle(b.x, b.y, b.radius * (0.22 + 0.3 * coreT) * pulse, paints.novaCore);
      if (armed) {
        const t = b.novaCountdown / gameConfig.hazards.supernova.fuse;
        const rect = Skia.XYWHRect(
          b.x - b.radius * 1.5,
          b.y - b.radius * 1.5,
          b.radius * 3,
          b.radius * 3,
        );
        canvas.drawArc(rect, -90, 360 * t, false, paints.danger);
      }
      break;
    }
    case 'gasGiant': {
      // Atmosphere halo (the drag band).
      const band = b.radius * (1 + gameConfig.physics.gasAtmosphereBand);
      paints.orbitRing.setAlphaf(0.35);
      canvas.drawCircle(b.x, b.y, band, paints.orbitRing);
      paints.orbitRing.setAlphaf(1);
      const shaded = drawShadedDisc(
        canvas, 'gasGiant', b.x, b.y, b.radius, b.visualSeed, engine.elapsed, quality,
      );
      if (shaded) break; // shader already paints bands + storms
      // Latitude bands, offset + weighted per visual seed so giants differ.
      const rng = new Rng(b.visualSeed);
      canvas.save();
      canvas.clipRRect(
        Skia.RRectXY(
          Skia.XYWHRect(b.x - b.radius, b.y - b.radius, b.radius * 2, b.radius * 2),
          b.radius,
          b.radius,
        ),
        ClipOp.Intersect,
        true,
      );
      const bands = rng.int(3, 5);
      for (let i = 0; i < bands; i++) {
        const yOff = rng.range(-0.75, 0.75) * b.radius;
        paints.bandStroke.setStrokeWidth(rng.range(2.5, 6));
        paints.bandStroke.setAlphaf(rng.range(0.1, 0.26));
        canvas.drawLine(b.x - b.radius, b.y + yOff, b.x + b.radius, b.y + yOff, paints.bandStroke);
      }
      paints.bandStroke.setAlphaf(1);
      canvas.restore();
      break;
    }
    default: {
      const shaded = drawShadedDisc(
        canvas, b.kind, b.x, b.y, b.radius, b.visualSeed, engine.elapsed, quality,
      );
      if (shaded) break; // shader surface already includes craters
      // Deterministic craters from the body's visual seed.
      const rng = new Rng(b.visualSeed);
      const craters = b.kind === 'deadPlanet' ? 5 : 3;
      for (let i = 0; i < craters; i++) {
        const a = rng.range(0, TWO_PI);
        const d = rng.range(0.15, 0.62) * b.radius;
        canvas.drawCircle(
          b.x + Math.cos(a) * d,
          b.y + Math.sin(a) * d,
          rng.range(0.08, 0.18) * b.radius,
          paints.bodyDetail,
        );
      }
    }
  }
};

// ---------------------------------------------------------------- cosmetics
let cosmetics: ResolvedCosmetics = resolveCosmetics(
  FREE_DEFAULTS.skin,
  FREE_DEFAULTS.scheme,
  FREE_DEFAULTS.trail,
);

let appliedKey = `${FREE_DEFAULTS.skin}|${FREE_DEFAULTS.scheme}|${FREE_DEFAULTS.trail}`;

/**
 * Swap the equipped cosmetic set. No-ops when unchanged, so subscribing this
 * to the whole progress store (which also changes on coin banking) never
 * re-allocates paths/paints mid-run.
 */
export const applyCosmetics = (skinId: string, schemeId: string, trailId: string): void => {
  const key = `${skinId}|${schemeId}|${trailId}`;
  if (key === appliedKey) return;
  appliedKey = key;
  cosmetics = resolveCosmetics(skinId, schemeId, trailId);
};

// ------------------------------------------------------------------- rocket
// Skia 2.6 deprecated mutable SkPath construction; PathBuilder is the
// supported API (see the official path-migration guide).

const drawRocket = (canvas: SkCanvas, ctx: SceneContext): void => {
  const { engine } = ctx;
  const r = engine.rocket;
  if (!engine.alive) return;

  // Trajectory preview while charging — dotted, honest (stops at the outcome).
  if (r.mode === 'charging' && engine.previewCount > 1) {
    for (let i = 0; i < engine.previewCount; i += 3) {
      const alpha = 1 - i / engine.previewCount;
      paints.trajectory.setAlphaf(0.5 * alpha + 0.08);
      canvas.drawCircle(
        engine.previewBuffer[i * 2] ?? 0,
        engine.previewBuffer[i * 2 + 1] ?? 0,
        1.6,
        paints.trajectory,
      );
    }
  }

  // Current orbit ring + decay arc.
  const body = r.bodyId >= 0 ? engine.world.byId(r.bodyId) : undefined;
  if (body && (r.mode === 'orbiting' || r.mode === 'charging')) {
    canvas.drawCircle(body.x, body.y, r.orbitRadius, paints.orbitRing);
    const remaining = Math.max(0, 1 - r.orbitTime / body.decayTime);
    const rect = Skia.XYWHRect(
      body.x - r.orbitRadius - 7,
      body.y - r.orbitRadius - 7,
      (r.orbitRadius + 7) * 2,
      (r.orbitRadius + 7) * 2,
    );
    paints.decayArc.setColor(
      Skia.Color(remaining < gameConfig.decay.warnAt ? palette.danger : palette.accent),
    );
    paints.decayArc.setAlphaf(0.8);
    canvas.drawArc(rect, -90, 360 * remaining, false, paints.decayArc);
  }

  canvas.save();
  canvas.translate(r.x, r.y);
  canvas.rotate((r.heading * 180) / Math.PI, 0, 0);
  canvas.scale(gameConfig.rocket.radius, gameConfig.rocket.radius); // unit → world
  if (r.mode === 'charging') {
    canvas.save();
    canvas.scale(0.5 + r.chargeT, 0.6 + r.chargeT * 0.5);
    canvas.drawPath(cosmetics.flamePath, cosmetics.flamePaint);
    canvas.restore();
  } else if (r.mode === 'flying') {
    canvas.drawPath(cosmetics.flamePath, cosmetics.flamePaint);
    // Side thruster puff opposite the steer direction.
    if (r.steer !== 0) {
      canvas.save();
      canvas.scale(0.55, 0.55);
      canvas.rotate(r.steer * -70, 0, 0);
      canvas.drawPath(cosmetics.flamePath, cosmetics.flamePaint);
      canvas.restore();
    }
  }
  const rocketSprite = cosmetics.rocketSpriteKey ? getSprite(cosmetics.rocketSpriteKey) : null;
  if (rocketSprite) {
    canvas.drawImageRect(rocketSprite.image, rocketSprite.src, ROCKET_SPRITE_DST, spritePaint);
  } else {
    for (const fin of cosmetics.finPaths) canvas.drawPath(fin, cosmetics.accentPaint);
    canvas.drawPath(cosmetics.hullPath, cosmetics.hullPaint);
  }
  canvas.restore();

  if (r.shields > 0) {
    paints.shield.setAlphaf(0.35 + 0.15 * Math.sin(engine.elapsed * 3));
    canvas.drawCircle(r.x, r.y, gameConfig.rocket.radius * 2.1, paints.shield);
  }
};

// ------------------------------------------------------------------- nebula
const nebulaPaint = mkPaint('#ffffff', PaintStyle.Fill);

/**
 * Parallax nebula layers (vertical wrap — the run climbs, so horizontal
 * scroll is imperceptible and skipping it saves two draws per layer).
 * Baking/loading is pumped one job per frame; missing layers simply don't
 * draw yet.
 */
const drawNebula = (canvas: SkCanvas, ctx: SceneContext, galaxy: number): void => {
  nebulaCache.ensure(galaxy);
  nebulaCache.pump();
  const { width, height, cam } = ctx;
  for (const layer of nebulaCache.layers(galaxy)) {
    if (!layer) continue;
    const img = layer.image;
    const srcRect = Skia.XYWHRect(0, 0, img.width(), img.height());
    const dstH = (width * img.height()) / img.width();
    const scroll = cam.y * layer.parallax;
    let offset = scroll % dstH;
    if (offset < 0) offset += dstH;
    nebulaPaint.setAlphaf(layer.alpha);
    for (let y = -offset; y < height; y += dstH) {
      canvas.drawImageRect(img, srcRect, Skia.XYWHRect(0, y, width, dstH), nebulaPaint);
    }
  }
};

// -------------------------------------------------------------------- trail
const drawTrail = (canvas: SkCanvas, trail: Trail): void => {
  const maxAge = gameConfig.trail.maxAge;
  const mode = cosmetics.trailMode;
  const size = cosmetics.trailSize;
  const stamp = cosmetics.trailSpriteKey ? getSprite(cosmetics.trailSpriteKey) : null;
  let prevX = NaN;
  let prevY = NaN;
  for (let i = 0; i < trail.count; i++) {
    const age = trail.data[i * 3 + 2] ?? Infinity;
    if (age > maxAge) {
      prevX = NaN;
      continue;
    }
    const x = trail.data[i * 3] ?? 0;
    const y = trail.data[i * 3 + 1] ?? 0;
    const t = age / maxAge; // 0 head → 1 tail
    const life = 1 - t;
    // Sprite tier: author-colored soft particle stamped per point (fades and
    // shrinks with age). Transform positions the cached unit rect — no alloc.
    if (stamp) {
      trailStampPaint.setAlphaf(life);
      canvas.save();
      canvas.translate(x, y);
      const sc = size * (0.4 + 0.6 * life);
      canvas.scale(sc, sc);
      canvas.drawImageRect(stamp.image, stamp.src, UNIT_SPRITE_DST, trailStampPaint);
      canvas.restore();
      prevX = x;
      prevY = y;
      continue;
    }
    const paint = trailPaintFor(cosmetics, t);
    switch (mode) {
      case 'comet': {
        if (!Number.isNaN(prevX)) {
          paint.setStrokeWidth(size * life);
          paint.setStyle(PaintStyle.Stroke);
          canvas.drawLine(prevX, prevY, x, y, paint);
          paint.setStyle(PaintStyle.Fill); // ramp paints are shared — restore
        }
        break;
      }
      case 'plasma': {
        cosmetics.trailGlowPaint.setAlphaf(0.5 * life);
        canvas.drawCircle(x, y, size * life, cosmetics.trailGlowPaint);
        canvas.drawCircle(x, y, size * 0.45 * life, paint);
        break;
      }
      case 'embers': {
        if (i % 2 === 0) {
          canvas.drawCircle(x, y, size * life * (0.7 + 0.3 * Math.sin(age * 20 + i)), paint);
        }
        break;
      }
      default:
        canvas.drawCircle(x, y, size * (0.5 + 0.5 * life), paint);
    }
    prevX = x;
    prevY = y;
  }
};

// -------------------------------------------------------------------- scene
export const renderScene = (canvas: SkCanvas, ctx: SceneContext): void => {
  const { engine, cam, width, height, effects, popups, particles, trail } = ctx;

  // Galaxy tint wash (subtle depth-based mood shift over the base background).
  const galaxy = engine.world.galaxyOf(engine.bodiesVisited);
  const tint = palette.galaxyTints[galaxy % palette.galaxyTints.length] ?? palette.space;
  paints.tint.setColor(Skia.Color(tint));
  paints.tint.setAlphaf(0.85);
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paints.tint);

  drawNebula(canvas, ctx, galaxy);
  drawStarfield(canvas, ctx);

  canvas.save();
  canvas.translate(width / 2 + ctx.shakeX, height * gameConfig.camera.anchorY + ctx.shakeY);
  canvas.scale(cam.zoom, cam.zoom);
  canvas.translate(-cam.x, -cam.y);

  for (const b of engine.world.bodies) drawBody(canvas, b, engine, ctx.quality);

  // Flight trail, rendered in the equipped style (all zero-allocation).
  drawTrail(canvas, trail);

  // Particles.
  for (const p of particles.pool) {
    if (!p.active) continue;
    const t = 1 - p.age / p.life;
    paints.particle.setColor(Skia.Color(particleTints[p.tint]));
    paints.particle.setAlphaf(0.8 * t);
    canvas.drawCircle(p.x, p.y, p.size * t, paints.particle);
  }

  // Coins.
  for (const c of engine.coins) {
    if (c.collected) continue;
    canvas.drawCircle(c.x, c.y, 4, paints.coin);
    canvas.drawCircle(c.x, c.y, 7.5, paints.coinRing);
  }

  // Asteroids — irregular rotated quads read as rocks at this scale.
  for (const a of engine.world.asteroids) {
    canvas.save();
    canvas.translate(a.x, a.y);
    canvas.rotate((a.spin * 180) / Math.PI, 0, 0);
    canvas.drawRect(Skia.XYWHRect(-a.radius, -a.radius * 0.8, a.radius * 2, a.radius * 1.6), paints.asteroid);
    canvas.restore();
  }

  drawRocket(canvas, ctx);

  // Transient effects (capture pulses, explosions).
  for (const e of effects) {
    const t = e.age / e.life;
    if (t >= 1) continue;
    paints.effectRing.setColor(Skia.Color(e.color));
    paints.effectRing.setAlphaf(1 - t);
    paints.effectRing.setStrokeWidth(e.kind === 'burst' ? 3.5 : 2);
    canvas.drawCircle(e.x, e.y, e.maxRadius * (e.kind === 'burst' ? Math.sqrt(t) : t), paints.effectRing);
  }

  // Floating score/coin popups (world-anchored, rise and fade).
  for (const pop of popups) {
    const t = pop.age / pop.life;
    if (t >= 1) continue;
    paints.popup.setColor(Skia.Color(pop.color));
    paints.popup.setAlphaf(1 - t * t);
    const w = popupFont.measureText(pop.text).width;
    canvas.drawText(
      pop.text,
      pop.x - w / 2,
      pop.y - gameConfig.popups.riseDistance * t,
      paints.popup,
      popupFont,
    );
  }

  canvas.restore();
};
