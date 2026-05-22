// T10 — Rename detection
// When git diff shows a file rename, searches for callers of the OLD symbol
// name. Those callers are genuinely broken — the PR author forgot to update them.
// Implemented in T10 (Lane A).

import type { ChangedFile, ChangedSymbol } from './types'

export function detectRenames(changedFiles: ChangedFile[]): ChangedFile[] {
  return changedFiles.filter(f => f.status === 'renamed' && f.previousPath != null)
}

export async function getRenamedSymbolCallers(
  renamedFiles: ChangedFile[],
  allSymbols: ChangedSymbol[],
  repoRoot: string
): Promise<ChangedSymbol[]> {
  // TODO (T10): for each renamed symbol, set isRename=true and oldName so
  // Track B searches the old name instead of the new one.
  void renamedFiles; void allSymbols; void repoRoot
  return []
}
