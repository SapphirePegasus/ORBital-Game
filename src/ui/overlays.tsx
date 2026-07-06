/**
 * Overlay screens. Each is a FadeView layered above the persistent canvas —
 * the world keeps breathing behind the menu (attract mode), which is what
 * gives the game its calm, seamless feel.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { audioManager } from '../audio/audioManager';
import { palette } from '../config/palette';
import { upgradeCost, upgradeDefs } from '../config/upgrades';
import { deathMessages, gameActions, gameStore } from '../state/gameStore';
import { progressActions, progressStore } from '../state/progressStore';
import { useStore } from '../state/store';
import { FadeView, MinimalButton, StatChip } from './components';

// ------------------------------------------------------------------- Menu

export const MenuOverlay: React.FC<{ visible: boolean; onStart: () => void }> = ({
  visible,
  onStart,
}) => {
  const insets = useSafeAreaInsets();
  const bestScore = useStore(progressStore, (s) => s.bestScore);
  const coins = useStore(progressStore, (s) => s.coins);

  return (
    <FadeView visible={visible}>
      <Pressable
        style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom + 30 }]}
        onPress={onStart}
        accessibilityRole="button"
        accessibilityLabel="Tap to start"
      >
        <View style={styles.menuTop}>
          <Text style={styles.title}>SPACE{'\n'}HOPPER</Text>
          <Text style={styles.subtitle}>hold to charge · release to fly</Text>
        </View>
        <View style={styles.menuBottom}>
          <Text style={styles.tapToStart}>tap to start</Text>
          <View style={styles.menuStats}>
            <StatChip label="Best" value={`${bestScore}`} />
            <StatChip label="Coins" value={`◈ ${coins}`} />
          </View>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              audioManager.play('ui');
              gameActions.setShopOpen(true);
            }}
            accessibilityRole="button"
            hitSlop={10}
          >
            <Text style={styles.link}>hangar · upgrades</Text>
          </Pressable>
        </View>
      </Pressable>
    </FadeView>
  );
};

// ------------------------------------------------------------------ Pause

export const PauseOverlay: React.FC<{ visible: boolean; onQuit: () => void }> = ({
  visible,
  onQuit,
}) => {
  const music = useStore(progressStore, (s) => s.musicEnabled);
  const sfx = useStore(progressStore, (s) => s.sfxEnabled);
  const haptics = useStore(progressStore, (s) => s.hapticsEnabled);

  return (
    <FadeView visible={visible} style={styles.scrim}>
      <View style={styles.center}>
        <Text style={styles.heading}>PAUSED</Text>
        <MinimalButton label="Resume" primary onPress={gameActions.resume} />
        <MinimalButton label="Abandon Run" onPress={onQuit} />
        <View style={styles.settings}>
          <SettingRow label="Music" value={music} onToggle={() => {
            progressActions.toggleSetting('musicEnabled');
            audioManager.applyMusicSetting();
          }} />
          <SettingRow label="Sound" value={sfx} onToggle={() => progressActions.toggleSetting('sfxEnabled')} />
          <SettingRow label="Haptics" value={haptics} onToggle={() => progressActions.toggleSetting('hapticsEnabled')} />
        </View>
      </View>
    </FadeView>
  );
};

const SettingRow: React.FC<{ label: string; value: boolean; onToggle: () => void }> = ({
  label,
  value,
  onToggle,
}) => (
  <View style={styles.settingRow}>
    <Text style={styles.settingLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onToggle}
      trackColor={{ true: palette.accentDim, false: palette.hairline }}
      thumbColor={value ? palette.accent : palette.textDim}
    />
  </View>
);

// --------------------------------------------------------------- Game over

export const GameOverOverlay: React.FC<{
  visible: boolean;
  onRetry: () => void;
  onMenu: () => void;
}> = ({ visible, onRetry, onMenu }) => {
  const score = useStore(gameStore, (s) => s.score);
  const runCoins = useStore(gameStore, (s) => s.runCoins);
  const depth = useStore(gameStore, (s) => s.depth);
  const cause = useStore(gameStore, (s) => s.deathCause);
  const isNewBest = useStore(gameStore, (s) => s.isNewBest);

  return (
    <FadeView visible={visible} style={styles.scrim}>
      <View style={styles.center}>
        <Text style={styles.heading}>SIGNAL LOST</Text>
        <Text style={styles.deathCause}>{cause ? deathMessages[cause] : ''}</Text>
        {isNewBest && <Text style={styles.newBest}>new best</Text>}
        <Text style={styles.finalScore}>{score}</Text>
        <View style={styles.menuStats}>
          <StatChip label="Bodies" value={`${depth}`} />
          <StatChip label="Salvage" value={`◈ ${runCoins}`} />
        </View>
        <View style={{ height: 26 }} />
        <MinimalButton label="Retry" primary onPress={onRetry} />
        <MinimalButton label="Upgrades" onPress={() => gameActions.setShopOpen(true)} />
        <MinimalButton label="Menu" onPress={onMenu} />
      </View>
    </FadeView>
  );
};

// ----------------------------------------------------------------- Upgrades

export const UpgradesOverlay: React.FC<{ visible: boolean }> = ({ visible }) => {
  const insets = useSafeAreaInsets();
  const coins = useStore(progressStore, (s) => s.coins);
  const upgrades = useStore(progressStore, (s) => s.upgrades);

  return (
    <FadeView visible={visible} style={styles.scrim}>
      <View style={[styles.fill, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.heading}>HANGAR</Text>
        <Text style={styles.walletText}>◈ {coins}</Text>
        <ScrollView contentContainerStyle={styles.shopList} showsVerticalScrollIndicator={false}>
          {upgradeDefs.map((def) => {
            const level = upgrades[def.id];
            const maxed = level >= def.maxLevel;
            const cost = upgradeCost(def, level);
            const affordable = !maxed && coins >= cost;
            return (
              <View key={def.id} style={styles.shopRow}>
                <View style={styles.shopInfo}>
                  <Text style={styles.shopName}>{def.name}</Text>
                  <Text style={styles.shopDesc}>{def.description}</Text>
                  <View style={styles.pips}>
                    {Array.from({ length: def.maxLevel }, (_, i) => (
                      <View key={i} style={[styles.pip, i < level && styles.pipFilled]} />
                    ))}
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={maxed ? `${def.name} maxed` : `Buy ${def.name} for ${cost}`}
                  disabled={!affordable}
                  onPress={() => {
                    if (progressActions.buyUpgrade(def.id)) audioManager.play('coin');
                  }}
                  style={[styles.buyButton, !affordable && styles.buyDisabled]}
                >
                  <Text style={[styles.buyText, affordable && { color: palette.accent }]}>
                    {maxed ? 'MAX' : `◈ ${cost}`}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
        <MinimalButton label="Back" onPress={() => gameActions.setShopOpen(false)} />
      </View>
    </FadeView>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'space-between' },
  scrim: { backgroundColor: 'rgba(5,6,15,0.82)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  menuTop: { alignItems: 'center', marginTop: 90 },
  title: {
    color: palette.text,
    fontSize: 52,
    fontWeight: '100',
    letterSpacing: 14,
    textAlign: 'center',
    lineHeight: 64,
  },
  subtitle: { color: palette.textDim, fontSize: 12, letterSpacing: 3, marginTop: 18 },
  menuBottom: { alignItems: 'center', gap: 22 },
  tapToStart: { color: palette.accent, fontSize: 14, letterSpacing: 5, textTransform: 'uppercase' },
  menuStats: { flexDirection: 'row', gap: 42 },
  link: { color: palette.textDim, fontSize: 12, letterSpacing: 2, textDecorationLine: 'underline' },
  heading: { color: palette.text, fontSize: 24, fontWeight: '200', letterSpacing: 8, marginBottom: 10 },
  deathCause: { color: palette.textDim, fontSize: 13, marginBottom: 18, textAlign: 'center' },
  newBest: { color: palette.accent, fontSize: 12, letterSpacing: 4, textTransform: 'uppercase' },
  finalScore: { color: palette.text, fontSize: 64, fontWeight: '100', fontVariant: ['tabular-nums'] },
  settings: { marginTop: 34, width: 240, gap: 4 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { color: palette.textDim, fontSize: 13, letterSpacing: 2 },
  walletText: { color: palette.accent, fontSize: 16, marginBottom: 14, fontVariant: ['tabular-nums'] },
  shopList: { gap: 18, paddingHorizontal: 26, paddingBottom: 20, width: '100%' },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 14, width: '100%' },
  shopInfo: { flex: 1 },
  shopName: { color: palette.text, fontSize: 15, letterSpacing: 1 },
  shopDesc: { color: palette.textDim, fontSize: 11, marginTop: 3, lineHeight: 15 },
  pips: { flexDirection: 'row', gap: 5, marginTop: 7 },
  pip: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.hairline,
  },
  pipFilled: { backgroundColor: palette.accent },
  buyButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.hairline,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    minWidth: 76,
    alignItems: 'center',
  },
  buyDisabled: { opacity: 0.4 },
  buyText: { color: palette.textDim, fontSize: 13, fontVariant: ['tabular-nums'] },
});
