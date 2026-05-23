import micromatch from 'micromatch'

export function isBotAuthor(handle: string, extraPatterns: string[]): boolean {
  // GitHub App convention: all App-based bots end with the literal suffix [bot]
  if (handle.endsWith('[bot]')) return true

  // User-supplied patterns for bots that skip the [bot] convention (e.g. 'renovate', 'devin-ai')
  return extraPatterns.length > 0 && micromatch.isMatch(handle, extraPatterns, { nocase: true })
}
