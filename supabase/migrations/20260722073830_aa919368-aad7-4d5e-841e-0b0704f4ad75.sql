-- Enum
CREATE TYPE public.embedding_status AS ENUM ('NEW','QUEUED','PROCESSING','EMBEDDED','FAILED','SKIPPED');

-- Table
CREATE TABLE public.message_semantics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  normalized_text TEXT NOT NULL,
  checksum VARCHAR(64) NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'en',
  quality_score NUMERIC(3,2) NOT NULL DEFAULT 0.0,
  processable BOOLEAN NOT NULL DEFAULT TRUE,
  embedding_status public.embedding_status NOT NULL DEFAULT 'NEW',
  last_error TEXT,
  last_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_semantics_quality_score_check CHECK (quality_score >= 0 AND quality_score <= 1)
);

CREATE INDEX message_semantics_embedding_status_idx ON public.message_semantics(embedding_status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_message_semantics_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_message_semantics_updated_at
BEFORE UPDATE ON public.message_semantics
FOR EACH ROW EXECUTE FUNCTION public.set_message_semantics_updated_at();

-- Grants
GRANT SELECT ON public.message_semantics TO authenticated;
GRANT ALL ON public.message_semantics TO service_role;

-- RLS
ALTER TABLE public.message_semantics ENABLE ROW LEVEL SECURITY;

-- Users may read semantics rows for messages in conversations they participate in.
CREATE POLICY "Participants view message semantics"
ON public.message_semantics FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_semantics.message_id
      AND public.is_conversation_participant(m.conversation_id)
  )
);
-- Writes are pipeline-only via service_role; no INSERT/UPDATE/DELETE policies for authenticated.
