DROP POLICY IF EXISTS "Page readers view page chunks" ON public.page_chunks;

CREATE POLICY "Page readers view page chunks"
ON public.page_chunks
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pages p
    WHERE p.id = page_chunks.page_id
      AND public.is_workspace_member(p.workspace_id)
      AND (
        p.visibility = 'workspace'::page_visibility
        OR p.visibility = 'external'::page_visibility
        OR (p.visibility = 'private'::page_visibility
            AND p.owner_workspace_user_id = public.current_workspace_user_id(p.workspace_id))
        OR (p.visibility = 'conversation'::page_visibility
            AND ((p.conversation_id IS NOT NULL AND public.is_conversation_participant(p.conversation_id))
                 OR public.is_page_collaborator(p.id)))
      )
  )
);