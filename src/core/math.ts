/**
 * Pure 2D math utilities. No React Native imports — fully unit-testable.
 * Vectors are plain `{ x, y }` objects; hot-path helpers offer in-place
 * variants to avoid per-frame allocation pressure on the game loop.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth ease used for camera follow and UI motion. */
export const smoothDamp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

export const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const len = (v: Vec2): number => Math.hypot(v.x, v.y);

/** Normalize `v` in place; returns zero vector unchanged. */
export const normalizeInPlace = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y);
  if (l > 1e-9) {
    v.x /= l;
    v.y /= l;
  }
  return v;
};

/** Angle of the vector from `a` to `b`, in radians. */
export const angleTo = (ax: number, ay: number, bx: number, by: number): number =>
  Math.atan2(by - ay, bx - ax);

export const TWO_PI = Math.PI * 2;

/** Wrap an angle into [0, 2π). */
export const wrapAngle = (a: number): number => {
  const r = a % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
};

/**
 * Sign of the z-component of the 2D cross product (a × b).
 * Used to derive orbital direction from angular momentum on capture.
 */
export const crossSign = (ax: number, ay: number, bx: number, by: number): 1 | -1 =>
  ax * by - ay * bx >= 0 ? 1 : -1;
