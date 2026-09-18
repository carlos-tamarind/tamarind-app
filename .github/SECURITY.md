# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Tamarind, please report it responsibly by sending an email to **`carlos@tamarind.so`** with "SECURITY" in the subject line. Do not open a public GitHub issue or discussion for security vulnerabilities.

Please include:
- A description of the vulnerability
- Steps to reproduce the issue
- The impact and severity (if known, using CVSS or your own assessment)
- Any suggested remediation

## Response Timeline

- **Acknowledgment:** We aim to acknowledge your report within 48 hours.
- **Resolution:** We target fixing and releasing a patch within 30–90 days, depending on complexity and severity.
- **Disclosure:** We will make a public security advisory 90 days after your initial report, or sooner if a patch is released and deployed.

## Scope

**In-scope:**
- Security issues in the Tamarind application code and server infrastructure in this repository
- Authentication, authorization, and access control flaws
- Data exposure or leakage vulnerabilities
- RLS and database security bypass issues

**Out-of-scope:**
- Third-party dependencies (report directly to the maintainers of those projects)
- Lovable Cloud Auth platform (report to Lovable directly)
- Supabase platform or PostgreSQL (report to Supabase)
- OpenAI API or embedding service (report to OpenAI)
- Issues requiring a specific user's pre-existing account or credentials (unless you can show a privilege escalation or unauthorized access path)

## Security Architecture

To better understand Tamarind's security design, please refer to:
- [Authentication & Authorization](../docs/architecture/auth.md) — JWT sessions, RLS, workspace roles, and OAuth flows
- [Database Security](../docs/architecture/database.md) — Row-level security policies and access control helpers
- [Deployment & Environment](../docs/architecture/deployment.md) — Secrets management and server-side configuration

## Credit

If you report a vulnerability that we confirm and fix, we are happy to credit you in our release notes (with your permission). Just let us know in your report if you'd like public acknowledgment.

## Security Updates

Subscribe to GitHub release notifications to stay informed about security patches and updates.
