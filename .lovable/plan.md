# Schedule the CTI worker cron job

The embedding worker runs every minute in production; the CTI worker endpoint exists but nothing ever calls it. Confirmed: `CTI_WORKER_SECRET` is not set in the backend environment (`EMBEDDING_WORKER_SECRET` is), so even a scheduled call would currently return 503.

## Steps

1. **Create the secret**
   Generate a fresh high-entropy value (32 random bytes, base64url) — not reused from the embedding secret — and store it as the server-side secret `CTI_WORKER_SECRET`. This surfaces a secret dialog for approval.

2. **Schedule the cron job**
   Run, against the production database (data operation, not a migration):

   ```sql
   SELECT cron.schedule(
     'run-cti-worker',
     '* * * * *',
     $$
     SELECT net.http_post(
       url := 'https://project--6c222d90-e90d-4100-a4e1-d2ef132f172e.lovable.app/api/public/internal/run-cti-worker',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-cti-worker-secret', '<the new secret>'
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

   Same stable host as the embedding job, so a project rename cannot break it. `pg_cron` and `pg_net` are already enabled.

3. **Verify**
   - `cron.job` contains `run-cti-worker` with schedule `* * * * *`.
   - After a couple of minutes, `cron.job_run_details` shows successful runs and `net._http_response` shows HTTP 200 (not 404 → wrong secret, not 503 → secret missing on the server).
   - Backend logs show `[cti-worker-cron] TICK_COMPLETE · N jobs`.

## Notes

- The secret must be live in the deployed backend before the cron starts firing; if the deploy lags, early ticks return 503 and simply retry the next minute.
- No application code changes: the route, handler and worker already exist.
- Docs (`docs/deployment.md`, `docs/cron/readme.md`) already describe this step; optionally mark the CTI cron as configured.
