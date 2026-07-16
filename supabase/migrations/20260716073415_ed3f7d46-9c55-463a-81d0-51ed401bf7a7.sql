CREATE OR REPLACE FUNCTION public.is_page_collaborator(_page_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.page_collaborators pc
    JOIN public.workspace_users wu ON wu.id = pc.workspace_user_id
    WHERE pc.page_id = _page_id
      AND wu.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Page visibility read" ON public.pages;
CREATE POLICY "Page visibility read" ON public.pages
FOR SELECT USING (
  is_workspace_member(workspace_id) AND (
    visibility = 'workspace'::page_visibility
    OR visibility = 'external'::page_visibility
    OR (visibility = 'private'::page_visibility
        AND owner_workspace_user_id = current_workspace_user_id(workspace_id))
    OR (visibility = 'conversation'::page_visibility
        AND (
          (conversation_id IS NOT NULL AND is_conversation_participant(conversation_id))
          OR public.is_page_collaborator(pages.id)
        ))
  )
);