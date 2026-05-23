# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| v1.x    | ✅        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email **vivekkumardev8@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact

You'll receive a response within 48 hours. If the issue is confirmed, a fix will be released as soon as possible and you'll be credited in the release notes (unless you prefer otherwise).

## Scope

Ripple runs as a GitHub Actions workflow with the following permissions:

- `contents: read` — reads the repo to perform git blame and file scanning
- `pull-requests: write` — posts comments and requests reviewers

It does **not** store any code, file paths, or PR content outside the GitHub Actions runner. All processing happens ephemerally within the workflow run.
