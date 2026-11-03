# Using TitanForge from an LLM

TitanForge exposes its stat engine and quest simulator as a small, JSON-only
**planner API**. The same API is reachable three ways:

| Way | For | Entry point |
| --- | --- | --- |
| MCP server | Claude Desktop, Claude Code, any MCP client | `pnpm mcp` (`src/mcp/server.ts`) |
| CLI | agents with shell access, scripts | `pnpm -s titanforge <command> [json]` (`src/mcp/cli.ts`) |
| TypeScript | other code in this repo | `createPlannerApi()` (`src/shared/api/planner.ts`) |

All three call the same functions as the app UI (`src/shared/team.ts`), so an
assistant and the app always produce identical numbers for the same builds.

## Design rules (why it is LLM-friendly)

- **Names or ids.** `"heroClass": "mercenary"`, `"item": "kiku ichimonji"`,
  `"spirit": "wolf"` all work. A promoted class name implies `promoted: true`.
- **No silent guessing.** Ambiguous input (`"item": "aegis"`) fails with
  `code: "ambiguous"` and a list of `suggestions` to pick from.
- **Every interpretation is reported** in `notes` (e.g. *Interpreted spirit
  "wolf" as "Wolf Spirit"*, *level 60 adjusted to 50*), so the model can
  correct itself instead of trusting a wrong assumption.
- **Helpful refusals.** Equipping an item the class cannot use returns the
  allowed item types for that slot.
- **Plain-language results.** Simulations return a `verdict` and `insights`
  (barrier not broken, who dies and why, timeouts, benched heroes) next to
  the raw numbers.
- **Round-trippable builds.** Every evaluation returns a normalized `build`
  object. Builds exported from the app are accepted as input, and the app's
  *Data → Import* box accepts the API's team format — so a player can paste an
  assistant's suggestion straight into the app.

## Connect via MCP

Inside this repository Claude Code picks up `.mcp.json` automatically. For
other clients (e.g. Claude Desktop) add:

```json
{
  "mcpServers": {
    "titanforge": {
      "command": "pnpm",
      "args": ["-s", "--dir", "/path/to/titanforge-hero-planner", "mcp"]
    }
  }
}
```

Optional environment variables: `TITANFORGE_DATA` (path to a game-data JSON)
and `TITANFORGE_DATA_URL` (URL of one). Both fall back to the bundled data.

### Tools

| Tool | Purpose |
| --- | --- |
| `get_data_info` | Game version, counts, value conventions. Call first. |
| `search` | Find heroes, items, skills, champions, enchantments, quests. `heroClass` limits items/skills to what that class can use. |
| `get_details` | Full data for one entity. |
| `get_hero_options` | Slots, accepted item types, strongest items per slot, tier cap for a class and level. |
| `evaluate_hero` | Final stats, power and element points of one build. |
| `evaluate_champion` | Champion stats and party aura. |
| `evaluate_team` | All heroes with the champion aura applied, plus totals. |
| `simulate_quest` | Monte Carlo fight: win rate, verdict, insights, per-unit survival. |
| `scan_difficulties` | Win rate on every difficulty of a zone — "what can this team farm?" |

All tools are read-only.

## Input shapes

```jsonc
// Hero
{
  "name": "Tank",                 // optional
  "heroClass": "Mercenary",       // name or id; promoted name ⇒ promoted
  "level": 40,                    // 1–50, default 40
  "seeds": { "attack": 10, "defense": 20, "hp": 30 },
  "skills": ["Sword Master"],     // up to 4, names or ids
  "gear": [
    { "slot": 1, "item": "Kiku-Ichimonji", "quality": "epic", "element": "Inferno", "spirit": "Wolf", "starforged": true },
    { "item": "Gaia Aegis" }      // slot omitted ⇒ first free slot that accepts it
  ]
}

// Champion
{ "champion": "Argon", "rank": 11, "championSoul": true, "familiar": { "item": "..." }, "aurasong": { "item": "..." } }

// Quest: an id, or zone + difficulty (+ type "Boss")
"howling-woods-normal-hard"
{ "zone": "Lost City of Gold Diff 9", "difficulty": "Extreme" }
```

Qualities: `normal`, `superior`, `flawless`, `epic`, `legendary`.
Mini-boss modifiers: `None`, `Agile`, `Dire`, `Huge`, `Legendary`.
Percent stats (`critChance`, `evasion`) are percentage points; `critDamage`
is a multiplier.

## CLI examples

```bash
pnpm -s titanforge info
pnpm -s titanforge search '{"kind":"item","query":"aegis","heroClass":"Soldier"}'
echo '{"heroes":[{"heroClass":"Mercenary"},{"heroClass":"Mage"}],"champion":{"champion":"Argon"},"quest":{"zone":"Elysium","difficulty":"Hard"}}' \
  | pnpm -s titanforge simulate
```

Output is always JSON. Errors are JSON too
(`{"error": {"code", "message", "suggestions"}}`) with exit code 1.

## A typical assistant loop

1. `get_data_info` → learn the game version and conventions.
2. The player pastes their team (*Data → Use with an AI assistant → Copy*).
3. `scan_difficulties` → find the hardest reliable difficulty.
4. `simulate_quest` on the target → read `insights`.
5. `get_hero_options` / `search` → find better gear for the weak unit.
6. `simulate_quest` again with the change; hand the improved `build` back to
   the player, who pastes it into *Data → Import*.

## Limits

The simulator is a port of Ress' community spreadsheet. Rest time, break
chance, Tamas randomness and loot side effects are not modelled; parity with
the spreadsheet is still being validated (see `docs/combat-simulator-calc-spec.md`).
Present win rates as estimates.
