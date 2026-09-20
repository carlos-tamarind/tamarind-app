-- Prevent members from escalating their own privileges via the self-update policy.
CREATE OR REPLACE FUNCTION public.prevent_workspace_user_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / superuser style access (no JWT) is trusted server-side code.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.role_id IS DISTINCT FROM OLD.role_id
      OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.id IS DISTINCT FROM OLD.id)
     AND NOT public.has_workspace_role(OLD.workspace_id, 'admin'::workspace_role)
  THEN
    RAISE EXCEPTION 'Only workspace admins can change membership role or ownership fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_workspace_user_privilege_escalation ON public.workspace_users;
CREATE TRIGGER trg_prevent_workspace_user_privilege_escalation
BEFORE UPDATE ON public.workspace_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_workspace_user_privilege_escalation();

REVOKE ALL ON FUNCTION public.prevent_workspace_user_privilege_escalation() FROM PUBLIC, anon, authenticated;