/**
 * Immediate-mode scene renderer. Called once per frame by GameCanvas to draw
 * the whole world into an SkPicture (ADR-001). Paint objects and paths are
 * created once and reused — the per-frame allocation budget here is ~zero.
 *
 * Everything is drawn procedurally: the minimal-majestic look needs no image
 * assets, ships tiny, and scales crisply on any DPI.
 */
import {
  BlurStyle,
  ClipOp,
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkPaint,
} from '@shopify/react-native-skia';
import { gameConfig } from '../config/gameConfig';
import { palette } from '../config/palette';
import { Rng } from '../core/rng';
import type { CelestialBody } from '../core/types';
import type { GameEngine } from '../engine/engine';
import { TWO_PI } from '../core/math';

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

export interface SceneContext {
  engine: GameEngine;
  cam: Camera;
  width: number;
  height: number;
  effects: Effect[];
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
  bodyFill: mkPaint('#ffffff', PaintStyle.Fill), // color set per body
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
  flare: (() => {
    const p = mkPaint('rgba(255,180,90,0.32)', PaintStyle.Fill);
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 22, true));
    return p;
  })(),
  danger: mkPaint(palette.danger, PaintStyle.Stroke, 1.5),
  accretion: mkPaint(palette.accent, PaintStyle.Stroke, 2.5),
  decayArc: mkPaint(palette.accent, PaintStyle.Stroke, 2.5),
  effectRing: mkPaint('#ffffff', PaintStyle.Stroke, 2),
  tint: mkPaint(palette.galaxyTints[0] ?? '#0A0C1C', PaintStyle.Fill),
};
paints.captureRing.setPathEffect(Skia.PathEffect.MakeDash([4, 9], 0));

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
const drawBody = (canvas: SkCanvas, b: CelestialBody, engine: GameEngine): void => {
  const color = palette.bodies[b.kind];
  paints.bodyFill.setColor(Skia.Color(color));

  // Faint dashed capture ring — the player's aiming aid.
  if (!b.detonated) {
    canvas.drawCircle(b.x, b.y, b.captureRadius, paints.captureRing);
  }

  switch (b.kind) {
    case 'star': {
      const cycleT = engine.flareCycleT(b);
      const active = engine.isFlareActive(b);
      paints.glow.setColor(Skia.Color(color));
      canvas.drawCircle(b.x, b.y, b.radius * 1.25, paints.glow);
      canvas.drawCircle(b.x, b.y, b.radius, paints.bodyFill);
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
      // Rotating accretion arc.
      canvas.save();
      canvas.translate(b.x, b.y);
      canvas.rotate((engine.elapsed * 55) % 360, 0, 0);
      const rect = Skia.XYWHRect(-b.radius * 1.45, -b.radius * 1.45, b.radius * 2.9, b.radius * 2.9);
      paints.accretion.setAlphaf(0.85);
      canvas.drawArc(rect, 0, 250, false, paints.accretion);
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
      paints.glow.setColor(Skia.Color(color));
      canvas.drawCircle(b.x, b.y, b.radius * 1.25 * pulse, paints.glow);
      canvas.drawCircle(b.x, b.y, b.radius * pulse, paints.bodyFill);
      if (armed) {
        // Fuse ring drains as the countdown ticks.
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
      canvas.drawCircle(b.x, b.y, b.radius, paints.bodyFill);
      // Latitude bands.
      canvas.save();
      canvas.clipRRect(
        Skia.RRectXY(Skia.XYWHRect(b.x - b.radius, b.y - b.radius, b.radius * 2, b.radius * 2), b.radius, b.radius),
        ClipOp.Intersect,
        true,
      );
      for (let i = -2; i <= 2; i++) {
        canvas.drawLine(b.x - b.radius, b.y + i * b.radius * 0.34, b.x + b.radius, b.y + i * b.radius * 0.34, paints.bandStroke);
      }
      canvas.restore();
      break;
    }
    default: {
      canvas.drawCircle(b.x, b.y, b.radius, paints.bodyFill);
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

// ------------------------------------------------------------------- rocket
const rocketPath = Skia.Path.Make();
{
  const r = gameConfig.rocket.radius;
  rocketPath.moveTo(r * 1.5, 0);
  rocketPath.lineTo(-r, r * 0.85);
  rocketPath.lineTo(-r * 0.45, 0);
  rocketPath.lineTo(-r, -r * 0.85);
  rocketPath.close();
}
const flamePath = Skia.Path.Make();
{
  const r = gameConfig.rocket.radius;
  flamePath.moveTo(-r * 0.7, r * 0.4);
  flamePath.lineTo(-r * 2.1, 0);
  flamePath.lineTo(-r * 0.7, -r * 0.4);
  flamePath.close();
}

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
  if (r.mode === 'charging') {
    canvas.save();
    canvas.scale(0.5 + r.chargeT, 0.6 + r.chargeT * 0.5);
    canvas.drawPath(flamePath, paints.flame);
    canvas.restore();
  } else if (r.mode === 'flying') {
    canvas.drawPath(flamePath, paints.flame);
  }
  canvas.drawPath(rocketPath, paints.rocket);
  canvas.restore();

  if (r.shields > 0) {
    paints.shield.setAlphaf(0.35 + 0.15 * Math.sin(engine.elapsed * 3));
    canvas.drawCircle(r.x, r.y, gameConfig.rocket.radius * 2.1, paints.shield);
  }
};

// -------------------------------------------------------------------- scene
export const renderScene = (canvas: SkCanvas, ctx: SceneContext): void => {
  const { engine, cam, width, height, effects } = ctx;

  // Galaxy tint wash (subtle depth-based mood shift over the base background).
  const galaxy = engine.world.galaxyOf(engine.bodiesVisited);
  const tint = palette.galaxyTints[galaxy % palette.galaxyTints.length] ?? palette.space;
  paints.tint.setColor(Skia.Color(tint));
  paints.tint.setAlphaf(0.85);
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), paints.tint);

  drawStarfield(canvas, ctx);

  canvas.save();
  canvas.translate(width / 2, height * gameConfig.camera.anchorY);
  canvas.scale(cam.zoom, cam.zoom);
  canvas.translate(-cam.x, -cam.y);

  for (const b of engine.world.bodies) drawBody(canvas, b, engine);

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

  canvas.restore();
};
