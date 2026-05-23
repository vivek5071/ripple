import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import type { ResolvedOwner } from './types'

type Octokit = ReturnType<typeof getOctokit>

export async function requestReviews(
  octokit: Octokit,
  repoOwner: string,
  repo: string,
  pullNumber: number,
  resolvedOwners: ResolvedOwner[]
): Promise<void> {
  const handles = [...new Set(
    resolvedOwners
      .filter(o => o.resolvedVia !== 'unresolved')
      .map(o => o.handle)
  )]

  for (const handle of handles) {
    try {
      await octokit.rest.pulls.requestReviewers({
        owner: repoOwner,
        repo,
        pull_number: pullNumber,
        reviewers: [handle],
      })
      core.info(`Requested review from @${handle}`)
    } catch (err) {
      // Non-collaborators and already-requested reviewers both throw here
      core.warning(`Could not request review from @${handle}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
