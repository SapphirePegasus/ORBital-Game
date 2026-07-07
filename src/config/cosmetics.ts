/**
 * Cosmetics catalog — the single source of truth for every purchasable
 * visual. Pure data: geometry in unit scale (rocket collision radius = 1),
 * colors as hex, costs in coins. The renderer resolves the equipped set once
 * per change; persistence validates every stored id against this catalog, so
 * a tampered save can never equip something that doesn't exist.
 *
 * Adding content = adding an entry here. Nothing else changes.
 */

export type CosmeticKind = 'skin' | 'scheme' | 'trail';

export interface RocketSkinDef {
  id: string;
  name: string;
  cost: number;
  /** Hull outline, unit scale, nose pointing +x. Closed automatically. */
  hull: readonly (readonly [number, number])[];
  /** Optional extra closed polygons (fins, pods) drawn in accent color. */
  fins?: readonly (readonly (readonly [number, number])[])[];
  /** Exhaust flame anchor (x offset of the nozzle, unit scale). */
  nozzleX: number;
  /**
   * Optional sprite slot: key into render/imageAssets `spriteManifest`
   * (convention: `rocket_<id>`). When registered art is loaded, it replaces
   * the vector hull/fins; flame, trail and colors still come from the scheme.
   */
  sprite?: string;
}

export interface ColorSchemeDef {
  id: string;
  name: string;
  cost: number;
  hull: string;
  accent: string;
  flame: string;
  /** Trail gradient, head → tail. */
  trail: readonly [string, string];
}

export type TrailMode = 'dots' | 'comet' | 'plasma' | 'embers';

export interface TrailStyleDef {
  id: string;
  name: string;
  cost: number;
  mode: TrailMode;
  /** Base stroke/dot size at the head, world units. */
  size: number;
  /** Optional sprite slot (`trail_<id>`): a soft particle stamped per point. */
  sprite?: string;
}

// --------------------------------------------------------------------- skins

export const rocketSkins: readonly RocketSkinDef[] = [
  {
    id: 'interceptor',
    name: 'Interceptor',
    cost: 0,
    hull: [[1.5, 0], [-1, 0.85], [-0.45, 0], [-1, -0.85]],
    nozzleX: -0.7,
  },
  {
    id: 'dart',
    name: 'Dart',
    cost: 80,
    hull: [[1.9, 0], [-0.6, 0.5], [-1.1, 0.2], [-1.1, -0.2], [-0.6, -0.5]],
    nozzleX: -1.0,
  },
  {
    id: 'hawk',
    name: 'Hawk',
    cost: 140,
    hull: [[1.4, 0], [0.2, 0.4], [-0.7, 1.1], [-0.9, 0.3], [-0.9, -0.3], [-0.7, -1.1], [0.2, -0.4]],
    nozzleX: -0.8,
  },
  {
    id: 'saucer',
    name: 'Saucer',
    cost: 200,
    hull: [
      [1.2, 0], [0.85, 0.6], [0, 0.85], [-0.85, 0.6], [-1.2, 0], [-0.85, -0.6], [0, -0.85], [0.85, -0.6],
    ],
    fins: [[[0.5, 0], [0, 0.35], [-0.5, 0], [0, -0.35]]],
    nozzleX: -1.0,
  },
  {
    id: 'retro',
    name: 'Retro',
    cost: 260,
    hull: [[1.6, 0], [0.9, 0.5], [-0.8, 0.5], [-0.8, -0.5], [0.9, -0.5]],
    fins: [
      [[-0.5, 0.5], [-1.3, 1.0], [-0.8, 0.5]],
      [[-0.5, -0.5], [-1.3, -1.0], [-0.8, -0.5]],
    ],
    nozzleX: -0.9,
  },
] as const;

// ------------------------------------------------------------------- schemes

export const colorSchemes: readonly ColorSchemeDef[] = [
  {
    id: 'stellar',
    name: 'Stellar White',
    cost: 0,
    hull: '#E8ECF4',
    accent: '#9BA6BC',
    flame: '#FFC46B',
    trail: ['#FFC46B', 'rgba(255,196,107,0)'],
  },
  {
    id: 'ember',
    name: 'Ember',
    cost: 60,
    hull: '#F0784E',
    accent: '#8C3B24',
    flame: '#FFD98A',
    trail: ['#FF8A5C', 'rgba(255,90,60,0)'],
  },
  {
    id: 'ion',
    name: 'Ion Blue',
    cost: 60,
    hull: '#7FB6FF',
    accent: '#2E5C9E',
    flame: '#BFE3FF',
    trail: ['#8CC5FF', 'rgba(90,160,255,0)'],
  },
  {
    id: 'toxic',
    name: 'Toxic',
    cost: 90,
    hull: '#8CE68C',
    accent: '#2F6B3A',
    flame: '#D8FFB0',
    trail: ['#A4F27E', 'rgba(120,230,90,0)'],
  },
  {
    id: 'royal',
    name: 'Royal',
    cost: 120,
    hull: '#B18AE0',
    accent: '#5A3B8C',
    flame: '#FFD1F0',
    trail: ['#C9A2F5', 'rgba(180,120,255,0)'],
  },
  {
    id: 'gold',
    name: 'Gilded',
    cost: 220,
    hull: '#F2CE72',
    accent: '#9C7A2E',
    flame: '#FFF2CF',
    trail: ['#FFE099', 'rgba(255,210,120,0)'],
  },
] as const;

// -------------------------------------------------------------------- trails

export const trailStyles: readonly TrailStyleDef[] = [
  { id: 'classic', name: 'Classic', cost: 0, mode: 'dots', size: 2.4 },
  { id: 'comet', name: 'Comet', cost: 100, mode: 'comet', size: 3.2 },
  { id: 'plasma', name: 'Plasma', cost: 160, mode: 'plasma', size: 4.4 },
  { id: 'embers', name: 'Embers', cost: 160, mode: 'embers', size: 2.2 },
] as const;

// ------------------------------------------------------------------- lookups

export const FREE_DEFAULTS = {
  skin: 'interceptor',
  scheme: 'stellar',
  trail: 'classic',
} as const;

export const skinById = (id: string): RocketSkinDef | undefined =>
  rocketSkins.find((s) => s.id === id);
export const schemeById = (id: string): ColorSchemeDef | undefined =>
  colorSchemes.find((s) => s.id === id);
export const trailById = (id: string): TrailStyleDef | undefined =>
  trailStyles.find((s) => s.id === id);

export const catalogIds = {
  skin: rocketSkins.map((s) => s.id),
  scheme: colorSchemes.map((s) => s.id),
  trail: trailStyles.map((s) => s.id),
} as const;

export const cosmeticCost = (kind: CosmeticKind, id: string): number | undefined => {
  const def =
    kind === 'skin' ? skinById(id) : kind === 'scheme' ? schemeById(id) : trailById(id);
  return def?.cost;
};
