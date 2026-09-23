# Close the open background-worker endpoints

## The problem

Each background job (message embeddings, conversation topics, page embeddings, conversation suggestions, page chunking, page semantics, canonical topics, purge) can currently be started through two different web addresses:

- A protected one under `/api/public/internal/...` that requires a secret header. This is the one the scheduler actually calls.
- An unprotected duplicate under `/api/run-...` that only hides behind a development/debug switch. Whenever that switch is on, anyone on the internet can start the job — spending paid AI processing and changing workspace data, including permanent deletions in the purge job.

The scanner flagged four of these; the same flaw exists on all eight.

## The fix

Delete the eight unprotected duplicates. Nothing in the app calls them — the scheduler and all automated runs use the protected versions, which stay exactly as they are. Manual runs during development stay possible by calling the protected address with the secret header.

## Technical detail

Remove these files (`src/routes/api/`):

- `run-embedding-worker.ts`
- `run-cti-worker.ts`
- `run-page-embedding-worker.ts`
- `run-conversation-suggestion-worker.ts`
- `run-page-chunking-worker.ts`
- `run-page-semantic-worker.ts`
- `run-canonical-topics-worker.ts`
- `run-purge-worker.ts`

`src/routeTree.gen.ts` regenerates automatically. `src/routes/api/public/internal/*` (secret header + `timingSafeEqual`) is untouched, so pg_cron jobs keep working.

Update docs that reference the removed addresses: `docs/api/readme.md`, `docs/cron/readme.md`, `docs/architecture/overview.md`, `docs/architecture/deployment.md`, `docs/semantic/readme.md`, `docs/semantic/msg_embedding.md`, `docs/semantic/page_embedding.md`, `docs/semantic/conversation_topics.md`, `docs/semantic/conversation_suggestions.md`, `src/semantic/README.md` — replacing local-trigger examples with the `curl -H "x-<worker>-secret: ..."` form against the internal route.

Bump `src/lib/version.ts` (and the matching string in `src/routes/__root.tsx`) to 0.3.256, run `bunx tsgo --noEmit`, then mark the four findings fixed with the security tool. No packages added, no database changes.
