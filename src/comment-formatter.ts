import type { BlastRadiusReport } from './types'

const MARKER = '<!-- ripple-report -->'

export function getReportCommentMarker(): string {
  return MARKER
}

export function formatReport(report: BlastRadiusReport): string {
  const lines: string[] = [MARKER, '## Ripple Report', '']

  const modeLabel = report.advisoryMode ? 'advisory mode' : 'gate mode'
  lines.push(`> Scanned **${report.filesSearched.toLocaleString()}** files in ${report.runtimeMs}ms · ${modeLabel}`)
  lines.push('')

  if (report.impactedFiles.length === 0) {
    lines.push('No downstream impact detected.')
    return appendFooter(lines, report)
  }

  // Owner sections
  if (report.owners.length > 0) {
    lines.push(`### Owners to notify (${report.owners.length})`)
    lines.push('')
    for (const owner of report.owners) {
      const count = owner.files.length
      lines.push(`**@${owner.handle}** — ${count} file${count !== 1 ? 's' : ''}`)
      for (const f of owner.files) lines.push(`- \`${f}\``)
      lines.push('')
    }
  }

  // Unresolved files
  if (report.unresolvedFiles.length > 0) {
    lines.push('### Files with no owner')
    lines.push('')
    lines.push('Add these paths to `.ripple.yml` so future PRs are routed automatically:')
    lines.push('')
    lines.push('```yaml')
    lines.push('paths:')
    for (const f of report.unresolvedFiles) lines.push(`  '${f}': your-handle`)
    lines.push('```')
    lines.push('')
  }

  return appendFooter(lines, report)
}

function appendFooter(lines: string[], report: BlastRadiusReport): string {
  const footers: string[] = []

  if (report.ownerCapHit) {
    const prefix = report.botAuthor ? '**Bot PR** — owner cap hit; ' : ''
    footers.push(
      `> ${prefix}Too many unique owners to route reviews automatically. ` +
      'Increase `max-owners-per-pr` or consolidate ownership in `.ripple.yml`.'
    )
  } else if (report.botAuthor && !report.advisoryMode) {
    footers.push(
      `> **Bot PR** — gate mode auto-applied because @${report.prAuthor} is a bot. ` +
      'All impacted file owners must approve before merge.'
    )
  } else if (report.advisoryMode) {
    footers.push(
      '> Running in **advisory mode** — this report is informational only. ' +
      'Set `mode: gate` to require owner approvals before merge.'
    )
  }

  if (!report.branchProtectionConfigured) {
    footers.push(
      '> **Setup required:** Branch protection is not configured on this branch. ' +
      'Without it, gate mode cannot block merges. ' +
      'Go to **Settings → Branches → Branch protection rules** and add a required status check.'
    )
  }

  if (footers.length > 0) {
    lines.push('---')
    lines.push(...footers)
  }

  return lines.join('\n')
}
