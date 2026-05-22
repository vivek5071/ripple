// T9 — Review requester
// In gate mode: requests GitHub reviews from each unique owner.
// One API call per owner (not per file). Skips PR author automatically.
// Implemented in T9 (Lane C).

import { getOctokit } from '@actions/github'
import type { ResolvedOwner } from './types'

type Octokit = ReturnType<typeof getOctokit>

export async function requestReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  resolvedOwners: ResolvedOwner[]
): Promise<void> {
  // TODO (T9): POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers
  // One call per owner handle. Handle errors gracefully (user not a collaborator, etc.)
  void octokit; void owner; void repo; void pullNumber; void resolvedOwners
}
