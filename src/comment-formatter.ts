// T7 — PR comment formatter
// Produces the grouped Blast Radius Report comment body.
// One section per owner, files listed under each owner.
// Includes YAML nudge for files with unresolved owners.
// Implemented in T7 (Lane C).

import type { BlastRadiusReport } from './types'

const HEADER = '<!-- blast-radius-report -->'

export function formatReport(report: BlastRadiusReport): string {
  // TODO (T7): full grouped formatting
  // Stub returns a minimal placeholder so index.ts compiles and posts something.
  const lines: string[] = [
    HEADER,
    '## Blast Radius Report',
    '',
    `> Scanned ${report.filesSearched.toLocaleString()} files in ${report.runtimeMs}ms`,
    '',
  ]

  if (report.changedSymbols.length === 0) {
    lines.push('No named functions or classes changed in this PR.')
    return lines.join('\n')
  }

  if (report.impactedFiles.length === 0) {
    lines.push('No downstream impact detected.')
    return lines.join('\n')
  }

  lines.push(`**${report.impactedFiles.length} file(s) may be impacted** — owner routing coming in T7.`)
  lines.push('')

  if (!report.branchProtectionConfigured) {
    lines.push('---')
    lines.push('> **Setup required:** Branch protection is not configured. Without it, this report is advisory only and merges are not blocked.')
    lines.push('> Go to Settings → Branches → Branch protection rules and add a required status check.')
  }

  return lines.join('\n')
}

export function getReportCommentMarker(): string {
  return HEADER
}
