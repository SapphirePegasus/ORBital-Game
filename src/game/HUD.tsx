/**
 * HUD — heads-up display overlay drawn in React Native (not Skia).
 *
 * Kept in React Native (not Skia) so we can use standard accessibility,
 * system fonts, and avoid the Skia text layout complexity for UI strings.
 *
 * Layout:
 *   Top-left:  score
 *   Top-right: fuel
 *   Bottom:    speed bar | orbit decay bar | charge bar
 *   Touch hint zones (subtle): L indicator / R indicator
 */

import React, { memo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import type { HUDData } from '../types';
import { COLORS } from '../constants';

// ─── Props ────────────────────────────────────────────────────────────────────

interface HUDProps {
  data: HUDData;
  isOrbiting: boolean;
  isHolding: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const BarMeter: React.FC<{
  value: number; // 0–100
  label: string;
  colorLow: string;
  colorHigh: string;
  invert?: boolean; // if true, high value = danger color
}> = memo(({ value, label, colorLow, colorHigh, invert }) => {
  const clamped = Math.min(Math.max(value, 0), 100);
  const t = clamped / 100;
  const fillColor = interpolateColorDirect(
    t,
    invert ? colorHigh : colorLow,
    invert ? colorLow : colorHigh,
  );

  return (
    <View style={styles.barContainer}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              width: `${clamped}%`,
              backgroundColor: fillColor,
            },
          ]}
        />
      </View>
      <Text style={styles.barValue}>{Math.round(clamped)}</Text>
    </View>
  );
});

/** Simple lerp between two hex colors — avoids Reanimated overhead for HUD */
function interpolateColorDirect(t: number, from: string, to: string): string {
  const parseHex = (hex: string) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  });
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const f = parseHex(from);
  const to_ = parseHex(to);
  return `rgb(${lerp(f.r, to_.r, t)},${lerp(f.g, to_.g, t)},${lerp(f.b, to_.b, t)})`;
}

// ─── Main HUD ─────────────────────────────────────────────────────────────────

export const HUD: React.FC<HUDProps> = memo(({ data, isOrbiting, isHolding }) => {
  const { width: W, height: H } = useWindowDimensions();

  const speedPercent = Math.min((data.speedMagnitude / 20) * 100, 100);

  return (
    <View style={[styles.root, { width: W, height: H }]} pointerEvents="none">

      {/* ── Top row ─────────────────────────────────────────────────────── */}
      <View style={styles.topRow}>
        {/* Score */}
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>SCORE</Text>
          <Text style={styles.pillValue}>{data.score.toLocaleString()}</Text>
        </View>

        {/* Current planet */}
        {data.currentPlanetName ? (
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>ORBIT</Text>
            <Text style={styles.pillValue}>{data.currentPlanetName}</Text>
          </View>
        ) : null}

        {/* Fuel */}
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>FUEL</Text>
          <Text style={[
            styles.pillValue,
            { color: data.fuel < 25 ? COLORS.uiDanger : COLORS.hudText },
          ]}>
            {Math.round(data.fuel)}%
          </Text>
        </View>
      </View>

      {/* ── Touch zone hints ────────────────────────────────────────────── */}
      {isOrbiting && (
        <View style={styles.zoneHints}>
          <View style={styles.zoneLeft}>
            <Text style={styles.zoneText}>◀</Text>
          </View>
          <View style={styles.zoneCenter}>
            {isHolding ? (
              <Text style={styles.zoneCenterHolding}>CHARGING</Text>
            ) : (
              <Text style={styles.zoneCenterIdle}>HOLD TO LAUNCH</Text>
            )}
          </View>
          <View style={styles.zoneRight}>
            <Text style={styles.zoneText}>▶</Text>
          </View>
        </View>
      )}

      {/* ── Bottom meters ────────────────────────────────────────────────── */}
      <View style={styles.bottomMeters}>
        <BarMeter
          value={speedPercent}
          label="SPD"
          colorLow={COLORS.speedBar}
          colorHigh="#FFAA00"
        />
        {isOrbiting && (
          <BarMeter
            value={data.orbitDecayPercent}
            label="DEC"
            colorLow={COLORS.orbitDecayLow}
            colorHigh={COLORS.orbitDecayHigh}
            invert
          />
        )}
        {isHolding && (
          <BarMeter
            value={data.launchChargePercent}
            label="CHG"
            colorLow={COLORS.chargeBar}
            colorHigh={COLORS.chargeBarFull}
          />
        )}
      </View>

    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'space-between',
    paddingTop: 52, // safe area — override with useSafeAreaInsets in prod
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pill: {
    backgroundColor: COLORS.hudBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 70,
  },
  pillLabel: {
    fontSize: 9,
    color: COLORS.hudTextMuted,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  pillValue: {
    fontSize: 16,
    color: COLORS.hudText,
    fontWeight: '300',
    marginTop: 2,
  },
  zoneHints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  zoneLeft: {
    opacity: 0.25,
    width: 60,
    alignItems: 'center',
  },
  zoneRight: {
    opacity: 0.25,
    width: 60,
    alignItems: 'center',
  },
  zoneCenter: {
    flex: 1,
    alignItems: 'center',
  },
  zoneText: {
    color: COLORS.hudText,
    fontSize: 22,
  },
  zoneCenterIdle: {
    color: COLORS.hudTextMuted,
    fontSize: 11,
    letterSpacing: 2,
  },
  zoneCenterHolding: {
    color: COLORS.chargeBarFull,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '600',
  },
  bottomMeters: {
    gap: 8,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    color: COLORS.hudTextMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    width: 28,
    fontWeight: '600',
  },
  barTrack: {
    flex: 1,
    height: 3,
    backgroundColor: '#FFFFFF18',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  barValue: {
    color: COLORS.hudTextMuted,
    fontSize: 10,
    width: 28,
    textAlign: 'right',
  },
});
