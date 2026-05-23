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

      - uses: vivek5071/ripple@main
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
- uses: vivek5071/ripple@main
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
- uses: vivek5071/ripple@main
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

## AI Review (opt-in)

Ripple can call any OpenAI-compatible LLM to review the diff for logical errors, security issues, and missing error handling — and post the findings as a separate comment on the PR.

### 1. Enable in `.ripple.yml`

```yaml
ai-review:
  enabled: true
  api-url: https://api.groq.com/openai   # base URL — /v1/chat/completions appended automatically
  model: llama-3.3-70b-versatile
  focus: logical-errors,error-handling   # comma-separated; see focus values below
  skip-patterns: "**/*.lock,**/*.snap,**/generated/**"
```

### 2. Pass the API key through the workflow

```yaml
- uses: vivek5071/ripple@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    ai-api-key: ${{ secrets.AI_API_KEY }}
```

Add the key as a repository secret: **Settings → Secrets and variables → Actions → New repository secret**.

### Provider table

| Provider | `api-url` | Notes |
|----------|-----------|-------|
| **Groq** (recommended free tier) | `https://api.groq.com/openai` | Free, no credit card. Models: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`. Get key at console.groq.com. |
| **OpenAI** | `https://api.openai.com` | Models: `gpt-4o`, `gpt-4o-mini`. Supports full structured output. |
| **Azure OpenAI** | `https://<resource>.openai.azure.com/openai/deployments/<deployment>` | Uses Azure RBAC. Set `api-url` to the deployment base URL (no `/v1`). |
| **Ollama** (local) | `http://localhost:11434/openai` | Requires `allow-private-networks: true` in `.ripple.yml`. |
| **vLLM** (private LAN) | `http://192.168.x.x:8000` | Requires `allow-private-networks: true`. |

Ripple negotiates the response format automatically — it tries `json_schema` first (OpenAI structured outputs), then falls back to `json_object`, then plain text. All OpenAI-compatible providers work.

### Focus values

| Value | What it checks |
|-------|----------------|
| `logical-errors` | Incorrect logic, off-by-one errors, wrong conditions |
| `security` | Injection risks, exposed secrets, broken access control |
| `error-handling` | Missing try/catch, silent failures, unhandled promise rejections |
| `broken-assumptions` | Invalid input shape assumptions, broken API contracts |
| `all` | All of the above |

Multiple values: `focus: logical-errors,security,error-handling`

### Additional `.ripple.yml` options

| Key | Default | Description |
|-----|---------|-------------|
| `include-patterns` | `` | Comma-separated globs. When set, only changed files matching at least one pattern are sent to the LLM. Applied before `skip-patterns`. Example: `"src/**,lib/**"` to scope review to source directories only. |
| `skip-patterns` | `` | Comma-separated globs for files to exclude (lock files, snapshots, generated code). |
| `skip-label` | `skip-ai-review` | PR label that disables AI Review for that PR. |
| `budget-usd` | `0` | Max spend per run in USD. Checked before each batch of 5 files; remaining files are listed as skipped-budget in the comment. `0` = unlimited. |
| `min-file-diff-lines` | `1` | Files with fewer changed lines than this are skipped. |
| `min-pr-diff-lines` | `1` | PRs with fewer total changed lines than this skip AI Review entirely. |
| `max-file-tokens` | `32000` | Files whose diff exceeds this token estimate are skipped. |
| `timeout-seconds` | `30` | Per-file LLM call timeout. Timed-out files are noted in the comment. |
| `allow-private-networks` | `false` | Set `true` to allow `api-url` pointing to a private IP (Ollama, vLLM on a LAN). |
| `post-as-comment` | `true` | Set `false` to print findings to the Actions log instead of posting a PR comment. |
| `inline-comments` | `false` | Set `true` to post findings as GitHub inline review comments attached to the diff line. Findings without a line number, or whose line falls outside the diff hunk, fall back to the main comment. Requires `post-as-comment: true`. |

### Example AI Review comment

```
## AI Review

> llama-3.3-70b-versatile · 2 issues found · 1 file reviewed · commit abc1234

### src/services/tradeService.ts

**Line 114 — logical-error**
Incorrect entry type: `BUY` should produce a `DEBIT` (money leaving the account), not `CREDIT`.
Fix: swap the condition — `input.action === 'BUY' ? 'DEBIT' : 'CREDIT'`

**Line 162 — logical-error**
Wrong pagination cursor: `trades[0]!.id` points to the first item in the current page,
not the last. The next page would re-fetch overlapping results.
Fix: use `trades[trades.length - 1]!.id` (or `trades.at(-1)!.id`).
```

---

## Fork PR support

Ripple partially works on fork PRs. GitHub does not grant write access to fork PRs on the default `pull_request` trigger, so Ripple **cannot post comments or request reviewers**. When a fork PR is detected, Ripple logs a warning to the Actions run and exits cleanly — it will not error your CI.

Full fork PR support (review comments + reviewer requests from forked contributor PRs) requires a two-workflow `pull_request_target` setup. This is planned for a future release.

---

## Requirements

- GitHub Actions runner with `ripgrep` installed (`ubuntu-latest` includes it by default)
- `pull-requests: write` permission (to post comments and request reviews)
- `contents: read` permission (for checkout and git blame)
- For gate mode: branch protection rules with required status checks
