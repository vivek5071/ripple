# Ripple

**Ripple** runs on every PR, finds which files downstream of your change could break, looks up who owns them, and routes review requests to the right people — automatically.

Works like the SonarQube report you already know, but for ownership and impact instead of code quality.

---

## How it works

1. **Diff** — reads the PR's changed files via the GitHub API
2. **Track A** — detects changes to contract files (`openapi.yaml`, `*.proto`, `schema.prisma`, route files, migrations) and finds their consumers across the repo
3. **Track B** — extracts exported symbols from the diff and ripgreps the repo for callers
4. **Owner resolution** — maps impacted files to GitHub handles via `.ripple.yml` → git blame → GitHub Search API
5. **Report** — posts a grouped PR comment; in gate mode, requests reviews from every owner

---

## Quick start

### 1. Add the workflow

Create `.github/workflows/ripple.yml` in your repo:

```yaml
name: Ripple

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  ripple:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # required for git blame fallback

      - uses: vivekkumardev8/ripple@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          mode: advisory
```

### 2. Add an ownership file

Create `.ripple.yml` in your repo root:

```yaml
# yaml-language-server: $schema=./ripple.schema.json
paths:
  'src/api/**': alice
  'src/db/**':
    - bob
    - charlie
  'src/auth/**': carol
  'src/shared/**':
    - alice
    - carol
```

Globs use [micromatch](https://github.com/micromatch/micromatch) syntax. The first matching pattern wins. Handles are GitHub usernames without the `@`.

That's it. Ripple will start posting reports on every PR.

---

## Configuration

| Input | Default | Description |
|-------|---------|-------------|
| `github-token` | — | **Required.** Use `${{ secrets.GITHUB_TOKEN }}`. |
| `mode` | `advisory` | `advisory` posts a report only. `gate` also requests GitHub reviews from all impacted owners. |
| `min-symbol-length` | `5` | Minimum characters for a symbol to trigger a Track B grep. Prevents flooding on short names like `get` or `run`. |
| `max-files-to-search` | `50000` | Cap on files scanned by ripgrep. Tune down for very large monorepos. |
| `max-owners-per-pr` | `10` | If more unique owners are found than this cap, Ripple falls back to advisory for that run. |
| `team-lead` | `` | GitHub handle used as fallback when the PR author is the sole owner of every impacted file (avoids review deadlock). |
| `bot-patterns` | `` | Comma-separated glob patterns for bot handles that lack the `[bot]` suffix — e.g. `renovate,devin-ai`. GitHub App bots ending in `[bot]` are detected automatically. |

---

## Advisory vs gate mode

**Advisory mode** (default) — Ripple posts a report comment on every PR. No reviews are requested and merges are never blocked. Good for building trust and calibrating your `.ripple.yml` before turning on enforcement.

**Gate mode** — Ripple requests GitHub reviews from every impacted file owner. Combined with a branch protection rule requiring those reviews, PRs cannot merge until all notified owners approve.

To enable gate mode:

```yaml
- uses: vivekkumardev8/ripple@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    mode: gate
```

Then go to **Settings → Branches → Branch protection rules** and add a required status check for the `ripple` job.

> Without branch protection, gate mode still requests reviews but cannot block the merge.

---

## Bot PR auto-gating

PRs from AI coding agents and automation bots are automatically upgraded to gate mode regardless of the `mode` setting.

**Always detected (no config needed):**
Any GitHub App bot whose handle ends in `[bot]` — for example `github-actions[bot]`, `dependabot[bot]`, `copilot-swe-agent[bot]`.

**Custom bots** (configure via `bot-patterns`):
Bots that don't follow the `[bot]` convention:

```yaml
- uses: vivekkumardev8/ripple@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    mode: advisory
    bot-patterns: 'renovate,devin-ai,my-deploy-bot'
```

When a bot PR is detected, the comment notes it: `Bot PR — gate mode auto-applied because @github-actions[bot] is a bot.`

---

## Owner resolution

Ripple resolves owners in this order for each impacted file:

1. **`.ripple.yml`** — first matching glob wins
2. **git blame** — most recent committer on that file (`git log --format=%ae -1`)
3. **GitHub Search API** — maps the commit email to a GitHub handle (`/search/users?q=EMAIL+in:email`)
4. **Unresolved** — file appears in the comment with a YAML snippet you can copy to add ownership

Files with no owner do not trigger review requests. The PR comment shows them separately with a suggestion to add them to `.ripple.yml`.

---

## Ownership file schema

A JSON Schema is included for IDE validation. Add this comment to the top of your `.ripple.yml`:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/vivekkumardev8/ripple/main/ripple.schema.json
```

VS Code with the [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) will validate globs and owner values as you type.

---

## Example PR comment

```
## Ripple Report

> Scanned 8,432 files in 1,847ms · gate mode

### Owners to notify (2)

**@alice** — 2 files
- `src/api/users.ts`
- `src/api/payments.ts`

**@bob** — 1 file
- `src/db/user-repo.ts`

### Files with no owner

Add these paths to `.ripple.yml` so future PRs are routed automatically:

paths:
  'src/lib/format.ts': your-handle

---
> **Bot PR** — gate mode auto-applied because @devin-ai is a bot.
  All impacted file owners must approve before merge.
```

---

## Requirements

- GitHub Actions runner with `ripgrep` installed (`ubuntu-latest` includes it by default)
- `pull-requests: write` permission (to post comments and request reviews)
- `contents: read` permission (for checkout and git blame)
- For gate mode: branch protection rules with required status checks
