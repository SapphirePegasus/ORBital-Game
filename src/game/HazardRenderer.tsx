/**
 * HazardRenderer — all hazard types in declarative Skia JSX.
 *
 * Black hole:     Accretion disk rings + event horizon void + lensing glow
 * Asteroid field: Individual lumpy rocks
 * Solar flare:    Directional cone burst with animated alpha
 * Supernova:      Expanding ring burst
 * Nebula:         Large soft translucent ellipse
 */

import React, { memo } from 'react';
import { Circle, Group, Path, Oval } from '@shopify/react-native-skia';
import type { Hazard, AsteroidRock } from '../types';
import type { CameraState } from './renderMath';
import { worldToScreen, worldRadiusToScreen, isVisible, buildAsteroidPath } from './renderMath';

// ─── Black Hole ───────────────────────────────────────────────────────────────

const BlackHoleRenderer: React.FC<{ hazard: Hazard; cam: CameraState; time: number }> = memo(
  ({ hazard, cam, time }) => {
    const { sx, sy } = worldToScreen(hazard.position.x, hazard.position.y, cam);
    const sr = worldRadiusToScreen(hazard.radius, cam.zoom);
    const influenceR = worldRadiusToScreen(hazard.influenceRadius, cam.zoom);
    const eventR = worldRadiusToScreen(hazard.eventHorizonRadius ?? hazard.radius, cam.zoom);

    // Rotating accretion disk pulse
    const diskPulse = 0.6 + Math.sin(time / 600) * 0.4;
    const outerPulse = 0.25 + Math.sin(time / 1200) * 0.15;

    return (
      <Group>
        {/* Outer gravitational lensing glow */}
        <Circle cx={sx} cy={sy} r={influenceR * 0.45} color={`rgba(88,44,180,${(outerPulse * 0.12).toFixed(2)})`} />

        {/* Accretion disk rings */}
        <Circle cx={sx} cy={sy} r={sr * 2.8} color="transparent" style="stroke" strokeWidth={sr * 0.4}
          opacity={diskPulse * 0.55} />
        <Circle cx={sx} cy={sy} r={sr * 2.0} color="transparent" style="stroke" strokeWidth={sr * 0.25}
          opacity={diskPulse * 0.7} />
        <Circle cx={sx} cy={sy} r={sr * 1.45} color="transparent" style="stroke" strokeWidth={sr * 0.18}
          opacity={0.85} />

        {/* Event horizon — pure black */}
        <Circle cx={sx} cy={sy} r={eventR} color="#000000" />

        {/* Singularity shimmer */}
        <Circle cx={sx} cy={sy} r={eventR * 0.4}
          color={`rgba(60,0,120,${(0.4 + Math.sin(time / 300) * 0.3).toFixed(2)})`} />
      </Group>
    );
  },
);

// ─── Asteroid Field ───────────────────────────────────────────────────────────

const AsteroidRockRenderer: React.FC<{ rock: AsteroidRock; cam: CameraState }> = memo(
  ({ rock, cam }) => {
    if (!isVisible(rock.position.x, rock.position.y, rock.radius, cam)) return null;

    const { sx, sy } = worldToScreen(rock.position.x, rock.position.y, cam);
    const sr = worldRadiusToScreen(rock.radius, cam.zoom);
    const path = buildAsteroidPath(sx, sy, sr, 7, rock.radius * 100 | 0);

    return (
      <Group>
        <Path path={path} color="#7A6B5A" />
        <Path path={path} color="transparent" style="stroke" strokeWidth={0.5} opacity={0.5} />
      </Group>
    );
  },
);

// ─── Solar Flare ──────────────────────────────────────────────────────────────

const SolarFlareRenderer: React.FC<{ hazard: Hazard; cam: CameraState; time: number }> = memo(
  ({ hazard, cam, time }) => {
    const { sx, sy } = worldToScreen(hazard.position.x, hazard.position.y, cam);
    const sr = worldRadiusToScreen(hazard.radius, cam.zoom);
    const influenceR = worldRadiusToScreen(hazard.influenceRadius, cam.zoom);
    const flicker = 0.5 + Math.sin(time / 120) * 0.3 + Math.sin(time / 80) * 0.2;

    // Directional cone using direction vector
    const dir = hazard.direction ?? { x: 0, y: -1 };
    const angle = Math.atan2(dir.y, dir.x) * (180 / Math.PI);

    return (
      <Group>
        {/* Source burst */}
        <Circle cx={sx} cy={sy} r={sr} color={`rgba(255,120,0,${(0.6 + flicker * 0.3).toFixed(2)})`} />
        <Circle cx={sx} cy={sy} r={sr * 1.5} color={`rgba(255,160,0,${(flicker * 0.25).toFixed(2)})`} />

        {/* Influence zone */}
        <Circle cx={sx} cy={sy} r={influenceR}
          color={`rgba(255,80,0,${(flicker * 0.06).toFixed(2)})`} />
        <Circle cx={sx} cy={sy} r={influenceR}
          color="transparent" style="stroke" strokeWidth={1}
          opacity={flicker * 0.3} />
      </Group>
    );
  },
);

// ─── Supernova ────────────────────────────────────────────────────────────────

const SupernovaRenderer: React.FC<{ hazard: Hazard; cam: CameraState; time: number }> = memo(
  ({ hazard, cam, time }) => {
    const { sx, sy } = worldToScreen(hazard.position.x, hazard.position.y, cam);
    const sr = worldRadiusToScreen(hazard.radius, cam.zoom);
    const pulse = Math.sin(time / 400);
    const outerR = sr * (1.0 + pulse * 0.2);

    return (
      <Group>
        {/* Outer shockwave ring */}
        <Circle cx={sx} cy={sy} r={outerR * 2.2} color="transparent" style="stroke"
          strokeWidth={2} opacity={0.2 + pulse * 0.15} />
        <Circle cx={sx} cy={sy} r={outerR * 1.5} color="transparent" style="stroke"
          strokeWidth={3} opacity={0.3 + pulse * 0.2} />

        {/* Core */}
        <Circle cx={sx} cy={sy} r={sr} color={`rgba(255,160,100,${(0.55 + pulse * 0.2).toFixed(2)})`} />
        <Circle cx={sx} cy={sy} r={sr * 0.55} color={`rgba(255,220,150,${(0.7 + pulse * 0.15).toFixed(2)})`} />
        <Circle cx={sx} cy={sy} r={sr * 0.25} color={`rgba(255,255,200,0.9)`} />
      </Group>
    );
  },
);

// ─── Nebula hazard (not just background) ─────────────────────────────────────

const NebulaHazardRenderer: React.FC<{ hazard: Hazard; cam: CameraState }> = memo(
  ({ hazard, cam }) => {
    const { sx, sy } = worldToScreen(hazard.position.x, hazard.position.y, cam);
    const sr = worldRadiusToScreen(hazard.radius, cam.zoom);

    return (
      <Group>
        <Circle cx={sx} cy={sy} r={sr * 1.6} color="rgba(40,10,80,0.18)" />
        <Circle cx={sx} cy={sy} r={sr} color="rgba(60,10,100,0.22)" />
        <Circle cx={sx} cy={sy} r={sr * 0.55} color="rgba(80,20,120,0.28)" />
      </Group>
    );
  },
);

// ─── Main hazard dispatcher ───────────────────────────────────────────────────

interface HazardRendererProps {
  hazard: Hazard;
  cam: CameraState;
  time: number;
}

export const HazardRenderer: React.FC<HazardRendererProps> = memo(({ hazard, cam, time }) => {
  if (!isVisible(hazard.position.x, hazard.position.y, hazard.influenceRadius, cam)) {
    return null;
  }

  switch (hazard.type) {
    case 'black_hole':
      return <BlackHoleRenderer hazard={hazard} cam={cam} time={time} />;
    case 'solar_flare':
      return <SolarFlareRenderer hazard={hazard} cam={cam} time={time} />;
    case 'supernova':
      return <SupernovaRenderer hazard={hazard} cam={cam} time={time} />;
    case 'nebula':
      return <NebulaHazardRenderer hazard={hazard} cam={cam} />;
    case 'asteroid_field':
      // Rendered separately via AsteroidRenderer below (individual rocks)
      return null;
    default:
      return null;
  }
});

// ─── Asteroid rocks (separate pass after hazard pass) ────────────────────────

interface AsteroidFieldRendererProps {
  rocks: AsteroidRock[];
  cam: CameraState;
}

export const AsteroidFieldRenderer: React.FC<AsteroidFieldRendererProps> = memo(
  ({ rocks, cam }) => (
    <Group>
      {rocks.map(rock => (
        <AsteroidRockRenderer key={rock.id} rock={rock} cam={cam} />
      ))}
    </Group>
  ),
);
