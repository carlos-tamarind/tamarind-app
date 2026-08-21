-- 1. entity type
INSERT INTO public.entity_types (key, display_name)
VALUES ('page_chunk', 'Page chunk')
ON CONFLICT (key) DO NOTHING;

-- 2. backfill
INSERT INTO public.entities (id, workspace_id, entity_type_id, created_by_workspace_user_id, created_at, last_modified_at)
SELECT c.id, p.workspace_id, public.entity_type_id_for('page_chunk'),
       p.created_by_workspace_user_id, c.created_at, c.updated_at
FROM public.page_chunks c
JOIN public.pages p ON p.id = c.page_id
ON CONFLICT (id) DO NOTHING;

-- 3. lifecycle trigger
CREATE OR REPLACE FUNCTION public.sync_entity_from_page_chunk()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.entities (id, workspace_id, entity_type_id, created_by_workspace_user_id, created_at, last_modified_at)
    SELECT NEW.id, p.workspace_id, public.entity_type_id_for('page_chunk'),
           p.created_by_workspace_user_id, NEW.created_at, NEW.updated_at
    FROM public.pages p
    WHERE p.id = NEW.page_id
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.entities WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_entity_from_page_chunk() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_entity_from_page_chunk() TO service_role;
DROP TRIGGER IF EXISTS trg_sync_entity_from_page_chunk ON public.page_chunks;
CREATE TRIGGER trg_sync_entity_from_page_chunk
  AFTER INSERT OR DELETE ON public.page_chunks
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_from_page_chunk();

-- 4. search_pages_semantic returns chunk_id
DROP FUNCTION IF EXISTS public.search_pages_semantic(uuid, vector, int, float4, float4, float4, float4, text);

CREATE FUNCTION public.search_pages_semantic(
  p_workspace_id           uuid,
  p_embedding              vector(1536),
  p_limit                  int,
  p_similarity_threshold   float4 DEFAULT 0.3,
  p_weight_similarity      float4 DEFAULT 0.85,
  p_weight_recency         float4 DEFAULT 0.15,
  p_recency_half_life_days float4 DEFAULT 180,
  p_embedding_model        text DEFAULT 'text-embedding-3-small'
)
RETURNS TABLE (
  asset_id      uuid,
  chunk_id      uuid,
  title         text,
  match_text    text,
  matched_field public.search_matched_field,
  score         float4
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH nearest AS (
    SELECT
      p.id                AS page_id,
      c.id                AS chunk_id,
      p.title             AS page_title,
      p.last_modified_at,
      c.content,
      (1 - (pe.embedding <=> p_embedding)) AS semantic_similarity
    FROM public.page_chunk_embeddings pe
    JOIN public.page_chunks c ON c.id = pe.chunk_id
    JOIN public.pages p ON p.id = c.page_id
    WHERE p.workspace_id = p_workspace_id
      AND pe.embedding_status = 'EMBEDDED'
      AND pe.embedding_model = p_embedding_model
    ORDER BY pe.embedding <=> p_embedding
    LIMIT p_limit * 3
  ),
  filtered AS (
    SELECT *
    FROM nearest
    WHERE semantic_similarity >= p_similarity_threshold
  ),
  scored AS (
    SELECT
      f.page_id,
      f.chunk_id,
      f.page_title,
      f.content,
      (
        p_weight_similarity * f.semantic_similarity
        + p_weight_recency * exp(
            -EXTRACT(EPOCH FROM (now() - f.last_modified_at))
            / 86400.0
            / p_recency_half_life_days
          )
      )::float4 AS final_score,
      ROW_NUMBER() OVER (
        PARTITION BY f.page_id
        ORDER BY (
          p_weight_similarity * f.semantic_similarity
          + p_weight_recency * exp(
              -EXTRACT(EPOCH FROM (now() - f.last_modified_at))
              / 86400.0
              / p_recency_half_life_days
            )
        ) DESC
      ) AS rn
    FROM filtered f
  )
  SELECT
    s.page_id    AS asset_id,
    s.chunk_id   AS chunk_id,
    s.page_title AS title,
    s.content    AS match_text,
    'content'::public.search_matched_field AS matched_field,
    s.final_score AS score
  FROM scored s
  WHERE s.rn = 1
  ORDER BY s.final_score DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_pages_semantic(
  uuid, vector, int, float4, float4, float4, float4, text
) TO authenticated;