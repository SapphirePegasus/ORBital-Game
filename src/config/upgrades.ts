import type { UpgradeId, UpgradeLevels } from '../core/types';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  /** cost(level) = round(baseCost × growth^level) for buying level+1. */
  costGrowth: number;
}

export const upgradeDefs: readonly UpgradeDef[] = [
  {
    id: 'chargeControl',
    name: 'Throttle Control',
    description: 'Slower charge sweep — finer launch-speed precision.',
    maxLevel: 5,
    baseCost: 20,
    costGrowth: 1.9,
  },
  {
    id: 'boosters',
    name: 'Boosters',
    description: '+1 mid-flight boost per hop. Tap while flying to burn.',
    maxLevel: 3,
    baseCost: 40,
    costGrowth: 2.2,
  },
  {
    id: 'shield',
    name: 'Hull Shield',
    description: '+1 shield per run. Absorbs one asteroid or flare hit.',
    maxLevel: 3,
    baseCost: 60,
    costGrowth: 2.4,
  },
  {
    id: 'stabilizers',
    name: 'Orbit Stabilizers',
    description: '+20% stable orbit time before decay, per level.',
    maxLevel: 5,
    baseCost: 25,
    costGrowth: 1.8,
  },
  {
    id: 'magnet',
    name: 'Salvage Magnet',
    description: 'Wider coin pickup radius.',
    maxLevel: 4,
    baseCost: 15,
    costGrowth: 1.8,
  },
] as const;

export const upgradeCost = (def: UpgradeDef, currentLevel: number): number =>
  Math.round(def.baseCost * Math.pow(def.costGrowth, currentLevel));

export const defaultUpgrades: UpgradeLevels = {
  chargeControl: 0,
  boosters: 0,
  shield: 0,
  stabilizers: 0,
  magnet: 0,
};

/** Stabilizer multiplier applied to every body's decayTime. */
export const stabilizerMultiplier = (level: number): number => 1 + 0.2 * level;
