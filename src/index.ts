import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import type { ActionInputs, AiReviewConfig, BlastRadiusReport, ChangedFile, ImpactedFile } from './types'
import { getChangedFiles, getSourceFiles } from './diff'
import { detectContractImpact } from './track-a'
import { symbolGrep } from './track-b'
import { detectRenames, getRenamedSymbolCallers } from './rename-detect'
import { extractChangedSymbols } from './symbol-extract'
import { resolveOwners } from './owner-resolver'
import { applyOwnerSafetyRules } from './owner-safety'
import { isBranchProtected } from './branch-check'
import { formatReport } from './comment-formatter'
import { upsertComment } from './comment'
import { requestReviews } from './review-requester'
import { isBotAuthor } from './bot-detect'
import { splitFiles, checkPrMinLines } from './file-splitter'
import { runAiReview } from './ai-review'
import { formatAiReview, AI_REVIEW_MARKER } from './ai-review-formatter'

type Octokit = ReturnType<typeof github.getOctokit>

function getInputs(): ActionInputs {
  return {
    githubToken: core.getInput('github-token', { required: true }),
    mode: (core.getInput('mode') || 'advisory') as 'advisory' | 'gate',
    minSymbolLength: parseInt(core.getInput('min-symbol-length') || '5', 10),
    maxFilesToSearch: parseInt(core.getInput('max-files-to-search') || '50000', 10),
    maxOwnersPerPr: parseInt(core.getInput('max-owners-per-pr') || '10', 10),
    teamLead: core.getInput('team-lead') || '',
    botPatterns: (core.getInput('bot-patterns') || '')
      .split(',').map(p => p.trim()).filter(Boolean),
  }
}

function loadAiReviewConfig(repoRoot: string): { config: AiReviewConfig; hasOwnerRouting: boolean } | null {
  const configPath = path.join(repoRoot, '.ripple.yml')
  if (!fs.existsSync(configPath)) return null

  let raw: Record<string, unknown>
  try {
    raw = (yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>) ?? {}
  } catch {
    return null
  }

  const aiReview = raw['ai-review'] as Record<string, unknown> | undefined
  if (!aiReview || aiReview['enabled'] !== true) return null

  const apiUrl = String(aiReview['api-url'] ?? '')
  const model = String(aiReview['model'] ?? '')

  if (!apiUrl || !model) {
    core.warning('ai-review: api-url and model are required in .ripple.yml — skipping ai-review')
    return null
  }

  const hasOwnerRouting = Boolean(
    raw['paths'] && typeof raw['paths'] === 'object' && Object.keys(raw['paths'] as object).length > 0
  )

  const config: AiReviewConfig = {
    enabled: true,
    apiUrl,
    model,
    focus: String(aiReview['focus'] ?? 'logical-errors,error-handling').split(',').map(s => s.trim()),
    skipPatterns: String(aiReview['skip-patterns'] ?? '').split(',').map(s => s.trim()).filter(Boolean),
    skipLabel: String(aiReview['skip-label'] ?? 'skip-ai-review'),
    minFileDiffLines: Number(aiReview['min-file-diff-lines'] ?? 1),
    minPrDiffLines: Number(aiReview['min-pr-diff-lines'] ?? 1),
    maxFileTokens: Number(aiReview['max-file-tokens'] ?? 32000),
    timeoutSeconds: Number(aiReview['timeout-seconds'] ?? 30),
    allowPrivateNetworks: aiReview['allow-private-networks'] === true,
    postAsComment: aiReview['post-as-comment'] !== false,
  }

  return { config, hasOwnerRouting }
}

async function runAiReviewPipeline(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  allChanged: ChangedFile[],
  allImpacted: ImpactedFile[],
  config: AiReviewConfig,
  apiKey: string,
  commitSha: string,
  hasOwnerRouting: boolean,
  prLabels: string[]
): Promise<void> {
  if (prLabels.includes(config.skipLabel)) {
    core.info(`ai-review: skipping — PR has label "${config.skipLabel}"`)
    return
  }

  if (!checkPrMinLines(allChanged, config)) {
    core.info('ai-review: skipping — PR has fewer changed lines than min-pr-diff-lines')
    return
  }

  const impactedPaths = hasOwnerRouting ? allImpacted.map(f => f.path) : null
  const fileDiffs = splitFiles(allChanged, config, impactedPaths)

  if (fileDiffs.length === 0) {
    core.info('ai-review: no files to review after filtering')
    return
  }

  core.info(`ai-review: reviewing ${fileDiffs.length} file(s)`)

  if (config.postAsComment) {
    const statusBody = `${AI_REVIEW_MARKER}\n## AI Review\n\n> Reviewing ${fileDiffs.length} file${fileDiffs.length === 1 ? '' : 's'}...`
    await upsertComment(octokit, owner, repo, pullNumber, statusBody, 'ai-review')
  }

  const { findings, skippedFiles, timedOutFiles } = await runAiReview({
    config,
    apiKey,
    files: fileDiffs,
    commitSha,
  })

  const filesReviewed = fileDiffs.length - skippedFiles.length - timedOutFiles.length
  const commentBody = formatAiReview(findings, config.model, commitSha, filesReviewed, skippedFiles, timedOutFiles)

  if (config.postAsComment) {
    await upsertComment(octokit, owner, repo, pullNumber, commentBody, 'ai-review')
  } else {
    core.info(commentBody)
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
    const commitSha: string = pr.head.sha
    const repoRoot = process.env.GITHUB_WORKSPACE ?? process.cwd()
    const prLabels: string[] = ((pr.labels as Array<{ name: string }>) ?? []).map(l => l.name)

    core.info(`Ripple: PR #${pullNumber} by @${prAuthor} → ${baseBranch}`)

    // 1. Fetch diff
    const allChanged = await getChangedFiles(octokit, owner, repo, pullNumber)
    const sourceFiles = getSourceFiles(allChanged)

    if (sourceFiles.length === 0) {
      core.info('No source files changed — skipping')
      return
    }

    // 2. Detect renames (so Track B searches OLD name for renamed symbols)
    const renamedFiles = detectRenames(sourceFiles)

    // 3. Extract exported symbols from the diff (regex-based, no AST required)
    const patchSymbols = extractChangedSymbols(sourceFiles)
    const renamedSymbols = await getRenamedSymbolCallers(renamedFiles, [], repoRoot)
    const changedSymbols = [...patchSymbols, ...renamedSymbols]

    core.info(`Symbols: ${patchSymbols.length} from patch, ${renamedSymbols.length} from renames`)

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
    const rawOwners = await resolveOwners(impactedPaths, repoRoot, octokit)

    // 8. Apply safety rules (author exclusion, team-lead fallback, cap)
    const safety = applyOwnerSafetyRules(
      rawOwners,
      prAuthor,
      inputs.teamLead,
      inputs.maxOwnersPerPr
    )

    const botPr = isBotAuthor(prAuthor, inputs.botPatterns)
    if (botPr) core.info(`Bot PR detected (@${prAuthor}) — forcing gate mode`)

    // advisory when: owner cap hit, OR (not a bot PR AND configured as advisory)
    const advisoryMode = safety.capHit || (!botPr && inputs.mode === 'advisory')

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
      botAuthor: botPr,
    }

    core.info(
      `Ripple complete: ${report.impactedFiles.length} impacted files, ` +
      `${report.owners.length} owners, ${report.runtimeMs}ms`
    )

    // 11. Post Ripple comment
    const commentBody = formatReport(report)
    await upsertComment(octokit, owner, repo, pullNumber, commentBody)

    // 12. Request reviews in gate mode
    if (!advisoryMode) {
      await requestReviews(octokit, owner, repo, pullNumber, safety.owners)
    }

    // 13. AI Review (if enabled in .ripple.yml)
    const aiReview = loadAiReviewConfig(repoRoot)
    const aiApiKey = core.getInput('ai-api-key')

    if (aiReview) {
      if (!aiApiKey) {
        core.warning('ai-review is enabled in .ripple.yml but ai-api-key input is not set — skipping')
      } else {
        await runAiReviewPipeline(
          octokit, owner, repo, pullNumber,
          allChanged, allImpacted,
          aiReview.config, aiApiKey, commitSha,
          aiReview.hasOwnerRouting, prLabels
        )
      }
    }

  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err))
  }
}

run()
