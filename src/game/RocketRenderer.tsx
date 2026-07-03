/**
 * RocketRenderer — the player rocket in declarative Skia JSX.
 *
 * Layers (back → front):
 *   1. Exhaust trail (fading dots)
 *   2. Flame (animated teardrop, only in free flight)
 *   3. Charge ring (glowing arc when hold gesture is active)
 *   4. Rocket body (path)
 *   5. Window highlight
 */

import React, { memo, useRef } from 'react';
import { Circle, Group, Path } from '@shopify/react-native-skia';
import type { RocketState } from '../types';
import type { CameraState } from './renderMath';
import {
  worldToScreen,
  worldRadiusToScreen,
  buildRocketPath,
  buildFlamePath,
  rocketRotation,
  orbitTangentRotation,
} from './renderMath';
import { Skia } from '@shopify/react-native-skia';

// ─── Pre-built paths (built once) ────────────────────────────────────────────

const ROCKET_PATH = buildRocketPath(1.6);
const FLAME_PATH = buildFlamePath(1.6);

// ─── Trail dot pool ───────────────────────────────────────────────────────────

interface TrailDot {
  x: number;
  y: number;
  age: number; // 0=fresh, 1=dead
}

const TRAIL_MAX = 20;
const trail: TrailDot[] = [];

export function pushTrailDot(x: number, y: number) {
  if (trail.length >= TRAIL_MAX) trail.shift();
  trail.push({ x, y, age: 0 });
}

export function ageTrail(dt: number) {
  for (const dot of trail) dot.age += dt * 1.2;
  // Remove fully faded
  while (trail.length > 0 && (trail[0]?.age ?? 0) >= 1) trail.shift();
}

// ─── Trail renderer ───────────────────────────────────────────────────────────

const TrailRenderer: React.FC<{ cam: CameraState }> = memo(({ cam }) => (
  <Group>
    {trail.map((dot, i) => {
      const alpha = Math.max(0, (1 - dot.age) * 0.4);
      const r = (1 - dot.age) * 2.5;
      const { sx, sy } = worldToScreen(dot.x, dot.y, cam);
      return (
        <Circle
          key={i}
          cx={sx}
          cy={sy}
          r={r}
          color={`rgba(255,160,50,${alpha.toFixed(2)})`}
        />
      );
    })}
  </Group>
));

// ─── Flame ────────────────────────────────────────────────────────────────────

const FlameRenderer: React.FC<{
  sx: number; sy: number; rotation: number; flameScale: number; visible: boolean;
}> = memo(({ sx, sy, rotation, flameScale, visible }) => {
  if (!visible) return null;
  // Flame sits at the bottom of the rocket (below center)
  const offsetX = Math.sin(rotation) * 12 * flameScale;
  const offsetY = -Math.cos(rotation) * 12 * flameScale;

  return (
    <Group transform={[{ translateX: sx + offsetX }, { translateY: sy + offsetY }, { rotate: rotation }, { scale: flameScale }]}>
      {/* Outer flame */}
      <Path path={FLAME_PATH} color="rgba(255,120,0,0.85)" />
      {/* Inner flame */}
      <Path
        path={buildFlamePath(0.6)}
        color="rgba(255,220,80,0.9)"
      />
    </Group>
  );
});

// ─── Charge ring ──────────────────────────────────────────────────────────────

const ChargeRing: React.FC<{ sx: number; sy: number; charge: number }> = memo(
  ({ sx, sy, charge }) => {
    if (charge <= 0) return null;
    const t = Math.min(charge, 1.0);
    const r = 18 + t * 8;
    const g = Math.round(170 - t * 120);
    const b = Math.round(255 - t * 155);
    const alpha = 0.4 + t * 0.5;
    const strokeWidth = 1.5 + t * 2;

    return (
      <Group>
        {/* Glow */}
        <Circle cx={sx} cy={sy} r={r + 6} color={`rgba(0,${g},${b},${(alpha * 0.3).toFixed(2)})`} />
        {/* Ring */}
        <Circle
          cx={sx}
          cy={sy}
          r={r}
          color="transparent"
          style="stroke"
          strokeWidth={strokeWidth}
          opacity={alpha}
        />
      </Group>
    );
  },
);

// ─── Main rocket renderer ─────────────────────────────────────────────────────

interface RocketRendererProps {
  rocket: RocketState;
  cam: CameraState;
  time: number;
  launchCharge: number; // 0–1
}

export const RocketRenderer: React.FC<RocketRendererProps> = memo(
  ({ rocket, cam, time, launchCharge }) => {
    const { sx, sy } = worldToScreen(rocket.position.x, rocket.position.y, cam);

    // Rotation: track velocity in flight, orbit tangent when orbiting
    const rotation = rocket.orbitingPlanetId !== null
      ? orbitTangentRotation(rocket.orbitAngle)
      : rocketRotation(rocket.velocity.x, rocket.velocity.y);

    // Flame only visible in free flight
    const inFlight = rocket.orbitingPlanetId === null;
    const flameScale = 0.8 + Math.sin(time / 80) * 0.2;

    // Push trail dot each frame (called from GameCanvas frame callback)
    if (inFlight) pushTrailDot(rocket.position.x, rocket.position.y);
    ageTrail(1 / 60);

    return (
      <Group>
        {/* Exhaust trail */}
        <TrailRenderer cam={cam} />

        {/* Flame */}
        <FlameRenderer
          sx={sx}
          sy={sy}
          rotation={rotation}
          flameScale={flameScale}
          visible={inFlight}
        />

        {/* Charge ring */}
        <ChargeRing sx={sx} sy={sy} charge={launchCharge} />

        {/* Rocket body */}
        <Group
          transform={[
            { translateX: sx },
            { translateY: sy },
            { rotate: rotation },
          ]}
        >
          {/* Shadow */}
          <Path path={ROCKET_PATH} color="rgba(0,0,0,0.3)"
            transform={[{ translateX: 1.5 }, { translateY: 1.5 }]} />
          {/* Body */}
          <Path path={ROCKET_PATH} color="#E8E8FF" />
          {/* Window */}
          <Circle cx={0} cy={-4} r={2.8} color="#88CCFF" opacity={0.85} />
          <Circle cx={-0.7} cy={-4.7} r={1} color="rgba(200,240,255,0.6)" />
        </Group>
      </Group>
    );
  },
);
