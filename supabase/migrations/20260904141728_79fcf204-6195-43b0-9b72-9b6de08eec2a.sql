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