import type { BodyKind } from '../core/types';

/**
 * Physical + gameplay identity of each celestial archetype.
 * mass = density × radius², so gravity/escape velocity emerge from these
 * numbers rather than being hand-set per body.
 */
export interface BodyArchetype {
  kind: BodyKind;
  radius: { min: number; max: number };
  /** Mass density multiplier — the main lever for how "heavy" a kind feels. */
  density: number;
  /** Gravity influence cutoff, × radius. */
  influenceFactor: number;
  /** Max capture distance, × radius. */
  captureFactor: number;
  /** Stable-orbit duration before decay (s). Black holes override via hazards config. */
  decayTime: number;
  coinReward: number;
  /** Spawn weight; scaled by depth gates below. */
  weight: number;
  /** Body does not appear before this depth (bodies visited). */
  minDepth: number;
}

export const bodyArchetypes: readonly BodyArchetype[] = [
  {
    kind: 'planet',
    radius: { min: 34, max: 54 },
    density: 1.0,
    influenceFactor: 7.5,
    captureFactor: 3.0,
    decayTime: 8,
    coinReward: 2,
    weight: 10,
    minDepth: 0,
  },
  {
    kind: 'deadPlanet',
    radius: { min: 24, max: 40 },
    density: 0.72,
    influenceFactor: 6.5,
    captureFactor: 2.8,
    decayTime: 10,
    coinReward: 1,
    weight: 6,
    minDepth: 2,
  },
  {
    kind: 'gasGiant',
    radius: { min: 62, max: 92 },
    density: 0.55, // huge but diffuse — big influence, softer surface gravity
    influenceFactor: 6.0,
    captureFactor: 2.6,
    decayTime: 7,
    coinReward: 4,
    weight: 4,
    minDepth: 4,
  },
  {
    kind: 'star',
    radius: { min: 48, max: 70 },
    density: 1.45,
    influenceFactor: 8.0,
    captureFactor: 3.2,
    decayTime: 6,
    coinReward: 5,
    weight: 3,
    minDepth: 6,
  },
  {
    kind: 'blackHole',
    radius: { min: 22, max: 30 },
    density: 6.0, // gravity multiplier applied on top — see hazards config
    influenceFactor: 12.0,
    captureFactor: 4.0,
    decayTime: 3.2,
    coinReward: 10,
    weight: 1.5,
    minDepth: 10,
  },
  {
    kind: 'supernova',
    radius: { min: 44, max: 60 },
    density: 1.3,
    influenceFactor: 7.5,
    captureFactor: 3.0,
    decayTime: 12, // decay is irrelevant — the fuse gets you first
    coinReward: 8,
    weight: 2,
    minDepth: 8,
  },
] as const;

export const archetypeOf = (kind: BodyKind): BodyArchetype => {
  const a = bodyArchetypes.find((b) => b.kind === kind);
  if (!a) throw new Error(`Unknown body kind: ${kind}`);
  return a;
};
