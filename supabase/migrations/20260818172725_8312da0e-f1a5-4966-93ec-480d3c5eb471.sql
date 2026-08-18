
CREATE OR REPLACE FUNCTION public.can_read_page(_page_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pages p
    WHERE p.id = _page_id
      AND public.is_workspace_member(p.workspace_id)
      AND (
        p.visibility = 'workspace'::page_visibility
        OR p.visibility = 'external'::page_visibility
        OR (p.visibility = 'private'::page_visibility AND p.owner_workspace_user_id = public.current_workspace_user_id(p.workspace_id))
        OR (p.visibility = 'conversation'::page_visibility AND (
              (p.conversation_id IS NOT NULL AND public.is_conversation_participant(p.conversation_id))
              OR public.is_page_collaborator(p.id)
        ))
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_page(uuid) FROM anon;

DROP POLICY IF EXISTS "Page readers view page embeddings" ON public.page_embeddings;
CREATE POLICY "Page readers view page embeddings"
ON public.page_embeddings FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.page_chunks c
  WHERE c.id = page_embeddings.chunk_id AND public.can_read_page(c.page_id)
));

DROP POLICY IF EXISTS "Page readers view page semantics" ON public.page_semantics;
CREATE POLICY "Page readers view page semantics"
ON public.page_semantics FOR SELECT TO authenticated
USING (public.can_read_page(page_semantics.page_id));

DROP POLICY IF EXISTS "Page readers view page semantic jobs" ON public.page_semantic_jobs;
CREATE POLICY "Page readers view page semantic jobs"
ON public.page_semantic_jobs FOR SELECT TO authenticated
USING (public.can_read_page(page_semantic_jobs.page_id));
