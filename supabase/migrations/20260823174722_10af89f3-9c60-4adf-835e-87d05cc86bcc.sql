-- 1. Scrub-not-delete for messages in purge_due_entities
CREATE OR REPLACE FUNCTION public.purge_due_entities(p_entity_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(entity_type text, id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  due_ids uuid[];
BEGIN
  FOR r IN
    SELECT t.entity_type_key, t.table_name
    FROM public.purgeable_entity_types t
    ORDER BY t.purge_order, t.entity_type_key
  LOOP
    IF r.entity_type_key = 'message' THEN
      -- Scrub strategy: keep the row as a tombstone so the placeholder survives.
      SELECT array_agg(m.id) INTO due_ids
      FROM public.messages m
      WHERE m.purged_at IS NOT NULL
        AND m.purged_at <= now()
        AND (p_entity_ids IS NULL OR m.id = ANY(p_entity_ids));

      IF due_ids IS NOT NULL AND array_length(due_ids, 1) > 0 THEN
        DELETE FROM public.conversation_topic_evidences e WHERE e.message_id = ANY(due_ids);
        DELETE FROM public.conversation_topic_jobs j WHERE j.message_id = ANY(due_ids);
        DELETE FROM public.message_semantics s WHERE s.message_id = ANY(due_ids);

        UPDATE public.messages m
        SET raw_text = ''
        WHERE m.id = ANY(due_ids)
          AND m.raw_text <> '';

        RETURN QUERY SELECT r.entity_type_key::text, u.id FROM unnest(due_ids) AS u(id);
      END IF;
    ELSE
      -- Generic strategy: hard delete (pages and any future delete-on-purge type).
      RETURN QUERY EXECUTE format(
        'DELETE FROM public.%I d
           WHERE d.purged_at IS NOT NULL
             AND d.purged_at <= now()
             AND ($1 IS NULL OR d.id = ANY($1))
         RETURNING %L::text, d.id',
        r.table_name, r.entity_type_key
      ) USING p_entity_ids;
    END IF;
  END LOOP;
END;
$function$;

-- 2. Hide trashed messages from search
CREATE OR REPLACE FUNCTION public.search_messages_keyword(p_workspace_id uuid, p_query text, p_limit integer)
 RETURNS TABLE(asset_id uuid, conversation_id uuid, title text, match_text text, matched_field search_matched_field, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH scored AS (
    SELECT
      m.id,
      m.conversation_id,
      ms.normalized_text,
      similarity(ms.normalized_text, p_query) AS content_score
    FROM public.message_semantics ms
    JOIN public.messages m ON m.id = ms.message_id
    WHERE m.workspace_id = p_workspace_id
      AND m.purged_at IS NULL
      AND ms.normalized_text ILIKE '%' || public.escape_ilike_pattern(p_query) || '%' ESCAPE '\'
  )
  SELECT
    s.id AS asset_id,
    s.conversation_id,
    NULL::text AS title,
    s.normalized_text AS match_text,
    'content'::public.search_matched_field AS matched_field,
    s.content_score AS score
  FROM scored s
  ORDER BY score DESC
  LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.search_messages_semantic(p_workspace_id uuid, p_embedding vector, p_limit integer, p_similarity_threshold real DEFAULT 0.75, p_weight_similarity real DEFAULT 0.8, p_weight_quality real DEFAULT 0.1, p_weight_recency real DEFAULT 0.1, p_recency_half_life_days real DEFAULT 180)
 RETURNS TABLE(asset_id uuid, conversation_id uuid, title text, match_text text, matched_field search_matched_field, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  WITH nearest AS (
    SELECT
      m.id                          AS message_id,
      m.conversation_id,
      ms.normalized_text,
      ms.quality_score,
      me.created_at                 AS embedding_created_at,
      (1 - (me.embedding_vector <=> p_embedding)) AS semantic_similarity
    FROM public.message_embeddings me
    JOIN public.message_semantics ms ON ms.id = me.message_semantics_id
    JOIN public.messages m ON m.id = ms.message_id
    WHERE m.workspace_id = p_workspace_id
      AND m.purged_at IS NULL
      AND me.is_active = true
    ORDER BY me.embedding_vector <=> p_embedding
    LIMIT p_limit * 3
  ),
  filtered AS (
    SELECT *
    FROM nearest
    WHERE semantic_similarity >= p_similarity_threshold
  ),
  scored AS (
    SELECT
      f.message_id,
      f.conversation_id,
      f.normalized_text,
      (
        p_weight_similarity * f.semantic_similarity
        + p_weight_quality * COALESCE(f.quality_score, 0)
        + p_weight_recency * exp(
            -EXTRACT(EPOCH FROM (now() - f.embedding_created_at))
            / 86400.0
            / p_recency_half_life_days
          )
      )::float4 AS final_score,
      ROW_NUMBER() OVER (
        PARTITION BY f.message_id
        ORDER BY (
          p_weight_similarity * f.semantic_similarity
          + p_weight_quality * COALESCE(f.quality_score, 0)
          + p_weight_recency * exp(
              -EXTRACT(EPOCH FROM (now() - f.embedding_created_at))
              / 86400.0
              / p_recency_half_life_days
            )
        ) DESC
      ) AS rn
    FROM filtered f
  )
  SELECT
    s.message_id     AS asset_id,
    s.conversation_id,
    NULL::text       AS title,
    s.normalized_text AS match_text,
    'content'::public.search_matched_field AS matched_field,
    s.final_score    AS score
  FROM scored s
  WHERE s.rn = 1
  ORDER BY s.final_score DESC
  LIMIT p_limit;
$function$;

-- 3. Do not stall CTI on trashed messages
CREATE OR REPLACE FUNCTION public.cti_is_next_processable(_conversation_id uuid, _message_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.messages e
    JOIN public.messages m ON m.id = _message_id
    WHERE e.conversation_id = _conversation_id
      AND e.id <> m.id
      AND e.purged_at IS NULL
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
              AND s.embedding_status IN ('QUEUED','PROCESSING','EMBEDDED')
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.conversation_topic_jobs jc
            WHERE jc.message_id = e.id
              AND jc.status IN ('COMPLETED','QUARANTINED')
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.claim_conversation_topic_job(p_stale_after interval DEFAULT '00:10:00'::interval)
 RETURNS conversation_topic_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND m.purged_at IS NULL
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
END $function$;