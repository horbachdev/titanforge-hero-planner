# Formula Notes

This MVP implements the stat engine as pure TypeScript and keeps all imported game data in JSON. It intentionally leaves the Quest Simulator disabled until Ress' workbook formulas are fully audited.

## Implemented

- Hero base stats are imported from the official `Heroes` tab.
- Base classes are linked to Titan Soul promotion classes; the Builder promotion toggle now resolves stats against the promoted class when available.
- The highest imported `Innate` skill for the active class is applied and displayed.
- Champion element, unlock cost, class type, base stats, element breakpoints, and rank rewards are imported from the official `Champions` tab via the XLSX workbook export.
- The UI mirrors Ress' party builder shape with five hero build tabs and one `Champion` build tab.
- Champion builds support rank, level, Champion Soul, seeds, Familiar, and Aurasong gear. Champion seeds use Ress' visible scaling pattern: ATK and DEF seeds add `+4`, HP seeds add `+1`.
- Champion `Leader` skills are resolved from the selected roster champion rank and applied only when calculating roster/team stats.
- Repeatable champion `(+X)` power-up rows are stored as repeatable rank rewards and can be added in the roster champion control.
- Gear base ATK, DEF, HP, EVA, and CRIT are imported from the official `Blueprints` tab.
- Quality multipliers are applied to item ATK, DEF, and HP.
- Starforge is a per-equipped-item toggle. If the item has a Starforged milestone matching `+25% Base ATK, DEF and HP`, the engine applies a `1.25` multiplier to that item's base ATK, DEF, and HP before quality scaling.
- Built-in elements and spirits are included in per-item end stats/effects.
- Element affinity adds +10 element score for selected matching affinities; `All` affinity adds +5. Built-in elements are locked to the item and do not receive an additional affinity bonus.
- Spirit affinity uses the matched effect columns extracted from Ress' `Skill Data` spirit rows. Built-in spirits are locked to the item and do not receive an additional matched-affinity bonus.
- Skill effects are parsed into broad percent modifiers for ATK, DEF, HP, EVA, CRIT, and critical damage.
- Roster presets are stored locally as separate team configurations. Champion leader skills are applied through the active roster, not through the individual Hero Builder stat panel.
- Build export/import uses schema version `1`.

## Ress Parity Audit

- The tab shape now matches Ress at a high level: five hero build tabs plus one champion build tab, with the champion aura resolved only in roster/team context.
- Ress final Hero output cells `E18:E23` read from hidden stat cells `AA140:AF140`. The MVP uses the same broad stat categories, but does not yet reproduce the complete hidden-cell chain.
- Ress element points are summed in `AC110` and then drive innate/skill tiers through `AA114:AA118`. The app now counts and displays element points, but skill tier upgrades from element thresholds are not fully data-driven yet.
- Ress spirit handling uses static and matched spirit columns in `Skill Data`; the app now mirrors the common static/matched spirit effects and Idol/Totem doubling, but this should be moved from code mapping to imported data before simulator parity.
- Ress Champion `Champion 1` formulas calculate HP/ATK/DEF from rank tables, level/card-level offsets, seeds, Champion Soul, Familiar/Aurasong base stats, enchantment bonuses, and affinity checks. The app supports the same controls, but Champion stat parity is still incomplete.
- Ress Champion gear formulas cap enchant stat additions with item base stats in several places, for example through `min(...)` branches for Familiar/Aurasong element and spirit stats. The MVP gear engine does not yet model every one of those cap branches.

## Current MVP Approximations

- Level scaling uses deterministic MVP curves until the Ress hero stat formulas are translated cell-by-cell.
- Element enchantments use imported element scores and a temporary stat conversion. This should be replaced with exact item-tier formulas from Ress' workbook.
- Spirit effects use an explicit Ress-derived combat mapping and should become importer-driven once the `Skill Data` matrix is normalized.
- Conditional innate skills are currently approximated as their imported stat modifiers; gear-type-specific and battle-state-specific clauses still need Ress parity work.
- Champion Card Level, Champion rank scaling, and Champion gear enchant caps still need exact Ress fixture tests.
- Power is a display score only and is not used for combat simulation.
- Quest combat and Monte Carlo simulation are intentionally deferred until formula parity tests are in place.

## Next Formula Work

1. Inspect `data/raw/ress-hero-quest-simulator.xlsx`.
2. Extract the hero stat, enchantment, spirit, barrier, damage, rest, and survival formulas into documented TypeScript functions.
3. Add fixture builds with expected outputs copied from the workbook.
4. Enable seeded Monte Carlo quest simulation only after the deterministic stat fixtures pass.
