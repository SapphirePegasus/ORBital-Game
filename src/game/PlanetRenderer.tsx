/**
 * PlanetRenderer — declarative Skia JSX for all planet types.
 *
 * Each planet renders:
 *   1. Outer atmosphere halo (large low-alpha circle)
 *   2. Inner atmosphere rim
 *   3. Planet body
 *   4. Surface detail (type-specific)
 *   5. Orbit ring (when player orbiting — shows decay via color)
 *   6. Destination pulse (subtle animated ring on target planet)
 */

import React, { memo } from 'react';
import { Circle, Group, Path, BlurMask, Oval } from '@shopify/react-native-skia';
import type { Planet } from '../types';
import type { CameraState } from './renderMath';
import { worldToScreen, worldRadiusToScreen, isVisible, buildGasBandPath } from './renderMath';
import { COLORS } from '../constants';

// ─── Props ────────────────────────────────────────────────────────────────────

interface PlanetProps {
  planet: Planet;
  cam: CameraState;
  orbitDecayPercent: number; // 0–100, only used if isOrbitTarget
  isOrbitTarget: boolean;
  isDestination: boolean;
  time: number; // ms, for pulse animation
}

// ─── Surface detail components ────────────────────────────────────────────────

const GasGiantBands: React.FC<{ sx: number; sy: number; sr: number; color: string }> = memo(
  ({ sx, sy, sr, color }) => {
    const bands = [
      { offset: -sr * 0.35, thickness: sr * 0.18 },
      { offset: sr * 0.15,  thickness: sr * 0.12 },
      { offset: sr * 0.5,   thickness: sr * 0.09 },
    ];
    return (
      <Group>
        {bands.map((band, i) => (
          <Path
            key={i}
            path={buildGasBandPath(sx, sy, sr * 0.95, band.offset, band.thickness)}
            color={`${color}44`}
            clip={{ x: sx - sr, y: sy - sr, width: sr * 2, height: sr * 2 }}
          />
        ))}
      </Group>
    );
  },
);

const IceCaps: React.FC<{ sx: number; sy: number; sr: number }> = memo(({ sx, sy, sr }) => (
  <Group>
    <Circle cx={sx} cy={sy - sr * 0.7} r={sr * 0.45} color="rgba(220,240,255,0.22)" />
    <Circle cx={sx} cy={sy + sr * 0.75} r={sr * 0.3}  color="rgba(220,240,255,0.16)" />
  </Group>
));

const LavaCracks: React.FC<{ sx: number; sy: number; sr: number }> = memo(({ sx, sy, sr }) => (
  <Group>
    <Circle cx={sx - sr * 0.25} cy={sy}          r={sr * 0.18} color="rgba(255,80,0,0.35)" />
    <Circle cx={sx + sr * 0.3}  cy={sy - sr * 0.3} r={sr * 0.12} color="rgba(255,120,0,0.3)" />
    <Circle cx={sx}             cy={sy + sr * 0.35} r={sr * 0.15} color="rgba(255,60,0,0.32)" />
  </Group>
));

const CrystalFacets: React.FC<{ sx: number; sy: number; sr: number }> = memo(({ sx, sy, sr }) => (
  <Group>
    <Circle cx={sx - sr * 0.3} cy={sy - sr * 0.2} r={sr * 0.15} color="rgba(200,180,255,0.4)" />
    <Circle cx={sx + sr * 0.35} cy={sy + sr * 0.25} r={sr * 0.12} color="rgba(180,220,255,0.35)" />
    <Circle cx={sx + sr * 0.1}  cy={sy - sr * 0.45} r={sr * 0.1}  color="rgba(220,200,255,0.45)" />
  </Group>
));

// ─── Orbit decay ring ─────────────────────────────────────────────────────────

const OrbitDecayRing: React.FC<{
  sx: number; sy: number; sr: number; orbitRadius: number; decayPercent: number;
}> = memo(({ sx, sy, sr, orbitRadius, decayPercent }) => {
  const t = decayPercent / 100;
  const r = 255;
  const g = Math.round(255 * (1 - t));
  const b = Math.round(44 * (1 - t));
  const strokeWidth = 0.5 + t * 1.5;
  const alpha = 0.15 + t * 0.55;

  return (
    <Circle
      cx={sx}
      cy={sy}
      r={orbitRadius}
      color="transparent"
      style="stroke"
      strokeWidth={strokeWidth}
      opacity={alpha}
    />
  );
});

// ─── Main planet component ────────────────────────────────────────────────────

export const PlanetRenderer: React.FC<PlanetProps> = memo(({
  planet, cam, orbitDecayPercent, isOrbitTarget, isDestination, time,
}) => {
  if (!isVisible(planet.position.x, planet.position.y, planet.radius * 3.5, cam)) {
    return null;
  }

  const { sx, sy } = worldToScreen(planet.position.x, planet.position.y, cam);
  const sr = worldRadiusToScreen(planet.radius, cam.zoom);

  // Destination pulse — sin wave between 0.5–1.0 opacity
  const pulseFactor = isDestination
    ? 0.55 + Math.sin(time / 900) * 0.45
    : 0;

  // Parse planet color for atmosphere (strip alpha if present)
  const baseColor = planet.color.length > 7 ? planet.color.slice(0, 7) : planet.color;
  const atmColor = planet.atmosphereColor.length > 9
    ? planet.atmosphereColor.slice(0, 7)
    : planet.atmosphereColor.slice(0, 7);

  return (
    <Group>
      {/* Outer atmosphere halo */}
      <Circle
        cx={sx}
        cy={sy}
        r={sr * 2.2}
        color={`${atmColor}18`}
      />
      <Circle
        cx={sx}
        cy={sy}
        r={sr * 1.55}
        color={`${atmColor}2A`}
      />

      {/* Planet body */}
      <Circle cx={sx} cy={sy} r={sr} color={baseColor} />

      {/* Surface detail by type */}
      {planet.type === 'gas_giant' && (
        <GasGiantBands sx={sx} sy={sy} sr={sr} color={baseColor} />
      )}
      {planet.type === 'ice' && <IceCaps sx={sx} sy={sy} sr={sr} />}
      {planet.type === 'lava' && <LavaCracks sx={sx} sy={sy} sr={sr} />}
      {planet.type === 'crystal' && <CrystalFacets sx={sx} sy={sy} sr={sr} />}
      {(planet.type === 'terrestrial' || planet.type === 'dead') && (
        // Simple shadow on one side
        <Circle cx={sx + sr * 0.25} cy={sy + sr * 0.2} r={sr * 0.72} color="rgba(0,0,0,0.22)" />
      )}

      {/* Limb highlight (top-left catch light) */}
      <Circle cx={sx - sr * 0.28} cy={sy - sr * 0.28} r={sr * 0.45} color={`${atmColor}18`} />

      {/* Orbit ring when player is here */}
      {isOrbitTarget && (
        <Circle
          cx={sx}
          cy={sy}
          r={sr * 1.8}
          color="transparent"
          style="stroke"
          strokeWidth={0.5 + (orbitDecayPercent / 100) * 1.5}
          opacity={0.15 + (orbitDecayPercent / 100) * 0.55}
        />
      )}

      {/* Destination indicator pulse */}
      {isDestination && (
        <Group>
          <Circle
            cx={sx}
            cy={sy}
            r={sr * 2.4}
            color="transparent"
            style="stroke"
            strokeWidth={1}
            opacity={pulseFactor * 0.4}
          />
          <Circle
            cx={sx}
            cy={sy}
            r={sr * 2.8}
            color="transparent"
            style="stroke"
            strokeWidth={0.5}
            opacity={pulseFactor * 0.2}
          />
        </Group>
      )}
    </Group>
  );
});
