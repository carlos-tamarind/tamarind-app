CREATE TYPE public.page_embedding_status AS ENUM ('QUEUED','PROCESSING','RETRY_WAIT','EMBEDDED','FAILED');

CREATE TABLE public.page_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  "position" integer NOT NULL CHECK ("position" >= 0),
  content text NOT NULL CHECK (length(trim(content)) > 0),
  checksum text NOT NULL,
  token_count integer NOT NULL CHECK (token_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_chunks_page_position_key UNIQUE (page_id, "position")
);

CREATE INDEX idx_page_chunks_page_checksum ON public.page_chunks (page_id, checksum);

CREATE TABLE public.page_embeddings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chunk_id uuid NOT NULL REFERENCES public.page_chunks(id) ON DELETE CASCADE,
  embedding vector(1536),
  embedding_model text NOT NULL,
  embedding_status public.page_embedding_status NOT NULL DEFAULT 'QUEUED',
  checksum text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at timestamptz,
  last_error text,
  embedded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_embeddings_chunk_model_key UNIQUE (chunk_id, embedding_model),
  CONSTRAINT page_embeddings_embedded_requires_vector CHECK (embedding_status <> 'EMBEDDED' OR embedding IS NOT NULL)
);

CREATE INDEX idx_page_embeddings_queue
  ON public.page_embeddings (embedding_status, next_retry_at, created_at);

CREATE INDEX idx_page_embeddings_claimable
  ON public.page_embeddings (next_retry_at, created_at)
  WHERE embedding_status IN ('QUEUED', 'RETRY_WAIT');

CREATE INDEX idx_page_embeddings_vector
  ON public.page_embeddings USING hnsw (embedding vector_cosine_ops)
  WHERE embedding_status = 'EMBEDDED';

CREATE OR REPLACE FUNCTION public.set_page_chunks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_page_chunks_updated_at
  BEFORE UPDATE ON public.page_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_page_chunks_updated_at();

CREATE OR REPLACE FUNCTION public.set_page_embeddings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_page_embeddings_updated_at
  BEFORE UPDATE ON public.page_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.set_page_embeddings_updated_at();

GRANT SELECT ON public.page_chunks TO authenticated;
GRANT ALL ON public.page_chunks TO service_role;
GRANT SELECT ON public.page_embeddings TO authenticated;
GRANT ALL ON public.page_embeddings TO service_role;

ALTER TABLE public.page_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Page readers view page chunks"
  ON public.page_chunks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pages p WHERE p.id = page_chunks.page_id));

CREATE POLICY "Page readers view page embeddings"
  ON public.page_embeddings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.page_chunks c
    JOIN public.pages p ON p.id = c.page_id
    WHERE c.id = page_embeddings.chunk_id
  ));

-- Workers must bump updated_at while processing; updated_at is the stale heartbeat.
CREATE OR REPLACE FUNCTION public.claim_page_embedding_batch(
  p_batch_size int DEFAULT 20,
  p_stale_after interval DEFAULT '10 minutes'
)
RETURNS SETOF public.page_embeddings
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT s.id
    FROM (
      SELECT pe.id, 0 AS stage, pe.next_retry_at, pe.created_at
      FROM public.page_embeddings pe
      WHERE pe.embedding_status = 'PROCESSING'
        AND pe.updated_at < now() - p_stale_after
      UNION ALL
      SELECT pe.id, 1 AS stage, pe.next_retry_at, pe.created_at
      FROM public.page_embeddings pe
      WHERE pe.embedding_status IN ('QUEUED', 'RETRY_WAIT')
        AND (pe.next_retry_at IS NULL OR pe.next_retry_at <= now())
    ) s
    ORDER BY s.stage, s.next_retry_at NULLS FIRST, s.created_at
    LIMIT p_batch_size
  ),
  locked AS (
    SELECT pe.id
    FROM public.page_embeddings pe
    WHERE pe.id IN (SELECT id FROM candidates)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.page_embeddings pe
  SET embedding_status = 'PROCESSING',
      updated_at = now()
  WHERE pe.id IN (SELECT id FROM locked)
  RETURNING pe.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_page_embedding_batch(int, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_page_embedding_batch(int, interval) FROM anon;
REVOKE ALL ON FUNCTION public.claim_page_embedding_batch(int, interval) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_page_embedding_batch(int, interval) TO service_role;