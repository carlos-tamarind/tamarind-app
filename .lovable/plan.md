## Goal

The embedding worker currently hangs off `scheduled()` in `src/server.ts`, which never fires. Replace it with a database-scheduled invocation of a secret-protected HTTP endpoint, running once per minute.

## Verified current state

- **`scheduled()` has never run.** Every `message_semantics` row has `last_processed_at = NULL`, including 2 rows sitting in `QUEUED` since 2026-07-28. Server logs show no worker ticks. The project also has no published deployment, and the managed deploy pipeline does not register the `triggers.crons` block in `wrangler.jsonc`.
- **`pg_cron` 1.6.4 and `pg_net` 0.20.3 are available but not installed** (`pg_available_extensions` shows both with `installed_version = NULL`).
- **pg_cron is operational, not merely listed.** `current_setting('cron.database_name')` returns `postgres`, so the pg_cron background worker is already loaded in `shared_preload_libraries` — `CREATE EXTENSION pg_cron` will actually schedule jobs. Lovable Cloud also exposes a Jobs surface (More → Cloud → Jobs), confirming database-scheduled jobs are the supported pattern for this architecture.
- `OPENAI_API_KEY` is already configured; no secret is needed for the embedding calls themselves.
- `claim_embedding_batch` already uses `FOR UPDATE SKIP LOCKED`, so overlapping ticks claim disjoint batches.

## One constraint to be aware of

On published sites, only routes under `/api/public/*` bypass the platform's edge auth gate. A route literally at `/api/internal/...` would be rejected at the edge before the handler runs, and `pg_net` has no way to present a user session — so the job would silently fail exactly like the cron trigger does today.

The plan therefore keeps the endpoint **private by authentication, not by path**: it lives at `/api/public/internal/run-embedding-worker` (reachable), and the handler rejects anything that does not present the scheduler's secret. Unauthenticated callers get an opaque `404`, so the route is undiscoverable and unusable by anyone but the cron job.

## What gets built

**1. A dedicated scheduler secret**

Generate a new high-entropy secret `EMBEDDING_WORKER_SECRET` — not the anon key, not the service-role key, but a credential whose only purpose is proving "I am the cron job". Stored in project secrets, read inside the handler via `process.env`.

**2. New route: `src/routes/api/public/internal/run-embedding-worker.ts`**

`POST` handler that, in order:
- Reads the `x-embedding-worker-secret` header.
- Compares it to `process.env.EMBEDDING_WORKER_SECRET` using constant-time comparison (`timingSafeEqual` over equal-length buffers) to avoid timing leaks.
- Returns a bare `404` (no body, no hint) on missing/mismatched secret, and `503` if the secret is not configured server-side.
- On success, runs `runEmbeddingWorker()` and returns `{ batchesProcessed, messagesProcessed }`.
- Logs each tick through `DebugLogger` so ticks are visible in server logs.

**3. Remove the dead cron path**

- Delete the `scheduled()` export and `runScheduledEmbeddingWorker` from `src/server.ts`, leaving the fetch entry and error normalization untouched.
- Remove the `triggers.crons` block from `wrangler.jsonc` so the file stops implying a schedule that never runs.
- Keep the existing dev-only `src/routes/api/run-embedding-worker.ts` for local manual testing.

**4. Database: enable extensions and schedule the job**

Migration: `CREATE EXTENSION IF NOT EXISTS pg_cron;` and `pg_net;` (run through the migration tool as the privileged `postgres` role).

Then, as a separate non-migration statement — it embeds the live secret and URL, which must not land in version-controlled migrations:

```sql
select cron.schedule(
  'run-embedding-worker',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--6c222d90-e90d-4100-a4e1-d2ef132f172e.lovable.app/api/public/internal/run-embedding-worker',
    headers := '{"Content-Type":"application/json","x-embedding-worker-secret":"<SECRET>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

The endpoint reads no body fields, so the body stays `{}`. The stable `project--<id>.lovable.app` host is used so renaming the project cannot break the schedule.

**5. Verification**

- Registration: `select jobname, schedule, active from cron.job;`
- Execution: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;`
- Effect: the 2 stuck `QUEUED` rows should move to `PROCESSING` then `EMBEDDED`, with `last_processed_at` populated.
- Negative test: a `POST` without the header must return `404`.

## Notes

- This only takes effect against a **published** deployment; until the site is published, the schedule will log connection failures in `cron.job_run_details`.
- Throughput is capped at `MAX_BATCHES_PER_TICK` per minute. If backlogs build up, a follow-up change can have the handler re-invoke itself while claimable rows remain.
- Version bump in `src/lib/version.ts` per project convention.
