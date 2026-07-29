ALTER TABLE public.message_embeddings DROP COLUMN IF EXISTS token_count;

CREATE INDEX IF NOT EXISTS idx_message_embeddings_semantic
  ON public.message_embeddings (message_semantics_id);

CREATE INDEX IF NOT EXISTS idx_message_embeddings_vector
  ON public.message_embeddings USING hnsw (embedding_vector vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_message_semantics_status_processed
  ON public.message_semantics (embedding_status, last_processed_at);

CREATE OR REPLACE FUNCTION public.claim_embedding_batch(
  p_batch_size int DEFAULT 20,
  p_stale_after interval DEFAULT '10 minutes'
)
RETURNS SETOF public.message_semantics
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT s.id
    FROM (
      SELECT ms.id, 0 AS stage, ms.next_retry_at, ms.created_at
      FROM public.message_semantics ms
      WHERE ms.embedding_status = 'PROCESSING'
        AND ms.last_processed_at IS NOT NULL
        AND ms.last_processed_at < now() - p_stale_after
      UNION ALL
      SELECT ms.id, 1 AS stage, ms.next_retry_at, ms.created_at
      FROM public.message_semantics ms
      WHERE ms.embedding_status = 'QUEUED'
        AND ms.processable = true
        AND (ms.next_retry_at IS NULL OR ms.next_retry_at <= now())
    ) s
    ORDER BY s.stage, s.next_retry_at NULLS FIRST, s.created_at
    LIMIT p_batch_size
  ),
  locked AS (
    SELECT ms.id
    FROM public.message_semantics ms
    WHERE ms.id IN (SELECT id FROM candidates)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.message_semantics ms
  SET embedding_status = 'PROCESSING',
      last_processed_at = now(),
      updated_at = now()
  WHERE ms.id IN (SELECT id FROM locked)
  RETURNING ms.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_embedding_batch(int, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_embedding_batch(int, interval) FROM anon;
REVOKE ALL ON FUNCTION public.claim_embedding_batch(int, interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_embedding_batch(int, interval) TO service_role;