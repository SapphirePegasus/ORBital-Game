/**
 * Feature toggles — the single source of truth for every user-switchable
 * feature. Pure data (like the cosmetics catalog): each entry gates one real
 * code path; nothing speculative.
 *
 * Defaults live here; the user's overrides persist inside the validated,
 * checksummed progress envelope (see state/persistence.ts) — an edited save
 * can only ever produce booleans for known ids.
 *
 * Deliberate exclusion: hazards. Toggling hazards would change scoring
 * difficulty and make best-score comparisons meaningless, so it is a design
 * constant, not a user switch.
 */

export interface FeatureDef {
  id: FeatureId;
  name: string;
  /** One-line description shown in the settings UI. */
  hint: string;
}

export type FeatureId =
  | 'upgrades'
  | 'customize'
  | 'steering'
  | 'tutorialHints'
  | 'screenShake'
  | 'particles'
  | 'crashReports';

export const featureDefs: readonly FeatureDef[] = [
  { id: 'upgrades', name: 'Upgrades', hint: 'Upgrade shop between runs' },
  { id: 'customize', name: 'Customize', hint: 'Rocket skins, colors and trails' },
  { id: 'steering', name: 'Steering', hint: 'Hold a screen side to steer in flight' },
  { id: 'tutorialHints', name: 'Hints', hint: 'First-run tutorial prompts' },
  { id: 'screenShake', name: 'Screen shake', hint: 'Impact camera shake' },
  { id: 'particles', name: 'Particles', hint: 'Exhaust and explosion particles' },
  {
    id: 'crashReports',
    name: 'Crash reports',
    hint: 'Anonymous crash data (no personal info). Enabling applies on next launch',
  },
] as const;

export const featureIds: readonly FeatureId[] = featureDefs.map((d) => d.id);

export const defaultFeatures: Readonly<Record<FeatureId, boolean>> = {
  upgrades: true,
  customize: true,
  steering: true,
  tutorialHints: true,
  screenShake: true,
  particles: true,
  crashReports: true,
} as const;
