CREATE INDEX IF NOT EXISTS idx_messages_conversation_unread
  ON public.messages (conversation_id, created_at)
  INCLUDE (author_workspace_user_id)
  WHERE purged_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_unread_conversation_summary_for_user(
  p_workspace_id uuid,
  p_workspace_user_id uuid
) RETURNS TABLE (
  conversation_id uuid,
  unread_count bigint,
  oldest_unread_message_id uuid,
  newest_unread_message_id uuid
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH my_conversations AS (
    SELECT cp.conversation_id, cp.last_read_at
    FROM public.conversation_participants cp
    WHERE cp.workspace_user_id = p_workspace_user_id
  ),
  unread AS (
    SELECT m.conversation_id, m.id, m.created_at
    FROM public.messages m
    JOIN my_conversations mc ON mc.conversation_id = m.conversation_id
    WHERE m.workspace_id = p_workspace_id
      AND m.purged_at IS NULL
      AND m.author_workspace_user_id IS DISTINCT FROM p_workspace_user_id
      AND m.created_at > mc.last_read_at
  )
  SELECT u.conversation_id, count(*),
    (array_agg(u.id ORDER BY u.created_at ASC))[1],
    (array_agg(u.id ORDER BY u.created_at DESC))[1]
  FROM unread u GROUP BY u.conversation_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_conversation_summary_for_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_conversation_summary_for_user(uuid, uuid) TO service_role;