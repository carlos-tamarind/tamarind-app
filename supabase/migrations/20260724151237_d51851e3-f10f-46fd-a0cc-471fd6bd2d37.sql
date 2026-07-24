
ALTER TABLE public.message_semantics
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NULL;

CREATE TABLE public.message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_semantics_id UUID NOT NULL REFERENCES public.message_semantics(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  embedding_vector VECTOR(1536) NOT NULL,
  token_count INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.message_embeddings TO service_role;

ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_message_embeddings_semantic
  ON public.message_embeddings (message_semantics_id);

CREATE INDEX idx_message_embeddings_vector
  ON public.message_embeddings
  USING hnsw (embedding_vector vector_cosine_ops);

CREATE INDEX idx_message_embeddings_active
  ON public.message_embeddings (is_active);

CREATE INDEX idx_message_semantics_queue
  ON public.message_semantics (next_retry_at, created_at)
  WHERE embedding_status = 'QUEUED';
