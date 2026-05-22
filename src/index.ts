import * as core from '@actions/core'
import * as github from '@actions/github'
import type { ActionInputs, BlastRadiusReport } from './types'
import { getChangedFiles, getSourceFiles } from './diff'
import { detectContractImpact } from './track-a'
import { symbolGrep } from './track-b'
import { detectRenames, getRenamedSymbolCallers } from './rename-detect'
import { resolveOwners } from './owner-resolver'
import { applyOwnerSafetyRules } from './owner-safety'
import { isBranchProtected } from './branch-check'
import { formatReport } from './comment-formatter'
import { upsertComment } from './comment'
import { requestReviews } from './review-requester'

function getInputs(): ActionInputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    mode: (core.getInput('mode') || 'advisory') as 'advisory' | 'gate',
    minSymbolLength: parseInt(core.getInput('min-symbol-length') || '5', 10),
    maxFilesToSearch: parseInt(core.getInput('max-files-to-search') || '50000', 10),
    maxOwnersPerPr: parseInt(core.getInput('max-owners-per-pr') || '10', 10),
    teamLead: core.getInput('team-lead') || '',
  }
}

async function run(): Promise<void> {
  const startTime = Date.now()

  try {
    const inputs = getInputs()
    const octokit = github.getOctokit(inputs.githubToken)
    const ctx = github.context

    if (!ctx.payload.pull_request) {
      core.info('Not a pull_request event — skipping')
      return
    }

    const pr = ctx.payload.pull_request
    const { owner, repo } = ctx.repo
    const pullNumber = pr.number
    const prAuthor: string = pr.user.login
    const baseBranch: string = pr.base.ref
    const repoRoot = process.env.GITHUB_WORKSPACE ?? process.cwd()

    core.info(`Blast Radius: PR #${pullNumber} by @${prAuthor} → ${baseBranch}`)

    // 1. Fetch diff
    const allChanged = await getChangedFiles(octokit, owner, repo, pullNumber)
    const sourceFiles = getSourceFiles(allChanged)

    if (sourceFiles.length === 0) {
      core.info('No source files changed — skipping')
      return
    }

    // 2. Detect renames (so Track B searches OLD name for renamed symbols)
    const renamedFiles = detectRenames(sourceFiles)

    // 3. Placeholder symbol list — T4/T5 will populate this from AST parsing
    //    For now: treat each changed source file path as a symbol-bearing unit
    const changedSymbols = await getRenamedSymbolCallers(renamedFiles, [], repoRoot)

    // 4. Track A — contract file detection
    const trackAImpact = await detectContractImpact(sourceFiles, repoRoot, inputs.maxFilesToSearch)

    // 5. Track B — symbol grep
    const trackBResult = await symbolGrep(
      changedSymbols,
      repoRoot,
      inputs.minSymbolLength,
      inputs.maxFilesToSearch
    )

    // 6. Merge and deduplicate impacted files
    const allImpacted = [...trackAImpact, ...trackBResult.impactedFiles]
    const impactedPaths = [...new Set(allImpacted.map(f => f.path))]

    // 7. Resolve owners
    const rawOwners = await resolveOwners(impactedPaths, repoRoot)

    // 8. Apply safety rules (author exclusion, team-lead fallback, cap)
    const safety = applyOwnerSafetyRules(
      rawOwners,
      prAuthor,
      inputs.teamLead,
      inputs.maxOwnersPerPr
    )

    const advisoryMode = inputs.mode === 'advisory' || safety.capHit

    // 9. Branch protection check
    const branchProtected = await isBranchProtected(octokit, owner, repo, baseBranch)

    // 10. Build report
    const report: BlastRadiusReport = {
      changedFiles: allChanged,
      changedSymbols,
      impactedFiles: allImpacted,
      owners: safety.owners,
      unresolvedFiles: impactedPaths.filter(
        p => !safety.owners.some(o => o.files.includes(p))
      ),
      prAuthor,
      advisoryMode,
      ownerCapHit: safety.capHit,
      branchProtectionConfigured: branchProtected,
      runtimeMs: Date.now() - startTime,
      filesSearched: trackBResult.filesSearched,
    }

    core.info(
      `Blast Radius complete: ${report.impactedFiles.length} impacted files, ` +
      `${report.owners.length} owners, ${report.runtimeMs}ms`
    )

    // 11. Post comment
    const commentBody = formatReport(report)
    await upsertComment(octokit, owner, repo, pullNumber, commentBody)

    // 12. Request reviews in gate mode
    if (!advisoryMode) {
      await requestReviews(octokit, owner, repo, pullNumber, safety.owners)
    }

  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err))
  }
}

run()
