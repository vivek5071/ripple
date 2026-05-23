# AI Review — Design Plan (integrated into Ripple)

## Problem

Vibe-coded projects are reviewed by humans who didn't write the code and lack
the context to evaluate what they're looking at. PRs get rubber-stamped.
Logical bugs, broken assumptions, and missing error handling slip through not
because the reviewer is careless but because they genuinely can't tell correct
from broken.

Ripple already solves routing — it gets the right eyes on the right files.
AI Review solves the other half: it tells those reviewers what to actually
look for.

## Architecture Decision

AI Review is a feature of Ripple, not a separate action. Users opt in via
`.ripple.yml`. The only addition to `action.yml` is a single `ai-api-key`
input (secrets can't live in yaml files committed to the repo).

This means:
- One action to install, one config file to edit
- When Ripple's owner routing is also enabled, ai-review automatically
  reviews only the impacted files Ripple already identified — no extra
  coordination needed
- When owner routing is disabled (no `owners:` block), ai-review reviews
  all changed files

## LLM-Agnostic Design

All major providers support the OpenAI chat completions format:
- OpenAI (gpt-4o, etc.)
- Anthropic (via compatibility endpoint)
- Azure OpenAI
- Ollama / vLLM / LM Studio (self-hosted)
- AWS Bedrock (via proxy)
- Google Vertex (via proxy)

The action calls `POST ${api-url}/v1/chat/completions` with no provider SDK.
Orgs with private codebases point `api-url` at their internal model endpoint.

## Configuration

### `.ripple.yml` — opt-in block

```yaml
# Enable only ai-review (routing disabled — reviews all changed files)
ai-review:
  enabled: true
  api-url: https://api.openai.com
  model: gpt-4o

# Enable both routing + ai-review (ai-review scoped to impacted files)
owners:
  "src/auth/**": ["@alice"]
  "src/payments/**": ["@bob"]

ai-review:
  enabled: true
  api-url: https://api.openai.com
  model: gpt-4o
  focus: logical-errors,error-handling          # default
  skip-patterns: "**/*.lock,**/generated/**"    # optional
  skip-label: skip-ai-review                    # optional
  min-file-diff-lines: 1                        # optional
  min-pr-diff-lines: 1                          # optional
  max-file-tokens: 32000                        # optional
  timeout-seconds: 30                           # optional
  allow-private-networks: false                 # set true for Ollama LAN
  post-as-comment: true                         # false = stdout only
```

### `action.yml` — one new input

```yaml
ai-api-key:
  description: 'API key for the LLM endpoint. Masked in all logs.'
  required: false
  default: ''
```

Usage in workflow:
```yaml
- uses: vivek5071/ripple@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    ai-api-key: ${{ secrets.AI_API_KEY }}   # only needed if ai-review enabled
```

## Architecture

### New files

```
src/
  ai-review.ts           # core: per-file LLM calls, ReviewBatch, parse findings
  ai-review-formatter.ts # Finding[] → markdown with <!-- ai-review-report v1 -->
  file-splitter.ts       # split diff by file, apply skip/min-lines filters
  secret-sanitizer.ts    # trufflehog-based regex redaction before sending to LLM
```

### Changed files

```
src/types.ts    # add: AiReviewConfig, Finding, ReviewBatch, ReviewOptions
src/index.ts    # after Ripple routing: if ai-review.enabled, run ai-review
action.yml      # add ai-api-key input
ripple.schema.json  # add ai-review block to schema
```

### Flow

```
PR opened/synchronized
  │
  ▼
[index.ts] — existing Ripple routing runs (Track A + B, owner resolution, comment)
  │
  ├─ read .ripple.yml → ai-review block present and enabled?
  │     NO → exit (existing behavior unchanged)
  │     YES ↓
  │
  ▼
[file-splitter.ts]
  ├─ if owners block exists: use Ripple's already-computed impacted file list
  ├─ else: use all PR changed files
  ├─ filter skip-patterns
  ├─ filter min-file-diff-lines
  └─ filter min-pr-diff-lines (PR-level early exit)
  │
  ▼
[post status comment: "AI Review: reviewing N files..."]
  │
  ▼
[ai-review.ts]  ReviewBatch { maxConcurrent: 5, failurePolicy: 'skip', retryLimit: 2 }
  ├─ sanitize diff  (secret-sanitizer.ts)
  ├─ build system prompt  (FOCUS_MAP interpolation)
  ├─ POST /v1/chat/completions  (JSON schema response_format)
  ├─ parse Finding[]  (regex fallback → raw prose fallback)
  └─ aggregate Finding[][] → Finding[]
  │
  ▼
[ai-review-formatter.ts]
  └─ format Finding[] → markdown body
  └─ footer: "Last evaluated: {sha} · {N reviewed} · {M skipped}"
  │
  ▼
[src/comment.ts:upsertComment(…, label='ai-review')]
  └─ replaces status comment with final findings
```

### System Prompt

```
You are a senior engineer reviewing a pull request diff.
Identify only concrete, actionable issues. Do not praise. Do not summarize.
Focus: {focus areas from FOCUS_MAP}

For each issue respond with JSON matching the FindingSchema.
If no issues found, return an empty findings array.
```

### Comment Format

```markdown
## AI Review

> Model: gpt-4o · 3 issues found · 2 files skipped

### ⚠ Logical error — `src/orders.ts:87`
`totalPrice` is computed before applying discount, so discounted orders
overcharge by the discount amount.
**Impact:** Revenue calculation wrong for all discounted orders.
**Fix:** Apply discount multiplier before summing line items.

### ⚠ Missing error handling — `src/auth.ts:34`
...

---
> Advisory · Last evaluated: a3f9c12 · 4 files reviewed · 2 files skipped
```

## Out of Scope (v1)

- Gate mode (block merge on critical findings) — deferred to v1.1
- `budget-usd` hard cap — deferred to v1.1
- Cost estimate in PR comment footer — deferred to v1.1
- Review memory across PRs — future
- Inline suggestions via GitHub suggestion blocks — future

---

## GSTACK REVIEW REPORT

<!-- /autoplan restore point: /home/pc/.gstack/projects/fresh/main-autoplan-restore-20260523-203436.md -->

### Pipeline: Phase 1 (CEO) → Phase 3 (Eng) → Phase 3.5 (DX) | Phase 2 skipped (no UI scope)
### Voices: Claude subagent (Codex unavailable — [single-model])

---

## Phase 1 — CEO Review

### CEO DUAL VOICES — CONSENSUS TABLE [subagent-only]

```
  Dimension                             Subagent  Codex   Consensus
  ─────────────────────────────────────  ────────  ──────  ──────────
  1. Premises valid?                     DISAGREE  N/A     FLAGGED (Bedrock/Vertex claim false)
  2. Right problem to solve?             PARTIAL   N/A     PARTIAL (reframe to "first real reviewer")
  3. Scope calibration correct?          DISAGREE  N/A     FLAGGED (per-file, skip mechanism, sanitization)
  4. Alternatives sufficiently explored? NO        N/A     GAP (no competitor analysis)
  5. Competitive/market risks covered?   NO        N/A     GAP (Copilot, CodeRabbit unnamed)
  6. Six-month trajectory sound?         CONCERN   N/A     TASTE (inline suggestions timing)
```

### 0A — Premise Challenge

**Premise 1: "OpenAI-compatible API covers all major providers"**
Status: **WRONG** — AWS Bedrock and Google Vertex do not expose OpenAI-compatible endpoints natively. Both require a proxy (LiteLLM, Portkey, etc.). The plan lists them as supported providers, which will produce silent 404s for enterprise users pointing `api-url` directly at Bedrock.
Fix: Remove from supported list OR add "via proxy" qualifier and provide a one-command proxy config snippet.

**Premise 2: "Advisory by default is the right ship posture"**
Status: **VALID** — correct ship posture for trust-building. However, the strategic framing is underselling. The real value is "the only reviewer that will read the diff" in solo/vibe-coded repos — not a supplement to human reviewers.

**Premise 3: "Separate action is the right architecture"**
Status: **VALID** — separation of concerns is correct. Ripple routes; ai-review analyzes.

**Premise 4: "Whole-diff review is the v1 default"**
Status: **QUESTIONABLE** — per-file review produces better signal (focused context), lower cost per call, and easier chunking. The subagent argues per-file should be the default, not a v2 feature.

### 0B — Existing Code Leverage

- `src/comment.ts` (Ripple): upsert comment pattern already implemented. `review-comment.ts` should import and extend it, not duplicate it. DRY gap.
- Octokit diff fetch: already built in Ripple's `src/index.ts`. The new action can use identical pattern.
- `src/branch-check.ts` and token handling: same patterns, same `@actions/core` / `@actions/github` setup.

### 0C — Dream State Mapping

```
CURRENT STATE              THIS PLAN                   12-MONTH IDEAL
──────────────────         ─────────────────────       ─────────────────────
Vibe-coded repos get       AI posts advisory comment   AI is required reviewer
rubber-stamped PRs.        with concrete issues on     on every PR. Gate mode
No one reads the diff.     every PR. Human reviewer    blocks merges on critical
Bugs ship.                 can act on findings.        issues. Inline fix
                                                       suggestions click-to-apply.
```

### 0C-bis — Implementation Alternatives

```
APPROACH A: Whole-diff, advisory (current plan)
  Summary: Fetch full diff, send to LLM, post markdown comment.
  Effort:  S (human: ~1 day / CC: ~2 hours)
  Risk:    Low
  Pros:    Simple. Fast to ship. Works on any size repo.
  Cons:    Worse LLM signal on large PRs. Higher cost. Defers per-file.
  Reuses:  comment.ts upsert pattern, Octokit diff fetch

APPROACH B: Per-file review, advisory (revised default)
  Summary: Split diff by file. One LLM call per changed file. Aggregate findings.
  Effort:  S-M (human: ~1.5 days / CC: ~3 hours)
  Risk:    Low-Medium
  Pros:    Better LLM signal (focused context). Lower cost per file.
           Parallelizable. Natural chunking boundary.
  Cons:    More API calls. Requires aggregation logic.
  Reuses:  Same patterns + diff-chunker becomes file-splitter

APPROACH C: Ripple-aware per-file review
  Summary: When Ripple runs first, ai-review only reviews Ripple-flagged files.
  Effort:  M (human: ~2 days / CC: ~3 hours)
  Risk:    Medium (requires Ripple to run first)
  Pros:    Most focused review. Lowest cost. Highest signal-to-noise.
  Cons:    Couples to Ripple. Requires coordination between two actions.
  Reuses:  Ripple's impacted-files output
```

AUTO-DECIDED: Approach B (per-file review as default, whole-diff as option). Per P1+P5: better signal, lower cost, no harder to implement.

### 0D — SELECTIVE EXPANSION — Scope Candidates

| # | Proposal | Effort | Decision | Principle |
|---|----------|--------|----------|-----------|
| 1 | `skip-patterns` input (skip lock files, generated files) | S | **ACCEPTED** | P2 — in blast radius, <1d CC |
| 2 | `min-diff-lines` to skip trivial PRs | S | **ACCEPTED** | P2 — in blast radius, <1d CC |
| 3 | `skip-label` input (`skip-ai-review` label on PR) | S | **ACCEPTED** | P2 — prevents workflow noise |
| 4 | Commit SHA footer on comment | S | **ACCEPTED** | P5 — explicit, prevents trust erosion |
| 5 | Token estimate log before each API call | S | **ACCEPTED** | P5 — prevents invoice surprise |
| 6 | Pre-send diff sanitization (strip secret patterns) | S-M | **ACCEPTED** | P1 — security gap, must fix |
| 7 | Inline suggestions (GitHub suggestion blocks) | L | DEFERRED to TODOS.md | P3 — real value but significant complexity |
| 8 | `gate` mode (block merge on critical issues) | M | DEFERRED to TODOS.md | P6 — ship advisory first, gate is v1.1 |
| 9 | Ripple-aware mode (review only Ripple-flagged files) | M | TASTE DECISION | requires both actions, coupling trade-off |

### 0E — Temporal Interrogation

```
HOUR 1 (setup):       api-url format validation? Does it need /v1 suffix or not?
                      What node version? (action.yml needs to specify)
HOUR 2-3 (core):      What does the response parser do when LLM returns prose not JSON?
                      How do you know when a file should be skipped vs reviewed?
HOUR 4-5 (integration): How does the comment know which commit it reviewed?
                      What happens when GitHub rate-limits the comment POST?
HOUR 6+ (polish):     Skip-label requires reading PR labels — additional API call.
                      Secret sanitization regex — how broad? False positives?
```

### Error & Rescue Map — CEO Identified Gaps

```
METHOD/CODEPATH              | WHAT CAN GO WRONG              | EXCEPTION
─────────────────────────────|────────────────────────────────|──────────────────
fetch() to api-url           | Wrong URL (404/connection error)| FetchError
                             | Rate limited (429)              | RateLimitError
                             | API key invalid (401)           | AuthError
                             | Timeout                         | TimeoutError
─────────────────────────────|────────────────────────────────|──────────────────
LLM response parsing         | Response is prose not JSON      | ParseError ← GAP
                             | Missing fields (no line number) | ValidationError ← GAP
                             | Hallucinated file path          | ValidationError ← GAP
                             | Empty response                  | EmptyResponseError ← GAP
─────────────────────────────|────────────────────────────────|──────────────────
GitHub comment POST          | Rate limited                    | RateLimitError ← GAP
                             | PR closed during analysis       | NotFoundError ← GAP
```

### Failure Modes Registry

| Mode | Scenario | Severity | Mitigated? |
|------|----------|----------|------------|
| Bedrock/Vertex direct URL | Silent 404, action passes | Critical | NO — fix in plan |
| LLM malformed response | Comment posts garbage | Critical | NO — add parser |
| No diff sanitization | Secrets sent to external LLM | High | NO — add sanitizer |
| No skip mechanism | Lock file PRs spam comments | High | NO — add skip-label |
| Token cost surprise | Org disables after first invoice | High | NO — add estimate log |
| Competitor parity gap | CodeRabbit used instead | Medium | Not addressed in plan |

### CEO Completion Summary

Plan is strategically sound. Two critical technical gaps (Bedrock false claim, malformed response parsing) and one critical security gap (diff sanitization) must be fixed before v1. Scope additions #1-6 are small and accepted. Inline suggestions and gate mode correctly deferred.

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 1 | CEO | Mode: SELECTIVE EXPANSION | Mechanical | P6 | autoplan override | — |
| 2 | CEO | Approach B (per-file default) | Mechanical | P1+P5 | better signal, no harder to build | Approaches A, C |
| 3 | CEO | Accept skip-patterns input | Mechanical | P2 | in blast radius, trivial to add | — |
| 4 | CEO | Accept min-diff-lines | Mechanical | P2 | open question resolved | — |
| 5 | CEO | Accept skip-label | Mechanical | P2 | prevents workflow noise | — |
| 6 | CEO | Accept commit SHA footer | Mechanical | P5 | explicit, small | — |
| 7 | CEO | Accept token estimate log | Mechanical | P5 | prevents invoice surprise | — |
| 8 | CEO | Accept pre-send sanitization | Mechanical | P1 | security gap | — |
| 9 | CEO | Defer inline suggestions | Mechanical | P3 | L effort, v1.1 | — |
| 10 | CEO | Defer gate mode | Mechanical | P6 | advisory-first validated by Ripple | — |
| 11 | CEO | Ripple-aware mode | TASTE | — | coupling trade-off, surfaced at gate | — |

---

## Phase 3 — Eng Review [subagent-only]

### ENG DUAL VOICES — CONSENSUS TABLE [subagent-only]

```
  Dimension                             Subagent  Codex   Consensus
  ─────────────────────────────────────  ────────  ──────  ──────────
  1. Architecture sound?                 DISAGREE  N/A     FLAGGED (per-file concurrency undefined)
  2. Test coverage sufficient?           NO        N/A     GAP (no test plan in plan)
  3. Performance risks addressed?        NO        N/A     GAP (80-file PR = 80 sequential calls)
  4. Security threats covered?           NO        N/A     GAP (SSRF, no URL validation)
  5. Error paths handled?                NO        N/A     GAP (LLM parser, rate limits, partial failure)
  6. Deployment risk manageable?         MEDIUM    N/A     Node version unpinned
```

### Architecture ASCII Diagram

```
PR event (opened/synchronize)
  │
  ▼
[index.ts]
  ├─ validate inputs (api-url scheme, reject private IPs)
  ├─ fetch PR diff via Octokit  ──→  [changed files list]
  │
  ▼
[file-splitter.ts]  (renamed from diff-chunker.ts)
  ├─ filter skip-patterns
  ├─ filter min-file-diff-lines
  └─ returns: FileReview[] { path, diff, lineOffset }
  │
  ▼
[post status comment: "Reviewing N files..."]  ← upsertComment('ai-review')
  │
  ▼
[ai-review.ts]  ReviewBatch { maxConcurrent: 5, failurePolicy: 'skip', retryLimit: 2 }
  ├─ sanitize diff (strip secret patterns → [REDACTED])
  ├─ build system prompt (focus map → prompt string)
  ├─ POST /v1/chat/completions with JSON schema response_format
  ├─ parse Finding[] (fallback: raw prose with unstructured header)
  └─ aggregate: Finding[][] → Finding[]
  │
  ▼
[ai-review-formatter.ts]  (new, NOT review-comment.ts)
  └─ format Finding[] → markdown comment body with <!-- ai-review-report --> marker
  └─ footer: "Last evaluated: {commitSHA} · {N files reviewed} · {M files skipped}"
  │
  ▼
[src/comment.ts upsertComment(octokit, owner, repo, pullNumber, body, label='ai-review')]
  └─ paginated comment search (not just first 100)
```

### Section 1 — Architecture: All 14 findings addressed

**Finding 1 (CRITICAL) → AUTO-DECIDED:** Define `ReviewBatch` concurrency model: `maxConcurrent: 5, failurePolicy: 'skip', retryLimit: 2`. On partial failure, aggregate what succeeded and note failed files in comment footer.

**Finding 2 (HIGH) → AUTO-DECIDED:** No `review-comment.ts`. Add `ai-review-formatter.ts` (formats markdown). Reuse `src/comment.ts:upsertComment` with `label` param.

**Finding 3 (HIGH) → AUTO-DECIDED:** Paginate `listComments` — paginate from most-recent first to find bot comment fast on large PRs.

**Finding 4 (HIGH) → AUTO-DECIDED:** Marker: `<!-- ai-review-report -->`. Injected by `ai-review-formatter.ts`. Will never collide with `<!-- ripple-report -->`.

**Finding 5 (HIGH) → AUTO-DECIDED:** Sanitization uses trufflehog's core regex set. Redaction sentinel: `[REDACTED]`. False positive policy: log redacted line count, never abort.

**Finding 6 (HIGH) → AUTO-DECIDED:** JSON schema mode: `response_format: { type: "json_schema", json_schema: { schema: FindingSchema } }`. Fallback: if provider doesn't support JSON schema, use sentinel-delimited markdown and regex extractor. If parsing fails entirely: post raw LLM output under `⚠ Unstructured review` header.

**Finding 7 (HIGH) → AUTO-DECIDED:** Normalize `api-url`: strip trailing slashes, detect if `/v1` already present, reject accordingly. Clear error: "api-url should be the base URL without /v1 (e.g. https://api.openai.com)".

**Finding 8 (MEDIUM) → AUTO-DECIDED:** `skip-patterns` filter runs after file-split, before any LLM call. Log: "Skipped N files matching skip-patterns."

**Finding 9 (MEDIUM) → AUTO-DECIDED:** Rename `min-diff-lines` → `min-file-diff-lines`. Apply per-file. Keep separate `min-pr-diff-lines` as PR-level early exit.

**Finding 10 (MEDIUM) → AUTO-DECIDED:** Add `actions/setup-node@v4` with `node-version: '20'` to composite `action.yml`.

**Finding 11 (MEDIUM) → AUTO-DECIDED:** Post a "Reviewing N files..." status comment first, then replace with final aggregated findings comment when done.

**Finding 12 (MEDIUM) → AUTO-DECIDED:** Define static focus map in `ai-review.ts`:
```ts
const FOCUS_MAP = {
  'logical-errors': 'logical errors and incorrect behavior',
  'security': 'security vulnerabilities, injection risks, and exposed secrets',
  'error-handling': 'missing or inadequate error handling and silent failure paths',
  'broken-assumptions': 'broken assumptions about input shape, API contracts, and state',
  'all': 'all of the above'
}
```

**Finding 13 (MEDIUM) → AUTO-DECIDED:** Validate `api-url`: require `https:`, reject private IP ranges (`10.*`, `172.16.*`, `192.168.*`, `169.254.*`). Exception: allow `http://localhost` for dev/test.

**Finding 14 (LOW) → AUTO-DECIDED:** `upsertComment` gains `label = 'ripple'` default param. AI Review passes `'ai-review'`.

### Section 2 — Error & Rescue Map (complete)

```
METHOD                     | FAILS WITH              | RESCUE ACTION               | USER SEES
────────────────────────── | ──────────────────────  | ────────────────────────── | ──────────────
fetch() → api-url          | 429 rate limit          | Exponential backoff 3x     | Nothing (transparent)
                           | 401 auth error          | Abort, core.setFailed      | "API key invalid"
                           | Connection error / 404  | Abort, core.setFailed      | "Endpoint unreachable: {url}"
                           | Timeout (30s)           | Skip file, log warning     | Footer: "N files timed out"
────────────────────────── | ──────────────────────  | ────────────────────────── | ──────────────
JSON schema parse          | Prose response          | Regex fallback extractor   | Unstructured header
                           | Empty response          | Skip file, log             | Footer: "N files returned empty"
                           | Hallucinated path       | Drop finding (path not in diff) | Not surfaced
────────────────────────── | ──────────────────────  | ────────────────────────── | ──────────────
GitHub comment POST        | 403/rate limit          | Retry 2x with backoff      | Comment appears eventually
                           | PR closed               | core.warning, exit 0       | Nothing (graceful)
```

### Section 3 — Security

| Threat | Likelihood | Impact | Mitigated? |
|--------|-----------|--------|------------|
| SSRF via private `api-url` | Medium | High | YES — URL validation added |
| API key in action logs | Low | High | YES — use `core.setSecret()` on api-key |
| Secret in diff sent to external LLM | High | High | YES — sanitization pass |
| Prompt injection via diff content | Medium | Medium | PARTIAL — JSON schema mode limits blast radius |
| Malicious PR modifying workflow | Low | High | Note: `api-url` + `api-key` must be in secrets, not env |

### Section 4 — Data Flow Edge Cases

```
INPUT ──▶ VALIDATE ──▶ SPLIT BY FILE ──▶ FILTER ──▶ SANITIZE ──▶ LLM ──▶ PARSE ──▶ POST
  │           │              │               │            │          │         │         │
  ▼           ▼              ▼               ▼            ▼          ▼         ▼         ▼
[0 files]  [bad url]  [1 huge file]   [all skipped]  [all       [empty]  [malformed]  [PR closed]
           [401]      [>32k chars    → log + skip     redacted]  → skip   → fallback  → graceful
                       → per-chunk]                             → log     → raw prose   exit
```

### Section 5 — Code Quality: DRY Map

| Sub-problem | Existing code to reuse |
|-------------|----------------------|
| Fetch PR diff | `src/index.ts` Octokit getFiles pattern |
| Post/upsert comment | `src/comment.ts:upsertComment` (extend with label param) |
| Get changed files | `src/index.ts:getChangedFiles` — import directly |
| Action inputs | `@actions/core.getInput` — same pattern as Ripple |
| PR metadata | `@actions/github.context` — identical |

### Section 6 — Test Plan

**New flows to test:**

| Flow | Test type | Gap? |
|------|-----------|------|
| `api-url` normalization (trailing slash, /v1 present) | Unit | NOT IN PLAN |
| `api-url` SSRF rejection (private IPs, http://) | Unit | NOT IN PLAN |
| skip-patterns filter — lock file excluded | Unit | NOT IN PLAN |
| min-file-diff-lines — 1-line file excluded | Unit | NOT IN PLAN |
| LLM prose response → fallback parser | Unit | NOT IN PLAN |
| LLM empty response → skip + footer | Unit | NOT IN PLAN |
| Secret sanitization — `AKIA`-prefixed line redacted | Unit | NOT IN PLAN |
| Partial failure (1/5 concurrent fails) → findings posted | Integration | NOT IN PLAN |
| >100 PR comments → marker found via pagination | Integration | NOT IN PLAN |
| PR closed during review → graceful exit | Integration | NOT IN PLAN |
| skip-label on PR → action no-ops | Integration | NOT IN PLAN |

### Updated File List (Phase 3 resolved)

```
src/
  ai-review.ts          # core: split by file, sanitize, call LLM, parse findings
  ai-review-formatter.ts # format Finding[] → markdown with <!-- ai-review-report -->
  file-splitter.ts      # renamed diff-chunker: split by file, apply filters
  secret-sanitizer.ts   # trufflehog-based regex redaction
  types.ts              # add Finding, ReviewBatch, ReviewOptions types
index.ts                # wire up inputs → validate → ai-review → formatter → upsertComment
action.yml              # composite: setup-node@v4, run node dist/index.js
```
`review-comment.ts` — REMOVED. Reuses `src/comment.ts`.

### Phase 3 Decision Audit Additions

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 12 | Eng | ReviewBatch: maxConcurrent=5, skip on fail, retry=2 | Mechanical | P1+P5 | explicit model, safe defaults | unbounded parallel |
| 13 | Eng | No review-comment.ts; use ai-review-formatter.ts + parameterized upsertComment | Mechanical | P4 | DRY, existing pattern works | duplicate |
| 14 | Eng | Paginate comment search | Mechanical | P1 | correctness on large PRs | 100-limit only |
| 15 | Eng | JSON schema response_format + regex fallback | Mechanical | P1+P5 | structured output, graceful fallback | no parser |
| 16 | Eng | api-url normalization + SSRF validation | Mechanical | P1 | security, UX | none |
| 17 | Eng | skip-patterns filter before LLM calls | Mechanical | P5 | obvious placement | post-LLM |
| 18 | Eng | Rename min-diff-lines → min-file-diff-lines | Mechanical | P5 | per-file default | PR-level only |
| 19 | Eng | Pin Node 20 in action.yml | Mechanical | P5 | explicit over implicit | runner default |
| 20 | Eng | Status comment first, final comment replaces it | Mechanical | P5 | streaming feel, no spam | all-at-once silent |
| 21 | Eng | Static FOCUS_MAP for prompt interpolation | Mechanical | P5 | explicit, no interpolation gap | string passthrough |
| 22 | Eng | core.setSecret(apiKey) | Mechanical | P1 | security, standard pattern | log exposure |
| 23 | Eng | upsertComment label param, default='ripple' | Mechanical | P5 | DRY + log clarity | hardcoded string |

---

## Phase 3.5 — DX Review [subagent-only]

### DX DUAL VOICES — CONSENSUS TABLE [subagent-only]

```
  Dimension                             Subagent  Codex   Consensus
  ─────────────────────────────────────  ────────  ──────  ──────────
  1. Getting started < 5 min?            NO        N/A     FAIL (12-18 min actual TTHW)
  2. API/CLI naming guessable?           PARTIAL   N/A     min-file-diff-lines confusing; rest OK
  3. Error messages actionable?          NO        N/A     GAP (403, timeout, private-IP rejection)
  4. Docs findable & complete?           NO        N/A     CRITICAL GAP (no README, no provider table)
  5. Upgrade path safe?                  PARTIAL   N/A     Comment marker needs version stamp
  6. Dev environment friction-free?      PARTIAL   N/A     allow-private-networks blocks Ollama LAN
```

### Developer Journey Map

```
Stage 1: Discovery       — "Is this the right tool?" → Repo README missing; judgment deferred
Stage 2: Installation    — "How do I install it?" → 12-18 min; no starter workflow; provider URL unclear
Stage 3: Configuration   — "What do I configure?" → 3 required secrets; api-url format ambiguous
Stage 4: First run       — "Did it work?" → PR comment appears; review is noisy if focus=all
Stage 5: Iteration       — "How do I tune it?" → skip-patterns, focus, min-file-diff-lines; syntax not documented
Stage 6: First error     — "What broke?" → Ollama LAN blocked; 403 unhelpful; timeout no hint
Stage 7: Production use  — "Is this running right?" → token cost surprise; no budget cap; no summary
Stage 8: Upgrade         — "What changes?" → comment marker versioned; CHANGELOG needed
Stage 9: Power use       — "Advanced config?" → Ripple composition; allow-private-networks; output-format
```

### DX Scorecard — All 8 Dimensions

| Dimension | Score (pre-fix) | Score (post-fix) | Key gap |
|-----------|----------------|-----------------|---------|
| Getting started / TTHW | 3/10 | 8/10 | No starter workflow, no README |
| Installation friction | 5/10 | 9/10 | required: true on defaulted inputs |
| Error message quality | 4/10 | 8/10 | 403, timeout, private-IP messages |
| API/CLI naming | 6/10 | 8/10 | min-file-diff-lines naming, skip-patterns syntax |
| Documentation | 2/10 | 8/10 | No README at all |
| Provider compatibility | 5/10 | 9/10 | Ollama LAN blocked, no provider table |
| Upgrade safety | 6/10 | 9/10 | Versionless marker, no CHANGELOG |
| Dev environment setup | 8/10 | 9/10 | Node version now pinned |

**TTHW: 12-18 min → Target: 5 min (achievable with Quick Start + auto-strip /v1 + defaults)**

### DX Phase 3.5 — All Findings Auto-Decided

| Finding | Decision | Principle |
|---------|----------|-----------|
| No starter workflow | ACCEPTED — add `## Quick Start` with copy-paste `.github/workflows/ai-review.yml` | P2 |
| No README | ACCEPTED — add README outline to plan: Quick Start, inputs, provider table, troubleshooting | P2 |
| `required:true` on defaulted inputs | ACCEPTED — set `required: false` on all inputs with defaults | P5 |
| /v1 suffix reject → auto-strip | ACCEPTED — strip silently, log warning | P3 |
| Private IP rejection breaks Ollama LAN | ACCEPTED — add `allow-private-networks: false` input | P1 |
| Inputs block stale (doesn't reflect eng decisions) | ACCEPTED — update `inputs:` as canonical spec before impl | P5 |
| No provider URL examples | ACCEPTED — add provider table (OpenAI, Azure, Ollama, Anthropic compat) | P1 |
| 403 not in error map | ACCEPTED — add to error map with Azure RBAC message | P1 |
| No `timeout-seconds` input | ACCEPTED — add configurable input, default 30s | P2 |
| `focus: all` default too noisy | **TASTE DECISION** — surfaced at final gate | — |
| `skip-patterns` syntax not documented | ACCEPTED — document in input description | P5 |
| `@main` in examples | ACCEPTED — use `@v1`, document release tagging | P5 |
| `post-as-comment:false` stdout format | ACCEPTED — document same markdown to stdout | P5 |
| Comment marker no version stamp | ACCEPTED — use `<!-- ai-review-report v1 -->` | P5 |
| `Finding` schema stability unguaranteed | ACCEPTED — add stability guarantee to docs | P1 |

### NOT in scope (DX-deferred to TODOS.md)
- `budget-usd` hard cap input — M effort, v1.1
- Cost estimate in PR comment footer (not just action log) — M effort, v1.1

### DX Phase Audit Trail Additions

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|---------|
| 24 | DX | Add Quick Start workflow to README | Mechanical | P2 | critical TTHW fix | — |
| 25 | DX | README outline: Quick Start + inputs + providers + troubleshooting | Mechanical | P2 | docs = product | — |
| 26 | DX | required:false on inputs with defaults | Mechanical | P5 | contradictory API | — |
| 27 | DX | Auto-strip /v1 from api-url, log warning | Mechanical | P3 | pragmatic, Ollama-friendly | reject with error |
| 28 | DX | allow-private-networks input (default false) | Mechanical | P1 | Ollama/vLLM LAN support | reject private IPs only |
| 29 | DX | Update inputs block to reflect all review decisions | Mechanical | P5 | spec = code | — |
| 30 | DX | Provider URL table in README | Mechanical | P1 | completeness | — |
| 31 | DX | 403 to error map with Azure RBAC message | Mechanical | P1 | gap in error coverage | — |
| 32 | DX | timeout-seconds input, default 30 | Mechanical | P2 | configurable, in blast radius | — |
| 33 | DX | focus default: TASTE (surfaced at gate) | Taste | — | product call | — |
| 34 | DX | skip-patterns glob syntax in input description | Mechanical | P5 | explicit API surface | — |
| 35 | DX | Use @v1 not @main in examples | Mechanical | P5 | stability | — |
| 36 | DX | post-as-comment:false → same markdown to stdout | Mechanical | P5 | explicit | — |
| 37 | DX | Comment marker: ai-review-report v1 | Mechanical | P5 | version-stamped | — |
| 38 | DX | Finding schema stability guarantee in docs | Mechanical | P1 | trust in API contract | — |
| 39 | Gate | Ripple-aware mode: resolved by architecture | Taste → Resolved | P6 | integrated approach: when owners: configured, impacted file list reused automatically | separate action |
| 40 | Gate | focus default: logical-errors,error-handling | Taste → Locked | P5 | high-signal default; avoids noisy first impression | all |

---

## Cross-Phase Themes

**Theme 1: Missing response parser** — flagged independently in CEO (Error Map gap), Eng (Finding 6 CRITICAL), and DX (error messages). High-confidence signal: LLM response parsing is the most likely 2am failure.

**Theme 2: Documentation deficit** — CEO flagged no competitor analysis, Eng flagged no test plan, DX flagged no README and no starter workflow. The action risks being functionally correct but undiscoverable.

**Theme 3: Security surface underspecified** — CEO flagged diff sanitization, Eng flagged SSRF, DX flagged Ollama LAN. All three independently caught that the security model is partially designed.
