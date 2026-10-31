# CLAUDE_TASK — build «Пепося и Дудоня: Ночной аукцион»

## Goal
Build a complete offline iPhone PWA game (portrait, Russian UI) from this repo. It is a birthday gift, so polish,
stability, and save safety matter more than feature count. Asset prep is already done; **all code is yours**.

## Read first
1. `SPEC.md` (Russian) — the full design and tech spec. It is the source of truth.
2. `assets/ATLAS.md` — sprite/atlas/sfx layout. Also `assets/items_index.json`, `assets/animals_index.json`,
   `assets/sfx_index.json`, `assets/sprites/**/**.json`.
3. `CREDITS.md` + `LICENSES/` — license constraints.

## How to work
- Work milestone by milestone: **M1 → M2 → M3 → M4 → M5** (defined in SPEC §14).
- After each milestone: run `node --test`, verify the game loads from a static server
  (`python3 -m http.server`) and is playable end-to-end for what exists, then **commit** with message `M<n>: ...`.
- The game must be playable at every milestone (no half-wired screens on the main path).
- Vanilla JS ES modules, no framework, no bundler required, no npm runtime deps. Tests use `node:test` only.
- All content in `data/*.json`; all UI strings in `data/strings.ru.json`. No hardcoded Russian in code.
- Deploy target: GitHub Pages from repo root (`main` branch, `/`), relative paths only, add `.nojekyll`.

## Hard constraints
- **No runtime network dependencies** (no CDN, no web fonts from the net, no analytics). Works in airplane mode.
- Service worker with versioned cache; precache every asset the game uses.
- Pixel art: integer scaling + nearest-neighbor only. Never resample assets on disk.
- Audio: Web Audio, unlock on first tap, prefer `.m4a`, fallback `.mp3`,
  set `navigator.audioSession.type = 'playback'` when available.
- Saves: `navigator.storage.persist()`, persist after **every** action, versioned save + migrations,
  export/import as a JSON string, corrupted-save fallback.
- Seeded RNG per run; RNG state is part of the save (no reroll by app restart).
- Total repo size < 25 MB.
- Tone: absurd + cozy. No jokes about couple quarrels or chores. «Горбодак» = rare flavor text only, never a boss.
  No real-time auction mode.

## License constraints
- Everything is CC0 **except Kyrise icons (`assets/sprites/items/kyrise_*.png`) — CC BY 4.0**: the in-game
  Credits screen must show: `Icons: "Kyrise's Free 16x16 RPG Icon Pack" by Kyrise (kyrise.itch.io), CC BY 4.0`.
- Credits screen lists all authors from `CREDITS.md`. Keep `LICENSES/` in the repo.
- If you add a font or any new asset: CC0/OFL/CC BY only, stored locally, added to `CREDITS.md`.
- Do not modify Kyrise icons (rename-only is fine; recolor would need a "changes made" note).

## Known gaps you must handle
- No Cyrillic pixel font is included — pick an OFL/CC0 one and bundle it.
- No app icons — compose 180/192/512 PNGs from the cat sprites (nearest-neighbor, integer scale, padded).
- Cats have no attack animation — use `aliases.attack` from the cat JSON + tweens.
- SFX were chosen by filename, not auditioned; `meow_sub*` and `wash_sub` are substitutes.
- `category_guess` / `name_guess` in indexes are heuristics; fix names in `data/*.json` as you see fit.

## Done checklist
- [ ] M1–M5 committed, each playable; `node --test` green
- [ ] Content minimums met: items ≥300, animals ≥60, enemy types ≥8, combos ≥40 (+ discovered log),
      album pages ≥20, events ≥30, all room types + mini-boss «Королевский клобстер»
- [ ] Lucky blocks with pity counter (visible), daily free block without timers, gentle streak
- [ ] Rarities common→slop, modifiers Грязный/Блестящий/Глючный/Проклятый/Золотой/Радужный rendered at runtime
- [ ] Shop, talents, tiers, skins, settings (volume, shake, anim speed, export/import/reset), credits screen
- [ ] PWA: manifest, apple-touch-icon 180, viewport-fit=cover, safe-area insets, standalone, offline after 1st load
- [ ] Save survives kill at any moment; export→import round-trips; migration test exists
- [ ] All data files validated by tests (ids unique, every referenced sprite/sound file exists)
- [ ] Repo < 25 MB, no network requests at runtime (check DevTools offline)
- [ ] README updated with run/deploy instructions
