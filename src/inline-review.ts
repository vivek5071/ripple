import * as github from '@actions/github'
import * as core from '@actions/core'
import type { Finding, FileDiff } from './types'

type Octokit = ReturnType<typeof github.getOctokit>

function getValidLines(patch: string): Set<number> {
  const valid = new Set<number>()
  const re = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g
  let m
  while ((m = re.exec(patch)) !== null) {
    const start = parseInt(m[1], 10)
    const count = m[2] !== undefined ? parseInt(m[2], 10) : 1
    for (let i = start; i < start + count; i++) valid.add(i)
  }
  return valid
}

function formatInlineBody(f: Finding): string {
  const parts = [`**${f.category}**: ${f.description}`]
  if (f.impact) parts.push(`**Impact:** ${f.impact}`)
  if (f.fix) parts.push(`**Fix:** ${f.fix}`)
  return parts.join('\n\n')
}

export interface InlineReviewResult {
  inlined: Finding[]
  fallback: Finding[]
}

export async function postInlineReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commitSha: string,
  findings: Finding[],
  fileDiffs: FileDiff[]
): Promise<InlineReviewResult> {
  const validLinesByFile = new Map<string, Set<number>>()
  for (const fd of fileDiffs) {
    validLinesByFile.set(fd.path, getValidLines(fd.diff))
  }

  const inlined: Finding[] = []
  const fallback: Finding[] = []
  const comments: Array<{ path: string; line: number; body: string }> = []

  for (const f of findings) {
    if (f.raw || f.line === null) {
      fallback.push(f)
      continue
    }
    const validLines = validLinesByFile.get(f.file)
    if (validLines?.has(f.line)) {
      comments.push({ path: f.file, line: f.line, body: formatInlineBody(f) })
      inlined.push(f)
    } else {
      fallback.push(f)
    }
  }

  if (comments.length > 0) {
    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitSha,
        event: 'COMMENT',
        comments,
      })
      core.info(`ai-review: posted ${comments.length} inline comment(s)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      core.warning(`ai-review: inline review failed (${msg}) — falling back to comment`)
      fallback.push(...inlined.splice(0))
    }
  }

  return { inlined, fallback }
}
