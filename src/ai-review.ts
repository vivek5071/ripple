import * as core from '@actions/core'
import { sanitizeDiff } from './secret-sanitizer'
import type { FileDiff, Finding, ReviewOptions } from './types'

// Cost per 1M tokens [input, output]. Unknown models use the conservative fallback.
const MODEL_PRICING: Record<string, [number, number]> = {
  'gpt-4o':                   [2.50, 10.00],
  'gpt-4o-mini':              [0.15,  0.60],
  'gpt-4-turbo':              [10.00, 30.00],
  'llama-3.3-70b-versatile':  [0.59,  0.79],
  'llama-3.1-70b-versatile':  [0.59,  0.79],
  'mixtral-8x7b-32768':       [0.24,  0.24],
}
const FALLBACK_PRICING: [number, number] = [5.00, 15.00]

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const [inputPer1M, outputPer1M] = MODEL_PRICING[model] ?? FALLBACK_PRICING
  return (promptTokens / 1_000_000) * inputPer1M + (completionTokens / 1_000_000) * outputPer1M
}

const FOCUS_MAP: Record<string, string> = {
  'logical-errors': 'logical errors and incorrect behavior',
  'security': 'security vulnerabilities, injection risks, and exposed secrets',
  'error-handling': 'missing or inadequate error handling and silent failure paths',
  'broken-assumptions': 'broken assumptions about input shape, API contracts, and state',
  'all': 'all of the above',
}

const FINDING_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'category', 'description', 'impact', 'fix'],
        properties: {
          file: { type: 'string' },
          line: { type: ['integer', 'null'] },
          category: {
            type: 'string',
            enum: ['logical-error', 'error-handling', 'security', 'broken-assumption'],
          },
          description: { type: 'string' },
          impact: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

export function validateApiUrl(rawUrl: string, allowPrivateNetworks: boolean): string {
  let url = rawUrl.replace(/\/+$/, '')

  if (url.endsWith('/v1')) {
    core.warning('ai-review: api-url should not include /v1 — stripping automatically')
    url = url.slice(0, -3)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`ai-review: invalid api-url "${rawUrl}"`)
  }

  const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'

  if (parsed.protocol === 'http:' && !isLocalhost) {
    throw new Error(
      'ai-review: api-url must use https. Use https:// or http://localhost for local testing.'
    )
  }

  if (!allowPrivateNetworks && !isLocalhost) {
    const h = parsed.hostname
    const isPrivate =
      /^10\./.test(h) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^169\.254\./.test(h)

    if (isPrivate) {
      throw new Error(
        `ai-review: api-url points to a private IP (${h}). ` +
        `Set allow-private-networks: true in .ripple.yml for Ollama/vLLM on a private LAN.`
      )
    }
  }

  return url
}

function buildSystemPrompt(focusList: string[]): string {
  const areas = focusList.includes('all')
    ? FOCUS_MAP['all']
    : focusList.map(f => FOCUS_MAP[f] ?? f).join('; ')

  return [
    'You are a senior engineer reviewing a pull request diff.',
    'Identify only concrete, actionable issues. Do not praise. Do not summarize.',
    `Focus: ${areas}.`,
    '',
    'For each issue respond with JSON matching the FindingSchema.',
    'If no issues found, return an empty findings array.',
    'Only report issues visible in the diff. Do not speculate beyond the shown code.',
  ].join('\n')
}

type ResponseFormatMode = 'json_schema' | 'json_object' | 'none'

async function callLlmWithFormat(
  apiUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  timeoutMs: number,
  mode: ResponseFormatMode
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  }

  if (mode === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'review_findings', schema: FINDING_SCHEMA, strict: true },
    }
  } else if (mode === 'json_object') {
    body.response_format = { type: 'json_object' }
  }

  try {
    return await fetch(`${apiUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

interface LlmResponse {
  content: string
  promptTokens: number
  completionTokens: number
}

async function callLlm(
  apiUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  timeoutMs: number
): Promise<LlmResponse> {
  const modes: ResponseFormatMode[] = ['json_schema', 'json_object', 'none']

  let response: Response | undefined
  for (const mode of modes) {
    response = await callLlmWithFormat(apiUrl, apiKey, model, systemPrompt, userContent, timeoutMs, mode)
    if (response.status !== 400 && response.status !== 422) break
    core.info(`ai-review: provider rejected response_format mode "${mode}", trying next`)
  }

  if (response!.status === 401) throw new Error('ai-review: API key invalid (401)')
  if (response!.status === 403) {
    throw new Error(
      'ai-review: API access forbidden (403). Check API key permissions or Azure RBAC role.'
    )
  }
  if (response!.status === 429) throw new Error('ai-review: rate limited (429)')
  if (!response!.ok) throw new Error(`ai-review: LLM request failed with status ${response!.status}`)

  const data = await response!.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  }
}

function parseFindings(content: string, filePath: string): Finding[] {
  try {
    const parsed = JSON.parse(content) as { findings?: unknown[] }
    if (Array.isArray(parsed.findings)) {
      return parsed.findings.map((f: any) => ({
        file: typeof f.file === 'string' ? f.file : filePath,
        line: typeof f.line === 'number' ? f.line : null,
        category: f.category ?? 'logical-error',
        description: String(f.description ?? ''),
        impact: String(f.impact ?? ''),
        fix: String(f.fix ?? ''),
      }))
    }
  } catch { /* fall through to prose fallback */ }

  if (content.trim().length > 0) {
    return [{ file: filePath, line: null, category: 'logical-error', description: '', impact: '', fix: '', raw: content }]
  }

  return []
}

interface FileReviewResult {
  findings: Finding[]
  costUsd: number
}

async function reviewFileWithRetry(
  file: FileDiff,
  apiUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  timeoutMs: number,
  retryLimit: number
): Promise<FileReviewResult> {
  const { sanitized, redactedCount } = sanitizeDiff(file.diff)
  if (redactedCount > 0) {
    core.info(`ai-review: redacted ${redactedCount} potential secret(s) in ${file.path}`)
  }

  const userContent = `File: ${file.path}\n\n\`\`\`diff\n${sanitized}\n\`\`\``

  core.info(`ai-review: reviewing ${file.path} (~${file.lineCount} changed lines)`)

  let lastErr: Error | undefined
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 2 ** attempt * 1000))
      core.info(`ai-review: retrying ${file.path} (attempt ${attempt + 1})`)
    }
    try {
      const { content, promptTokens, completionTokens } = await callLlm(apiUrl, apiKey, model, systemPrompt, userContent, timeoutMs)
      const costUsd = estimateCost(model, promptTokens, completionTokens)
      if (!content) return { findings: [], costUsd }
      return { findings: parseFindings(content, file.path), costUsd }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (!lastErr.message.includes('429') && !lastErr.message.includes('aborted')) break
    }
  }
  throw lastErr ?? new Error('ai-review: unknown error')
}

export interface ReviewResult {
  findings: Finding[]
  skippedFiles: string[]
  timedOutFiles: string[]
  budgetExceededFiles: string[]
  totalCostUsd: number
}

export async function runAiReview(options: ReviewOptions): Promise<ReviewResult> {
  const { config, apiKey, files } = options
  const apiUrl = validateApiUrl(config.apiUrl, config.allowPrivateNetworks)
  const systemPrompt = buildSystemPrompt(config.focus)
  const timeoutMs = config.timeoutSeconds * 1000

  core.setSecret(apiKey)

  const allFindings: Finding[] = []
  const skippedFiles: string[] = []
  const timedOutFiles: string[] = []
  const budgetExceededFiles: string[] = []
  let totalCostUsd = 0
  const maxConcurrent = 5

  for (let i = 0; i < files.length; i += maxConcurrent) {
    if (config.budgetUsd > 0 && totalCostUsd >= config.budgetUsd) {
      const remaining = files.slice(i).map(f => f.path)
      budgetExceededFiles.push(...remaining)
      core.warning(`ai-review: budget cap $${config.budgetUsd} reached — skipping ${remaining.length} file(s)`)
      break
    }

    const batch = files.slice(i, i + maxConcurrent)
    const results = await Promise.allSettled(
      batch.map(f => reviewFileWithRetry(f, apiUrl, apiKey, config.model, systemPrompt, timeoutMs, 2))
    )

    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      const file = batch[j]
      if (r.status === 'fulfilled') {
        allFindings.push(...r.value.findings)
        totalCostUsd += r.value.costUsd
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        if (msg.includes('aborted') || msg.includes('timed out')) {
          timedOutFiles.push(file.path)
          core.warning(`ai-review: timed out reviewing ${file.path}`)
        } else {
          skippedFiles.push(file.path)
          core.warning(`ai-review: skipped ${file.path} — ${msg}`)
        }
      }
    }
  }

  return { findings: allFindings, skippedFiles, timedOutFiles, budgetExceededFiles, totalCostUsd }
}
