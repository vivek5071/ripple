import * as core from '@actions/core'
import * as path from 'path'
import { filesWithMatches } from './ripgrep'
import type { ChangedFile, ImpactedFile } from './types'

interface ContractRule {
  regex: RegExp
  label: string
  // Returns the ripgrep search term, or null if consumer search is not feasible
  consumerTerm: (basename: string, stem: string) => string | null
}

const CONTRACT_RULES: ContractRule[] = [
  {
    regex: /openapi\.(yaml|yml|json)$/i,
    label: 'openapi',
    consumerTerm: (basename) => basename,
  },
  {
    regex: /swagger\.(yaml|yml|json)$/i,
    label: 'swagger',
    consumerTerm: (basename) => basename,
  },
  {
    regex: /\.proto$/i,
    label: 'protobuf',
    consumerTerm: (basename) => basename,
  },
  {
    regex: /schema\.prisma$/i,
    label: 'prisma',
    consumerTerm: () => '@prisma/client',
  },
  {
    regex: /routes?\.(ts|tsx|js|jsx|py|rb|go)$/i,
    label: 'routes',
    consumerTerm: (_, stem) => stem,
  },
  {
    // DB migrations — no reliable consumer search; impact is implicit
    regex: /(migration|migrate)/i,
    label: 'migration',
    consumerTerm: () => null,
  },
]

export async function detectContractImpact(
  changedFiles: ChangedFile[],
  repoRoot: string,
  maxFiles: number
): Promise<ImpactedFile[]> {
  const impacted: ImpactedFile[] = []
  const seen = new Set<string>()

  for (const file of changedFiles) {
    const rule = CONTRACT_RULES.find(r => r.regex.test(file.path))
    if (!rule) continue

    const basename = path.basename(file.path)
    const stem = basename.replace(/\.[^.]+$/, '')
    const term = rule.consumerTerm(basename, stem)

    core.info(`Track A: ${file.path} matched '${rule.label}'`)

    if (!term || stem.length < 3) continue

    const matches = await filesWithMatches(term, repoRoot, false)
    for (const absPath of matches) {
      const rel = absPath.startsWith(repoRoot + '/')
        ? absPath.slice(repoRoot.length + 1)
        : absPath
      if (!seen.has(rel) && rel !== file.path) {
        seen.add(rel)
        impacted.push({ path: rel, detectedVia: 'track-a' })
      }
    }
  }

  if (impacted.length > maxFiles) {
    core.warning(`Track A: trimming ${impacted.length} consumer results to ${maxFiles}`)
    return impacted.slice(0, maxFiles)
  }

  return impacted
}
