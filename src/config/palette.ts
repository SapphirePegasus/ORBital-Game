/**
 * Visual palette. Minimal, high-contrast, "quiet cosmos" aesthetic:
 * near-black backdrop, desaturated body tones, one warm accent.
 * Galaxies cycle through subtle background tints as the player climbs.
 */

export const palette = {
  /** Deep space backdrop (also the app/splash background — no white flashes). */
  space: '#05060F',
  /** Warm accent: charge bar, coins, active highlights. */
  accent: '#FFC46B',
  accentDim: 'rgba(255,196,107,0.35)',
  danger: '#FF5D5D',
  text: '#E8ECF4',
  textDim: 'rgba(232,236,244,0.55)',
  hairline: 'rgba(232,236,244,0.14)',
  star: 'rgba(232,236,244,0.9)',
  trajectory: 'rgba(232,236,244,0.45)',
  orbitRing: 'rgba(232,236,244,0.18)',
  shield: 'rgba(120,200,255,0.85)',

  bodies: {
    planet: '#7FB2A8',
    deadPlanet: '#6E7280',
    gasGiant: '#C08AC9',
    star: '#FFD98A',
    blackHole: '#141522',
    supernova: '#FF9E7A',
  },

  /** Background tint per galaxy (cycled by depth). Kept subtle on purpose. */
  galaxyTints: ['#0A0C1C', '#0C0A1A', '#081018', '#120A14', '#0A1212'],
} as const;

export type Palette = typeof palette;
