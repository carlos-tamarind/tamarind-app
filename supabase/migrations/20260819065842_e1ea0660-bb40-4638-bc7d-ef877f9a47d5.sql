CREATE OR REPLACE FUNCTION public.search_pages_semantic(
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
      p.title             AS page_title,
      p.last_modified_at,
      c.content,
      (1 - (pe.embedding <=> p_embedding)) AS semantic_similarity
    FROM public.page_embeddings pe
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