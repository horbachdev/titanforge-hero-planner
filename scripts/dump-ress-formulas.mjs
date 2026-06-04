import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSXModule from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const XLSX = XLSXModule.default ?? XLSXModule;

const inputPath = resolve(rootDir, 'data/raw/ress-hero-quest-simulator.xlsx');
const outputPath = resolve(rootDir, 'data/raw/ress-formula-dump.json');
const summaryPath = resolve(rootDir, 'docs/ress-formula-index.md');

const workbook = XLSX.readFile(inputPath, {
  cellDates: false,
  cellFormula: true,
  cellNF: false,
  cellStyles: false
});

const sheets = workbook.SheetNames.map((sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const formulas = Object.keys(sheet)
    .filter((address) => !address.startsWith('!') && sheet[address]?.f)
    .sort(compareCellAddresses)
    .map((address) => ({
      address,
      formula: sheet[address].f,
      value: sheet[address].v ?? null
    }));
  return {
    name: sheetName,
    ref: sheet['!ref'] ?? '',
    formulaCount: formulas.length,
    formulas
  };
});

const dump = {
  source: 'data/raw/ress-hero-quest-simulator.xlsx',
  generatedAt: new Date().toISOString(),
  sheets
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(dump, null, 2)}\n`, 'utf8');
await writeFile(summaryPath, buildSummaryMarkdown(dump), 'utf8');

process.stdout.write(`Wrote ${outputPath}\n`);
process.stdout.write(`Wrote ${summaryPath}\n`);

function buildSummaryMarkdown({ source, generatedAt, sheets: workbookSheets }) {
  const rows = workbookSheets
    .map((sheet) => `| ${escapePipe(sheet.name)} | ${sheet.ref} | ${sheet.formulaCount.toLocaleString()} |`)
    .join('\n');
  const focusSheets = ['Quest Sim', 'Hero 1', 'Champion 1', 'Hero Stats', 'Skill Data', 'Eq Data', 'Quest Data'];
  const focus = workbookSheets
    .filter((sheet) => focusSheets.includes(sheet.name))
    .map((sheet) => {
      const examples = sheet.formulas
        .slice(0, 12)
        .map((entry) => `- \`${sheet.name}!${entry.address}\`: \`${entry.formula}\``)
        .join('\n');
      return `## ${sheet.name}\n\nFormula cells: ${sheet.formulaCount.toLocaleString()}  \nUsed range: \`${sheet.ref}\`\n\n${examples}`;
    })
    .join('\n\n');

  return `# Ress Formula Index

Generated from \`${source}\` at ${generatedAt}.

The complete raw formula dump is stored in \`data/raw/ress-formula-dump.json\`.

| Sheet | Used range | Formula cells |
| --- | ---: | ---: |
${rows}

${focus}
`;
}

function escapePipe(value) {
  return String(value).replace(/\|/g, '\\|');
}

function compareCellAddresses(left, right) {
  const leftCell = XLSX.utils.decode_cell(left);
  const rightCell = XLSX.utils.decode_cell(right);
  if (leftCell.r !== rightCell.r) {
    return leftCell.r - rightCell.r;
  }
  return leftCell.c - rightCell.c;
}
