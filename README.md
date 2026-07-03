# Orbital — React Native Space Game

A minimalist orbital-mechanics mobile game. Pilot a rocket between planets using real gravity, orbital capture, and launch timing.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Prebuild native layer (required for Skia + MMKV + Reanimated)
npx expo prebuild

# 3. Run on device/simulator
npx expo run:ios     # or run:android
```

> **Do not use Expo Go** — this app uses native modules (Skia, MMKV, Reanimated worklets) that require a custom dev client.

---

## Project structure

```
src/
├── types/          Single source of truth — all TS types
├── constants/      Physics tuning, colors, timing
├── utils/
│   ├── vec2.ts     Allocation-minimal vector math
│   └── rng.ts      Seeded PRNG for world gen
├── engine/
│   ├── physics.ts  RK4 integrator, gravity, orbits, collisions
│   └── worldGen.ts Procedural galaxy / system / planet generation
├── store/
│   └── gameStore.ts Zustand store — game phase, score, upgrades, persistence
├── audio/
│   └── AudioManager.ts expo-av music + SFX with crossfade
├── game/
│   ├── GameCanvas.tsx  Skia canvas + Reanimated physics loop
│   ├── GestureHandler.tsx  Touch zones: hold-to-charge, steer L/R
│   └── HUD.tsx         Score, speed, orbit decay, charge bar
└── screens/
    ├── MenuScreen.tsx  Animated main menu
    ├── GameScreen.tsx  Orchestrates all game layers
    ├── PauseOverlay.tsx Frosted pause menu
    └── FailScreen.tsx  Game over with reason + retry
```

---

## Architecture decisions

### Why no game engine?
React Native Skia + Reanimated gives us a 60fps GPU-accelerated canvas with physics running on the UI thread via worklets — no bridge crossings per frame. No Unity/Pixi overhead, stays in the React Native ecosystem.

### Physics: RK4 integrator
The Runge-Kutta 4th order integrator in `engine/physics.ts` handles multiple gravitational bodies simultaneously. It's numerically stable at variable frame rates and runs at a fixed 60Hz timestep with accumulator-based catching-up.

### Gravity model
```
F = G * M * m / r²
```
Each planet has a unique `mass` and `radius`. Black holes have 50× base mass and an event horizon radius for instant-kill collision. Gas giants have high mass (800–3000) for strong pull; dead planets have low mass (30–120) for weak, treacherous orbits.

### Screen transitions
All screens coexist in a single view tree — no Navigator push/pop. `phase` in Zustand drives opacity/scale animations. Menu → Game is a radial fade (350ms). Pause is a blur overlay (200ms). Fail is a shake + dissolve (300ms).

### Controls
- **Left 30% of screen**: steer left during orbit
- **Center 40%**: hold to charge, release to launch
- **Right 30%**: steer right during orbit
- **Double-tap**: pause / resume

### Audio
`AudioManager` maintains two concurrent `expo-av` Sound objects for music crossfading. SFX are pooled on first load. Adaptive music switches tracks based on hazard proximity (calm → tense → danger).

---

## Adding assets

See `src/assets/ASSETS.md` for the full list of audio + image files needed.

For the MVP, all game objects are rendered as Skia vector paths — no sprites required. Audio placeholders can be silent `.mp3` files during dev.

---

## Running tests

```bash
npm test
```

Tests cover: physics formulas, orbit mechanics, collision detection, world generation determinism.

---

## Tuning the feel

All physics constants live in `src/constants/index.ts`:

| Constant | Effect |
|---|---|
| `G` | Overall gravity strength |
| `LAUNCH_VELOCITY_SCALE` | How fast the rocket launches at full charge |
| `ORBIT_CAPTURE_RADIUS_MULTIPLIER` | How close you need to be to enter orbit |
| `BASE_ORBIT_DECAY_RATE` | How quickly orbit decays per revolution |
| `MAX_ORBITS_BEFORE_CRASH` | Hard cap on orbit loops |
| `TRAJECTORY_STEPS` | Preview dot count (performance vs accuracy) |

---

## Next steps (post-MVP)

- [ ] Skia planet rendering (atmosphere glow, surface detail paths)
- [ ] Rocket sprite + flame particle system
- [ ] Upgrade shop screen between runs
- [ ] Galaxy map screen (zoomed-out solar systems)
- [ ] Supernova / solar flare animated hazards
- [ ] Haptic feedback on launch / collect / death
- [ ] Leaderboard (Expo + Supabase or Game Center)
- [ ] Procedural background music via Tone.js or custom generator
