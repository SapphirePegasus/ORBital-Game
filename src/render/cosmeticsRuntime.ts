/**
 * Cosmetics runtime: turns catalog *data* (unit-scale points, hex colors)
 * into render-ready Skia objects (paths, paints, a trail color LUT).
 *
 * Resolution happens only when the selection changes (equip, preview tap) —
 * never per frame — so the render loop keeps its zero-allocation budget.
 * The same resolved object drives both the in-game rocket and the Customize
 * screen preview, guaranteeing what you see is what you fly.
 */
import { BlurStyle, PaintStyle, Skia, type SkPaint, type SkPath } from '@shopify/react-native-skia';
import {
  FREE_DEFAULTS,
  schemeById,
  skinById,
  trailById,
  type TrailMode,
} from '../config/cosmetics';

export interface ResolvedCosmetics {
  hullPath: SkPath;
  finPaths: readonly SkPath[];
  /** Exhaust anchor in unit scale (multiply by rocket radius). */
  nozzleX: number;
  flamePath: SkPath;
  hullPaint: SkPaint;
  accentPaint: SkPaint;
  flamePaint: SkPaint;
  trailMode: TrailMode;
  trailSize: number;
  /** Head→tail color ramp, pre-mixed (index by normalized trail age). */
  trailPaints: readonly SkPaint[];
  /** Blurred variant of the head paint for glow modes. */
  trailGlowPaint: SkPaint;
  /** Sprite manifest keys (null → procedural). Resolved by the renderer. */
  rocketSpriteKey: string | null;
  trailSpriteKey: string | null;
}

const TRAIL_RAMP_STEPS = 8;

const buildPolygon = (points: readonly (readonly [number, number])[]): SkPath => {
  const b = Skia.PathBuilder.Make();
  points.forEach(([x, y], i) => (i === 0 ? b.moveTo(x, y) : b.lineTo(x, y)));
  return b.close().build();
};

const fillPaint = (color: string): SkPaint => {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setStyle(PaintStyle.Fill);
  p.setColor(Skia.Color(color));
  return p;
};

/** Parse '#RRGGBB' or 'rgba(r,g,b,a)' into [r,g,b,a] 0..255 (+ 0..1 alpha). */
const parseColor = (c: string): [number, number, number, number] => {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(c);
  if (hex && hex[1]) {
    const v = parseInt(hex[1], 16);
    return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff, 1];
  }
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(c);
  if (rgba) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  }
  return [232, 236, 244, 1];
};

const mixColors = (a: string, b: string, t: number): string => {
  const ca = parseColor(a);
  const cb = parseColor(b);
  const m = (i: 0 | 1 | 2): number => Math.round(ca[i] + (cb[i] - ca[i]) * t);
  const alpha = ca[3] + (cb[3] - ca[3]) * t;
  return `rgba(${m(0)},${m(1)},${m(2)},${alpha.toFixed(3)})`;
};

/**
 * Resolve a cosmetic selection. Unknown ids resolve to the free defaults —
 * this is the last line of defense; persistence already validates ids.
 */
export const resolveCosmetics = (
  skinId: string,
  schemeId: string,
  trailId: string,
): ResolvedCosmetics => {
  const skin = skinById(skinId) ?? skinById(FREE_DEFAULTS.skin)!;
  const scheme = schemeById(schemeId) ?? schemeById(FREE_DEFAULTS.scheme)!;
  const trail = trailById(trailId) ?? trailById(FREE_DEFAULTS.trail)!;

  const flamePath = (() => {
    const b = Skia.PathBuilder.Make();
    b.moveTo(skin.nozzleX, 0.4);
    b.lineTo(skin.nozzleX - 1.4, 0);
    b.lineTo(skin.nozzleX, -0.4);
    return b.close().build();
  })();

  const trailPaints: SkPaint[] = [];
  for (let i = 0; i < TRAIL_RAMP_STEPS; i++) {
    trailPaints.push(fillPaint(mixColors(scheme.trail[0], scheme.trail[1], i / (TRAIL_RAMP_STEPS - 1))));
  }

  const trailGlowPaint = fillPaint(scheme.trail[0]);
  trailGlowPaint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 6, true));

  return {
    hullPath: buildPolygon(skin.hull),
    finPaths: (skin.fins ?? []).map(buildPolygon),
    nozzleX: skin.nozzleX,
    flamePath,
    hullPaint: fillPaint(scheme.hull),
    accentPaint: fillPaint(scheme.accent),
    flamePaint: fillPaint(scheme.flame),
    trailMode: trail.mode,
    trailSize: trail.size,
    trailPaints,
    trailGlowPaint,
    rocketSpriteKey: skin.sprite ?? null,
    trailSpriteKey: trail.sprite ?? null,
  };
};

/** Trail paint for a normalized age t (0 head → 1 tail), alpha pre-faded. */
export const trailPaintFor = (resolved: ResolvedCosmetics, t: number): SkPaint => {
  const idx = Math.min(
    resolved.trailPaints.length - 1,
    Math.max(0, Math.floor(t * resolved.trailPaints.length)),
  );
  return resolved.trailPaints[idx] ?? resolved.trailPaints[0]!;
};
