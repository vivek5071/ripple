const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /gh[pos]_[A-Za-z0-9_]{36,}/g,
  /Bearer\s+[A-Za-z0-9\-._~+\/]+=*/g,
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]+?-----END [\w ]*PRIVATE KEY-----/g,
  /(?:api[-_]?key|api[-_]?secret|access[-_]?token|client[-_]?secret)\s*[=:]\s*["']?[A-Za-z0-9_\-]{16,}["']?/gi,
  /(?:password|passwd|pwd)\s*[=:]\s*["'][^"']{8,}["']/gi,
]

export function sanitizeDiff(diff: string): { sanitized: string; redactedCount: number } {
  let result = diff
  let count = 0
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, () => {
      count++
      return '[REDACTED]'
    })
  }
  return { sanitized: result, redactedCount: count }
}
