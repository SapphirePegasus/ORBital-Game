/**
 * StarfieldRenderer — two layers:
 *   1. Static star field with subtle parallax vs camera
 *   2. Trajectory preview dotted path
 *
 * Both are pure React components consuming camera state as props.
 * Stars are generated once and stored in module scope.
 */

import React, { memo, useMemo } from 'react';
import { Circle, Group, Path } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import type { Vec2 } from '../types';
import type { CameraState } from './renderMath';
import { COLORS } from '../constants';

// ─── Star data (generated once at module load) ────────────────────────────────

interface StarData {
  wx: number;   // world X (large space)
  wy: number;   // world Y
  r: number;    // radius
  alpha: number;
  layer: 0 | 1 | 2; // 0=far, 1=mid, 2=close — parallax factor
}

function generateStars(count: number): StarData[] {
  const stars: StarData[] = [];
  // Use a fixed seed so the starfield is always the same
  let s = 42;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    stars.push({
      wx: (rand() - 0.5) * 3000,
      wy: (rand() - 0.5) * 3000,
      r: rand() * 1.4 + 0.3,
      alpha: rand() * 0.7 + 0.15,
      layer: (i % 3) as 0 | 1 | 2,
    });
  }
  return stars;
}

const STARS = generateStars(280);
const PARALLAX = [0.05, 0.12, 0.22]; // per layer — subtle, not extreme

// ─── Stars component ──────────────────────────────────────────────────────────

interface StarfieldProps {
  cam: CameraState;
}

export const Starfield: React.FC<StarfieldProps> = memo(({ cam }) => {
  return (
    <Group>
      {STARS.map((star, i) => {
        const parallax = PARALLAX[star.layer] ?? 0.1;
        // Screen position with parallax offset
        const sx = (star.wx - cam.x * parallax) % cam.screenW;
        const sy = (star.wy - cam.y * parallax) % cam.screenH;
        // Wrap to screen
        const wx = ((sx % cam.screenW) + cam.screenW) % cam.screenW;
        const wy = ((sy % cam.screenH) + cam.screenH) % cam.screenH;

        return (
          <Circle
            key={i}
            cx={wx}
            cy={wy}
            r={star.r}
            color={`rgba(255,255,255,${star.alpha.toFixed(2)})`}
          />
        );
      })}
    </Group>
  );
});

// ─── Nebula backdrop ──────────────────────────────────────────────────────────

export const NebulaBackdrop: React.FC<{ cam: CameraState }> = memo(({ cam }) => {
  // Static large soft circles for nebula ambiance
  const nebulae = useMemo(() => [
    { wx: -400, wy: -200, r: 300, color: '#1A0A3A', alpha: 0.35 },
    { wx: 600,  wy: 300,  r: 250, color: '#0A1A3A', alpha: 0.3 },
    { wx: 200,  wy: -500, r: 200, color: '#3A0A1A', alpha: 0.25 },
    { wx: -200, wy: 600,  r: 280, color: '#0A3A2A', alpha: 0.2 },
  ], []);

  return (
    <Group>
      {nebulae.map((n, i) => {
        const sx = (n.wx - cam.x) * 0.08 + cam.screenW / 2;
        const sy = (n.wy - cam.y) * 0.08 + cam.screenH / 2;
        return (
          <Circle
            key={i}
            cx={sx}
            cy={sy}
            r={n.r}
            color={`${n.color}${Math.round(n.alpha * 255).toString(16).padStart(2, '0')}`}
          />
        );
      })}
    </Group>
  );
});

// ─── Trajectory preview ───────────────────────────────────────────────────────

interface TrajectoryProps {
  points: Vec2[];
  cam: CameraState;
}

export const TrajectoryPreview: React.FC<TrajectoryProps> = memo(({ points, cam }) => {
  if (points.length < 2) return null;

  // Build a dotted path — draw every Nth point as a small circle
  const DOT_INTERVAL = 4;

  return (
    <Group>
      {points.map((pt, i) => {
        if (i % DOT_INTERVAL !== 0) return null;
        const sx = (pt.x - cam.x) * cam.zoom + cam.screenW / 2;
        const sy = (pt.y - cam.y) * cam.zoom + cam.screenH / 2;
        const t = i / points.length;
        // Fade out toward end
        const alpha = (0.5 - t * 0.45).toFixed(2);
        // Size shrinks toward end too
        const r = 1.5 - t * 1.0;
        if (r < 0.3) return null;

        return (
          <Circle
            key={i}
            cx={sx}
            cy={sy}
            r={r}
            color={`rgba(255,255,255,${alpha})`}
          />
        );
      })}
    </Group>
  );
});
