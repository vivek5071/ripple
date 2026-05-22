// T6 — Owner safety logic
// 1. Deduplicates owners (one section per handle, all their files grouped).
// 2. Removes PR author from review requests (prevents deadlock).
// 3. Substitutes team-lead when PR author is the sole owner of every impacted file.
// 4. If unique owner count > maxOwnersPerPr, falls back to advisory for this run.
// Implemented in T6 (Lane B).

import type { ResolvedOwner } from './types'

export interface SafetyResult {
  owners: ResolvedOwner[]
  capHit: boolean     // true when owner count exceeded maxOwnersPerPr
  authorSkipped: boolean
  teamLeadSubstituted: boolean
}

export function applyOwnerSafetyRules(
  owners: ResolvedOwner[],
  prAuthor: string,
  teamLead: string,
  maxOwnersPerPr: number
): SafetyResult {
  // TODO (T6): dedup, author exclusion, team-lead substitution, cap check
  void owners; void prAuthor; void teamLead; void maxOwnersPerPr
  return { owners: [], capHit: false, authorSkipped: false, teamLeadSubstituted: false }
}
