DROP FUNCTION IF EXISTS public.list_conversation_suggestion_jobs_due(interval, integer);

CREATE OR REPLACE FUNCTION public.list_conversation_suggestion_jobs_due(
  p_idle interval,
  p_cooldown interval,
  p_limit integer
)
RETURNS TABLE(conversation_id uuid, workspace_id uuid, workspace_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.workspace_id, cp.workspace_user_id
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE c.current_topic_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.message_semantics ms ON ms.message_id = m.id
      WHERE m.conversation_id = c.id
        AND ms.embedding_status = 'EMBEDDED'
        AND m.created_at <= now() - p_idle
    )
    -- negative-feedback cooldown supplied by the caller
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_suggestions s
      WHERE s.conversation_id = c.id
        AND s.workspace_user_id = cp.workspace_user_id
        AND s.feedback_type = 'negative'
        AND s.feedback_at > now() - p_cooldown
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_suggestions s
      WHERE s.conversation_id = c.id
        AND s.workspace_user_id = cp.workspace_user_id
        AND s.status = 'PENDING'
        AND s.expires_at > now()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_suggestion_jobs j
      WHERE j.conversation_id = c.id
        AND j.workspace_user_id = cp.workspace_user_id
        AND (
          j.status IN ('QUEUED', 'PROCESSING')
          OR (j.status = 'RETRY_WAIT' AND (j.next_retry_at IS NULL OR j.next_retry_at > now()))
        )
    )
  ORDER BY c.last_modified_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.list_conversation_suggestion_jobs_due(interval, interval, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_conversation_suggestion_jobs_due(interval, interval, integer) TO service_role;