import * as core from '@actions/core'
import { getOctokit } from '@actions/github'

type Octokit = ReturnType<typeof getOctokit>

export async function isBranchProtected(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  try {
    await octokit.rest.repos.getBranchProtection({ owner, repo, branch })
    return true
  } catch (err: unknown) {
    const status = (err as { status?: number }).status
    if (status === 404) return false          // no protection rules configured
    if (status === 403) return false          // no admin permission — treat as unprotected
    core.warning(`Branch protection check failed: ${err instanceof Error ? err.message : String(err)}`)
    return true  // assume protected on network/auth errors to avoid false banners
  }
}
