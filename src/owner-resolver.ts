// T2 — YAML owner resolver
// Parses .blast-radius.yml with micromatch glob matching.
// Supports single owner (string) or multiple owners (string[]).
// Falls back to git blame when no YAML entry matches.
// Implemented in T2 (Lane B).

import type { ResolvedOwner } from './types'

export async function resolveOwners(
  impactedPaths: string[],
  repoRoot: string
): Promise<ResolvedOwner[]> {
  // TODO (T2): load .blast-radius.yml, micromatch each path, fall back to git blame
  void impactedPaths; void repoRoot
  return []
}
