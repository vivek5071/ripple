export interface ActionInputs {
  githubToken: string
  mode: 'advisory' | 'gate'
  minSymbolLength: number
  maxFilesToSearch: number
  maxOwnersPerPr: number
  teamLead: string
  botPatterns: string[]
}

export interface ChangedFile {
  path: string
  status: 'added' | 'modified' | 'removed' | 'renamed'
  previousPath?: string  // set when status === 'renamed'
  patch?: string
}

export interface ChangedSymbol {
  name: string
  file: string
  language: string
  // When a rename is detected, ripgrep searches for oldName across the repo
  isRename: boolean
  oldName?: string
}

export interface ImpactedFile {
  path: string
  detectedVia: 'track-a' | 'track-b'
  matchedSymbol?: string
}

export interface ResolvedOwner {
  handle: string             // @username (without @)
  files: string[]
  resolvedVia: 'yaml' | 'git-blame' | 'unresolved'
}

export interface BlastRadiusReport {
  changedFiles: ChangedFile[]
  changedSymbols: ChangedSymbol[]
  impactedFiles: ImpactedFile[]
  owners: ResolvedOwner[]
  unresolvedFiles: string[]  // impacted files with no owner found
  prAuthor: string
  advisoryMode: boolean
  ownerCapHit: boolean       // true when unique owner count > maxOwnersPerPr
  branchProtectionConfigured: boolean
  runtimeMs: number
  filesSearched: number
  botAuthor: boolean         // true when prAuthor matched a bot pattern
}
