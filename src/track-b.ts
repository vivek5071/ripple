import * as core from '@actions/core'
import { countRepoFiles, filesWithMatches } from './ripgrep'
import type { ChangedSymbol, ImpactedFile } from './types'

export interface TrackBResult {
  impactedFiles: ImpactedFile[]
  filesSearched: number
  capHit: boolean
  runtimeMs: number
}

export async function symbolGrep(
  symbols: ChangedSymbol[],
  repoRoot: string,
  minSymbolLength: number,
  maxFiles: number
): Promise<TrackBResult> {
  const start = Date.now()

  const filesSearched = await countRepoFiles(repoRoot)
  if (filesSearched > maxFiles) {
    core.warning(`Track B: ${filesSearched} files exceeds cap (${maxFiles}) — skipping symbol grep`)
    return { impactedFiles: [], filesSearched, capHit: true, runtimeMs: Date.now() - start }
  }

  const eligible = symbols.filter(s => {
    const term = s.isRename && s.oldName ? s.oldName : s.name
    return term.length >= minSymbolLength
  })

  const seen = new Set<string>()
  const impactedFiles: ImpactedFile[] = []

  for (const sym of eligible) {
    const term = sym.isRename && sym.oldName ? sym.oldName : sym.name
    const matches = await filesWithMatches(term, repoRoot, true)
    for (const absPath of matches) {
      const rel = toRelative(absPath, repoRoot)
      if (!seen.has(rel) && rel !== sym.file) {
        seen.add(rel)
        impactedFiles.push({ path: rel, detectedVia: 'track-b', matchedSymbol: sym.name })
      }
    }
  }

  core.info(`Track B: ${eligible.length} symbols → ${impactedFiles.length} impacted files (${filesSearched} files searched)`)
  return { impactedFiles, filesSearched, capHit: false, runtimeMs: Date.now() - start }
}

function toRelative(absPath: string, repoRoot: string): string {
  return absPath.startsWith(repoRoot + '/')
    ? absPath.slice(repoRoot.length + 1)
    : absPath
}
