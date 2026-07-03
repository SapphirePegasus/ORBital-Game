# Asset checklist — Orbital Game
# All files go under src/assets/

## ── Audio ────────────────────────────────────────────────────────────────────
# Music tracks (looping, ~2–4 min each, 128kbps mp3 or ogg)
# Recommended source: https://freemusicarchive.org  |  https://incompetech.com
# Style: minimalist ambient space / cinematic

audio/music_menu.mp3          # Slow ethereal ambient, 90–100 BPM
audio/music_game_calm.mp3     # Gentle pulse, low tension
audio/music_game_tense.mp3    # Rising pads, mid tension
audio/music_game_danger.mp3   # Driving bass, high tension

# SFX (short, under 2s)
# Recommended source: https://freesound.org  |  https://opengameart.org
audio/sfx_launch.mp3          # Short burst / whoosh
audio/sfx_orbit_enter.mp3     # Soft chime / lock-in tone
audio/sfx_orbit_exit.mp3      # Light release
audio/sfx_collect_coin.mp3    # Bright ding
audio/sfx_collect_fuel.mp3    # Liquid fill tone
audio/sfx_collect_mineral.mp3 # Crystal ping
audio/sfx_charge_loop.mp3     # Rising tone loop (will loop while held)
audio/sfx_explosion.mp3       # Death SFX
audio/sfx_black_hole.mp3      # Deep rumble / distortion
audio/sfx_solar_flare.mp3     # Crackle / burst
audio/sfx_ui_tap.mp3          # Soft click
audio/sfx_ui_confirm.mp3      # Positive confirm tone
audio/sfx_ui_back.mp3         # Soft dismiss tone

## ── Images ───────────────────────────────────────────────────────────────────
# App icons (Expo generates all sizes from these)
icon.png                      # 1024×1024 — app icon
adaptive-icon.png             # 1024×1024 — Android adaptive foreground
splash.png                    # 1284×2778 — launch screen (transparent bg)

# In-game sprites (optional — can use Skia paths for MVP)
# sprites/rocket.png          # 64×64 px, transparent background
# sprites/rocket_flame.png    # 32×64 px, animated sprite sheet (4 frames)
# sprites/collectible_coin.png
# sprites/collectible_fuel.png
# sprites/collectible_mineral.png
# sprites/collectible_dark_matter.png

## ── Notes ────────────────────────────────────────────────────────────────────
# For MVP, the Skia renderer draws all game objects as vector shapes.
# Sprites are only needed for a higher-fidelity visual pass.
# All audio can use royalty-free placeholder tracks during development.
