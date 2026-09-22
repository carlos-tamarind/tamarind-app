CREATE OR REPLACE FUNCTION public.workspace_user_current_role_id(_workspace_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role_id FROM public.workspace_users WHERE id = _workspace_user_id
$$;

REVOKE ALL ON FUNCTION public.workspace_user_current_role_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workspace_user_current_role_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.workspace_user_current_role_id(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can update their own membership profile" ON public.workspace_users;

CREATE POLICY "Users can update their own membership profile"
ON public.workspace_users
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND role_id = public.workspace_user_current_role_id(id)
);