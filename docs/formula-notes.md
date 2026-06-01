# Formula Notes

This MVP implements the stat engine as pure TypeScript and keeps all imported game data in JSON. It intentionally leaves the Quest Simulator disabled until Ress' workbook formulas are fully audited.

## Implemented

- Hero base stats are imported from the official `Heroes` tab.
- Gear base ATK, DEF, HP, EVA, and CRIT are imported from the official `Blueprints` tab.
- Quality multipliers are applied to item ATK, DEF, and HP.
- Starforge is a per-equipped-item toggle. If the item has a Starforged milestone matching `+25% Base ATK, DEF and HP`, the engine applies a `1.25` multiplier to that item's base ATK, DEF, and HP before quality scaling.
- Skill effects are parsed into broad percent modifiers for ATK, DEF, HP, EVA, CRIT, and critical damage.
- Build export/import uses schema version `1`.

## Current MVP Approximations

- Level scaling uses deterministic MVP curves until the Ress hero stat formulas are translated cell-by-cell.
- Element enchantments use imported element scores and a temporary stat conversion. This should be replaced with exact item-tier formulas from Ress' workbook.
- Spirit effects use a small explicit mapping for common combat spirits and should be expanded as formulas are verified.
- Power is a display score only and is not used for combat simulation.
- Quest combat and Monte Carlo simulation are intentionally deferred until formula parity tests are in place.

## Next Formula Work

1. Inspect `data/raw/ress-hero-quest-simulator.xlsx`.
2. Extract the hero stat, enchantment, spirit, barrier, damage, rest, and survival formulas into documented TypeScript functions.
3. Add fixture builds with expected outputs copied from the workbook.
4. Enable seeded Monte Carlo quest simulation only after the deterministic stat fixtures pass.
