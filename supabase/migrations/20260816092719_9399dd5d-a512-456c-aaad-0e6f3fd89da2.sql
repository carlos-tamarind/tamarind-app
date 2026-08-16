-- 1. Enum replacement
ALTER TYPE public.cti_job_status RENAME TO cti_job_status_old;
CREATE TYPE public.cti_job_status AS ENUM ('QUEUED','PROCESSING','COMPLETED','RETRY_WAIT','QUARANTINED');

ALTER TABLE public.conversation_topic_jobs ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.conversation_topic_jobs
  ALTER COLUMN status TYPE public.cti_job_status
  USING (CASE WHEN status::text = 'FAILED' THEN 'QUARANTINED' ELSE status::text END)::public.cti_job_status;
ALTER TABLE public.conversation_topic_jobs ALTER COLUMN status SET DEFAULT 'QUEUED'::public.cti_job_status;

DROP TYPE public.cti_job_status_old;

-- 2. Ordering predicate treats QUARANTINED as settled
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
          WHERE je.message_id = e.id
            AND je.status NOT IN ('COMPLETED','QUARANTINED')
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.message_semantics s
            WHERE s.message_id = e.id
              AND s.embedding_status IN ('NEW','QUEUED','PROCESSING','EMBEDDED')
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.conversation_topic_jobs jc
            WHERE jc.message_id = e.id
              AND jc.status IN ('COMPLETED','QUARANTINED')
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.cti_is_next_processable(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cti_is_next_processable(uuid, uuid) TO service_role;

-- 3. Claim considers QUEUED and RETRY_WAIT
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
    WHERE j.status IN ('QUEUED','RETRY_WAIT')
      AND (j.next_retry_at IS NULL OR j.next_retry_at <= now())
    ORDER BY m.created_at, m.id
  LOOP
    IF NOT public.cti_is_next_processable(cand.conversation_id, cand.message_id) THEN
      CONTINUE;
    END IF;

    SELECT j.id INTO locked_id
    FROM public.conversation_topic_jobs j
    WHERE j.id = cand.id
      AND j.status IN ('QUEUED','RETRY_WAIT')
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

REVOKE ALL ON FUNCTION public.claim_conversation_topic_job(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation_topic_job(interval) TO service_role;