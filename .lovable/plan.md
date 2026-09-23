# Close out the "admin actions without an admin role" findings

## What the scan is reporting

Four findings point at these addresses:

- `POST /api/run-purge-worker`
- `POST /api/run-canonical-topics-worker`
- `POST /api/run-page-semantic-worker`
- `POST /api/run-page-chunking-worker`

## Current state (verified)

`src/routes/api/` now contains only `pages.save.ts` and the `public` folder. All eight
unprotected `run-*-worker` files were deleted in the previous change, so none of the four
flagged addresses exist in the project any more. The only remaining way to run these jobs is
`src/routes/api/public/internal/run-*-worker.ts`, each of which requires a matching secret
header compared with a timing-safe check and returns 404 otherwise.

So the risk is already removed; the findings are stale results from the scan that ran before
the deletion.

## Plan

1. Re-run the security scan so the results reflect the current code.
2. Confirm the four findings no longer reproduce, and confirm no `run-*-worker` address is
   reachable without the secret header.
3. Mark the four findings as fixed with an explanation pointing at the deletion.
4. If the re-scan surfaces anything genuinely new in the same family, report it rather than
   silently clearing it.

## Technical notes

- No code changes, no package changes, no database changes are required.
- If re-scanning still lists the deleted routes, that is a caching artefact of the scanner;
  the finding is closed via `manage_security_finding` with the deletion as the justification.
- Version stays at 0.3.256 since no source change is involved.
