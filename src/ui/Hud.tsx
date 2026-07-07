/**
 * In-game HUD. Deliberately quiet: score up top, one row of physics readouts
 * at the bottom (speed / gravity / mass / escape velocity) so the player can
 * judge how long to hold, plus a charge bar that appears only while charging.
 * Numbers refresh at gameConfig.ui.hudHz — the canvas beneath is always 60+.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { gameConfig } from '../config/gameConfig';
import { palette } from '../config/palette';
import type { HudInfo } from '../engine/engine';
import { gameActions, gameStore, type TutorialHint } from '../state/gameStore';
import { useStore } from '../state/store';
import { StatChip } from './components';

interface Props {
  visible: boolean;
  getHud: () => HudInfo | null;
}

const kindLabels: Record<string, string> = {
  planet: 'Planet',
  deadPlanet: 'Dead Planet',
  gasGiant: 'Gas Giant',
  star: 'Star',
  blackHole: 'Black Hole',
  supernova: 'Supernova',
  '—': '—',
};

const hintText: Record<Exclude<TutorialHint, null>, string> = {
  hold: 'hold anywhere to charge your launch',
  release: 'release to fly — watch the dotted path',
  steer: 'hold left / right side to steer',
};

export const Hud: React.FC<Props> = ({ visible, getHud }) => {
  const insets = useSafeAreaInsets();
  const score = useStore(gameStore, (s) => s.score);
  const runCoins = useStore(gameStore, (s) => s.runCoins);
  const hint = useStore(gameStore, (s) => s.hint);
  const [hud, setHud] = useState<HudInfo | null>(null);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setHud(getHud()), 1000 / gameConfig.ui.hudHz);
    return () => clearInterval(id);
  }, [visible, getHud]);

  if (!visible) return null;

  const charge = hud?.chargeT ?? 0;
  const decay = hud?.decayRemaining ?? 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        <View>
          <Text style={styles.score}>{score}</Text>
          <Text style={styles.coins}>◈ {runCoins}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pause"
          onPress={gameActions.pause}
          hitSlop={16}
          style={styles.pauseButton}
        >
          <View style={styles.pauseBar} />
          <View style={styles.pauseBar} />
        </Pressable>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="none">
        {hint !== null && <Text style={styles.hint}>{hintText[hint]}</Text>}
        {charge > 0 && (
          <View style={styles.chargeTrack}>
            <View style={[styles.chargeFill, { width: `${Math.round(charge * 100)}%` }]} />
          </View>
        )}
        {hud?.mode !== 'flying' && decay < 1 && (
          <Text style={[styles.decayText, decay < gameConfig.decay.warnAt && styles.decayWarn]}>
            orbit {Math.round(decay * 100)}%
          </Text>
        )}
        <View style={styles.statsRow}>
          <StatChip label="Speed" value={`${Math.round(hud?.speed ?? 0)}`} />
          <StatChip label="Gravity" value={(hud?.bodyGravity ?? 0).toFixed(1)} />
          <StatChip label="Mass" value={formatMass(hud?.bodyMass ?? 0)} />
          <StatChip label="Esc Vel" value={`${Math.round(hud?.escapeVelocity ?? 0)}`} />
        </View>
        <Text style={styles.bodyKind}>
          {kindLabels[hud?.bodyKind ?? '—'] ?? '—'}
          {(hud?.shields ?? 0) > 0 ? `   ⬡ ${hud?.shields}` : ''}
        </Text>
      </View>
    </View>
  );
};

const formatMass = (m: number): string =>
  m >= 1000 ? `${(m / 1000).toFixed(1)}k` : `${Math.round(m)}`;

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 22,
  },
  score: { color: palette.text, fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '200' },
  coins: { color: palette.accent, fontSize: 14, marginTop: 2, fontVariant: ['tabular-nums'] },
  pauseButton: { flexDirection: 'row', gap: 5, padding: 8 },
  pauseBar: { width: 4, height: 18, backgroundColor: palette.textDim, borderRadius: 2 },
  bottom: { alignItems: 'center', gap: 8, paddingHorizontal: 22 },
  chargeTrack: {
    width: '72%',
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.hairline,
    overflow: 'hidden',
  },
  chargeFill: { height: '100%', backgroundColor: palette.accent },
  decayText: { color: palette.textDim, fontSize: 11, letterSpacing: 2 },
  hint: {
    color: palette.accent,
    fontSize: 13,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  decayWarn: { color: palette.danger },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  bodyKind: { color: palette.textDim, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase' },
});
