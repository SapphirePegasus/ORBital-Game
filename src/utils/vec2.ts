import type { Vec2 } from '../types';

/** Returns a new Vec2 — allocates. Use sparingly in hot loops. */
export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const vec2Zero = (): Vec2 => ({ x: 0, y: 0 });

/** Add two vectors, writing result into `out` to avoid allocation. */
export const addInto = (a: Vec2, b: Vec2, out: Vec2): void => {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
};

/** Scale a vector by scalar, writing into `out`. */
export const scaleInto = (v: Vec2, s: number, out: Vec2): void => {
  out.x = v.x * s;
  out.y = v.y * s;
};

/** Add scaled vector: out = a + b*s */
export const addScaledInto = (a: Vec2, b: Vec2, s: number, out: Vec2): void => {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
};

export const subtract = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x - b.x,
  y: a.y - b.y,
});

export const add = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x + b.x,
  y: a.y + b.y,
});

export const scale = (v: Vec2, s: number): Vec2 => ({
  x: v.x * s,
  y: v.y * s,
});

export const magnitudeSq = (v: Vec2): number => v.x * v.x + v.y * v.y;

export const magnitude = (v: Vec2): number => Math.sqrt(magnitudeSq(v));

export const normalize = (v: Vec2): Vec2 => {
  const mag = magnitude(v);
  if (mag === 0) return vec2Zero();
  return { x: v.x / mag, y: v.y / mag };
};

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Perpendicular (rotate 90° CCW) */
export const perp = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

export const distance = (a: Vec2, b: Vec2): number =>
  magnitude(subtract(a, b));

export const distanceSq = (a: Vec2, b: Vec2): number =>
  magnitudeSq(subtract(a, b));

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const lerpScalar = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

export const angle = (v: Vec2): number => Math.atan2(v.y, v.x);

export const fromAngle = (radians: number, magnitude: number = 1): Vec2 => ({
  x: Math.cos(radians) * magnitude,
  y: Math.sin(radians) * magnitude,
});

/** Clamp a scalar between min and max */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Deep copy a Vec2 */
export const copyVec2 = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });

/** Write src into dst without allocation */
export const assignVec2 = (dst: Vec2, src: Vec2): void => {
  dst.x = src.x;
  dst.y = src.y;
};
