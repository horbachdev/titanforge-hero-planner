# Shop Titans Hero Builder

Electron desktop MVP for a Shop Titans hero builder. The app imports the official community data sheet into local JSON, calculates hero stats in TypeScript, supports per-item Starforge toggles, compares saved builds, and exports/imports builds as schema-versioned JSON.

## Commands

Use the Windows `.cmd` shims from PowerShell:

```powershell
pnpm.cmd install
pnpm.cmd run import:data
pnpm.cmd run dev
pnpm.cmd run test
pnpm.cmd run build
```

`pnpm.cmd run dev:renderer` starts only the browser-rendered Vite UI at `http://127.0.0.1:5173`.

## Data

Generated data lives in `src/data/generated/game-data.json`.

The importer reads:

- Official Shop Titans Data Spreadsheet: `client v26.5.0`
- Ress' Hero & Quest Simulator workbook: `V9.4`

Rerun `pnpm.cmd run import:data` when the source sheets change. The app consumes generated JSON only; engine logic does not fetch live data at runtime.

## MVP Status

Implemented:

- Electron + Vite + React + TypeScript shell
- Build-time CSV/XLSX importer
- Hero class, Titan Soul promotion toggle, level, seeds, innate skills, learned skills, gear, quality, element, spirit, and Starforge selection
- Champion leader skill selection for party-wide stat effects
- Roster management with saved hero builds and team totals
- Pure TypeScript stat calculation engine
- Build comparison
- Item browser
- Versioned JSON export/import

Prepared but not final:

- Quest simulation module boundary
- Exact combat parity against Ress' formulas
- Exact affinity/spirit edge-case parity for every special-case item and champion behavior

See `docs/formula-notes.md` for current formula translation notes and known gaps.
