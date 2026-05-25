import * as exec from '@actions/exec'

export async function countRepoFiles(repoRoot: string): Promise<number> {
  let count = 0
  await exec.exec('rg', ['--files', repoRoot], {
    ignoreReturnCode: true,
    silent: true,
    listeners: { stdline: () => { count++ } },
  })
  return count
}

export async function filesWithMatches(
  pattern: string,
  repoRoot: string,
  wordBoundary = false,
  maxResults = 0
): Promise<string[]> {
  const paths: string[] = []
  const args = ['--files-with-matches']
  if (wordBoundary) args.push('--word-regexp')
  if (maxResults > 0) args.push('--max-count', String(maxResults))
  args.push('--', pattern, repoRoot)

  const code = await exec.exec('rg', args, {
    ignoreReturnCode: true,
    silent: true,
    listeners: { stdline: (line: string) => { paths.push(line) } },
  })
  return code > 1 ? [] : paths
}
