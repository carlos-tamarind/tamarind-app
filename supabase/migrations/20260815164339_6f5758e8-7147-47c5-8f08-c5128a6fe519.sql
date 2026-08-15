-- 1. enum + table
CREATE TYPE public.cti_job_status AS ENUM ('QUEUED','PROCESSING','COMPLETED','FAILED');

CREATE TABLE public.conversation_topic_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  status public.cti_job_status NOT NULL DEFAULT 'QUEUED',
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_retry_at timestamptz,
  processing_started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conversation_topic_jobs TO authenticated;
GRANT ALL ON public.conversation_topic_jobs TO service_role;
ALTER TABLE public.conversation_topic_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view topic jobs" ON public.conversation_topic_jobs
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id));

CREATE OR REPLACE FUNCTION public.set_conversation_topic_jobs_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER trg_conversation_topic_jobs_updated_at
BEFORE UPDATE ON public.conversation_topic_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_conversation_topic_jobs_updated_at();

CREATE INDEX idx_conversation_topic_jobs_conv_status ON public.conversation_topic_jobs (conversation_id, status, next_retry_at, created_at);
CREATE INDEX idx_conversation_topic_jobs_conv_message ON public.conversation_topic_jobs (conversation_id, message_id);
CREATE INDEX idx_conversation_topic_jobs_status ON public.conversation_topic_jobs (status, next_retry_at, created_at);

-- 2. claiming RPC
CREATE OR REPLACE FUNCTION public.claim_conversation_topic_job(p_stale_after interval DEFAULT '10 minutes')
RETURNS public.conversation_topic_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE claimed public.conversation_topic_jobs;
BEGIN
  UPDATE public.conversation_topic_jobs j
  SET status = 'QUEUED', processing_started_at = NULL, updated_at = now()
  WHERE j.status = 'PROCESSING'
    AND j.processing_started_at IS NOT NULL
    AND j.processing_started_at < now() - p_stale_after;

  WITH candidate AS (
    SELECT j.id
    FROM public.conversation_topic_jobs j
    JOIN public.messages m ON m.id = j.message_id
    WHERE j.status = 'QUEUED'
      AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
    ORDER BY m.created_at, m.id
    LIMIT 1
    FOR UPDATE OF j SKIP LOCKED
  )
  UPDATE public.conversation_topic_jobs j
  SET status = 'PROCESSING',
      processing_started_at = now(),
      attempt_count = j.attempt_count + 1,
      updated_at = now()
  FROM candidate c
  WHERE j.id = c.id
  RETURNING j.* INTO claimed;

  RETURN claimed;
END $$;

REVOKE ALL ON FUNCTION public.claim_conversation_topic_job(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_conversation_topic_job(interval) TO service_role;

-- 3. conversation-level advisory locks
CREATE OR REPLACE FUNCTION public.cti_lock_conversation(_conversation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(_conversation_id::text, 0));
$$;

CREATE OR REPLACE FUNCTION public.cti_try_lock_conversation(_conversation_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pg_try_advisory_xact_lock(hashtextextended(_conversation_id::text, 0));
$$;

REVOKE ALL ON FUNCTION public.cti_lock_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cti_try_lock_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cti_lock_conversation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cti_try_lock_conversation(uuid) TO service_role;

-- 5. cross-conversation integrity
ALTER TABLE public.messages ADD CONSTRAINT messages_id_conversation_key UNIQUE (id, conversation_id);
ALTER TABLE public.conversation_topics ADD CONSTRAINT conversation_topics_id_conversation_key UNIQUE (id, conversation_id);

ALTER TABLE public.conversation_topic_evidences ADD COLUMN conversation_id uuid;
UPDATE public.conversation_topic_evidences e
SET conversation_id = t.conversation_id
FROM public.conversation_topics t
WHERE t.id = e.topic_id;
ALTER TABLE public.conversation_topic_evidences ALTER COLUMN conversation_id SET NOT NULL;

ALTER TABLE public.conversation_topic_evidences DROP CONSTRAINT conversation_topic_evidences_topic_id_fkey;
ALTER TABLE public.conversation_topic_evidences DROP CONSTRAINT conversation_topic_evidences_message_id_fkey;
ALTER TABLE public.conversation_topic_evidences
  ADD CONSTRAINT conversation_topic_evidences_topic_conv_fkey
  FOREIGN KEY (topic_id, conversation_id)
  REFERENCES public.conversation_topics(id, conversation_id) ON DELETE CASCADE;
ALTER TABLE public.conversation_topic_evidences
  ADD CONSTRAINT conversation_topic_evidences_message_conv_fkey
  FOREIGN KEY (message_id, conversation_id)
  REFERENCES public.messages(id, conversation_id) ON DELETE CASCADE;

ALTER TABLE public.conversations DROP CONSTRAINT conversations_current_topic_id_fkey;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_current_topic_conv_fkey
  FOREIGN KEY (current_topic_id, id)
  REFERENCES public.conversation_topics(id, conversation_id) ON DELETE SET NULL;

-- 6. established topic constraint
ALTER TABLE public.conversation_topics DROP CONSTRAINT conversation_topics_final_name_check;
ALTER TABLE public.conversation_topics
  ADD CONSTRAINT conversation_topics_established_check
  CHECK (is_candidate = true OR (name IS NOT NULL AND description IS NOT NULL AND embedding IS NOT NULL));

-- 7. pipeline ownership
DROP POLICY "Participants insert topic evidences" ON public.conversation_topic_evidences;
DROP POLICY "Participants update topic evidences" ON public.conversation_topic_evidences;
DROP POLICY "Participants delete topic evidences" ON public.conversation_topic_evidences;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_topic_evidences FROM authenticated;

DROP POLICY "Participants insert conversation topics" ON public.conversation_topics;
DROP POLICY "Participants update conversation topics" ON public.conversation_topics;
DROP POLICY "Participants delete conversation topics" ON public.conversation_topics;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_topics FROM authenticated;