// T8 — Branch protection detection
// Checks if the base branch has protection rules configured.
// If not, the PR comment shows a one-time setup banner.
// Implemented in T8 (Lane C).

import { getOctokit } from '@actions/github'

type Octokit = ReturnType<typeof getOctokit>

export async function isBranchProtected(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  // TODO (T8): GET /repos/{owner}/{repo}/branches/{branch}
  // Returns false on 404/403 (no protection or no permission to check)
  void octokit; void owner; void repo; void branch
  return true  // assume protected until T8 is implemented; avoids false banners
}
