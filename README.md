# ORBital

A minimal, majestic orbital-hopping game for **React Native + Expo SDK 56**
(React Native 0.85, React 19.2, New Architecture).

Hold to charge. Release to fly. Hold a screen side to steer. Gravity does the rest.

- Rocket orbits a body; **hold** anywhere to charge launch speed (live,
  honest trajectory preview), **release** to launch tangentially.
- Get captured by the next body's gravity — planet to planet, like a monkey
  through trees. Collect coins, bank them, upgrade the rocket.
- Every body has real derived physics: `mass = density × r²`, inverse-square
  gravity, escape velocity `√(2GM/d)` shown live on the HUD.
- Hazards: asteroid belts, solar flares, gas-giant atmospheric drag, dead
  planets, black holes (event horizons are non-negotiable), supernovas on a
  fuse. Orbit too long → decay. Aim badly → lost in the dark.
- Mid-flight steering: hold the left/right half of the screen to fire lateral
  thrusters (velocity-relative). The Thrusters upgrade adds turn authority.
- Zoom-to-fit camera: the current body and the next unvisited body are always
  framed together (pure, unit-tested math) — you always know where to go.
- Seamless transitions: one persistent Skia canvas; menu / play / pause /
  death / retry are crossfaded overlays. No navigator. No loading screens.
- First-run tutorial hints, rocket trail + pooled particles, score popups
  drawn on-canvas, screen shake.
- **Realistic space rendering**: SkSL runtime shaders — rocky surface noise,
  gas-giant bands, stellar granulation, all rotating in real time with
  fresnel atmospheric rim lighting; multi-layer parallax nebula backgrounds
  procedurally baked to cached textures per galaxy (near-zero per-frame cost).
- **Customization**: rocket skins, color schemes and trail styles unlocked
  with in-game coins from the Customize screen (live Skia preview). Equipped
  cosmetics are validated against the catalog on load — an edited save can
  never equip a nonexistent item.
- **HD Graphics toggle** (pause → settings): shader planets on high, cheap
  instanced gradient discs on low for weaker devices. Persisted.
- **Feature toggles** (pause → settings → FEATURES): upgrades, customize,
  steering, hints, screen shake, particles, crash reports — each gates a
  real code path; overrides persist in the validated save envelope.
- **Sprite art slots**: optional PNG/WebP skins for rockets, trail particles
  and planets (per-kind variants, auto-rotation + rim lighting applied by
  the renderer). See `assets/skins/README.md` — anything not provided keeps
  its procedural rendering.

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
src/render/                renderer.ts (immediate-mode Skia) · GameCanvas.tsx ·
                           shaders.ts (SkSL) · nebula.ts (bake+cache pipeline) ·
                           cosmeticsRuntime.ts · camera.ts · particles.ts
src/config/cosmetics.ts    the cosmetics catalog (skins, schemes, trails, prices)
src/config/features.ts     the feature-toggle catalog (defaults + UI copy)
assets/skins/               drop-in slots for rocket/trail/planet sprite art
assets/backgrounds/        drop-in slots for hand-made nebula art (see README
                           there for file names, sizes and tiling rules)
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

## Building for stores (EAS)

`eas.json` ships three profiles:

| Profile | Artifact | Use |
|---|---|---|
| `development` | dev-client APK | day-to-day device testing |
| `preview` | APK, `preview` channel | internal hand-off builds |
| `production` | AAB, auto-incremented, `production` channel | Play Store |

```bash
npm i -g eas-cli && eas login
eas build --profile development --platform android   # first dev client
eas build --profile production  --platform android   # store build
```

App identity: **ORBital** · `com.sapphirepegasus.orbital` · versions are
remote-managed (`appVersionSource: "remote"`, `autoIncrement`).

## Error tracking (Sentry — dormant until you add a DSN)

`@sentry/react-native` 8.17.2 is wired behind the first-party seam
(`src/observability/errorReporter.ts` → `src/observability/sentry.ts`, see
ADR-004). Ships **fully dormant**: without `EXPO_PUBLIC_SENTRY_DSN` the app
never loads or contacts Sentry.

To activate (once you have a free Sentry account):

1. `eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <your dsn>`
   (the DSN is a public identifier — safe in the JS bundle).
2. For symbolicated release stack traces, also create `SENTRY_ORG`,
   `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` (secret) in EAS env, then set
   `SENTRY_DISABLE_AUTO_UPLOAD` to `"false"` in `eas.json` and remove
   `"disableAutoUpload": true` from the plugin entry in `app.json`.
3. Rebuild. Privacy stays enforced in code: no PII, `tracesSampleRate: 0`,
   user opt-out via the **Crash reports** feature toggle.

`.env.example` documents the same contract for local dev.

## Roadmap hooks (intentionally out of scope for v1)

- Sentry activation (seam is in place; DSN via EAS secrets, never hardcoded).
- Ads: rewarded revive + capped interstitials via an AdManager seam (last).
- Daily-seed challenge (worldgen is already seed-deterministic).
- Cloud save / leaderboards (would finally justify server-side save signing).
