-- Canonical topics: owner index, rename updated_at -> last_modified_at, regenerate-on-REMOVE flag

-- 1. Owner index for grouping / visibility joins
CREATE INDEX IF NOT EXISTS idx_canonical_topic_evidences_owner
  ON public.canonical_topic_evidences (source_type, owning_entity_id);

-- 2. Rename updated_at -> last_modified_at (schema-wide convention)
DROP TRIGGER IF EXISTS trg_canonical_topics_updated_at ON public.canonical_topics;
ALTER TABLE public.canonical_topics RENAME COLUMN updated_at TO last_modified_at;
CREATE TRIGGER trg_canonical_topics_last_modified_at
  BEFORE UPDATE ON public.canonical_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
DROP FUNCTION IF EXISTS public.set_canonical_topics_updated_at();

-- 3. Regeneration flag
ALTER TABLE public.canonical_topics
  ADD COLUMN needs_regeneration boolean NOT NULL DEFAULT false,
  ADD COLUMN regeneration_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_canonical_topics_needs_regeneration
  ON public.canonical_topics (workspace_id) WHERE needs_regeneration;

CREATE OR REPLACE FUNCTION public.clear_canonical_topic_regen_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.needs_regeneration := false;
    NEW.regeneration_requested_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_canonical_topics_clear_regen_flag
  BEFORE UPDATE ON public.canonical_topics
  FOR EACH ROW EXECUTE FUNCTION public.clear_canonical_topic_regen_flag();

-- Commit RPCs (only the canonical_topics timestamp column + REMOVE flag change)
CREATE OR REPLACE FUNCTION public.apply_canonical_topic_add_and_commit(p_job_id uuid, p_result jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  j public.canonical_topic_jobs;
  v_topic_id uuid;
  v_name text;
  v_description text;
  v_embedding vector(1536);
  v_embedding_model text;
  v_owning_entity_id uuid;
  v_similarity real;
  v_decision text;
  v_existing_id uuid;
  v_match_threshold double precision := 0.92;
  v_matched_id uuid;
  v_should_update_embedding boolean;
BEGIN
  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(j.workspace_id::text, 1));

  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id FOR UPDATE;
  IF j.status <> 'PROCESSING' THEN
    RETURN 'not_processing';
  END IF;

  v_name := NULLIF(p_result->>'name', '');
  v_description := NULLIF(p_result->>'description', '');
  v_embedding := CASE WHEN p_result ? 'embedding' AND p_result->>'embedding' IS NOT NULL THEN (p_result->>'embedding')::vector ELSE NULL END;
  v_embedding_model := COALESCE(NULLIF(p_result->>'embedding_model', ''), 'text-embedding-3-small');
  v_owning_entity_id := (p_result->>'owning_entity_id')::uuid;
  v_similarity := COALESCE((p_result->>'similarity')::real, 0);
  v_decision := COALESCE(p_result->>'decision', 'create');
  v_existing_id := (p_result->>'canonical_topic_id')::uuid;

  IF v_name IS NULL OR v_description IS NULL OR v_embedding IS NULL OR v_owning_entity_id IS NULL THEN
    RAISE EXCEPTION 'Missing required fields in add result for job %', p_job_id;
  END IF;

  -- If the caller asked to create, re-run the nearest-match check under the lock.
  IF v_decision = 'create' THEN
    SELECT t.id INTO v_matched_id
    FROM public.canonical_topics t
    WHERE t.workspace_id = j.workspace_id
      AND 1 - (t.embedding <=> v_embedding) >= v_match_threshold
    ORDER BY t.embedding <=> v_embedding
    LIMIT 1;

    IF v_matched_id IS NOT NULL THEN
      v_decision := 'reinforce';
      v_existing_id := v_matched_id;
    END IF;
  END IF;

  IF v_decision = 'reinforce' AND v_existing_id IS NOT NULL THEN
    SELECT embedding INTO v_embedding
    FROM public.canonical_topics
    WHERE id = v_existing_id
    FOR UPDATE;

    v_should_update_embedding := (p_result->>'update_embedding')::boolean;

    UPDATE public.canonical_topics
    SET
      name = CASE WHEN p_result ? 'name' THEN v_name ELSE name END,
      description = CASE WHEN p_result ? 'description' THEN v_description ELSE description END,
      embedding = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN v_embedding ELSE embedding END,
      embedding_model = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN v_embedding_model ELSE embedding_model END,
      evidence_count = evidence_count + 1,
      regenerated_at = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN now() ELSE regenerated_at END,
      generation_model = CASE WHEN v_should_update_embedding AND v_embedding IS NOT NULL THEN v_embedding_model ELSE generation_model END,
      last_evidence_at = now(),
      last_modified_at = now()
    WHERE id = v_existing_id
    RETURNING id INTO v_topic_id;
  ELSE
    INSERT INTO public.canonical_topics (
      workspace_id, name, description, embedding, embedding_model,
      evidence_count, generated_at, generation_model, last_evidence_at
    ) VALUES (
      j.workspace_id, v_name, v_description, v_embedding, v_embedding_model,
      1, now(), v_embedding_model, now()
    )
    RETURNING id INTO v_topic_id;
  END IF;

  INSERT INTO public.canonical_topic_evidences (
    canonical_topic_id, source_type, source_id, owning_entity_id, similarity
  ) VALUES (
    v_topic_id, j.source_type, j.source_id, v_owning_entity_id, v_similarity
  );

  UPDATE public.canonical_topic_jobs
  SET status = 'COMPLETED', completed_at = now(), result = p_result, updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_canonical_topic_remove_and_commit(p_job_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  j public.canonical_topic_jobs;
  affected_topic_id uuid;
  deleted_count integer;
BEGIN
  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT * INTO j FROM public.canonical_topic_jobs WHERE id = p_job_id FOR UPDATE;
  IF j.status <> 'PROCESSING' THEN
    RETURN 'not_processing';
  END IF;

  FOR affected_topic_id IN
    DELETE FROM public.canonical_topic_evidences
    WHERE source_type = j.source_type AND source_id = j.source_id
    RETURNING canonical_topic_id
  LOOP
    UPDATE public.canonical_topics
    SET evidence_count = evidence_count - 1,
        last_modified_at = now()
    WHERE id = affected_topic_id;

    DELETE FROM public.canonical_topics
    WHERE id = affected_topic_id AND evidence_count <= 0;

    -- Surviving topics may still paraphrase the removed source: flag for regeneration.
    UPDATE public.canonical_topics
    SET needs_regeneration = true,
        regeneration_requested_at = now()
    WHERE id = affected_topic_id;
  END LOOP;

  UPDATE public.canonical_topic_jobs
  SET status = 'COMPLETED', completed_at = now(), updated_at = now()
  WHERE id = p_job_id;

  RETURN 'committed';
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_canonical_topic_add_and_commit(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_canonical_topic_remove_and_commit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_canonical_topic_add_and_commit(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_canonical_topic_remove_and_commit(uuid) TO service_role;
