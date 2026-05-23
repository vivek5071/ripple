import type { ChangedFile, ChangedSymbol } from './types'

// Matches exported TS/JS symbols. Handles: function, async function, class,
// const/let/var, interface, type, enum, default variants.
const EXPORT_RE = /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?\s+|class\s+|(?:const|let|var|enum)\s+|interface\s+|type\s+)(\w{3,})/

const SOURCE_EXTS = /\.(tsx?|jsx?|mjs|cjs)$/i

function lang(filePath: string): string {
  if (/\.tsx?$/.test(filePath)) return 'typescript'
  if (/\.jsx?$/.test(filePath)) return 'javascript'
  return 'unknown'
}

export function extractChangedSymbols(changedFiles: ChangedFile[]): ChangedSymbol[] {
  const symbols: ChangedSymbol[] = []
  const seen = new Set<string>()

  for (const file of changedFiles) {
    if (!file.patch || !SOURCE_EXTS.test(file.path)) continue

    for (const rawLine of file.patch.split('\n')) {
      // Only added lines — changed signatures and new exports
      if (!rawLine.startsWith('+')) continue
      const line = rawLine.slice(1)

      const m = line.match(EXPORT_RE)
      if (!m) continue

      const name = m[1]
      const key = `${file.path}:${name}`
      if (seen.has(key)) continue
      seen.add(key)

      symbols.push({ name, file: file.path, language: lang(file.path), isRename: false })
    }
  }

  return symbols
}
