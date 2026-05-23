import type { ResolvedOwner } from './types'

export interface SafetyResult {
  owners: ResolvedOwner[]
  capHit: boolean
  authorSkipped: boolean
  teamLeadSubstituted: boolean
}

export function applyOwnerSafetyRules(
  owners: ResolvedOwner[],
  prAuthor: string,
  teamLead: string,
  maxOwnersPerPr: number
): SafetyResult {
  // 1. Dedup: merge files for duplicate handles
  const byHandle = new Map<string, ResolvedOwner>()
  for (const owner of owners) {
    const existing = byHandle.get(owner.handle)
    if (existing) {
      existing.files = [...new Set([...existing.files, ...owner.files])]
    } else {
      byHandle.set(owner.handle, { ...owner, files: [...owner.files] })
    }
  }

  // 2. Remove PR author
  const authorOwner = byHandle.get(prAuthor)
  const authorSkipped = authorOwner != null
  byHandle.delete(prAuthor)

  // 3. Substitute team-lead when author was the sole owner and all owners are gone
  let teamLeadSubstituted = false
  if (byHandle.size === 0 && teamLead && authorOwner && authorOwner.files.length > 0) {
    byHandle.set(teamLead, {
      handle: teamLead,
      files: authorOwner.files,
      resolvedVia: 'yaml',
    })
    teamLeadSubstituted = true
  }

  const allOwners = [...byHandle.values()]
  const capHit = allOwners.length > maxOwnersPerPr

  return { owners: allOwners, capHit, authorSkipped, teamLeadSubstituted }
}
