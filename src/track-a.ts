// T4 — Track A contract detection
// Detects changes to contract files (openapi.yaml, *.proto, *migration*, etc.)
// and finds consumers across the repo via ripgrep.
// Implemented in T4 (Lane A).

import type { ChangedFile, ImpactedFile } from './types'

export async function detectContractImpact(
  changedFiles: ChangedFile[],
  repoRoot: string,
  maxFiles: number
): Promise<ImpactedFile[]> {
  // TODO (T4): file-pattern heuristics + ripgrep consumer search
  void changedFiles; void repoRoot; void maxFiles
  return []
}
