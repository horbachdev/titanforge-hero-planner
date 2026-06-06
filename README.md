# Shop Titans Hero Builder

Desktop hero builder, roster planner, and quest simulator groundwork for **Shop Titans**.

The goal is to replace spreadsheet-based community workflows with a real application: create heroes and champions, save builds, assemble rosters, compare stats, and run a Ress-style quest simulation from normalized game data.

This project is not affiliated with, endorsed by, or sponsored by Kabam. Shop Titans is owned by Kabam.

## Current Status

This is an MVP. The hero/champion builder and roster workflow are usable, while simulator parity is still being validated against Ress' spreadsheet and Apps Script logic.

Implemented:

- Electron + Vite + React + TypeScript desktop app
- Local JSON data generated from the official Shop Titans data spreadsheet
- Hero builder with class, promotion, level, seeds, skills, gear, quality, element, spirit, and per-item Starforge toggle
- Champion builder with rank, level, Champion Soul, seeds, familiar, Aurasong, gear, enchants, and champion item effects
- Build library for saved heroes and champions
- Roster management with up to five hero slots plus one champion slot
- Team totals, element point display, and stat summaries
- Build comparison
- Item database browser
- Versioned JSON export/import
- Ress-style quest simulator with seeded Monte Carlo runs, enemy crits, AoE rolls, barriers, mini-boss modifiers, LCoG slot handling, combat spirits, healing, fatal-blow saves, and mapped champion/Aurasong effects

Still being validated:

- Exact parity against Ress' known output rows for the full quest simulator
- Edge cases for every special artifact, champion behavior, and conditional combat effect
- Tamas randomness, boosters, rest time, break chance, and non-combat drop side effects
- Release packaging for Windows/macOS/Linux

## Data Sources

Generated data lives in `src/data/generated/game-data.json`.

The importer uses:

- Official Shop Titans Data Spreadsheet, currently tracked as `client v26.5.0`
- Ress' Hero & Quest Simulator workbook, currently tracked as `V9.4`
- Ress Apps Script snippets copied from the live sheet for Monte Carlo combat logic inspection
- ST-Central combat references for mechanic explanations

The app consumes local JSON at runtime. It does not fetch live Google Sheet data while the user is using the app.

## Requirements

- Node.js
- pnpm
- Windows users should call `pnpm.cmd` from PowerShell because `.ps1` shims may be blocked by execution policy.

## Setup

```powershell
pnpm.cmd install
pnpm.cmd run import:data
pnpm.cmd run dev
```

Useful commands:

```powershell
pnpm.cmd run dev
pnpm.cmd run dev:renderer
pnpm.cmd run test
pnpm.cmd run build
pnpm.cmd run import:data
pnpm.cmd run dump:ress-formulas
```

`pnpm.cmd run dev:renderer` starts only the browser-rendered Vite UI at:

```text
http://127.0.0.1:5173
```

## App Workflow

Recommended MVP workflow:

1. Create a hero in the hero builder.
2. Save it to the build library.
3. Create a champion in the champion builder.
4. Save it to the champion library.
5. Assemble one or more rosters from saved heroes and champions.
6. Open the quest simulator and select a roster, quest, mini-boss modifier, defense cap, and run count.
7. Export builds as JSON when you want to share or back them up.

Rosters store references to saved builds. This keeps old rosters stable and makes it clear when a saved build is being edited.

## Architecture

Important project areas:

```text
src/main/                 Electron main process
src/preload/              Electron preload bridge
src/renderer/             React renderer app and UI
src/shared/               Pure TypeScript data, stat, import/export, and combat logic
src/data/generated/       Generated game data consumed by the app
scripts/                  Data import and Ress formula dump scripts
docs/                     Formula notes and combat simulator calc specs
data/fixtures/            Test fixtures for simulator parity
data/raw/                 Local raw spreadsheet artifacts
```

Core principle: data and logic stay separate. New game data should be imported into JSON instead of hardcoded into the stat engine.

## Simulator Notes

The combat simulator is implemented as pure TypeScript in `src/shared/combat-engine.ts`.

It currently models:

- Seeded Monte Carlo runs
- Enemy damage reduction from defense cap
- Enemy critical hits
- Enemy AoE rolls
- Mini-boss modifiers: Agile, Dire, Huge, Legendary
- Targeting by threat with retargeting after deaths
- Evasion and extreme quest evasion penalty
- Barrier damage and barrier penalty
- LCoG fifth hero slot handling
- Combat spirits including Armadillo, Lizard, Shark, Dinosaur, Mundra, and Totem/Idol spirit doubling
- Selected class innates and special cases
- Champion and Aurasong combat auras mapped from Ress' script

The simulator is deterministic for the same inputs because it uses a fixed seed by default. This makes test comparison and debugging practical.

See:

- `docs/combat-simulator-calc-spec.md`
- `docs/formula-notes.md`
- `docs/ress-formula-index.md`

## Testing

Run:

```powershell
pnpm.cmd run test
```

The current test suite covers importer expectations, stat engine behavior, build import/export, UI workflows, and deterministic combat formulas. Some Ress parity tests remain marked as TODO until stable input/output truth rows are captured from the live spreadsheet.

## Distribution Plan

For a desktop app, the main distribution target should be GitHub Releases with packaged Electron builds.

GitHub Pages can still be useful for:

- A project landing page
- Documentation
- Screenshots and quick-start instructions
- A browser-only demo of the renderer, if that path is intentionally supported later

GitHub Pages is not a replacement for distributing the Electron desktop app.

The current Pages entry point is `docs/index.html`.

## License

This project is source-available, not open source.

Official compiled releases may be used for free for personal, non-commercial use. The source code may be viewed for review and portfolio evaluation. Modification, redistribution, commercial use, and publication of derivative versions are not allowed without prior written permission.

See `LICENSE.md`.

## Roadmap

Near-term:

- Capture controlled Ress spreadsheet truth rows for full simulator parity tests
- Add more simulator fixtures for special artifacts and champion edge cases
- Add screenshots and release downloads to the GitHub Pages landing page
- Add release packaging

Later:

- More polished simulator result views
- Build sharing links or portable build bundles
- Automated data update workflow
- Better visual data browser for items, skills, spirits, elements, and champions
