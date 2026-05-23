import * as fs from 'fs'
import * as path from 'path'
import * as exec from '@actions/exec'
import * as core from '@actions/core'
import * as yaml from 'js-yaml'
import micromatch from 'micromatch'
import { getOctokit } from '@actions/github'
import { emailToHandle } from './github-user'
import type { ResolvedOwner } from './types'

type Octokit = ReturnType<typeof getOctokit>

interface BlastRadiusConfig {
  paths?: Record<string, string | string[]>
}

function loadConfig(repoRoot: string): BlastRadiusConfig {
  const configPath = path.join(repoRoot, '.ripple.yml')
  if (!fs.existsSync(configPath)) return {}
  try {
    return (yaml.load(fs.readFileSync(configPath, 'utf8')) as BlastRadiusConfig) ?? {}
  } catch {
    core.warning('Failed to parse .ripple.yml — skipping YAML owner resolution')
    return {}
  }
}

function matchYaml(filePath: string, pathConfig: Record<string, string | string[]>): string[] {
  for (const [glob, owners] of Object.entries(pathConfig)) {
    if (micromatch.isMatch(filePath, glob)) {
      return Array.isArray(owners) ? owners : [owners]
    }
  }
  return []
}

async function gitBlameEmail(filePath: string, repoRoot: string): Promise<string | undefined> {
  let out = ''
  const code = await exec.exec(
    'git',
    ['-C', repoRoot, 'log', '--format=%ae', '-1', '--', filePath],
    {
      ignoreReturnCode: true,
      silent: true,
      listeners: { stdout: (d: Buffer) => { out += d.toString() } },
    }
  )
  if (code !== 0) return undefined
  const email = out.trim()
  return email || undefined
}

export async function resolveOwners(
  impactedPaths: string[],
  repoRoot: string,
  octokit: Octokit
): Promise<ResolvedOwner[]> {
  const config = loadConfig(repoRoot)
  const pathConfig = config.paths ?? {}

  // handle → { files, resolvedVia } — first-touch wins for resolvedVia
  const handleFiles = new Map<string, string[]>()
  const handleVia = new Map<string, 'yaml' | 'git-blame' | 'unresolved'>()
  const emailHandleCache = new Map<string, string | undefined>()

  function addOwner(handle: string, filePath: string, via: 'yaml' | 'git-blame' | 'unresolved') {
    if (!handleVia.has(handle)) handleVia.set(handle, via)
    const files = handleFiles.get(handle) ?? []
    files.push(filePath)
    handleFiles.set(handle, files)
  }

  for (const filePath of impactedPaths) {
    const handles = matchYaml(filePath, pathConfig)

    if (handles.length > 0) {
      for (const h of handles) addOwner(h, filePath, 'yaml')
      continue
    }

    const email = await gitBlameEmail(filePath, repoRoot)
    if (!email) continue

    if (!emailHandleCache.has(email)) {
      emailHandleCache.set(email, await emailToHandle(email, octokit))
    }
    const handle = emailHandleCache.get(email)
    if (handle) {
      addOwner(handle, filePath, 'git-blame')
    }
    // No handle found → file lands in unresolvedFiles (computed in index.ts)
  }

  return [...handleFiles.entries()].map(([handle, files]) => ({
    handle,
    files,
    resolvedVia: handleVia.get(handle) ?? 'unresolved',
  }))
}
