# Security Policy

[Português](SECURITY.md) · **English** · [Español](SECURITY.es.md)

## Supported versions

Security fixes are applied only to the latest version published on the Marketplace.

| Version | Supported |
|---|---|
| 0.2.x | ✅ |
| < 0.2 | ❌ |

## Reporting a vulnerability

**Do not open a public issue** for security flaws.

Use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the flaw, its impact and, if possible, steps to reproduce.

Direct link: <https://github.com/carlosdealmeida/claude-todos-vscode/security/advisories/new>

## What to expect

- **Acknowledgement:** within 5 business days.
- **Initial assessment:** within 10 business days, with an estimated fix timeline.
- You are kept informed of progress until resolution.
- Once fixed, we publish a GitHub Security Advisory crediting the reporter (unless anonymity is requested).

## Scope

This extension is fully local and never talks to a server. The following are considered in scope, among others:

- Arbitrary code execution from data read out of Claude Code transcripts.
- Path traversal or writes outside the expected directories.
- Exposure of sensitive data (secrets, transcript content) beyond what is needed.

Out of scope: vulnerabilities in development dependencies that are not bundled into the published `.vsix`.
