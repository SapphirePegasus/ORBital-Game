/**
 * Camera zoom-to-fit (pure math, unit-tested).
 *
 * Guarantees the player never loses the sense of direction: given the camera
 * focus (the followed rocket) and a set of must-be-visible target circles
 * (current body + next unvisited body), computes the zoom at which every
 * target fits inside the viewport with a margin — respecting the asymmetric
 * vertical anchor — clamped to [minZoom, maxZoom].
 */
import { clamp } from '../core/math';

export interface FitTarget {
  x: number;
  y: number;
  /** Radius that must be fully visible (body radius, capture ring, etc.). */
  r: number;
}

export interface FitParams {
  focusX: number;
  focusY: number;
  viewportW: number;
  viewportH: number;
  /** Vertical screen anchor of the focus (0 = top, 1 = bottom). */
  anchorY: number;
  marginPx: number;
  minZoom: number;
  maxZoom: number;
}

/**
 * Zoom needed so that every target circle is on screen.
 *
 * With the world-to-screen transform `screen = (world − focus) × zoom + anchor`,
 * a margin in *screen* pixels means the available world extent on each side
 * is `available/zoom − margin/zoom`, so per-axis: zoom ≤ (available − margin·0)
 * … solving directly: zoom ≤ (available − marginPx) / worldDistance.
 */
export const computeFitZoom = (targets: readonly FitTarget[], p: FitParams): number => {
  let zoom = p.maxZoom;
  const availLeft = p.viewportW / 2 - p.marginPx;
  const availRight = p.viewportW / 2 - p.marginPx;
  const availUp = p.viewportH * p.anchorY - p.marginPx;
  const availDown = p.viewportH * (1 - p.anchorY) - p.marginPx;

  for (const t of targets) {
    const dxLeft = p.focusX - (t.x - t.r); // world extent needed to the left
    const dxRight = t.x + t.r - p.focusX;
    const dyUp = p.focusY - (t.y - t.r); // screen-up = smaller world y
    const dyDown = t.y + t.r - p.focusY;

    if (dxLeft > 0) zoom = Math.min(zoom, availLeft / dxLeft);
    if (dxRight > 0) zoom = Math.min(zoom, availRight / dxRight);
    if (dyUp > 0) zoom = Math.min(zoom, availUp / dyUp);
    if (dyDown > 0) zoom = Math.min(zoom, availDown / dyDown);
  }
  return clamp(zoom, p.minZoom, p.maxZoom);
};

/** True if a target circle is fully inside the viewport at the given zoom. */
export const targetFits = (t: FitTarget, zoom: number, p: FitParams): boolean => {
  const sx = (t.x - p.focusX) * zoom + p.viewportW / 2;
  const sy = (t.y - p.focusY) * zoom + p.viewportH * p.anchorY;
  const sr = t.r * zoom;
  return (
    sx - sr >= 0 && sx + sr <= p.viewportW && sy - sr >= 0 && sy + sr <= p.viewportH
  );
};
