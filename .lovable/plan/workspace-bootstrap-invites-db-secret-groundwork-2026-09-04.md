# Workspace Bootstrap Invites — DB + Secret Groundwork

## Scope

1. Create the `PLATFORM_OWNER_EMAILS` server-only secret with the initial allowlist:
   `rabadancm@gmail.com,carlos@tamarind.so`
   (comma-separated, lowercase; lives only as an env var — never in the DB).
2. Run one migration creating `public.workspace_bootstrap_invites`.
3. Regenerate `src/integrations/supabase/types.ts` (automatic after migration approval).
4. Update `docs/architecture/database.md` (table + migration timeline entry).

## Migration SQL

```sql
CREATE TABLE public.workspace_bootstrap_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  admin_email text,
  welcome_message text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workspace_bootstrap_invites_token ON public.workspace_bootstrap_invites(token);
CREATE TRIGGER trg_workspace_bootstrap_invites_lm BEFORE UPDATE ON public.workspace_bootstrap_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();

GRANT ALL ON public.workspace_bootstrap_invites TO service_role;
ALTER TABLE public.workspace_bootstrap_invites ENABLE ROW LEVEL SECURITY;
```

Deliberately no `authenticated`/`anon` grants or policies: all access flows through server functions using `supabaseAdmin`, with the platform-owner check enforced in app code — the same model already used for `workspace_invites`.

## Notes / flags worth knowing

- **No expiry validation constraint:** Postgres CHECK constraints must be immutable, so `expires_at > now()` can't be enforced at the table level. If we want DB-side validation later, it needs a trigger. For now, expiry will be validated in the server function (out of scope this turn).
- **One-time-use isn't DB-enforced:** `used_at` is set by app code; concurrent redemption of the same token is only safe if the future redeem function updates atomically (`UPDATE ... WHERE used_at IS NULL RETURNING`). Flagging now so the follow-up implementation uses that pattern.
- **No index on `expires_at`/`used_at`:** not needed yet (no cleanup worker). Add later if a sweep job appears.
- **`token UNIQUE` already indexed:** the separate `CREATE INDEX ... (token)` is redundant with the UNIQUE constraint's implicit index, but keeping it is harmless and documents intent.
- **Secret mechanism:** `PLATFORM_OWNER_EMAILS` is a user-provided value, so it can't be auto-generated — I'll store it as a runtime secret via the secrets tool with the exact value above. Rotation means updating the env var (no DB change).
- **No version bump:** this turn is DB + secret + docs only, matching the established convention (no app-code change).

## Out of scope (confirmed)

- The `/generate-workspace-invite` route, redeem flow, and any server functions / UI.
