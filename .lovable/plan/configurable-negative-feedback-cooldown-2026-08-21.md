# Configurable negative-feedback cooldown

`list_conversation_suggestion_jobs_due` hardcodes `interval '14 days'` for the negative-feedback cooldown, so any TypeScript cooldown constant shorter than that can never take effect. The fix parameterizes the cooldown the same way `p_idle` already is.

## 1. Migration — new signature

- `DROP FUNCTION public.list_conversation_suggestion_jobs_due(interval, integer);` (argument list changes, so a plain `CREATE OR REPLACE` is not enough).
- Recreate as `list_conversation_suggestion_jobs_due(p_idle interval, p_cooldown interval, p_limit integer)`, identical body except the negative-feedback branch becomes `s.feedback_at > now() - p_cooldown`.
- Keep everything else unchanged: `STABLE SECURITY DEFINER`, `SET search_path = public`, ordering, `LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)`.
- Re-issue grants for the new signature: `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO service_role` (matching the current grants; no `authenticated` execute).

## 2. Generated types

Regenerate `src/integrations/supabase/types.ts` so the RPC entry reflects the three-argument signature.

## 3. Documentation

Update `docs/architecture/database.md` (function signature in the conversation-suggestions section and the migration timeline). Note in the suggestions/cron docs that the cooldown is supplied by the caller, with the exploration default of 120h rather than 14 days, and that the due-list is an optimization while the TypeScript constant remains the source of truth — the worker re-checks the last negative `feedback_at` after claiming a job.

## 4. Version

Bump `src/lib/version.ts` to `0.3.121`.

## Out of scope

No engine/config module, no worker changes, no call-site wiring — the worker is still the inert placeholder and has no caller of this RPC today. Those land with the suggestion engine, which will pass `p_idle` and `p_cooldown` from `src/semantic/conversation-suggestions/engine/config.ts` using `PAGE_SEMANTIC_IDLE_INTERVAL`-style helpers.
