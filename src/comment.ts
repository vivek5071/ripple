import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import { getReportCommentMarker } from './comment-formatter'
import { AI_REVIEW_MARKER } from './ai-review-formatter'

type Octokit = ReturnType<typeof getOctokit>

const MARKERS: Record<string, string> = {
  ripple: getReportCommentMarker(),
  'ai-review': AI_REVIEW_MARKER,
}

export async function upsertComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  label: 'ripple' | 'ai-review' = 'ripple'
): Promise<void> {
  const marker = MARKERS[label]

  let existing: { id: number } | undefined
  let page = 1
  while (!existing) {
    const { data } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
      page,
    })
    if (data.length === 0) break
    existing = data.find(c => c.body?.includes(marker))
    if (data.length < 100) break
    page++
  }

  if (existing) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body })
    core.info(`Updated existing ${label} comment #${existing.id}`)
  } else {
    await octokit.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body })
    core.info(`Created ${label} comment`)
  }
}
