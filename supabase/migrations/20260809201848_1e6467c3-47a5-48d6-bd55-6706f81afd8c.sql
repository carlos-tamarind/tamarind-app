CREATE TABLE public.conversation_topics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  name text NULL,
  description text NULL,
  embedding vector(1536) NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  evidence_count integer NOT NULL DEFAULT 1,
  is_candidate boolean NOT NULL DEFAULT true,
  historical_weight double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_topics_evidence_count_check CHECK (evidence_count > 0),
  CONSTRAINT conversation_topics_historical_weight_check CHECK (historical_weight >= 0),
  CONSTRAINT conversation_topics_final_name_check CHECK (is_candidate = true OR name IS NOT NULL)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_topics TO authenticated;
GRANT ALL ON public.conversation_topics TO service_role;

ALTER TABLE public.conversation_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view conversation topics"
  ON public.conversation_topics FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants insert conversation topics"
  ON public.conversation_topics FOR INSERT TO authenticated
  WITH CHECK (public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants update conversation topics"
  ON public.conversation_topics FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(conversation_id))
  WITH CHECK (public.is_conversation_participant(conversation_id));

CREATE POLICY "Participants delete conversation topics"
  ON public.conversation_topics FOR DELETE TO authenticated
  USING (public.is_conversation_participant(conversation_id));

CREATE INDEX IF NOT EXISTS idx_conversation_topics_conversation_id
  ON public.conversation_topics (conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_topics_conversation_candidate
  ON public.conversation_topics (conversation_id, is_candidate);

CREATE OR REPLACE FUNCTION public.set_conversation_topics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_conversation_topics_updated_at
  BEFORE UPDATE ON public.conversation_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_conversation_topics_updated_at();

ALTER TABLE public.conversations
  ADD COLUMN current_topic_id uuid NULL
  REFERENCES public.conversation_topics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_current_topic_id
  ON public.conversations (current_topic_id);