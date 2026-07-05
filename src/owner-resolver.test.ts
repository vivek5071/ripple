import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { resolveOwners } from './owner-resolver'

// Octokit is only consulted for git-blame email lookups; yaml-resolved paths
// never touch it, and in a non-git temp dir the blame fallback exits early.
const octokit = {} as Parameters<typeof resolveOwners>[2]

function tmpRepo(rippleYml?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ripple-test-'))
  if (rippleYml !== undefined) fs.writeFileSync(path.join(dir, '.ripple.yml'), rippleYml)
  return dir
}

describe('resolveOwners', () => {
  it('resolves owners from .ripple.yml globs and groups files per handle', async () => {
    const repo = tmpRepo(
      [
        'paths:',
        "  'src/payments/**': alice",
        "  'src/auth/**':",
        '    - bob',
        '    - carol',
      ].join('\n')
    )

    const owners = await resolveOwners(
      ['src/payments/checkout.ts', 'src/payments/refund.ts', 'src/auth/login.ts'],
      repo,
      octokit
    )

    const byHandle = Object.fromEntries(owners.map(o => [o.handle, o]))
    expect(byHandle.alice.files).toEqual(['src/payments/checkout.ts', 'src/payments/refund.ts'])
    expect(byHandle.alice.resolvedVia).toBe('yaml')
    expect(byHandle.bob.files).toEqual(['src/auth/login.ts'])
    expect(byHandle.carol.files).toEqual(['src/auth/login.ts'])
  })

  it('first matching glob wins', async () => {
    const repo = tmpRepo(
      ['paths:', "  'src/payments/**': alice", "  'src/**': bob"].join('\n')
    )

    const owners = await resolveOwners(['src/payments/checkout.ts'], repo, octokit)
    expect(owners).toHaveLength(1)
    expect(owners[0].handle).toBe('alice')
  })

  it('returns no owner for unmatched files when git blame has nothing (non-git dir)', async () => {
    const repo = tmpRepo("paths:\n  'src/**': alice")
    const owners = await resolveOwners(['docs/guide.md'], repo, octokit)
    expect(owners).toEqual([])
  })

  it('survives a missing or malformed .ripple.yml', async () => {
    await expect(resolveOwners(['src/a.ts'], tmpRepo(), octokit)).resolves.toEqual([])
    await expect(
      resolveOwners(['src/a.ts'], tmpRepo('paths: ["broken'), octokit)
    ).resolves.toEqual([])
  })
})
