-- CTI engine read + atomic apply/commit RPCs.

CREATE OR REPLACE FUNCTION public.match_conversation_topics(
  p_conversation_id uuid,
  p_message_id uuid
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  name text,
  description text,
  embedding vector(1536),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  evidence_count integer,
  is_candidate boolean,
  historical_weight double precision,
  created_at timestamptz,
  updated_at timestamptz,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    t.id,
    t.conversation_id,
    t.name,
    t.description,
    t.embedding,
    t.first_seen_at,
    t.last_seen_at,
    t.evidence_count,
    t.is_candidate,
    t.historical_weight,
    t.created_at,
    t.updated_at,
    (1 - (t.embedding <=> me.embedding_vector))::real AS similarity
  FROM public.conversation_topics t
  CROSS JOIN (
    SELECT me.embedding_vector
    FROM public.message_semantics ms
    JOIN public.message_embeddings me ON me.message_semantics_id = ms.id
    WHERE ms.message_id = p_message_id
      AND me.is_active = true
    ORDER BY me.created_at DESC
    LIMIT 1
  ) me
  WHERE t.conversation_id = p_conversation_id
    AND t.embedding IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.match_conversation_topics(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_conversation_topics(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_cti_plan_and_commit(
  p_job_id uuid,
  p_plan jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  j public.conversation_topic_jobs;
  item jsonb;
  v_from uuid;
  v_to uuid;
  v_current uuid;
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

  FOR item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'topicsToInsert', '[]'::jsonb))
  LOOP
    INSERT INTO public.conversation_topics (
      id,
      conversation_id,
      name,
      description,
      embedding,
      historical_weight,
      evidence_count,
      is_candidate,
      last_seen_at,
      first_seen_at
    ) VALUES (
      (item->>'id')::uuid,
      (item->>'conversation_id')::uuid,
      NULLIF(item->>'name', ''),
      NULLIF(item->>'description', ''),
      (item->>'embedding')::vector,
      COALESCE((item->>'historical_weight')::double precision, 0),
      COALESCE((item->>'evidence_count')::integer, 1),
      COALESCE((item->>'is_candidate')::boolean, true),
      COALESCE((item->>'last_seen_at')::timestamptz, now()),
      COALESCE((item->>'first_seen_at')::timestamptz, now())
    );
  END LOOP;

  FOR item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'evidencesToInsert', '[]'::jsonb))
  LOOP
    INSERT INTO public.conversation_topic_evidences (
      topic_id,
      message_id,
      conversation_id,
      similarity
    ) VALUES (
      (item->>'topic_id')::uuid,
      (item->>'message_id')::uuid,
      (item->>'conversation_id')::uuid,
      (item->>'similarity')::real
    )
    ON CONFLICT (topic_id, message_id) DO NOTHING;
  END LOOP;

  FOR item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'topicsToUpdate', '[]'::jsonb))
  LOOP
    UPDATE public.conversation_topics t
    SET
      name = CASE WHEN item ? 'name' THEN NULLIF(item->>'name', '') ELSE t.name END,
      description = CASE WHEN item ? 'description' THEN NULLIF(item->>'description', '') ELSE t.description END,
      embedding = CASE
        WHEN item ? 'embedding' AND item->>'embedding' IS NOT NULL THEN (item->>'embedding')::vector
        ELSE t.embedding
      END,
      historical_weight = CASE
        WHEN item ? 'historical_weight' THEN (item->>'historical_weight')::double precision
        ELSE t.historical_weight
      END,
      evidence_count = CASE
        WHEN item ? 'evidence_count' THEN (item->>'evidence_count')::integer
        ELSE t.evidence_count
      END,
      is_candidate = CASE
        WHEN item ? 'is_candidate' THEN (item->>'is_candidate')::boolean
        ELSE t.is_candidate
      END,
      last_seen_at = CASE
        WHEN item ? 'last_seen_at' THEN (item->>'last_seen_at')::timestamptz
        ELSE t.last_seen_at
      END
    WHERE t.id = (item->>'id')::uuid;
  END LOOP;

  FOR item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_plan->'evidencesToMove', '[]'::jsonb))
  LOOP
    v_from := (item->>'from_topic_id')::uuid;
    v_to := (item->>'to_topic_id')::uuid;

    UPDATE public.conversation_topic_evidences e
    SET topic_id = v_to
    WHERE e.topic_id = v_from
      AND NOT EXISTS (
        SELECT 1
        FROM public.conversation_topic_evidences t
        WHERE t.topic_id = v_to
          AND t.message_id = e.message_id
      );

    DELETE FROM public.conversation_topic_evidences
    WHERE topic_id = v_from;
  END LOOP;

  IF p_plan ? 'currentTopicId' THEN
    IF p_plan->>'currentTopicId' IS NULL THEN
      v_current := NULL;
    ELSE
      v_current := (p_plan->>'currentTopicId')::uuid;
    END IF;

    UPDATE public.conversations
    SET current_topic_id = v_current
    WHERE id = j.conversation_id;
  END IF;

  DELETE FROM public.conversation_topics
  WHERE id IN (
    SELECT value::uuid
    FROM jsonb_array_elements_text(COALESCE(p_plan->'topicsToDelete', '[]'::jsonb))
  );

  UPDATE public.conversation_topic_jobs
  SET status = 'COMPLETED',
      completed_at = now(),
      last_error = NULL,
      next_retry_at = NULL,
      updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END $$;

REVOKE ALL ON FUNCTION public.apply_cti_plan_and_commit(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cti_plan_and_commit(uuid, jsonb) TO service_role;
