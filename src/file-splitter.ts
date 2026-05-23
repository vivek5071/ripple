import micromatch from 'micromatch'
import type { ChangedFile, AiReviewConfig, FileDiff } from './types'

export function splitFiles(
  files: ChangedFile[],
  config: AiReviewConfig,
  impactedPaths: string[] | null
): FileDiff[] {
  let candidates: ChangedFile[]

  if (impactedPaths !== null) {
    const impactedSet = new Set(impactedPaths)
    candidates = files.filter(f => impactedSet.has(f.path))
  } else {
    candidates = files
  }

  candidates = candidates.filter(f => f.status !== 'removed' && f.patch)

  if (config.includePatterns.length > 0) {
    candidates = candidates.filter(f => micromatch.isMatch(f.path, config.includePatterns))
  }

  if (config.skipPatterns.length > 0) {
    candidates = candidates.filter(f => !micromatch.isMatch(f.path, config.skipPatterns))
  }

  const result: FileDiff[] = []
  for (const f of candidates) {
    const diff = f.patch ?? ''
    const lineCount = diff.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length

    if (lineCount < config.minFileDiffLines) continue

    result.push({
      path: f.path,
      diff: diff.slice(0, config.maxFileTokens),
      lineCount,
    })
  }

  return result
}

export function checkPrMinLines(files: ChangedFile[], config: AiReviewConfig): boolean {
  const total = files.reduce((sum, f) => {
    const lines = (f.patch ?? '').split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length
    return sum + lines
  }, 0)
  return total >= config.minPrDiffLines
}
