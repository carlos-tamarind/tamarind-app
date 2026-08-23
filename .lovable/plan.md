# Purge worker: routes, runner, secret, cron, docs

Completes the entity-deletion groundwork with the same split used for the page-semantic worker: thin HTTP routes, a placeholder runner, a dedicated secret, an hourly cron job, and ops docs. No UI, no mention rewrite.

## HTTP routes

`src/routes/api/public/internal/run-purge-worker.ts` (POST)
- Reads `PURGE_WORKER_SECRET` inside the handler; 503 + `SECRET_NOT_CONFIGURED` log when unset.
- Header `x-purge-worker-secret`, timing-safe compare, opaque 404 on missing/mismatch.
- Logs `TICK_COMPLETE` / `TICK_FAILED` under scope `purge-worker-cron`.

`src/routes/api/run-purge-worker.ts` (POST, dev-only mirror)
- 404 unless `import.meta.env.DEV` or `VITE_DEBUG_LOGS=true`. No secret header.

Both mirror the existing page-semantic route files exactly.

## Placeholder runner

`src/lib/delete-entities/worker/runPurgeWorker.ts`

Tick contract:
1. (Optional, logged only) read `purgeable_entity_types` ordered by `purge_order` and log the walked types.
2. Clearly marked `TODO` hook where mention/quote rewrite will run before purging — no rewrite logic yet.
3. `supabaseAdmin.rpc("purge_due_entities")` with no `p_entity_ids` — global sweep.
4. Aggregate the returned rows into `{ purged: number; byType: Record<string, number> }`.

No table names hardcoded in the delete path; the RPC walks the registry. Safe today — nothing sets `purged_at`, so the sweep returns empty.

## Secret

Mint a fresh high-entropy `PURGE_WORKER_SECRET` (no reuse of embedding / CTI / page / suggestion secrets) and store it as a backend secret. Header: `x-purge-worker-secret`.

## Cron (hourly)

After a build containing the prod route is live, schedule:

```text
SELECT cron.schedule(
  'run-purge-worker',
  '0 * * * *',
  $$ SELECT net.http_post(
       url := '<prod-host>/api/public/internal/run-purge-worker',
       headers := jsonb_build_object('Content-Type','application/json','x-purge-worker-secret','<secret>'),
       body := '{}'::jsonb) $$
);
```

Verify with `SELECT * FROM cron.job WHERE jobname = 'run-purge-worker';` and a manual POST. `pg_cron` and `pg_net` are already enabled. No SQL migration for the cron job.

## Docs

- `docs/deployment.md` — env table row, local required list, new "Purge Worker Cron" section with the SQL.
- `docs/api/readme.md` — both routes in the summary table plus auth/response sections.
- `docs/cron/readme.md` — diagram, worker section, dev manual trigger list.
- `docs/architecture/overview.md` — the two route rows only.

Unchanged: `docs/architecture/database.md`, `src/integrations/supabase/types.ts`.

## Out of scope

Trash/recover/erase-now UI, mention rewrite to `[Deleted page]`, `DELETE_GRACE_PERIOD_MS`, page server functions, message trash UI.

## Version

Bump `src/lib/version.ts` to `0.3.135` unless you prefer another number.
