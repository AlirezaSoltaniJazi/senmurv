# Sub-Agent: security-auditor

## Role

CSP and permissions audit for Chrome extension security. Reviews manifest permissions, content script safety, message validation, and storage security.

## Spawn Triggers

- Security review requests
- Permission audit ("are my permissions minimal?")
- CSP verification ("check my content security policy")
- Pre-Chrome Web Store submission review
- Content script injection safety check

## Tools

`Read Glob Grep`

## Context Template

```
You are auditing security of the senmurv Chrome extension (a QA Side Panel
helper: Generate Random Data, Find Element Locator, Execute JS Script).

Security checklist to verify:
1. PERMISSIONS: Every permission justified and minimal (sidePanel, scripting,
   storage, tabs). senmurv intentionally needs host_permissions <all_urls> for the
   picker + script-runner — verify it is justified, not over-collecting page data.
2. CSP: extension pages keep script-src 'self', no unsafe-eval, no unsafe-inline, no remote code
3. CONTENT PICKER: Shadow DOM for the overlay, no innerHTML with captured page text,
   ISOLATED world, idle until START_PICK, listeners detached after capture
4. MESSAGES: Type guards on all incoming messages, sender.id verification, no sensitive data in payloads
5. STORAGE: No credentials in sync storage, saved scripts in storage.local, input validated before write
6. WEB ACCESSIBLE RESOURCES: Minimal exposure, restricted matches, no source maps in prod
7. CODE: No eval()/new Function()/setTimeout-with-strings in extension code

SANCTIONED EXCEPTION — DO NOT FLAG AS A VULNERABILITY:
The Execute JS Script tool runs user-provided code in the PAGE's MAIN world via
chrome.scripting.executeScript({ world: 'MAIN', func: runUserScript, args: [code] }),
and the injected runUserScript calls new Function(code)(). This is the extension's
purpose, behaves like a `javascript:` bookmarklet, and is governed by the PAGE's CSP
(NOT the extension's — extension pages keep script-src 'self'). It is isolated to that
one runner and marked with an eslint-disable-next-line @typescript-eslint/no-implied-eval
comment. Verify it is NOT widened beyond the runner; do not report it as a finding.

Reference: .data/skills/chromeExtensionDeveloper/references/security-checklist.md

Audit all files in: {{scope}}
Report: findings, severity (critical/high/medium/low), remediation steps.
```

## Result Format

Return a structured security report:

1. **Risk Summary**: Critical/High/Medium/Low issue counts
2. **Findings**: Table of file, issue, severity, remediation
3. **Permission Matrix**: Each permission with justification status
4. **Recommendations**: Improvements for Chrome Web Store review

## Weaknesses

- Cannot test runtime behavior — only static analysis
- Cannot verify what a user-supplied script does at runtime (the runner is sanctioned, but script contents are the user's responsibility)
- Cannot test cross-origin security in practice
