import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSXModule from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const XLSX = XLSXModule.default ?? XLSXModule;

const OFFICIAL_SHEET_ID = '1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c';
const RESS_SHEET_ID = '1LM8yySoXgyxute3xv5qKqBOt86Xcr41LEDncdrPp4EA';
const OFFICIAL_TABS = ['Home', 'Blueprints', 'Heroes', 'Hero Levels', 'Skills', 'Champions', 'Quests', 'Enchantments'];
const OFFICIAL_CSV_TABS = OFFICIAL_TABS.filter((tab) => tab !== 'Champions');
const OUTPUT_PATH = resolve(rootDir, 'src/data/generated/game-data.json');
const RAW_RESS_PATH = resolve(rootDir, 'data/raw/ress-hero-quest-simulator.xlsx');

async function main() {
  const sheets = new Map();

  for (const tab of OFFICIAL_CSV_TABS) {
    process.stdout.write(`Fetching ${tab}...\n`);
    const csv = await fetchCsv(OFFICIAL_SHEET_ID, tab);
    sheets.set(tab, parseCsv(csv));
  }

  process.stdout.write('Fetching official workbook for Champions...\n');
  const officialWorkbook = await fetchXlsx(OFFICIAL_SHEET_ID);
  const championRows = readXlsxRows(officialWorkbook, 'Champions');

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
    champions: parseChampions(skills, championRows),
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

async function fetchXlsx(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download workbook: ${response.status} ${response.statusText}`);
  }
  return XLSX.read(Buffer.from(await response.arrayBuffer()), {
    cellDates: false,
    cellFormula: false,
    type: 'buffer'
  });
}

function readXlsxRows(workbook, tab) {
  const sheet = workbook.Sheets[tab];
  if (!sheet) {
    throw new Error(`Missing workbook sheet "${tab}".`);
  }
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false
  });
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

function parseChampions(skills, rows) {
  const leaderSkillIdsByChampion = new Map();
  for (const skill of skills.filter((entry) => entry.type === 'Leader')) {
    const classLabel = skill.classes[0] ?? '';
    const match = classLabel.match(/^(.+?)\s+\((Guest Champion|Champion)\)$/i);
    if (!match) {
      continue;
    }
    const id = slugify(match[1]);
    leaderSkillIdsByChampion.set(id, [...(leaderSkillIdsByChampion.get(id) ?? []), skill.id]);
  }

  return parseChampionSheet(rows, skills, leaderSkillIdsByChampion).sort((left, right) => left.name.localeCompare(right.name));
}

function parseChampionSheet(rows, skills, leaderSkillIdsByChampion) {
  const leaderSkillByName = new Map(
    skills.filter((skill) => skill.type === 'Leader').map((skill) => [normalizeName(skill.name), skill])
  );
  const elementBreakpoints = parseChampionElementBreakpoints(rows);
  const champions = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    if (!isChampionStart(row)) {
      continue;
    }

    const nextStart = findNextChampionBlock(rows, rowIndex + 1);
    const blockRows = rows.slice(rowIndex, nextStart === -1 ? rows.length : nextStart);
    const parsedName = parseChampionName(clean(row[1]));
    const leaderSkillIds = leaderSkillIdsByChampion.get(parsedName.id) ?? [];
    const rankRewards = parseChampionRankRewards(blockRows, leaderSkillByName, leaderSkillIds);

    champions.push({
      id: parsedName.id,
      name: parsedName.name,
      guest: parsedName.guest,
      role: championRole(clean(blockRows[3]?.[2])),
      element: clean(blockRows[1]?.[2]),
      unlockCost: clean(blockRows[2]?.[2]),
      prerequisite: clean(blockRows[0]?.[4]),
      baseStats: {
        hp: numberValue(blockRows[0]?.[6]),
        attack: numberValue(blockRows[1]?.[6]),
        defense: numberValue(blockRows[2]?.[6]),
        evasion: percentOrNumber(blockRows[3]?.[6]),
        critChance: percentOrNumber(blockRows[1]?.[4]),
        critDamage: multiplierValue(blockRows[2]?.[4]),
        threat: numberValue(blockRows[3]?.[4]),
        power: 0
      },
      leaderSkillIds,
      rankRewards,
      elementBreakpoints
    });

    if (nextStart === -1) {
      break;
    }
    rowIndex = nextStart - 1;
  }

  return champions;
}

function isChampionStart(row) {
  return Boolean(
    clean(row[1]) &&
      /^Prerequisite$/i.test(clean(row[3])) &&
      /^HP$/i.test(clean(row[5]))
  );
}

function findNextChampionBlock(rows, startIndex) {
  for (let index = startIndex; index < rows.length; index += 1) {
    if (isChampionStart(rows[index] ?? [])) {
      return index;
    }
  }
  return -1;
}

function parseChampionName(rawName) {
  const guest = /\(Guest Champion\)/i.test(rawName);
  const name = titleCase(rawName.replace(/\(Guest Champion\)/i, '').trim());
  return {
    id: slugify(name),
    name,
    guest
  };
}

function championRole(value) {
  if (/fighter/i.test(value)) {
    return 'fighter';
  }
  if (/rogue/i.test(value)) {
    return 'rogue';
  }
  if (/spellcaster/i.test(value)) {
    return 'spellcaster';
  }
  return 'champion';
}

function parseChampionElementBreakpoints(rows) {
  const breakpoints = [];
  for (const row of rows) {
    const rank = numberValue(row[8]);
    if (rank <= 0 || /^Rank$/i.test(clean(row[8]))) {
      continue;
    }
    breakpoints.push({
      rank,
      elementValue: numberValue(row[9])
    });
  }
  return breakpoints;
}

function parseChampionRankRewards(blockRows, leaderSkillByName, leaderSkillIds) {
  const rewards = [];

  for (const row of blockRows.slice(5)) {
    const rankLabel = clean(row[1]);
    const rewardText = clean(row[3]);
    const repeatable = /\+X/i.test(rankLabel);
    const rank = numberValue(rankLabel);

    if (rank > 0) {
      rewards.push({
        rank,
        rankLabel,
        coinsNeeded: numberValue(row[2]),
        coinsFormula: repeatable ? clean(row[2]) : '',
        reward: rewardText,
        statGains: parseChampionStatGains(rewardText),
        leaderSkillId: rewards.length === 0 ? leaderSkillIds[0] ?? '' : leaderSkillIdFromReward(rewardText, leaderSkillByName),
        repeatable
      });
      continue;
    }

    if (rewardText && rewards.length > 0) {
      const previous = rewards[rewards.length - 1];
      previous.reward = [previous.reward, rewardText].filter(Boolean).join(' | ');
      previous.statGains = addFlatStatBlocks(previous.statGains, parseChampionStatGains(rewardText));
      previous.leaderSkillId ||= leaderSkillIdFromReward(rewardText, leaderSkillByName);
    }
  }

  return rewards;
}

function leaderSkillIdFromReward(rewardText, leaderSkillByName) {
  const match = rewardText.match(/Leader Skill Upgraded:\s*(.+)$/i);
  if (!match) {
    return '';
  }
  return leaderSkillByName.get(normalizeName(match[1]))?.id ?? '';
}

function parseChampionStatGains(rewardText) {
  return {
    attack: sumFlat(rewardText, [/\+(\d+(?:\.\d+)?)\s+Attack\b/gi]),
    defense: sumFlat(rewardText, [/\+(\d+(?:\.\d+)?)\s+Defense\b/gi]),
    hp: sumFlat(rewardText, [/\+(\d+(?:\.\d+)?)\s+Health\b/gi]),
    evasion: 0,
    critChance: 0,
    critDamage: 0,
    threat: 0
  };
}

function zeroStatBlock() {
  return {
    attack: 0,
    defense: 0,
    hp: 0,
    evasion: 0,
    critChance: 0,
    critDamage: 0,
    threat: 0,
    power: 0
  };
}

function addFlatStatBlocks(left, right) {
  return {
    attack: left.attack + right.attack,
    defense: left.defense + right.defense,
    hp: left.hp + right.hp,
    evasion: left.evasion + right.evasion,
    critChance: left.critChance + right.critChance,
    critDamage: left.critDamage + right.critDamage,
    threat: left.threat + right.threat
  };
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
  const parsed = numberValue(cleaned.replace('%', ''));
  return parsed > 0 && parsed < 1 ? parsed * 100 : parsed;
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
