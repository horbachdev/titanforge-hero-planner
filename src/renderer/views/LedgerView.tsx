import { Bot, Database, Download, FileUp, Search, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { normalizeSearch } from '../../shared/data/repository';
import { getStarforgeStatMultiplier } from '../../shared/engine';
import { Combobox } from '../components/Combobox';
import { itemStatSummary } from '../components/game';
import { Card, copyText, downloadJson } from '../components/ui';
import { useGame } from '../data/GameDataContext';
import { useStore } from '../state/store';
import { createBackup, parseImport, teamForAssistant, type ImportResult } from '../state/transfer';

export function LedgerView(): JSX.Element {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Records & tools</p>
          <h1>Ledger</h1>
        </div>
      </header>
      <div className="ledger-layout">
        <div className="data-column">
          <BackupCard />
          <AssistantCard />
          <SourceCard />
        </div>
        <ItemCatalog />
      </div>
    </div>
  );
}

function SourceCard(): JSX.Element {
  const { data, loaded } = useGame();
  const meta = data.metadata;
  const generated = new Date(meta.generatedAt);
  const ageDays = Math.floor((Date.now() - generated.getTime()) / 86_400_000);
  return (
    <Card
      title={
        <>
          <Database size={16} /> Game data
        </>
      }
    >
      <dl className="facts">
        <div>
          <dt>Game version</dt>
          <dd>{meta.officialSpreadsheetVersion}</dd>
        </div>
        <div>
          <dt>Last refreshed</dt>
          <dd>
            {generated.toLocaleDateString()}{' '}
            {ageDays > 0 && (
              <span className="muted">
                ({ageDays} day{ageDays === 1 ? '' : 's'} ago)
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{loaded.source.label}</dd>
        </div>
        <div>
          <dt>Simulator reference</dt>
          <dd>Ress {meta.ressSpreadsheetVersion}</dd>
        </div>
      </dl>
      <p className="muted small">
        {data.heroes.length} classes · {data.items.length.toLocaleString('en-US')} items · {data.skills.length} skills · {data.champions.length}{' '}
        champions · {data.quests.length} quests. Imported from Kabam’s official Shop Titans data spreadsheet and checked for new game versions
        automatically.
      </p>
      {loaded.failures.length > 0 && (
        <div className="callout callout-warning">
          <strong>Using fallback data</strong>
          <ul>
            {loaded.failures.map((failure) => (
              <li key={failure.source.id}>
                {failure.source.label}: {failure.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function BackupCard(): JSX.Element {
  const { data, repo } = useGame();
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const library = { heroes: store.heroes, champions: store.champions, teams: store.teams };

  function check(raw: string): void {
    setText(raw);
    setPreview(raw.trim() ? parseImport(raw, repo) : null);
  }

  function apply(): void {
    if (preview?.ok) {
      store.importLibrary(preview.library);
      store.notify({ message: `Imported ${preview.summary}.`, tone: 'success' });
      setText('');
      setPreview(null);
    }
  }

  return (
    <Card
      title={
        <>
          <Download size={16} /> Backup & import
        </>
      }
    >
      <p className="muted small">Your builds are stored in this browser/app only. Export a backup to move them to another device or share them.</p>
      <div className="button-row">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            downloadJson(
              `titanforge-backup-${new Date().toISOString().slice(0, 10)}.json`,
              createBackup(library, data.metadata.officialSpreadsheetVersion)
            )
          }
        >
          <Download size={15} /> Download backup
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          <FileUp size={15} /> Import file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) {
              check(await file.text());
            }
            event.target.value = '';
          }}
        />
      </div>
      <label className="field">
        <span className="field-label">…or paste JSON (backup, exported build, or an AI-suggested team)</span>
        <textarea
          className="text-input mono"
          rows={5}
          value={text}
          placeholder='{"heroes": [{"heroClass": "Mercenary", "level": 40, "gear": [{"item": "Kiku-Ichimonji", "quality": "epic"}]}]}'
          onChange={(event) => check(event.target.value)}
        />
      </label>
      {preview && !preview.ok && (
        <div className="callout callout-danger" role="alert">
          <strong>Can’t import this</strong>
          <p>{preview.error}</p>
          {preview.suggestions.length > 0 && <p className="small">Did you mean: {preview.suggestions.join(' · ')}</p>}
        </div>
      )}
      {preview?.ok && (
        <div className="callout callout-success">
          <strong>Ready to import {preview.summary}.</strong>
          {preview.notes.length > 0 && (
            <ul className="small">
              {preview.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={apply}>
            <Upload size={15} /> Import
          </button>
        </div>
      )}
    </Card>
  );
}

function AssistantCard(): JSX.Element {
  const store = useStore();
  const team = store.teams.find((entry) => entry.id === store.prefs.teamId) ?? store.teams[0];
  const config = JSON.stringify(
    { mcpServers: { titanforge: { command: 'pnpm', args: ['-s', 'mcp'], cwd: '<path to titanforge-hero-planner>' } } },
    null,
    2
  );
  return (
    <Card
      title={
        <>
          <Bot size={16} /> Use with an AI assistant
        </>
      }
    >
      <p className="small">
        Ask an assistant like Claude “Which difficulty can my team farm?” or “Improve my tank’s survival”. Copy your team below and paste it into the
        chat — the assistant can send improved builds back, which you paste into the import box above.
      </p>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!team}
        onClick={async () => {
          const payload = JSON.stringify(teamForAssistant(team, { heroes: store.heroes, champions: store.champions, teams: store.teams }), null, 2);
          store.notify({ message: (await copyText(payload)) ? `Copied “${team.name}” for your assistant.` : 'Copy failed.', tone: 'success' });
        }}
      >
        Copy “{team?.name}” as JSON
      </button>
      <details className="small">
        <summary>Connect TitanForge as a tool (MCP)</summary>
        <p>
          Assistants that support the Model Context Protocol can run simulations themselves. Add this to your MCP client configuration (for example
          Claude Desktop), then ask it to “simulate my team on Elysium Hard”:
        </p>
        <pre className="code">{config}</pre>
        <p>
          Without MCP, the same API is available on the command line: <code>pnpm titanforge simulate</code>. See docs/llm-interface.md.
        </p>
      </details>
    </Card>
  );
}

function ItemCatalog(): JSX.Element {
  const { data } = useGame();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const types = useMemo(() => [...new Set(data.items.map((item) => item.type))].sort(), [data]);
  const results = useMemo(() => {
    const normalized = normalizeSearch(query);
    return data.items
      .filter((item) => !type || item.type === type)
      .filter((item) => !normalized || normalizeSearch(`${item.name} ${item.type} ${item.builtInSpirit} ${item.builtInElement}`).includes(normalized))
      .sort((left, right) => right.tier - left.tier || left.name.localeCompare(right.name));
  }, [data, query, type]);

  return (
    <Card title="Item catalog" className="catalog">
      <div className="catalog-filters">
        <label className="list-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search items</span>
          <input value={query} placeholder="Search items…" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <Combobox
          label="Item type"
          hideLabel
          value={type}
          clearable
          placeholder="All types"
          options={types.map((entry) => ({ value: entry, label: entry }))}
          onChange={setType}
        />
      </div>
      <p className="muted small">{results.length.toLocaleString('en-US')} items</p>
      <ul className="catalog-list">
        {results.slice(0, 150).map((item) => (
          <li key={item.id} className="catalog-item">
            <span className={`tier-badge tier-${Math.min(item.tier, 16)}`}>T{item.tier}</span>
            <span className="catalog-item-main">
              <strong>{item.name}</strong>
              <small>
                {item.type} · {itemStatSummary(item.stats) || 'no combat stats'}
              </small>
            </span>
            <span className="catalog-item-tags">
              {item.builtInSpirit && <span className="tag">{item.builtInSpirit}</span>}
              {item.builtInElement && <span className="tag">{item.builtInElement}</span>}
              {getStarforgeStatMultiplier(item) > 1 && <span className="tag">Starforge +25%</span>}
            </span>
          </li>
        ))}
      </ul>
      {results.length > 150 && <p className="muted small">Showing the first 150 — refine the search to see more.</p>}
    </Card>
  );
}
