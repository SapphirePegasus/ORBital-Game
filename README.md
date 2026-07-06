# Space Hopper

A minimal, majestic orbital-hopping game for **React Native + Expo SDK 56**
(React Native 0.85, React 19.2, New Architecture).

Hold to charge. Release to fly. Gravity does the rest.

- Rocket orbits a body; **hold** anywhere to charge launch speed (live,
  honest trajectory preview), **release** to launch tangentially.
- Get captured by the next body's gravity — planet to planet, like a monkey
  through trees. Collect coins, bank them, upgrade the rocket.
- Every body has real derived physics: `mass = density × r²`, inverse-square
  gravity, escape velocity `√(2GM/d)` shown live on the HUD.
- Hazards: asteroid belts, solar flares, gas-giant atmospheric drag, dead
  planets, black holes (event horizons are non-negotiable), supernovas on a
  fuse. Orbit too long → decay. Aim badly → lost in the dark.
- Seamless transitions: one persistent Skia canvas; menu / play / pause /
  death / retry are crossfaded overlays. No navigator. No loading screens.

## Run it

```bash
npm install          # or: npx expo install --fix  (aligns to your SDK patch)
npm run typecheck    # tsc --noEmit
npm test             # jest-expo: physics, worldgen, engine, persistence
npm start            # Expo dev server → press a / i or scan with Expo Go
```

Audio is pre-generated. To re-synthesize (or after editing the generator):
`npm run generate-audio`. Drop your own WAVs into `assets/audio/` to reskin.

## Where everything lives

```
App.tsx                    boot, phase wiring, overlay composition
src/config/                ⚙ ALL gameplay tunables — start here to tune feel
  gameConfig.ts            gravity G, launch speeds, capture rules, decay,
                           hazards, camera, scoring, world pacing…
  bodies.ts                per-archetype physics (density, size, rewards)
  upgrades.ts              upgrade definitions + cost curves
  palette.ts               the entire look
src/core/                  math, seeded RNG, shared types (pure TS)
src/engine/                physics.ts · world.ts · engine.ts (pure TS, tested)
src/state/                 store.ts (useSyncExternalStore) · gameStore ·
                           progressStore · persistence (validated + checksummed)
src/render/                renderer.ts (immediate-mode Skia) · GameCanvas.tsx
src/ui/                    HUD + menu/pause/gameover/upgrades overlays
src/audio/                 expo-audio manager (expo-av is deprecated in SDK 56)
docs/decisions/            ADRs: rendering loop, state, physics model
__tests__/                 engine-layer unit tests
scripts/generate-audio.mjs deterministic WAV synthesis (license-clean)
```

## Tuning cheatsheet

| Feel change | Knob |
|---|---|
| Heavier universe | `physics.G` |
| Easier captures | `capture.speedFactor` ↑, archetype `captureFactor` ↑ |
| Finer launch control | `launch.chargeTime` ↑ |
| Longer safe orbits | archetype `decayTime`, `decay.shrinkRate` ↓ |
| Bigger jumps | `world.gapMin/gapMax` |
| More danger | `world.beltChance`, hazard `minDepth` ↓ |
| Faster difficulty ramp | `world.difficultyPerGalaxy` |

## Engineering posture

- **Fixed-timestep simulation** (ADR-003): identical feel at 60/120 Hz,
  hitch-proof accumulator, no tunneling.
- **Zero React work in the hot path** (ADR-001): one `SkPicture` per frame;
  HUD mirrors at 8 Hz.
- **Dependencies**: only Expo-bundled, first-party packages (Expo, Shopify
  Skia, Software Mansion, RN community AsyncStorage) at the exact versions
  pinned by the SDK 56 release — no long-tail community packages (ADR-002).
- **Persistence hardening**: versioned envelope, full structural validation,
  range clamping, FNV-1a corruption check, storage failures degrade to
  defaults. Honest limit: on-device saves can never be truly tamper-proof
  without a server; there is no PII, no network I/O, no remote code, no
  dynamic evaluation anywhere in the app.
- **Resilience**: audio/haptics failures are swallowed (never crash
  gameplay); backgrounding auto-pauses the run and flushes saves.
- **Determinism**: seeded worldgen — a run is reproducible from its seed.

## Roadmap hooks (intentionally out of scope for v1)

- Daily-seed challenge (worldgen is already seed-deterministic).
- Cosmetic rocket skins (renderer paths are centralized).
- Cloud save / leaderboards (would finally justify server-side save signing).
