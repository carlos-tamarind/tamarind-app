-- 1. Shared ordering predicate
CREATE OR REPLACE FUNCTION public.cti_is_next_processable(_conversation_id uuid, _message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.messages e
    JOIN public.messages m ON m.id = _message_id
    WHERE e.conversation_id = _conversation_id
      AND e.id <> m.id
      AND (e.created_at, e.id) < (m.created_at, m.id)
      AND (
        EXISTS (
          SELECT 1 FROM public.conversation_topic_jobs je
          WHERE je.message_id = e.id AND je.status <> 'COMPLETED'
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.message_semantics s
            WHERE s.message_id = e.id
              AND s.embedding_status IN ('NEW','QUEUED','PROCESSING','EMBEDDED')
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.conversation_topic_jobs jc
            WHERE jc.message_id = e.id AND jc.status = 'COMPLETED'
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.cti_is_next_processable(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cti_is_next_processable(uuid, uuid) TO service_role;

-- 2. Claim only next-in-conversation jobs
CREATE OR REPLACE FUNCTION public.claim_conversation_topic_job(p_stale_after interval DEFAULT '00:10:00'::interval)
RETURNS conversation_topic_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed public.conversation_topic_jobs;
  cand record;
  locked_id uuid;
BEGIN
  UPDATE public.conversation_topic_jobs j
  SET status = 'QUEUED', processing_started_at = NULL, updated_at = now()
  WHERE j.status = 'PROCESSING'
    AND j.processing_started_at IS NOT NULL
    AND j.processing_started_at < now() - p_stale_after;

  FOR cand IN
    SELECT j.id, j.conversation_id, j.message_id
    FROM public.conversation_topic_jobs j
    JOIN public.messages m ON m.id = j.message_id
    WHERE j.status = 'QUEUED'
      AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
    ORDER BY m.created_at, m.id
  LOOP
    IF NOT public.cti_is_next_processable(cand.conversation_id, cand.message_id) THEN
      CONTINUE;
    END IF;

    SELECT j.id INTO locked_id
    FROM public.conversation_topic_jobs j
    WHERE j.id = cand.id
      AND j.status = 'QUEUED'
      AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
    FOR UPDATE SKIP LOCKED;

    IF locked_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.conversation_topic_jobs j
    SET status = 'PROCESSING',
        processing_started_at = now(),
        attempt_count = j.attempt_count + 1,
        updated_at = now()
    WHERE j.id = locked_id
    RETURNING j.* INTO claimed;

    RETURN claimed;
  END LOOP;

  RETURN NULL;
END $$;

-- 3. Single-transaction completion / release
CREATE OR REPLACE FUNCTION public.commit_cti_job(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE j public.conversation_topic_jobs;
BEGIN
  SELECT * INTO j FROM public.conversation_topic_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(j.conversation_id::text, 0));

  SELECT * INTO j FROM public.conversation_topic_jobs WHERE id = p_job_id FOR UPDATE;

  IF j.status <> 'PROCESSING' THEN
    RETURN 'not_processing';
  END IF;

  IF NOT public.cti_is_next_processable(j.conversation_id, j.message_id) THEN
    RETURN 'not_next';
  END IF;

  UPDATE public.conversation_topic_jobs
  SET status = 'COMPLETED',
      completed_at = now(),
      last_error = NULL,
      next_retry_at = NULL,
      updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END $$;

CREATE OR REPLACE FUNCTION public.release_conversation_topic_job(p_job_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversation_topic_jobs
  SET status = 'QUEUED',
      processing_started_at = NULL,
      attempt_count = greatest(attempt_count - 1, 0),
      updated_at = now()
  WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.commit_cti_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_cti_job(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_conversation_topic_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_conversation_topic_job(uuid) TO service_role;

-- 4. Gate job creation on EMBEDDED
CREATE OR REPLACE FUNCTION public.cti_jobs_require_embedded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.message_semantics s
    WHERE s.message_id = NEW.message_id
      AND s.embedding_status = 'EMBEDDED'
  ) THEN
    RAISE EXCEPTION 'conversation_topic_jobs: message % is not EMBEDDED', NEW.message_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cti_jobs_require_embedded ON public.conversation_topic_jobs;
CREATE TRIGGER trg_cti_jobs_require_embedded
BEFORE INSERT ON public.conversation_topic_jobs
FOR EACH ROW EXECUTE FUNCTION public.cti_jobs_require_embedded();

CREATE OR REPLACE FUNCTION public.finalize_embedded_message(p_message_semantics_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_message_id uuid;
BEGIN
  UPDATE public.message_semantics
  SET embedding_status = 'EMBEDDED',
      last_processed_at = now(),
      last_error = NULL,
      next_retry_at = NULL,
      updated_at = now()
  WHERE id = p_message_semantics_id
  RETURNING message_id INTO v_message_id;

  IF v_message_id IS NULL THEN
    RAISE EXCEPTION 'message_semantics % not found', p_message_semantics_id;
  END IF;

  INSERT INTO public.conversation_topic_jobs (message_id, conversation_id)
  SELECT m.id, m.conversation_id
  FROM public.messages m
  WHERE m.id = v_message_id
  ON CONFLICT (message_id) DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION public.finalize_embedded_message(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_embedded_message(uuid) TO service_role;

-- 5. Supporting indexes
CREATE INDEX IF NOT EXISTS idx_conversation_topic_jobs_message_status
  ON public.conversation_topic_jobs (message_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_id
  ON public.messages (conversation_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_message_semantics_message_status
  ON public.message_semantics (message_id, embedding_status);