# GitHub Actions workflows (ready to enable)

These two workflows are kept here because the automation that prepared them
was not allowed to write to `.github/workflows`. To enable them, run once from
the repository root and push:

```bash
mkdir -p .github/workflows && git mv docs/github-workflows/*.yml .github/workflows/
```

- `ci.yml` — typecheck, tests and web build on every pull request.
- `update-game-data.yml` — every Monday (and on demand): imports Kabam's
  official data spreadsheet, validates it, runs the tests, rebuilds the web
  app and opens a pull request with a change summary if the game data changed.
  Requires *Settings → Actions → General → Workflow permissions → Allow GitHub
  Actions to create and approve pull requests*.
