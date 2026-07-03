/**
 * Pure math helpers for renderers.
 * No Skia imports — all these run on the JS thread safely and are
 * passed as computed values into JSX props.
 */

import { Skia, type SkPath } from '@shopify/react-native-skia';

// ─── World-to-screen projection ───────────────────────────────────────────────

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  screenW: number;
  screenH: number;
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  cam: CameraState,
): { sx: number; sy: number } {
  return {
    sx: (worldX - cam.x) * cam.zoom + cam.screenW / 2,
    sy: (worldY - cam.y) * cam.zoom + cam.screenH / 2,
  };
}

export function worldRadiusToScreen(r: number, zoom: number): number {
  return r * zoom;
}

/** Returns true if a world-space circle is visible on screen */
export function isVisible(
  worldX: number,
  worldY: number,
  worldRadius: number,
  cam: CameraState,
): boolean {
  const { sx, sy } = worldToScreen(worldX, worldY, cam);
  const sr = worldRadiusToScreen(worldRadius, cam.zoom);
  const margin = sr + 32;
  return (
    sx + margin >= 0 &&
    sx - margin <= cam.screenW &&
    sy + margin >= 0 &&
    sy - margin <= cam.screenH
  );
}

// ─── Path builders (return SkPath — Skia type, OK on JS thread) ───────────────

/** Rocket silhouette centered at (0,0) pointing up, scale=1 → ~12px tall */
export function buildRocketPath(scale: number = 1): SkPath {
  const path = Skia.Path.Make();
  const w = 5 * scale;
  const h = 12 * scale;
  path.moveTo(0, -h);
  path.lineTo(w, h * 0.2);
  path.lineTo(w * 1.7, h);
  path.lineTo(w * 0.35, h * 0.55);
  path.lineTo(-w * 0.35, h * 0.55);
  path.lineTo(-w * 1.7, h);
  path.lineTo(-w, h * 0.2);
  path.close();
  return path;
}

/** Flame teardrop at (0,0) pointing down */
export function buildFlamePath(scale: number = 1): SkPath {
  const path = Skia.Path.Make();
  const w = 3.5 * scale;
  const h = 8 * scale;
  path.moveTo(0, 0);
  path.lineTo(w, h * 0.4);
  path.cubicTo(w * 0.8, h, 0, h * 1.2, 0, h * 1.2);
  path.cubicTo(0, h * 1.2, -w * 0.8, h, -w, h * 0.4);
  path.close();
  return path;
}

/** Hexagon for mineral collectible */
export function buildHexPath(cx: number, cy: number, r: number): SkPath {
  const path = Skia.Path.Make();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
  }
  path.close();
  return path;
}

/** Diamond for dark matter */
export function buildDiamondPath(cx: number, cy: number, r: number): SkPath {
  const path = Skia.Path.Make();
  path.moveTo(cx, cy - r);
  path.lineTo(cx + r * 0.6, cy);
  path.lineTo(cx, cy + r);
  path.lineTo(cx - r * 0.6, cy);
  path.close();
  return path;
}

/** Lumpy asteroid polygon with deterministic wobble */
export function buildAsteroidPath(
  cx: number,
  cy: number,
  r: number,
  sides: number = 7,
  seed: number = 1,
): SkPath {
  const path = Skia.Path.Make();
  let s = seed | 0;
  const wobble = () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides;
    const f = 0.62 + wobble() * 0.38;
    const x = cx + Math.cos(angle) * r * f;
    const y = cy + Math.sin(angle) * r * f;
    i === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
  }
  path.close();
  return path;
}

/** Gas giant band rect path at a given y-offset inside a circle clip */
export function buildGasBandPath(
  cx: number,
  cy: number,
  r: number,
  yOffset: number,
  thickness: number,
): SkPath {
  const path = Skia.Path.Make();
  path.addRect({
    x: cx - r,
    y: cy + yOffset - thickness / 2,
    width: r * 2,
    height: thickness,
  });
  return path;
}

// ─── Rotation helpers ─────────────────────────────────────────────────────────

/** Velocity angle in radians, 0 = pointing right */
export function velocityAngle(vx: number, vy: number): number {
  return Math.atan2(vy, vx);
}

/** Rotation to point rocket "nose" toward velocity direction */
export function rocketRotation(vx: number, vy: number): number {
  // Rocket path points up (-Y), so rotate by +90° from velocity angle
  return velocityAngle(vx, vy) + Math.PI / 2;
}

/** Orbit tangent angle at current orbit angle */
export function orbitTangentRotation(orbitAngle: number): number {
  return orbitAngle + Math.PI / 2;
}
