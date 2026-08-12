CREATE TABLE public.conversation_topic_evidences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.conversation_topics(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  similarity real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_topic_evidences_topic_message_key UNIQUE (topic_id, message_id),
  CONSTRAINT conversation_topic_evidences_similarity_check CHECK (similarity >= 0 AND similarity <= 1)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_topic_evidences TO authenticated;
GRANT ALL ON public.conversation_topic_evidences TO service_role;

ALTER TABLE public.conversation_topic_evidences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view topic evidences"
  ON public.conversation_topic_evidences FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_topics t
    WHERE t.id = conversation_topic_evidences.topic_id
      AND public.is_conversation_participant(t.conversation_id)
  ));

CREATE POLICY "Participants insert topic evidences"
  ON public.conversation_topic_evidences FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversation_topics t
    WHERE t.id = conversation_topic_evidences.topic_id
      AND public.is_conversation_participant(t.conversation_id)
  ));

CREATE POLICY "Participants update topic evidences"
  ON public.conversation_topic_evidences FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_topics t
    WHERE t.id = conversation_topic_evidences.topic_id
      AND public.is_conversation_participant(t.conversation_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversation_topics t
    WHERE t.id = conversation_topic_evidences.topic_id
      AND public.is_conversation_participant(t.conversation_id)
  ));

CREATE POLICY "Participants delete topic evidences"
  ON public.conversation_topic_evidences FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_topics t
    WHERE t.id = conversation_topic_evidences.topic_id
      AND public.is_conversation_participant(t.conversation_id)
  ));

CREATE INDEX IF NOT EXISTS idx_conversation_topic_evidences_topic_id
  ON public.conversation_topic_evidences (topic_id);

CREATE INDEX IF NOT EXISTS idx_conversation_topic_evidences_message_id
  ON public.conversation_topic_evidences (message_id);

CREATE INDEX IF NOT EXISTS idx_conversation_topic_evidences_topic_created
  ON public.conversation_topic_evidences (topic_id, created_at);