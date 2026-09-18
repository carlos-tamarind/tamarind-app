# MIT licensing: audit, cleanup, and README update

## Audit results (already verified)

**Dependency licensing — clear for MIT.**
All 83 direct dependencies are MIT (80), Apache-2.0 (2), or ISC (1). Across all 486 installed packages: MIT, ISC, Apache-2.0, BSD-2/3, MPL-2.0 (3), LGPL-3.0-or-later (2), CC0, Unlicense, BlueOak. No GPL, AGPL, SSPL, BUSL, or non-commercial packages. MPL-2.0 and LGPL are file-level/dynamic-link copyleft and do not affect the license of this project's own source. No blocker.

**Authorship.** Commits come from the owner's two accounts plus Lovable and Dependabot bots. No third-party contributor whose consent would be needed.

**Sensitive-data scan — three real issues, all in tracked files:**

1. `.env` is committed. It holds the backend project ID, URL, and the publishable (anon) key. These are client-side values by design, but committing them publicly exposes the backend endpoint to anyone, and `.gitignore` only ignores `.env.*`, not `.env`.
2. The `.lovable/` planning folder is committed (44 files) even though `.gitignore` lists it — it was added before the rule. It contains internal planning notes and one personal email address (`rabadancm@gmail.com`, in the workspace-bootstrap plan).
3. The README documents `SUPABASE_SERVICE_ROLE_KEY` as a required variable without warning that it must never be client-side or committed.

**Clean:** no API keys, private keys, passwords, tokens, or worker-secret values anywhere in source, migrations, or docs — every reference is by variable name. Migrations contain no seeded personal data. The only email-like strings in code are placeholders and test fixtures (`alice@example.com`).

## Changes to make

1. **Add `LICENSE`** at the project root: standard MIT text, `Copyright (c) 2026 Carlos Rabadán`.
2. **`package.json`**: add `"license": "MIT"`. Leave `"private": true` as is (it only blocks accidental npm publishing).
3. **Stop tracking `.env`**: remove it from version control while keeping the local file, and add a bare `.env` line to `.gitignore`. Add a committed `.env.example` listing variable names with empty values, since the README already points at it.
4. **Stop tracking `.lovable/`**: remove the folder from version control (files stay on disk; `.gitignore` already covers it). This also removes the personal email from the public tree.
5. **README**: replace "Proprietary. All rights reserved." with an MIT section pointing at `LICENSE`, add an MIT badge line at the top, and add a short security note to Getting Started — `SUPABASE_SERVICE_ROLE_KEY` is server-only and never committed; `.env` stays local.
6. **`.claude` / `.cursor`**: nothing to do — neither folder exists on disk, neither is tracked in version control, and `.gitignore` already lists both. Verified, no change needed.

## Important caveat: git history

Removing `.env` and `.lovable/` from the current tree does **not** remove them from past commits — the publishable key and the planning notes remain readable in history to anyone who clones a public repo. Options:

- **Accept it** (reasonable): the exposed values are publishable/anon-tier, protected by row-level security, and the planning notes are not secret. Nothing here is a credential that grants privileged access.
- **Rewrite history** (`git filter-repo`) before going public: clean, but rewrites every commit hash and is not something I can run here — git history operations are outside what I can do in this project.

My recommendation: accept, and additionally rotate nothing since no privileged credential was ever committed. If you want the history scrubbed, do that locally before the first public push.

## Out of scope

No source-code changes, no per-file license headers, no version bump.
