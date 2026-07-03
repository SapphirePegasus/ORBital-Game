/**
 * CollectibleRenderer — all collectible types in declarative Skia JSX.
 *
 * coin:        Golden circle with spin highlight
 * fuel:        Green rounded bar / droplet
 * mineral:     Purple hexagon
 * dark_matter: Pink diamond with strong glow
 *
 * All pulse gently to draw the player's eye.
 */

import React, { memo } from 'react';
import { Circle, Group, Path } from '@shopify/react-native-skia';
import type { Collectible } from '../types';
import type { CameraState } from './renderMath';
import {
  worldToScreen,
  worldRadiusToScreen,
  isVisible,
  buildHexPath,
  buildDiamondPath,
} from './renderMath';
import { COLORS } from '../constants';

// ─── Individual collectible types ─────────────────────────────────────────────

const CoinRenderer: React.FC<{ sx: number; sy: number; sr: number; pulse: number }> = memo(
  ({ sx, sy, sr, pulse }) => (
    <Group>
      {/* Outer glow */}
      <Circle cx={sx} cy={sy} r={sr * 2.2} color={`rgba(255,215,0,${(0.08 + pulse * 0.08).toFixed(2)})`} />
      {/* Body */}
      <Circle cx={sx} cy={sy} r={sr} color={COLORS.collectibleCoin} />
      {/* Inner highlight */}
      <Circle cx={sx - sr * 0.25} cy={sy - sr * 0.25} r={sr * 0.38} color="rgba(255,255,180,0.55)" />
      {/* Rim */}
      <Circle cx={sx} cy={sy} r={sr} color="transparent" style="stroke" strokeWidth={0.8}
        opacity={0.5} />
    </Group>
  ),
);

const FuelRenderer: React.FC<{ sx: number; sy: number; sr: number; pulse: number }> = memo(
  ({ sx, sy, sr, pulse }) => (
    <Group>
      {/* Glow */}
      <Circle cx={sx} cy={sy} r={sr * 2.0} color={`rgba(0,255,136,${(0.07 + pulse * 0.07).toFixed(2)})`} />
      {/* Body — elongated oval (fuel canister shape) */}
      <Circle cx={sx} cy={sy} r={sr} color={COLORS.collectibleFuel} />
      {/* Cap highlight */}
      <Circle cx={sx} cy={sy - sr * 0.3} r={sr * 0.45} color="rgba(100,255,180,0.45)" />
    </Group>
  ),
);

const MineralRenderer: React.FC<{ sx: number; sy: number; sr: number; pulse: number }> = memo(
  ({ sx, sy, sr, pulse }) => {
    const hexPath = buildHexPath(sx, sy, sr);
    return (
      <Group>
        {/* Glow */}
        <Circle cx={sx} cy={sy} r={sr * 2.2} color={`rgba(170,68,255,${(0.08 + pulse * 0.08).toFixed(2)})`} />
        {/* Body hexagon */}
        <Path path={hexPath} color={COLORS.collectibleMineral} />
        {/* Inner facet */}
        <Path path={buildHexPath(sx, sy, sr * 0.55)} color="rgba(200,150,255,0.4)" />
        {/* Rim */}
        <Path path={hexPath} color="transparent" style="stroke" strokeWidth={0.8} opacity={0.5} />
      </Group>
    );
  },
);

const DarkMatterRenderer: React.FC<{ sx: number; sy: number; sr: number; pulse: number }> = memo(
  ({ sx, sy, sr, pulse }) => {
    const diamondPath = buildDiamondPath(sx, sy, sr);
    return (
      <Group>
        {/* Strong glow — dark matter is rare */}
        <Circle cx={sx} cy={sy} r={sr * 3.0} color={`rgba(255,0,170,${(0.08 + pulse * 0.1).toFixed(2)})`} />
        <Circle cx={sx} cy={sy} r={sr * 1.8} color={`rgba(255,0,170,${(0.15 + pulse * 0.1).toFixed(2)})`} />
        {/* Body */}
        <Path path={diamondPath} color={COLORS.collectibleDarkMatter} />
        {/* Inner shimmer */}
        <Path path={buildDiamondPath(sx, sy, sr * 0.5)} color="rgba(255,150,220,0.55)" />
        {/* Rim */}
        <Path path={diamondPath} color="transparent" style="stroke" strokeWidth={1} opacity={0.6} />
      </Group>
    );
  },
);

// ─── Dispatcher ───────────────────────────────────────────────────────────────

interface CollectibleRendererProps {
  collectible: Collectible;
  cam: CameraState;
  time: number;
}

export const CollectibleRenderer: React.FC<CollectibleRendererProps> = memo(
  ({ collectible, cam, time }) => {
    if (collectible.collected) return null;
    if (!isVisible(collectible.position.x, collectible.position.y, collectible.radius * 3, cam)) {
      return null;
    }

    const { sx, sy } = worldToScreen(collectible.position.x, collectible.position.y, cam);
    const sr = worldRadiusToScreen(collectible.radius, cam.zoom);
    const pulse = (Math.sin(time / 800) + 1) / 2; // 0–1

    switch (collectible.type) {
      case 'coin':
        return <CoinRenderer sx={sx} sy={sy} sr={sr} pulse={pulse} />;
      case 'fuel':
        return <FuelRenderer sx={sx} sy={sy} sr={sr} pulse={pulse} />;
      case 'mineral':
        return <MineralRenderer sx={sx} sy={sy} sr={sr} pulse={pulse} />;
      case 'dark_matter':
        return <DarkMatterRenderer sx={sx} sy={sy} sr={sr} pulse={pulse} />;
      default:
        return null;
    }
  },
);

// ─── Batch renderer ───────────────────────────────────────────────────────────

interface CollectiblesLayerProps {
  collectibles: Collectible[];
  cam: CameraState;
  time: number;
}

export const CollectiblesLayer: React.FC<CollectiblesLayerProps> = memo(
  ({ collectibles, cam, time }) => (
    <Group>
      {collectibles.map(c => (
        <CollectibleRenderer key={c.id} collectible={c} cam={cam} time={time} />
      ))}
    </Group>
  ),
);
