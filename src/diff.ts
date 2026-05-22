import * as core from '@actions/core'
import { getOctokit } from '@actions/github'
import type { ChangedFile } from './types'

type Octokit = ReturnType<typeof getOctokit>

export async function getChangedFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<ChangedFile[]> {
  const files: ChangedFile[] = []
  let page = 1

  while (true) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
      page,
    })

    if (data.length === 0) break

    for (const f of data) {
      const status = f.status as ChangedFile['status']
      files.push({
        path: f.filename,
        status,
        previousPath: f.previous_filename,
        patch: f.patch,
      })
    }

    if (data.length < 100) break
    page++
  }

  core.info(`Diff: ${files.length} changed files`)
  return files
}

export function getSourceFiles(files: ChangedFile[]): ChangedFile[] {
  const ignored = /\.(md|txt|lock|sum|png|jpg|jpeg|gif|svg|ico|pdf|zip|tar|gz)$/i
  return files.filter(f => f.status !== 'removed' && !ignored.test(f.path))
}
