CREATE TYPE public.search_matched_field AS ENUM ('title', 'content', 'name');

CREATE INDEX IF NOT EXISTS idx_workspace_users_display_name_trgm
  ON public.workspace_users USING gin (display_name extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_pages_keyword(
  p_workspace_id uuid,
  p_query text,
  p_limit int
)
RETURNS TABLE (
  asset_id uuid,
  title text,
  match_text text,
  matched_field public.search_matched_field,
  score float4
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH scored AS (
    SELECT
      p.id,
      p.title,
      p.plain_text,
      similarity(p.title, p_query) AS title_score,
      similarity(p.plain_text, p_query) AS content_score
    FROM public.pages p
    WHERE p.workspace_id = p_workspace_id
      AND (p.title % p_query OR p.plain_text % p_query)
  )
  SELECT
    s.id AS asset_id,
    s.title,
    CASE
      WHEN s.title_score >= s.content_score THEN s.title
      ELSE s.plain_text
    END AS match_text,
    CASE
      WHEN s.title_score >= s.content_score THEN 'title'::public.search_matched_field
      ELSE 'content'::public.search_matched_field
    END AS matched_field,
    greatest(s.title_score, s.content_score) AS score
  FROM scored s
  ORDER BY score DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.search_conversations_keyword(
  p_workspace_id uuid,
  p_query text,
  p_limit int
)
RETURNS TABLE (
  asset_id uuid,
  title text,
  match_text text,
  matched_field public.search_matched_field,
  score float4
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH scored AS (
    SELECT
      c.id,
      c.title,
      similarity(c.title, p_query) AS title_score
    FROM public.conversations c
    WHERE c.workspace_id = p_workspace_id
      AND c.title IS NOT NULL
      AND c.title % p_query
  )
  SELECT
    s.id AS asset_id,
    s.title,
    s.title AS match_text,
    'title'::public.search_matched_field AS matched_field,
    s.title_score AS score
  FROM scored s
  ORDER BY score DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.search_messages_keyword(
  p_workspace_id uuid,
  p_query text,
  p_limit int
)
RETURNS TABLE (
  asset_id uuid,
  conversation_id uuid,
  title text,
  match_text text,
  matched_field public.search_matched_field,
  score float4
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH scored AS (
    SELECT
      m.id,
      m.conversation_id,
      ms.normalized_text,
      similarity(ms.normalized_text, p_query) AS content_score
    FROM public.message_semantics ms
    JOIN public.messages m ON m.id = ms.message_id
    WHERE m.workspace_id = p_workspace_id
      AND ms.normalized_text % p_query
  )
  SELECT
    s.id AS asset_id,
    s.conversation_id,
    NULL::text AS title,
    s.normalized_text AS match_text,
    'content'::public.search_matched_field AS matched_field,
    s.content_score AS score
  FROM scored s
  ORDER BY score DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.search_people_keyword(
  p_workspace_id uuid,
  p_query text,
  p_limit int
)
RETURNS TABLE (
  asset_id uuid,
  title text,
  match_text text,
  matched_field public.search_matched_field,
  score float4
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH scored AS (
    SELECT
      c.id AS conversation_id,
      c.title,
      wu.display_name,
      similarity(wu.display_name, p_query) AS name_score
    FROM public.conversation_participants cp
    JOIN public.workspace_users wu ON wu.id = cp.workspace_user_id
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE c.workspace_id = p_workspace_id
      AND wu.display_name IS NOT NULL
      AND wu.display_name % p_query
  ),
  best_per_conversation AS (
    SELECT DISTINCT ON (conversation_id)
      conversation_id,
      title,
      display_name,
      name_score
    FROM scored
    ORDER BY conversation_id, name_score DESC
  )
  SELECT
    b.conversation_id AS asset_id,
    b.title,
    b.display_name AS match_text,
    'name'::public.search_matched_field AS matched_field,
    b.name_score AS score
  FROM best_per_conversation b
  ORDER BY score DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_pages_keyword(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_conversations_keyword(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_messages_keyword(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_people_keyword(uuid, text, int) TO authenticated;