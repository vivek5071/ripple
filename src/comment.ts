import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import { getReportCommentMarker } from './comment-formatter'

type Octokit = ReturnType<typeof getOctokit>

export async function upsertComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
): Promise<void> {
  const marker = getReportCommentMarker()

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  })

  const existing = comments.find(c => c.body?.includes(marker))

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    })
    core.info(`Updated existing blast radius comment #${existing.id}`)
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    })
    core.info('Created blast radius comment')
  }
}
