import type { Finding } from './types'

export const AI_REVIEW_MARKER = '<!-- ai-review-report v1 -->'

const CATEGORY_LABEL: Record<string, string> = {
  'logical-error': 'Logical error',
  'error-handling': 'Missing error handling',
  'security': 'Security issue',
  'broken-assumption': 'Broken assumption',
}

export function formatAiReview(
  findings: Finding[],
  model: string,
  commitSha: string,
  filesReviewed: number,
  skippedFiles: string[],
  timedOutFiles: string[],
  budgetExceededFiles: string[],
  totalCostUsd: number,
  inlinedCount = 0
): string {
  const lines: string[] = [AI_REVIEW_MARKER, '## AI Review', '']

  const realFindings = findings.filter(f => !f.raw)
  const totalSkipped = skippedFiles.length + timedOutFiles.length

  lines.push(`> Model: ${model} · ${realFindings.length} issue${realFindings.length === 1 ? '' : 's'} found`)
  lines.push('')

  if (findings.length === 0) {
    lines.push('No issues found.')
    lines.push('')
  } else {
    for (const finding of findings) {
      if (finding.raw) {
        lines.push(`### ⚠ Unstructured review — \`${finding.file}\``)
        lines.push(finding.raw)
      } else {
        const label = CATEGORY_LABEL[finding.category] ?? finding.category
        const loc = finding.line ? `${finding.file}:${finding.line}` : finding.file
        lines.push(`### ⚠ ${label} — \`${loc}\``)
        lines.push(finding.description)
        if (finding.impact) lines.push(`**Impact:** ${finding.impact}`)
        if (finding.fix) lines.push(`**Fix:** ${finding.fix}`)
      }
      lines.push('')
    }
  }

  lines.push('---')
  const footerParts = [
    'Advisory',
    `Last evaluated: ${commitSha.slice(0, 7)}`,
    `${filesReviewed} file${filesReviewed === 1 ? '' : 's'} reviewed`,
  ]
  if (inlinedCount > 0) footerParts.push(`${inlinedCount} inline`)
  if (totalSkipped > 0) footerParts.push(`${totalSkipped} skipped`)
  if (budgetExceededFiles.length > 0) footerParts.push(`${budgetExceededFiles.length} over budget`)
  if (totalCostUsd > 0) footerParts.push(`~$${totalCostUsd.toFixed(4)}`)
  lines.push(`> ${footerParts.join(' · ')}`)

  return lines.join('\n')
}
