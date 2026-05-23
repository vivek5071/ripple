import * as path from 'path'
import type { ChangedFile, ChangedSymbol } from './types'

export function detectRenames(changedFiles: ChangedFile[]): ChangedFile[] {
  return changedFiles.filter(f => f.status === 'renamed' && f.previousPath != null)
}

export async function getRenamedSymbolCallers(
  renamedFiles: ChangedFile[],
  allSymbols: ChangedSymbol[],
  _repoRoot: string
): Promise<ChangedSymbol[]> {
  const symbols: ChangedSymbol[] = []

  for (const file of renamedFiles) {
    if (!file.previousPath) continue

    const oldStem = path.basename(file.previousPath).replace(/\.[^.]+$/, '')
    const newStem = path.basename(file.path).replace(/\.[^.]+$/, '')

    symbols.push({
      name: newStem,
      oldName: oldStem,
      file: file.path,
      language: languageFromPath(file.path),
      isRename: true,
    })
  }

  for (const sym of allSymbols) {
    if (sym.isRename && sym.oldName) {
      symbols.push(sym)
    }
  }

  return symbols
}

function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.java': 'java',
    '.rs': 'rust',
    '.cs': 'csharp',
    '.php': 'php',
  }
  return map[ext] ?? 'unknown'
}
