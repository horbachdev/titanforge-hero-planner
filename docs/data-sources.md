# Game data: sources, updates and plugging in an API

## Where the data comes from today

There is **no public Shop Titans API** (checked November 2026). The best
machine-readable source is Kabam's official *Shop Titans Data Spreadsheet*
(linked from playshoptitans.com/spreadsheet). It is a public Google Sheet, so
`scripts/import-data.mjs` reads it through Google's CSV/XLSX export endpoints
and enriches quests with combat metadata from Ress' community *Hero & Quest
Simulator* workbook.

The result is one normalized file, `src/data/generated/game-data.json`
(`GameData` in `src/shared/types.ts`).

## How it stays up to date

| Step | Where |
| --- | --- |
| Weekly check for a new game version (and on demand) | `docs/github-workflows/update-game-data.yml` (move to `.github/workflows/` to enable, see its README) |
| Import + validation; refuses to write broken data | `pnpm import:data` → `src/shared/data/validate.ts` |
| Change summary used as PR description | `pnpm import:data --summary file.md` |
| Tests + web rebuild, then a pull request for review | same workflow |
| Quick manual check | `pnpm import:data --check` (exit code 10 = update available) |

Renamed entities: if an id disappears only because the item/skill was
renamed upstream, add `"old-id": "new-id"` to `data/id-aliases.json`. Saved
builds then keep working; the app rewrites old ids when loading.

Lesson learned: Google's `gviz` CSV endpoint guesses header rows unless
`headers=1` is passed. At client v26.9.1 it merged ~30 skill rows into the
header, the import crashed and the app silently stayed on old data. The
validator now catches this class of problem.

## Architecture: the data source boundary

```
          ┌──────────────────────────── GameDataSource ───────────────────────────┐
          │ bundled JSON │ remote JSON │ local file │ future official API (+map) │
          └───────────────┬────────────────────────────────────────────────────────┘
                          │ loadGameData(): validate → fallback on failure
                          ▼
                   GameData (+ GameRepository: indexes, aliases, search)
                          │
     ┌────────────────────┼───────────────────────┬──────────────────────┐
     ▼                    ▼                       ▼                      ▼
 stat engine        team/simulator           planner API            React UI
 (engine.ts)        (team.ts)                (api/planner.ts)       (GameDataProvider)
                                             ├─ MCP server
                                             └─ CLI
```

Nothing above the boundary imports the JSON file directly. The UI receives
data from `<GameDataProvider source={…}>`, the MCP server and CLI from
`createNodeDataSource()`.

Files:

- `src/shared/data/source.ts` — `GameDataSource` interface, `loadGameData`,
  `remoteJsonDataSource`, `fallbackDataSource`, `memoryDataSource`
- `src/shared/data/bundled.ts` — lazy-loaded bundled JSON
- `src/shared/data/file.ts`, `node.ts` — Node-only sources and env selection
- `src/shared/data/validate.ts` — the shared validator
- `src/shared/data/repository.ts` — indexed, alias-aware read model

## Connecting an API later

1. Map the API payload to `GameData` (the hardest part; keep ids stable or
   add aliases):

   ```ts
   import { remoteJsonDataSource } from './shared/data/source';

   export const kabamApiSource = remoteJsonDataSource('https://api.example.com/v1/game-data', {
     kind: 'api',
     label: 'Official API',
     headers: { Authorization: `Bearer ${token}` },
     transform: (payload) => mapKabamPayloadToGameData(payload)
   });
   ```

   For anything more custom, implement the two-member interface directly:
   `{ info, load(signal) }`.

2. Use it with the bundled data as fallback:
   - App: build with `VITE_GAME_DATA_URL=…` (simple JSON), or pass
     `fallbackDataSource(kabamApiSource, bundledDataSource())` to `<App source>`.
   - MCP/CLI: set `TITANFORGE_DATA_URL`, or extend `createNodeDataSource()`.

3. Nothing else changes: the validator rejects incomplete payloads, the app
   falls back to the bundled data and tells the player in *Data → Game data*.

A browser app cannot hold a private API key. If an API requires one, put a
small proxy (or the scheduled import workflow) in front of it and publish the
mapped `game-data.json`, e.g. on GitHub Pages, then point
`VITE_GAME_DATA_URL` at it.
