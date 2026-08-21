-- Due-list: participant x conversation pairs ready for a suggestion pass
CREATE OR REPLACE FUNCTION public.list_conversation_suggestion_jobs_due(
  p_idle interval,
  p_limit integer
)
RETURNS TABLE(conversation_id uuid, workspace_id uuid, workspace_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.workspace_id, cp.workspace_user_id
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE c.current_topic_id IS NOT NULL
    -- last embedded message in the conversation is settled (older than the debounce)
    AND EXISTS (
      SELECT 1
      FROM public.messages m
      JOIN public.message_semantics ms ON ms.message_id = m.id
      WHERE m.conversation_id = c.id
        AND ms.embedding_status = 'EMBEDDED'
        AND m.created_at <= now() - p_idle
    )
    -- no negative-feedback cooldown in the last 14 days
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_suggestions s
      WHERE s.conversation_id = c.id
        AND s.workspace_user_id = cp.workspace_user_id
        AND s.feedback_type = 'negative'
        AND s.feedback_at > now() - interval '14 days'
    )
    -- no unexpired PENDING suggestion
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_suggestions s
      WHERE s.conversation_id = c.id
        AND s.workspace_user_id = cp.workspace_user_id
        AND s.status = 'PENDING'
        AND s.expires_at > now()
    )
    -- job missing, terminal, or a due RETRY_WAIT
    AND NOT EXISTS (
      SELECT 1 FROM public.conversation_suggestion_jobs j
      WHERE j.conversation_id = c.id
        AND j.workspace_user_id = cp.workspace_user_id
        AND (
          j.status IN ('QUEUED', 'PROCESSING')
          OR (j.status = 'RETRY_WAIT' AND (j.next_retry_at IS NULL OR j.next_retry_at > now()))
        )
    )
  ORDER BY c.last_modified_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

-- Enqueue: upsert the durable job row
CREATE OR REPLACE FUNCTION public.enqueue_conversation_suggestion_job(
  p_conversation_id uuid,
  p_workspace_user_id uuid
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.conversation_suggestion_jobs;
  v_workspace_id uuid;
BEGIN
  SELECT * INTO v_existing
  FROM public.conversation_suggestion_jobs
  WHERE conversation_id = p_conversation_id AND workspace_user_id = p_workspace_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'PROCESSING' THEN
      RETURN 'processing';
    END IF;

    UPDATE public.conversation_suggestion_jobs
    SET status = 'QUEUED',
        next_retry_at = NULL,
        started_at = NULL,
        completed_at = NULL,
        last_error = NULL
    WHERE id = v_existing.id;

    RETURN 'requeued';
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.conversations WHERE id = p_conversation_id;

  IF v_workspace_id IS NULL THEN
    RETURN 'not_found';
  END IF;

  INSERT INTO public.conversation_suggestion_jobs (conversation_id, workspace_id, workspace_user_id)
  VALUES (p_conversation_id, v_workspace_id, p_workspace_user_id)
  ON CONFLICT (conversation_id, workspace_user_id) DO NOTHING;

  RETURN 'enqueued';
END $$;

-- Claim one job
CREATE OR REPLACE FUNCTION public.claim_conversation_suggestion_job(
  p_stale_after interval
)
RETURNS public.conversation_suggestion_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.conversation_suggestion_jobs;
BEGIN
  SELECT * INTO v_job
  FROM public.conversation_suggestion_jobs j
  WHERE (
      j.status = 'QUEUED'
      OR (j.status = 'RETRY_WAIT' AND j.next_retry_at IS NOT NULL AND j.next_retry_at <= now())
      OR (j.status = 'PROCESSING' AND j.started_at IS NOT NULL AND j.started_at <= now() - p_stale_after)
    )
  ORDER BY COALESCE(j.next_retry_at, j.created_at) ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.conversation_suggestion_jobs
  SET status = 'PROCESSING',
      started_at = now(),
      attempts = attempts + 1,
      next_retry_at = NULL
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END $$;

-- Commit: insert the suggestion (or none) and complete the job atomically
CREATE OR REPLACE FUNCTION public.apply_conversation_suggestion_result(
  p_job_id uuid,
  p_entity_id uuid DEFAULT NULL,
  p_conversation_topic_id uuid DEFAULT NULL,
  p_entity_similarity_score real DEFAULT NULL,
  p_llm_confidence real DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notification_text text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_job public.conversation_suggestion_jobs;
BEGIN
  SELECT * INTO v_job
  FROM public.conversation_suggestion_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF v_job.status <> 'PROCESSING' THEN
    RETURN 'not_processing';
  END IF;

  -- expire stale PENDING rows so the partial unique index reflects reality
  UPDATE public.conversation_suggestions
  SET status = 'EXPIRED'
  WHERE conversation_id = v_job.conversation_id
    AND workspace_user_id = v_job.workspace_user_id
    AND status = 'PENDING'
    AND expires_at <= now();

  IF p_entity_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.conversation_suggestions s
      WHERE s.conversation_id = v_job.conversation_id
        AND s.workspace_user_id = v_job.workspace_user_id
        AND s.status = 'PENDING'
    ) THEN
      UPDATE public.conversation_suggestion_jobs
      SET status = 'COMPLETED', completed_at = now(), started_at = NULL, last_error = NULL
      WHERE id = v_job.id;
      RETURN 'already_pending';
    END IF;

    INSERT INTO public.conversation_suggestions (
      workspace_id, workspace_user_id, conversation_id, entity_id, conversation_topic_id,
      entity_similarity_score, llm_confidence, reason, notification_text, expires_at
    ) VALUES (
      v_job.workspace_id, v_job.workspace_user_id, v_job.conversation_id, p_entity_id, p_conversation_topic_id,
      p_entity_similarity_score, p_llm_confidence, p_reason, p_notification_text,
      COALESCE(p_expires_at, now() + interval '48 hours')
    );
  END IF;

  UPDATE public.conversation_suggestion_jobs
  SET status = 'COMPLETED', completed_at = now(), started_at = NULL, last_error = NULL
  WHERE id = v_job.id;

  RETURN CASE WHEN p_entity_id IS NULL THEN 'committed_none' ELSE 'committed' END;
END $$;

REVOKE ALL ON FUNCTION public.list_conversation_suggestion_jobs_due(interval, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_conversation_suggestion_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_conversation_suggestion_job(interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_conversation_suggestion_result(uuid, uuid, uuid, real, real, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_conversation_suggestion_jobs_due(interval, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_conversation_suggestion_job(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_conversation_suggestion_job(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_conversation_suggestion_result(uuid, uuid, uuid, real, real, text, text, timestamptz) TO service_role;