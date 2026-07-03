import type {
  Galaxy,
  SolarSystem,
  Planet,
  Hazard,
  Collectible,
  PlanetType,
  HazardType,
} from '../types';
import { createRNG } from '../utils/rng';
import { escapeVelocity } from './physics';
import {
  PLANET_CONFIGS,
  BLACK_HOLE_CONFIG,
  PLANETS_PER_SYSTEM,
  HAZARDS_PER_SYSTEM,
  MIN_PLANET_SEPARATION,
  SYSTEM_SPACING,
} from '../constants';

let _entityCounter = 0;
const uid = (prefix: string) => `${prefix}_${++_entityCounter}`;

// ─── Planet generation ────────────────────────────────────────────────────────

function generatePlanet(
  systemCenter: { x: number; y: number },
  usedPositions: Array<{ x: number; y: number }>,
  type: PlanetType,
  rng: ReturnType<typeof createRNG>,
  isFirst: boolean,
): Planet {
  const cfg = PLANET_CONFIGS[type];
  const mass = rng.float(cfg.massRange[0], cfg.massRange[1]);
  const radius = rng.float(cfg.radiusRange[0], cfg.radiusRange[1]);

  // Find a position that doesn't overlap other planets
  let pos = { x: 0, y: 0 };
  let attempts = 0;
  do {
    if (isFirst) {
      // First planet near system center
      pos = {
        x: systemCenter.x + rng.float(-30, 30),
        y: systemCenter.y + rng.float(-30, 30),
      };
    } else {
      const angle = rng.float(0, Math.PI * 2);
      const dist = rng.float(MIN_PLANET_SEPARATION, MIN_PLANET_SEPARATION * 3);
      pos = {
        x: systemCenter.x + Math.cos(angle) * dist,
        y: systemCenter.y + Math.sin(angle) * dist,
      };
    }
    attempts++;
  } while (
    attempts < 30 &&
    usedPositions.some(p => {
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      return Math.sqrt(dx * dx + dy * dy) < MIN_PLANET_SEPARATION;
    })
  );

  usedPositions.push(pos);

  const colorIdx = rng.int(0, cfg.colors.length - 1);

  return {
    id: uid('planet'),
    position: pos,
    mass,
    radius,
    type,
    orbitDecayRate: cfg.orbitDecayRate + rng.float(-0.02, 0.02),
    escapeVelocity: escapeVelocity(mass, radius),
    color: cfg.colors[colorIdx] ?? cfg.colors[0]!,
    atmosphereColor: cfg.atmosphereColors[colorIdx] ?? cfg.atmosphereColors[0]!,
    resources: generateResources(type, rng),
  };
}

function generateResources(
  type: PlanetType,
  rng: ReturnType<typeof createRNG>,
): Planet['resources'] {
  const allTypes: Planet['resources'][number][] = ['coin', 'fuel', 'mineral', 'dark_matter'];
  const count = rng.int(1, 3);
  const result: Planet['resources'] = [];
  for (let i = 0; i < count; i++) {
    result.push(rng.pick(allTypes));
  }
  return result;
}

// ─── Hazard generation ────────────────────────────────────────────────────────

function generateHazard(
  systemCenter: { x: number; y: number },
  planets: Planet[],
  type: HazardType,
  rng: ReturnType<typeof createRNG>,
): Hazard {
  const angle = rng.float(0, Math.PI * 2);
  const dist = rng.float(100, 200);
  const pos = {
    x: systemCenter.x + Math.cos(angle) * dist,
    y: systemCenter.y + Math.sin(angle) * dist,
  };

  if (type === 'black_hole') {
    return {
      id: uid('hazard'),
      type,
      position: pos,
      radius: BLACK_HOLE_CONFIG.radius,
      influenceRadius: BLACK_HOLE_CONFIG.influenceRadius,
      mass: BLACK_HOLE_CONFIG.mass,
      damage: BLACK_HOLE_CONFIG.damage,
      eventHorizonRadius: BLACK_HOLE_CONFIG.eventHorizonRadius,
    };
  }

  if (type === 'asteroid_field') {
    const fieldRadius = rng.float(40, 80);
    const rockCount = rng.int(8, 20);
    const rocks = Array.from({ length: rockCount }, () => {
      const rockAngle = rng.float(0, Math.PI * 2);
      const rockDist = rng.float(0, fieldRadius);
      const speed = rng.float(0.5, 2.0);
      const velAngle = rng.float(0, Math.PI * 2);
      return {
        id: uid('rock'),
        position: {
          x: pos.x + Math.cos(rockAngle) * rockDist,
          y: pos.y + Math.sin(rockAngle) * rockDist,
        },
        velocity: {
          x: Math.cos(velAngle) * speed,
          y: Math.sin(velAngle) * speed,
        },
        radius: rng.float(2, 6),
        mass: rng.float(1, 5),
      };
    });

    return {
      id: uid('hazard'),
      type,
      position: pos,
      radius: fieldRadius,
      influenceRadius: fieldRadius + 20,
      mass: 0,
      damage: 999, // instant kill on rock collision
      children: rocks,
    };
  }

  if (type === 'solar_flare') {
    const dirAngle = rng.float(0, Math.PI * 2);
    return {
      id: uid('hazard'),
      type,
      position: pos,
      radius: rng.float(15, 30),
      influenceRadius: rng.float(80, 150),
      mass: 0,
      damage: 999,
      direction: { x: Math.cos(dirAngle), y: Math.sin(dirAngle) },
    };
  }

  // supernova / nebula
  return {
    id: uid('hazard'),
    type,
    position: pos,
    radius: rng.float(30, 60),
    influenceRadius: rng.float(60, 120),
    mass: 0,
    damage: type === 'supernova' ? 999 : 0,
  };
}

// ─── Collectibles ─────────────────────────────────────────────────────────────

function generateCollectibles(
  planets: Planet[],
  rng: ReturnType<typeof createRNG>,
): Collectible[] {
  const collectibles: Collectible[] = [];

  for (const planet of planets) {
    const count = rng.int(2, 5);
    for (let i = 0; i < count; i++) {
      const angle = rng.float(0, Math.PI * 2);
      const dist = planet.radius * rng.float(1.5, 3.5);
      const type = rng.pick(planet.resources);
      const valueMap = {
        coin: rng.int(5, 20),
        fuel: rng.int(15, 30),
        mineral: rng.int(30, 80),
        dark_matter: rng.int(100, 250),
      };

      collectibles.push({
        id: uid('collectible'),
        type,
        position: {
          x: planet.position.x + Math.cos(angle) * dist,
          y: planet.position.y + Math.sin(angle) * dist,
        },
        radius: type === 'dark_matter' ? 6 : type === 'mineral' ? 5 : 4,
        value: valueMap[type],
        collected: false,
      });
    }
  }

  return collectibles;
}

// ─── Solar system ─────────────────────────────────────────────────────────────

const PLANET_TYPE_POOL: PlanetType[] = [
  'terrestrial', 'terrestrial',
  'gas_giant',
  'dead', 'dead',
  'ice',
  'lava',
  'crystal',
];

const HAZARD_TYPE_POOL: HazardType[] = [
  'asteroid_field', 'asteroid_field',
  'solar_flare',
  'black_hole',
  'supernova',
  'nebula',
];

function generateSystem(
  center: { x: number; y: number },
  index: number,
  seed: number,
): SolarSystem {
  const rng = createRNG(seed + index * 7919);
  const planetCount = rng.int(PLANETS_PER_SYSTEM.min, PLANETS_PER_SYSTEM.max);
  const hazardCount = Math.min(
    rng.int(HAZARDS_PER_SYSTEM.min, HAZARDS_PER_SYSTEM.max),
    // Scale hazard density with system index (later systems = harder)
    Math.floor(1 + index * 0.4),
  );

  const usedPositions: Array<{ x: number; y: number }> = [];
  const planets: Planet[] = [];

  for (let i = 0; i < planetCount; i++) {
    const type = rng.pick(PLANET_TYPE_POOL);
    const planet = generatePlanet(center, usedPositions, type, rng, i === 0);
    planets.push(planet);
  }

  // Mark last planet in chain as the destination hint
  const lastPlanet = planets[planets.length - 1];
  if (lastPlanet) lastPlanet.isDestination = true;

  const hazards: Hazard[] = [];
  for (let i = 0; i < hazardCount; i++) {
    const type = rng.pick(HAZARD_TYPE_POOL);
    hazards.push(generateHazard(center, planets, type, rng));
  }

  const collectibles = generateCollectibles(planets, rng);
  const allAsteroids = hazards.flatMap(h => h.children ?? []);

  return {
    id: uid('system'),
    center,
    planets,
    hazards,
    collectibles,
    radius: SYSTEM_SPACING * 0.45,
  };
}

// ─── Galaxy ───────────────────────────────────────────────────────────────────

export function generateGalaxy(seed: number, name: string, systemCount: number = 12): Galaxy {
  const rng = createRNG(seed);
  const systems: SolarSystem[] = [];

  // Arrange systems in a loose spiral
  for (let i = 0; i < systemCount; i++) {
    const angle = i * (Math.PI * 2) / 4 + rng.float(-0.3, 0.3);
    const dist = SYSTEM_SPACING * (1 + i * 0.6) + rng.float(-50, 50);
    const center = {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
    systems.push(generateSystem(center, i, seed));
  }

  return { id: uid('galaxy'), name, seed, systems };
}

// ─── Starting rocket position ─────────────────────────────────────────────────

export function getStartingPlanet(galaxy: Galaxy): Planet {
  const system = galaxy.systems[0];
  const planet = system?.planets[0];
  if (!system || !planet) throw new Error('Galaxy has no systems or planets');
  return planet;
}
