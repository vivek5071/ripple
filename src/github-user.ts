// T3 — Email-to-handle mapping
// git blame returns committer emails. GitHub review requests need @handles.
// Uses GET /search/users?q=EMAIL+in:email to find the handle.
// Falls back to undefined (comment-only, no review request) when not found.
// Implemented in T3 (Lane B).

import { getOctokit } from '@actions/github'

type Octokit = ReturnType<typeof getOctokit>

export async function emailToHandle(
  email: string,
  octokit: Octokit
): Promise<string | undefined> {
  // TODO (T3): GitHub Search API lookup, graceful 404/rate-limit handling
  void email; void octokit
  return undefined
}
