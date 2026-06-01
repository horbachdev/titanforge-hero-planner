import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const OFFICIAL_SHEET_ID = '1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c';
const RESS_SHEET_ID = '1LM8yySoXgyxute3xv5qKqBOt86Xcr41LEDncdrPp4EA';
const OFFICIAL_TABS = ['Home', 'Blueprints', 'Heroes', 'Hero Levels', 'Skills', 'Quests', 'Enchantments'];
const OUTPUT_PATH = resolve(rootDir, 'src/data/generated/game-data.json');
const RAW_RESS_PATH = resolve(rootDir, 'data/raw/ress-hero-quest-simulator.xlsx');

async function main() {
  const sheets = new Map();

  for (const tab of OFFICIAL_TABS) {
    process.stdout.write(`Fetching ${tab}...\n`);
    const csv = await fetchCsv(OFFICIAL_SHEET_ID, tab);
    sheets.set(tab, parseCsv(csv));
  }

  const ressVersion = await readRessVersion();
  const metadata = readMetadata(sheets.get('Home') ?? [], ressVersion);
  const skills = parseSkills(sheets.get('Skills') ?? []);
  const heroes = linkHeroMetadata(parseHeroes(sheets.get('Heroes') ?? []), skills);
  const data = {
    metadata,
    heroes,
    heroLevels: parseHeroLevels(sheets.get('Hero Levels') ?? []),
    items: parseItems(sheets.get('Blueprints') ?? []),
    skills,
    champions: parseChampions(skills),
    enchantments: parseEnchantments(sheets.get('Enchantments') ?? []),
    quests: parseQuests(sheets.get('Quests') ?? [])
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);

  await downloadRessWorkbook();
}

async function fetchCsv(sheetId, tab) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${tab}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function readRessVersion() {
  try {
    const csv = await fetchCsv(RESS_SHEET_ID, 'Intro');
    const rows = parseCsv(csv);
    const text = rows.flat().join(' ');
    return text.match(/Latest version\s+(V[\d.]+)/i)?.[1] ?? text.match(/This version\s+(V[\d.]+)/i)?.[1] ?? 'V9.4';
  } catch (error) {
    process.stderr.write(`Warning: could not read Ress version (${error.message}).\n`);
    return 'V9.4';
  }
}

async function downloadRessWorkbook() {
  const url = `https://docs.google.com/spreadsheets/d/${RESS_SHEET_ID}/export?format=xlsx`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Ress workbook: ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(RAW_RESS_PATH), { recursive: true });
  await writeFile(RAW_RESS_PATH, bytes);
  process.stdout.write(`Wrote ${RAW_RESS_PATH}\n`);
}

function readMetadata(homeRows, ressVersion) {
  const text = homeRows.flat().join(' ');
  const officialVersion = text.match(/client:\s*([^ ]+)\s+spreadsheet:\s*([^ ]+)/i);
  return {
    generatedAt: new Date().toISOString(),
    officialSpreadsheetId: OFFICIAL_SHEET_ID,
    officialSpreadsheetVersion: officialVersion
      ? `client ${officialVersion[1]} / spreadsheet ${officialVersion[2]}`
      : 'unknown',
    ressSpreadsheetId: RESS_SHEET_ID,
    ressSpreadsheetVersion: ressVersion,
    tabs: OFFICIAL_TABS.filter((tab) => tab !== 'Home')
  };
}

function parseItems(rows) {
  const header = rows[0] ?? [];
  const idx = indexer(header);
  const makeId = makeUniqueSlugger();
  const starforgeColumns = header
    .map((name, index) => ({ name, index }))
    .filter((entry) => /^Starforged Milestone \d+$/i.test(entry.name));
  const craftingColumns = header
    .map((name, index) => ({ name, index }))
    .filter((entry) => /^Crafting Upgrade \d+$/i.test(entry.name));
  const ascensionColumns = header
    .map((name, index) => ({ name, index }))
    .filter((entry) => /^Ascension Upgrade \d+$/i.test(entry.name));

  return rows
    .slice(1)
    .map((row) => {
      const name = clean(row[idx('Name')]);
      const type = clean(row[idx('Type')]);
      if (!name || !type) {
        return null;
      }

      return {
        id: makeId(name),
        name,
        type,
        tier: numberValue(row[idx('Tier')]),
        value: numberValue(row[idx('Value')]),
        stats: {
          attack: numberValue(row[idx('ATK')]),
          defense: numberValue(row[idx('DEF')]),
          hp: numberValue(row[idx('HP')]),
          evasion: percentOrNumber(row[idx('EVA')]),
          critChance: percentOrNumber(row[idx('CRIT')])
        },
        elementalAffinity: clean(row[idx('Elemental Affinity')]),
        spiritAffinity: clean(row[idx('Spirit Affinity')]),
        builtInElement: clean(row[idx('Built-In Element')]),
        builtInSpirit: clean(row[idx('Built-In Spirit')]),
        craftingUpgrades: parseUpgradeColumns(row, craftingColumns),
        starforgedMilestones: parseUpgradeColumns(row, starforgeColumns),
        ascensionUpgrades: parseUpgradeColumns(row, ascensionColumns)
      };
    })
    .filter(Boolean);
}

function parseHeroLevels(rows) {
  const header = rows[0] ?? [];
  const idx = indexer(header);
  return rows
    .slice(1)
    .map((row) => ({
      level: numberValue(row[idx('Hero Level')]),
      xpNeeded: numberValue(row[idx('XP Needed')]),
      maxItemTier: numberValue(row[idx('Max Item Tier')])
    }))
    .filter((row) => row.level > 0);
}

function parseSkills(rows) {
  const header = rows[0] ?? [];
  const idx = indexer(header);
  const makeId = makeUniqueSlugger();

  return rows
    .slice(1)
    .map((row) => {
      const name = clean(row[idx('Name')]);
      const effect = clean(row[idx('Skill Effect(s)')]);
      if (!name) {
        return null;
      }
      return {
        id: makeId(name),
        name,
        type: clean(row[idx('Type')]),
        tier: numberValue(row[idx('Tier')]),
        rarity: clean(row[idx('Rarity')]),
        effect,
        classes: clean(row[idx('Classes')])
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
        requiresPromotion: /^yes$/i.test(clean(row[idx('Requires Class Promotion')])),
        modifiers: parseSkillModifiers(effect),
        flatStats: parseSkillFlatStats(effect)
      };
    })
    .filter(Boolean);
}

function parseEnchantments(rows) {
  const elementKeys = ['fire', 'water', 'air', 'earth', 'light', 'dark', 'luxurious', 'all'];
  const makeId = makeUniqueSlugger();
  return rows
    .slice(1)
    .map((row) => {
      const name = clean(row[0]);
      const type = clean(row[1]);
      if (!name || !type) {
        return null;
      }
      const elementScores = Object.fromEntries(
        elementKeys.map((key, offset) => [key, numberValue(row[offset + 2])]).filter(([, value]) => value > 0)
      );
      return {
        id: makeId(name),
        name,
        type,
        elementScores
      };
    })
    .filter(Boolean);
}

function parseHeroes(rows) {
  const groupStarts = [1, 9, 17];
  const heroes = [];
  const makeId = makeUniqueSlugger();

  for (const startColumn of groupStarts) {
    const role = roleFromHeader(rows[0]?.[startColumn] ?? '');
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      if (!isHeroStart(row, startColumn)) {
        continue;
      }

      const rawName = clean(row[startColumn]);
      const promotionMatch = rawName.match(/^(.+?)\s*\((.+?)\s+Class Promotion\)$/is);
      const name = titleCase((promotionMatch?.[1] ?? rawName).replace(/\s+/g, ' '));
      const baseClassName = titleCase((promotionMatch?.[2] ?? rawName).replace(/\s+/g, ' '));
      const isPromotion = Boolean(promotionMatch);
      const prerequisite = clean(row[startColumn + 3]);
      const slots = [];
      const skillUnlocks = [];

      for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
        const allowedTypes = [];
        for (let allowedRow = rowIndex + 5; allowedRow < Math.min(rowIndex + 12, rows.length); allowedRow += 1) {
          if (isHeroStart(rows[allowedRow] ?? [], startColumn)) {
            break;
          }
          const value = clean(rows[allowedRow]?.[startColumn + slotIndex]);
          if (value && !allowedTypes.includes(value)) {
            allowedTypes.push(value);
          }
        }
        slots.push({
          id: `slot-${slotIndex + 1}`,
          label: `Slot ${slotIndex + 1}`,
          allowedTypes
        });
      }

      for (let allowedRow = rowIndex + 5; allowedRow < Math.min(rowIndex + 12, rows.length); allowedRow += 1) {
        const unlock = clean(rows[allowedRow]?.[startColumn + 6]);
        if (unlock && !skillUnlocks.includes(unlock)) {
          if (/^Lv\.\s*\d+/i.test(unlock)) {
            skillUnlocks.push(unlock);
          }
        }
      }

      heroes.push({
        id: isPromotion ? slugify(`${name}-${baseClassName}-class-promotion`) : makeId(name),
        name,
        role,
        promoted: isPromotion,
        baseClassId: slugify(baseClassName),
        baseClassName,
        promotedClassId: '',
        promotedClassName: '',
        element: clean(rows[rowIndex + 2]?.[startColumn + 6]),
        prerequisite,
        baseStats: {
          hp: numberValue(row[startColumn + 5]),
          attack: numberValue(rows[rowIndex + 1]?.[startColumn + 5]),
          defense: numberValue(rows[rowIndex + 2]?.[startColumn + 5]),
          evasion: percentOrNumber(rows[rowIndex + 3]?.[startColumn + 5]),
          critChance: percentOrNumber(rows[rowIndex + 1]?.[startColumn + 3]),
          critDamage: multiplierValue(rows[rowIndex + 2]?.[startColumn + 3]),
          threat: numberValue(rows[rowIndex + 3]?.[startColumn + 3]),
          power: 0
        },
        slots,
        skillUnlocks,
        innateSkillIds: []
      });
    }
  }

  return heroes;
}

function linkHeroMetadata(heroes, skills) {
  const byId = new Map(heroes.map((hero) => [hero.id, hero]));
  const innateSkills = skills.filter((skill) => skill.type === 'Innate');

  for (const hero of heroes) {
    if (hero.promoted) {
      const baseHero = byId.get(hero.baseClassId);
      if (baseHero) {
        baseHero.promotedClassId = hero.id;
        baseHero.promotedClassName = hero.name;
      }
      hero.promotedClassId = hero.id;
      hero.promotedClassName = hero.name;
    }
  }

  for (const hero of heroes) {
    const matchingInnates = innateSkills
      .filter((skill) => skill.classes.some((entry) => normalizeName(entry) === normalizeName(hero.name)))
      .sort((left, right) => right.tier - left.tier);
    hero.innateSkillIds = matchingInnates.length > 0 ? [matchingInnates[0].id] : [];
  }

  return heroes;
}

function parseChampions(skills) {
  const championMap = new Map();
  for (const skill of skills.filter((entry) => entry.type === 'Leader')) {
    const classLabel = skill.classes[0] ?? '';
    const match = classLabel.match(/^(.+?)\s+\((Guest Champion|Champion)\)$/i);
    if (!match) {
      continue;
    }
    const name = match[1].trim();
    const id = slugify(name);
    const champion = championMap.get(id) ?? {
      id,
      name,
      guest: /guest/i.test(match[2]),
      leaderSkillIds: []
    };
    champion.leaderSkillIds.push(skill.id);
    championMap.set(id, champion);
  }
  return [...championMap.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function parseQuests(rows) {
  const quests = [];
  let currentZone = '';
  let partySize = 0;
  const makeId = makeUniqueSlugger();

  for (const row of rows) {
    if (clean(row[1]) && clean(row[5]) === 'Maximum Party Size') {
      currentZone = clean(row[1]);
      partySize = numberValue(row[7]);
      continue;
    }

    const difficulty = clean(row[1]);
    if (!['Easy', 'Medium', 'Hard', 'Extreme'].includes(difficulty)) {
      continue;
    }

    const type = clean(row[2]) || 'Normal';
    quests.push({
      id: makeId(`${currentZone}-${type}-${difficulty}`),
      zone: currentZone,
      difficulty,
      type,
      partySize,
      powerRequirement: numberValue(row[3]) || numberValue(row[4]),
      enemyHealth: numberValue(row[12]),
      enemyDamage: numberValue(row[13]),
      barrierType: clean(row[15]),
      barrierHealth: numberValue(row[16])
    });
  }

  return quests;
}

function parseSkillModifiers(effect) {
  return {
    attack: sumPercent(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)%\s+(?:bonus\s+)?(?:Attack|ATK)\b/gi]),
    defense: sumPercent(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)%\s+(?:bonus\s+)?(?:Defense|DEF)\b/gi]),
    hp: sumPercent(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)%\s+(?:more\s+|bonus\s+)?(?:HP|Health)\b/gi]),
    evasion: sumPercent(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)%\s+(?:bonus\s+)?(?:Evasion|EVA)\b/gi]),
    critChance: sumPercent(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)%\s+(?:Critical Hit Chance|Crit(?:ical)? Chance|\bCRIT\b)/gi]),
    critDamage: sumPercent(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)%\s+(?:Critical Hit Damage|Crit(?:ical)? Damage)\b/gi])
  };
}

function parseSkillFlatStats(effect) {
  return {
    attack: sumFlat(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)\s+(?:Attack|ATK)\b/gi]),
    defense: sumFlat(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)\s+(?:Defense|DEF)\b/gi]),
    hp: sumFlat(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)\s+(?:Health|HP)\b/gi]),
    evasion: 0,
    critChance: 0,
    critDamage: 0,
    threat: sumFlat(effect, [/(?:\+|plus )(\d+(?:\.\d+)?)\s+Threat Rating\b/gi])
  };
}

function sumPercent(value, patterns) {
  let total = 0;
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      total += Number.parseFloat(match[1]) / 100;
    }
  }
  return total;
}

function sumFlat(value, patterns) {
  let total = 0;
  const withoutPercents = value.replace(/\+\d+(?:\.\d+)?%[^.]*\./g, '');
  for (const pattern of patterns) {
    for (const match of withoutPercents.matchAll(pattern)) {
      total += Number.parseFloat(match[1]);
    }
  }
  return total;
}

function parseUpgradeColumns(row, columns) {
  return columns
    .map(({ index }) => ({
      description: clean(row[index]),
      unlockCount: numberValue(row[index + 1])
    }))
    .filter((entry) => entry.description);
}

function isHeroStart(row, startColumn) {
  const name = clean(row[startColumn]);
  return Boolean(name && clean(row[startColumn + 2]) === 'Prerequisite' && clean(row[startColumn + 4]) === 'HP');
}

function roleFromHeader(value) {
  if (/fighter/i.test(value)) {
    return 'fighter';
  }
  if (/rogue/i.test(value)) {
    return 'rogue';
  }
  if (/spellcaster/i.test(value)) {
    return 'spellcaster';
  }
  return 'unknown';
}

function indexer(header) {
  return (name) => {
    const index = header.findIndex((entry) => entry === name);
    if (index === -1) {
      throw new Error(`Missing required column "${name}".`);
    }
    return index;
  };
}

function clean(value) {
  const text = String(value ?? '').trim();
  return text === '---' ? '' : text;
}

function numberValue(value) {
  const cleaned = clean(value).replace(/,/g, '');
  if (!cleaned || /^free$/i.test(cleaned)) {
    return 0;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentOrNumber(value) {
  const cleaned = clean(value);
  if (!cleaned) {
    return 0;
  }
  return numberValue(cleaned.replace('%', ''));
}

function multiplierValue(value) {
  const cleaned = clean(value).replace(/x$/i, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeUniqueSlugger() {
  const counts = new Map();
  return (value) => {
    const base = slugify(value);
    const next = (counts.get(base) ?? 0) + 1;
    counts.set(base, next);
    return next === 1 ? base : `${base}-${next}`;
  };
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
