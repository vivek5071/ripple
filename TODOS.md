# TODOS — Ripple

> **NOTE (2026-05-22):** Product pivoted from verdict model to owner-routing model.
> Items marked ~~superseded~~ are no longer applicable. See design doc for current spec.

## P1 — Must resolve before first EM install

### ~~Risk rubric: critical module detection~~ ~~SUPERSEDED (2026-05-22)~~
~~Verdict model removed. No High/Medium/Low score. Owners make the safety call.~~

---

### ~~Post-LLM validation for prompt injection~~ ~~SUPERSEDED (2026-05-22)~~
~~LLM removed from core product. No LLM output to validate.~~

---

### ~~.ripple.yml JSON Schema~~ ~~DONE (2026-05-22)~~
~~`ripple.schema.json` shipped alongside the Action. Covers `paths` map, single/array owner values, micromatch glob keys.~~

---

### ~~Branch protection detection + first-run banner~~ ~~DONE (2026-05-22)~~
~~`src/branch-check.ts` calls `repos.getBranchProtection`. Returns false on 404/403; shows setup banner in PR comment via `comment-formatter.ts`.~~

---

### ~~Symbol flood protection~~ ~~DONE (2026-05-22)~~
~~`min-symbol-length` (default 5) filters Track B symbols. `max-owners-per-pr` (default 10) triggers advisory fallback in `owner-safety.ts` when cap hit.~~

---

## P2 — Ship in V1.1 (after first paying customer)

### Fork PR support (pull_request_target)
**What:** Support ripple analysis on PRs from forked repositories using `pull_request_target` with proper security scoping (separate trigger workflow from analysis workflow so forked code doesn't run with elevated permissions).

**Why:** V1 targets private repos only. Fork PRs silently fail because GitHub provides read-only tokens with no secret access. OSS repos and enterprise orgs using fork-based development workflows need this. The HN "Show HN" launch will surface fork PR questions.

**Pros:** Unlocks the OSS market segment. Required for public repos on GitHub Marketplace.

**Cons:** `pull_request_target` has documented security risks (contributor code can run with base branch permissions). Requires careful architecture: trigger on fork PR → dispatch separate workflow with secrets in base branch context.

**Context:** Decided during /plan-ceo-review (2026-05-22). Deferred to V2 (private repos only for V1). Implement after hitting 3-team validation milestone.

**Effort:** M (human: ~2 days / CC: ~2 hours — two-workflow architecture, security review)
**Priority:** P2 (V2)

---

### Reviewer suggestion edge case hardening
**What:** The V1 reviewer suggestion (git blame top committer) needs hardening for: (1) squash merge codebases where one person appears on every commit, (2) slow-moving modules with a 90-day window that tags someone who left the team, (3) bot accounts that slip through the default filter patterns.

**Why:** The outside voice flagged this as potentially noisy. The V1 implementation will have some false positives (tagging wrong people). V1.1 should: expand bot filter patterns, add opt-out config, and validate suggestion accuracy with early users.

**Context:** Decided during /plan-ceo-review (2026-05-22).

**Effort:** S (human: ~2 hours / CC: ~20 min)
**Priority:** P2 (V1.1)

---

### ~~Gate mode (opt-in blocking)~~ ~~DONE (2026-05-22)~~
~~`mode: gate` input implemented. `index.ts` calls `requestReviews` only when not in advisory mode. `owner-safety.ts` forces advisory when cap hit.~~

---

## P3 — Future (evaluate after first 10 paying customers)

### Slack / Teams notification for HIGH risk PRs
**What:** Send a Slack/Teams webhook notification when a PR has many impacted owners. Reaches EMs who don't monitor GitHub PR comments.

**Context:** Deferred from /plan-ceo-review (2026-05-22).

**Effort:** M (human: ~2 days / CC: ~2 hours)

---

### Cross-repo ripple
**What:** Detect when a shared library change in repo A affects services in repos B, C, D. Most impactful for microservices shops.

**Context:** Requires multi-repo read access (additional GitHub permissions). V2+ trajectory.

**Effort:** XL (human: ~4 weeks / CC: ~1 week)

---

### Framework-aware Track A contract detection
**What:** Per-framework route extractors (Express, Flask, Rails, Spring, FastAPI) that detect exactly WHICH route changed, not just that a contract file changed.

**Why:** V1 Track A uses file-pattern heuristics (openapi.yaml, *.proto, *migration*, schema.prisma). Framework-aware parsing is more precise but each framework is a separate implementation.

**Context:** Decided during /plan-eng-review (2026-05-22). Look for existing open-source extractors rather than building from scratch.

**Effort:** L (human: ~2 weeks / CC: ~4 hours per framework, N frameworks)
