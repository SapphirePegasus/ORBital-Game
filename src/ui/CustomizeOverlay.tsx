/**
 * Customize screen: rocket skins, color schemes, trail styles.
 *
 * The preview is a real Skia canvas rendering the *selected* (not yet
 * equipped) combination through the exact same `resolveCosmetics` runtime the
 * game uses — what you see is literally what you fly. Selection is local
 * state; Buy spends coins through the store (which enforces catalog validity
 * and funds), Equip persists through the sanitized save layer.
 */
import { Canvas, Picture, createPicture, Skia } from '@shopify/react-native-skia';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { audioManager } from '../audio/audioManager';
import {
  colorSchemes,
  rocketSkins,
  trailStyles,
  type CosmeticKind,
} from '../config/cosmetics';
import { palette } from '../config/palette';
import { resolveCosmetics, trailPaintFor } from '../render/cosmeticsRuntime';
import { gameActions } from '../state/gameStore';
import { progressActions, progressStore } from '../state/progressStore';
import { useStore } from '../state/store';
import { FadeView, MinimalButton } from './components';

const PREVIEW_W = 260;
const PREVIEW_H = 130;

const PreviewCanvas: React.FC<{ skin: string; scheme: string; trail: string }> = ({
  skin,
  scheme,
  trail,
}) => {
  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        const resolved = resolveCosmetics(skin, scheme, trail);
        // Trail sweep behind the ship, faked as a gentle arc of aged samples.
        for (let i = 0; i < 14; i++) {
          const t = i / 13;
          const x = PREVIEW_W * 0.62 - i * 13;
          const y = PREVIEW_H * 0.52 + Math.sin(t * 2.2) * 9;
          const paint = trailPaintFor(resolved, t);
          const size = resolved.trailSize * (1 - t * 0.7);
          if (resolved.trailMode === 'plasma') {
            resolved.trailGlowPaint.setAlphaf(0.5 * (1 - t));
            canvas.drawCircle(x, y, size, resolved.trailGlowPaint);
          }
          if (resolved.trailMode !== 'embers' || i % 2 === 0) {
            canvas.drawCircle(x, y, Math.max(1, size * 0.7), paint);
          }
        }
        canvas.save();
        canvas.translate(PREVIEW_W * 0.66, PREVIEW_H * 0.5);
        canvas.scale(16, 16);
        canvas.drawPath(resolved.flamePath, resolved.flamePaint);
        for (const fin of resolved.finPaths) canvas.drawPath(fin, resolved.accentPaint);
        canvas.drawPath(resolved.hullPath, resolved.hullPaint);
        canvas.restore();
      }, Skia.XYWHRect(0, 0, PREVIEW_W, PREVIEW_H)),
    [skin, scheme, trail],
  );
  return (
    <Canvas style={styles.preview}>
      <Picture picture={picture} />
    </Canvas>
  );
};

interface RowItem {
  id: string;
  name: string;
  cost: number;
}

const CosmeticRow: React.FC<{
  title: string;
  kind: CosmeticKind;
  items: readonly RowItem[];
  selected: string;
  onSelect: (id: string) => void;
}> = ({ title, kind, items, selected, onSelect }) => {
  const coins = useStore(progressStore, (s) => s.coins);
  const unlocked = useStore(progressStore, (s) => s.unlocked);
  const equipped = useStore(progressStore, (s) => s.equipped);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
        {items.map((item) => {
          const owned = unlocked[kind].includes(item.id);
          const isEquipped = equipped[kind] === item.id;
          const isSelected = selected === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}${owned ? '' : `, costs ${item.cost}`}`}
              onPress={() => {
                audioManager.play('ui');
                onSelect(item.id);
              }}
              style={[styles.card, isSelected && styles.cardSelected]}
            >
              <Text style={[styles.cardName, isSelected && { color: palette.accent }]}>
                {item.name}
              </Text>
              <Text style={styles.cardMeta}>
                {isEquipped
                  ? 'EQUIPPED'
                  : owned
                    ? 'OWNED'
                    : `◈ ${item.cost}`}
              </Text>
              {!owned && coins < item.cost && <View style={styles.lockDim} pointerEvents="none" />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

export const CustomizeOverlay: React.FC<{ visible: boolean }> = ({ visible }) => {
  const enabled = useStore(progressStore, (s) => s.features.customize);
  const insets = useSafeAreaInsets();
  const coins = useStore(progressStore, (s) => s.coins);
  const unlocked = useStore(progressStore, (s) => s.unlocked);
  const equipped = useStore(progressStore, (s) => s.equipped);

  const [selSkin, setSelSkin] = useState(equipped.skin);
  const [selScheme, setSelScheme] = useState(equipped.scheme);
  const [selTrail, setSelTrail] = useState(equipped.trail);

  // Re-sync local selection whenever the overlay opens.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setWasVisible(true);
    setSelSkin(equipped.skin);
    setSelScheme(equipped.scheme);
    setSelTrail(equipped.trail);
  } else if (!visible && wasVisible) {
    setWasVisible(false);
  }

  const pending: { kind: CosmeticKind; id: string; cost: number }[] = [];
  const consider = (kind: CosmeticKind, id: string, items: readonly RowItem[]): void => {
    if (!unlocked[kind].includes(id)) {
      const def = items.find((i) => i.id === id);
      if (def) pending.push({ kind, id, cost: def.cost });
    }
  };
  consider('skin', selSkin, rocketSkins);
  consider('scheme', selScheme, colorSchemes);
  consider('trail', selTrail, trailStyles);
  const totalCost = pending.reduce((sum, p) => sum + p.cost, 0);
  const canAfford = coins >= totalCost;

  const apply = (): void => {
    for (const p of pending) {
      if (!progressActions.buyCosmetic(p.kind, p.id)) return; // funds raced out — stop safely
    }
    progressActions.equipCosmetic('skin', selSkin);
    progressActions.equipCosmetic('scheme', selScheme);
    progressActions.equipCosmetic('trail', selTrail);
    audioManager.play('capture');
  };

  return (
    <FadeView visible={visible && enabled} style={styles.scrim}>
      <View style={[styles.fill, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.heading}>CUSTOMIZE</Text>
        <Text style={styles.wallet}>◈ {coins}</Text>
        <PreviewCanvas skin={selSkin} scheme={selScheme} trail={selTrail} />
        <ScrollView style={styles.sections} showsVerticalScrollIndicator={false}>
          <CosmeticRow title="Hull" kind="skin" items={rocketSkins} selected={selSkin} onSelect={setSelSkin} />
          <CosmeticRow title="Colors" kind="scheme" items={colorSchemes} selected={selScheme} onSelect={setSelScheme} />
          <CosmeticRow title="Trail" kind="trail" items={trailStyles} selected={selTrail} onSelect={setSelTrail} />
        </ScrollView>
        <MinimalButton
          label={
            pending.length === 0
              ? 'Equipped'
              : totalCost > 0
                ? `Buy & Equip · ◈ ${totalCost}`
                : 'Equip'
          }
          primary
          disabled={pending.length > 0 && !canAfford}
          onPress={apply}
        />
        <MinimalButton label="Back" onPress={() => gameActions.setCustomizeOpen(false)} />
      </View>
    </FadeView>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(5,6,15,0.9)' },
  fill: { flex: 1, alignItems: 'center' },
  heading: { color: palette.text, fontSize: 24, fontWeight: '200', letterSpacing: 8 },
  wallet: { color: palette.accent, fontSize: 15, marginTop: 6, fontVariant: ['tabular-nums'] },
  preview: {
    width: PREVIEW_W,
    height: PREVIEW_H,
    marginVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: 16,
  },
  sections: { alignSelf: 'stretch', flexGrow: 0, flexShrink: 1 },
  section: { marginBottom: 14 },
  sectionTitle: {
    color: palette.textDim,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginLeft: 26,
    marginBottom: 8,
  },
  rowContent: { paddingHorizontal: 22, gap: 10 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 108,
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  cardSelected: { borderColor: palette.accent },
  cardName: { color: palette.text, fontSize: 13, letterSpacing: 1 },
  cardMeta: { color: palette.textDim, fontSize: 10, letterSpacing: 1.5 },
  lockDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5,6,15,0.45)',
  },
});
