GRANT SELECT ON public.message_embeddings TO authenticated;

CREATE POLICY "Participants view message embeddings"
  ON public.message_embeddings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.message_semantics ms
      JOIN public.messages m ON m.id = ms.message_id
      WHERE ms.id = message_embeddings.message_semantics_id
        AND public.is_conversation_participant(m.conversation_id)
    )
  );

CREATE OR REPLACE FUNCTION public.search_messages_semantic(
  p_workspace_id       uuid,
  p_embedding          vector(1536),
  p_limit              int,
  p_similarity_threshold   float4 DEFAULT 0.75,
  p_weight_similarity      float4 DEFAULT 0.8,
  p_weight_quality         float4 DEFAULT 0.1,
  p_weight_recency         float4 DEFAULT 0.1,
  p_recency_half_life_days float4 DEFAULT 180
)
RETURNS TABLE (
  asset_id         uuid,
  conversation_id  uuid,
  title            text,
  match_text       text,
  matched_field    public.search_matched_field,
  score            float4
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH nearest AS (
    SELECT
      m.id                          AS message_id,
      m.conversation_id,
      ms.normalized_text,
      ms.quality_score,
      me.created_at                 AS embedding_created_at,
      (1 - (me.embedding_vector <=> p_embedding)) AS semantic_similarity
    FROM public.message_embeddings me
    JOIN public.message_semantics ms ON ms.id = me.message_semantics_id
    JOIN public.messages m ON m.id = ms.message_id
    WHERE m.workspace_id = p_workspace_id
      AND me.is_active = true
    ORDER BY me.embedding_vector <=> p_embedding
    LIMIT p_limit * 3
  ),
  filtered AS (
    SELECT *
    FROM nearest
    WHERE semantic_similarity >= p_similarity_threshold
  ),
  scored AS (
    SELECT
      f.message_id,
      f.conversation_id,
      f.normalized_text,
      (
        p_weight_similarity * f.semantic_similarity
        + p_weight_quality * COALESCE(f.quality_score, 0)
        + p_weight_recency * exp(
            -EXTRACT(EPOCH FROM (now() - f.embedding_created_at))
            / 86400.0
            / p_recency_half_life_days
          )
      )::float4 AS final_score,
      ROW_NUMBER() OVER (
        PARTITION BY f.message_id
        ORDER BY (
          p_weight_similarity * f.semantic_similarity
          + p_weight_quality * COALESCE(f.quality_score, 0)
          + p_weight_recency * exp(
              -EXTRACT(EPOCH FROM (now() - f.embedding_created_at))
              / 86400.0
              / p_recency_half_life_days
            )
        ) DESC
      ) AS rn
    FROM filtered f
  )
  SELECT
    s.message_id     AS asset_id,
    s.conversation_id,
    NULL::text       AS title,
    s.normalized_text AS match_text,
    'content'::public.search_matched_field AS matched_field,
    s.final_score    AS score
  FROM scored s
  WHERE s.rn = 1
  ORDER BY s.final_score DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_messages_semantic(
  uuid, vector, int, float4, float4, float4, float4, float4
) TO authenticated;