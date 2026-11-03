# Shop Titans Hero Builder

Desktop hero builder, roster planner, and quest simulator groundwork for **Shop Titans**.

The goal is to replace spreadsheet-based community workflows with a real application: create heroes and champions, save builds, assemble rosters, compare stats, and run a Ress-style quest simulation from normalized game data.

This project is not affiliated with, endorsed by, or sponsored by Kabam. Shop Titans is owned by Kabam.

## Current Status

Version 0.2. Builder, teams and simulator are usable; simulator parity with Ress' spreadsheet is still being validated.

What you can do:

- **Quest board** – your party sits in a dock at the top; below it every quest is a heatmap cell showing how often *this* party wins (quick estimate for all 244 quests in ~2 s, in a background worker). Click a cell for a full 10,000-fight analysis with a verdict, "what to improve" tips and per-unit survival.
- **Barracks** – heroes and champions as cards. Recruit by picking a class crest.
- **Character sheet** – six equipment slots like in game. Clicking a slot opens an item drawer that shows the stat and power change of every candidate *before* you equip it (hover previews the full stat list). Quality, elements, spirits, Starforge and skills live there too. Everything saves automatically; delete has Undo.
- **Ledger** – backup/restore, import of builds suggested by AI assistants, item catalog, data version.
- **For AI assistants** – an MCP server and a CLI expose the same planner API (see `docs/llm-interface.md`).

Still being validated:

- Exact parity against Ress' known output rows for the full quest simulator
- Edge cases for every special artifact, champion behavior, and conditional combat effect
- Tamas randomness, boosters, rest time, break chance, and non-combat drop side effects
- Release packaging for Windows/macOS/Linux

## Data Sources

There is no public Shop Titans API. Game data comes from:

- Kabam's official Shop Titans Data Spreadsheet (currently `client v26.9.1`)
- Ress' Hero & Quest Simulator workbook (`V9.4`) for quest combat metadata
- Ress Apps Script snippets for the Monte Carlo combat logic
- ST-Central combat references for mechanic explanations

`pnpm import:data` turns them into `src/data/generated/game-data.json`, validates the result and refuses to overwrite good data with broken data. A scheduled GitHub Action (`docs/github-workflows/`, ready to enable) checks for new game versions every week and opens a pull request when the data changed. The app loads data through a `GameDataSource` boundary, so a hosted JSON or a future official API can be plugged in without touching the UI or engine. Details: `docs/data-sources.md`.

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
pnpm.cmd run typecheck
pnpm.cmd run build
pnpm.cmd run build:web
pnpm.cmd run dist
pnpm.cmd run import:data            # refresh + validate game data
pnpm.cmd run import:data --check    # only check for a newer game version
pnpm.cmd run mcp                    # MCP server for AI assistants
pnpm.cmd run titanforge             # planner API on the command line
pnpm.cmd run dump:ress-formulas
```

`pnpm.cmd run dev:renderer` starts only the browser-rendered Vite UI at:

```text
http://127.0.0.1:5173
```

`pnpm.cmd run build:web` builds the browser-hosted GitHub Pages app into `docs/app`.

## App Workflow

1. **Barracks → Recruit hero** – pick the class, then fill the six slots on the character sheet. The drawer shows what each item changes before you equip it.
2. Add your champion the same way.
3. **Quest board** – put heroes and the champion into the party dock (click a socket; drag to reorder — order decides who joins 3- and 4-hero quests, the 5th socket is for Lost City of Gold).
4. Read the heatmap: green is farmable. Click any cell for the detailed fight analysis and tips.
5. **Ledger** – download a backup, import builds, or copy your party for an AI assistant.

Parties store references to heroes, so improving a hero updates every party it is in. Data saved by v0.1 is picked up automatically, including an unsaved draft from the old builder.

## Architecture

Important project areas:

```text
src/main/                 Electron main process
src/preload/              Electron preload bridge
src/renderer/             React UI: views/ (quest board, barracks, character sheets, ledger), components/ (art, drawers, pickers), state/, sim/ (Web Worker + quest scan)
src/shared/data/          Data source boundary, validator, indexed repository
src/shared/engine.ts      Stat engine
src/shared/combat-engine.ts  Ress-style quest simulator
src/shared/team.ts        Team pipeline + plain-language analysis (shared by UI, API, CLI)
src/shared/api/           LLM-friendly planner API
src/mcp/                  MCP server and CLI
src/data/generated/       Generated game data
scripts/                  Data import and Ress formula dump scripts
data/id-aliases.json      Old → new ids for entities renamed upstream
docs/                     Formula notes, simulator spec, data sources, LLM interface
docs/github-workflows/    CI and weekly data update workflows (move to .github/workflows to enable)
```

Core principles: data and logic stay separate, and nothing above `src/shared/data` knows where the data came from. New game data is imported into JSON instead of hardcoded into the stat engine.

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
- `docs/data-sources.md`
- `docs/llm-interface.md`

## Testing

Run:

```powershell
pnpm.cmd run test
```

The test suite covers data validation and sources, the stat engine, the planner API (including parity with the UI pipeline), UI workflows (autosave, pickers, simulation, migration, undo, AI import), and deterministic combat formulas. Some Ress parity tests remain marked as TODO until stable input/output truth rows are captured from the live spreadsheet.

## Distribution Plan

TitanForge is published in two forms:

- A browser demo hosted on GitHub Pages.
- A Windows desktop build distributed through GitHub Releases.

GitHub Pages URLs:

```text
https://horbachm-cpu.github.io/titanforge-hero-planner/
https://horbachm-cpu.github.io/titanforge-hero-planner/app/
```

The current Pages entry point is `docs/index.html`. The interactive web app is built into `docs/app` with the Vite base URL `/titanforge-hero-planner/app/`.

Build Windows release artifacts with:

```powershell
pnpm.cmd run dist
```

The generated artifacts are written to `release/`. For the MVP release, publish them on GitHub as `v0.1.0-mvp` and upload the portable `.exe` plus the `.zip` archive.

## License

This project is source-available, not open source.

Official compiled releases may be used for free for personal, non-commercial use. The source code may be viewed for review and portfolio evaluation. Modification, redistribution, commercial use, and publication of derivative versions are not allowed without prior written permission.

See `LICENSE.md`.

## Roadmap

Near-term:

- Capture controlled Ress spreadsheet truth rows for full simulator parity tests
- Item icons (Kabam's fan kit) instead of initials
- Add more simulator fixtures for special artifacts and champion edge cases
- Add screenshots and release downloads to the GitHub Pages landing page
- Add automated release publishing

Later:

- More polished simulator result views
- Build sharing links or portable build bundles
- Better visual data browser for items, skills, spirits, elements, and champions
