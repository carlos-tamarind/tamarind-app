-- Explicit-user ACL helpers (the auth.uid()-based ones are useless under service_role)
CREATE OR REPLACE FUNCTION public.is_workspace_member_as(_workspace_id uuid, _workspace_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.id = _workspace_user_id AND wu.workspace_id = _workspace_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant_as(_conversation_id uuid, _workspace_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND cp.workspace_user_id = _workspace_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_page_collaborator_as(_page_id uuid, _workspace_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.page_collaborators pc
    WHERE pc.page_id = _page_id AND pc.workspace_user_id = _workspace_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_page_as(_page_id uuid, _workspace_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pages p
    WHERE p.id = _page_id
      AND public.is_workspace_member_as(p.workspace_id, _workspace_user_id)
      AND (
        p.visibility = 'workspace'::page_visibility
        OR p.visibility = 'external'::page_visibility
        OR (p.visibility = 'private'::page_visibility AND p.owner_workspace_user_id = _workspace_user_id)
        OR (p.visibility = 'conversation'::page_visibility AND (
              (p.conversation_id IS NOT NULL AND public.is_conversation_participant_as(p.conversation_id, _workspace_user_id))
              OR public.is_page_collaborator_as(p.id, _workspace_user_id)
        ))
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member_as(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_conversation_participant_as(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_page_collaborator_as(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_read_page_as(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member_as(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant_as(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_page_collaborator_as(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_read_page_as(uuid, uuid) TO service_role;

-- User-scoped semantic search wrappers (same ranking, ACL applied for an explicit user)
CREATE OR REPLACE FUNCTION public.search_pages_semantic_for_user(
  p_workspace_user_id uuid,
  p_workspace_id uuid,
  p_embedding vector,
  p_limit integer,
  p_similarity_threshold real DEFAULT 0.3,
  p_weight_similarity real DEFAULT 0.85,
  p_weight_recency real DEFAULT 0.15,
  p_recency_half_life_days real DEFAULT 180,
  p_embedding_model text DEFAULT 'text-embedding-3-small'
)
RETURNS TABLE(asset_id uuid, chunk_id uuid, title text, match_text text, matched_field search_matched_field, score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT r.asset_id, r.chunk_id, r.title, r.match_text, r.matched_field, r.score
  FROM public.search_pages_semantic(
    p_workspace_id,
    p_embedding,
    GREATEST(p_limit * 4, p_limit),
    p_similarity_threshold,
    p_weight_similarity,
    p_weight_recency,
    p_recency_half_life_days,
    p_embedding_model
  ) r
  WHERE public.can_read_page_as(r.asset_id, p_workspace_user_id)
  ORDER BY r.score DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.search_messages_semantic_for_user(
  p_workspace_user_id uuid,
  p_workspace_id uuid,
  p_embedding vector,
  p_limit integer,
  p_similarity_threshold real DEFAULT 0.75,
  p_weight_similarity real DEFAULT 0.8,
  p_weight_quality real DEFAULT 0.1,
  p_weight_recency real DEFAULT 0.1,
  p_recency_half_life_days real DEFAULT 180
)
RETURNS TABLE(asset_id uuid, conversation_id uuid, title text, match_text text, matched_field search_matched_field, score real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT r.asset_id, r.conversation_id, r.title, r.match_text, r.matched_field, r.score
  FROM public.search_messages_semantic(
    p_workspace_id,
    p_embedding,
    GREATEST(p_limit * 4, p_limit),
    p_similarity_threshold,
    p_weight_similarity,
    p_weight_quality,
    p_weight_recency,
    p_recency_half_life_days
  ) r
  WHERE public.is_conversation_participant_as(r.conversation_id, p_workspace_user_id)
  ORDER BY r.score DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.search_pages_semantic_for_user(uuid, uuid, vector, integer, real, real, real, real, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_messages_semantic_for_user(uuid, uuid, vector, integer, real, real, real, real, real) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_pages_semantic_for_user(uuid, uuid, vector, integer, real, real, real, real, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_messages_semantic_for_user(uuid, uuid, vector, integer, real, real, real, real, real) TO service_role;