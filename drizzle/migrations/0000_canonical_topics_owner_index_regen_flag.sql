-- 1. Owner index for grouping and visibility joins
CREATE INDEX IF NOT EXISTS idx_canonical_topic_evidences_owner
  ON public.canonical_topic_evidences (source_type, owning_entity_id);

-- 2. Regeneration flag columns on canonical_topics
ALTER TABLE public.canonical_topics
  ADD COLUMN IF NOT EXISTS needs_regeneration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regeneration_requested_at timestamptz;

COMMENT ON COLUMN public.canonical_topics.needs_regeneration IS 'Set when evidence is removed; the worker must regenerate name/description from remaining evidence.';
COMMENT ON COLUMN public.canonical_topics.regeneration_requested_at IS 'When the regeneration flag was set.';

-- Partial index for the future worker sweep
CREATE INDEX IF NOT EXISTS idx_canonical_topics_needs_regeneration
  ON public.canonical_topics (workspace_id) WHERE needs_regeneration;

-- 3. Auto-clear the flag when name or description changes
CREATE OR REPLACE FUNCTION public.clear_canonical_topic_regen_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.needs_regeneration := false;
    NEW.regeneration_requested_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_topics_clear_regen_flag ON public.canonical_topics;
CREATE TRIGGER trg_canonical_topics_clear_regen_flag
  BEFORE UPDATE ON public.canonical_topics
  FOR EACH ROW EXECUTE FUNCTION public.clear_canonical_topic_regen_flag();

-- 4. REMOVE commit RPC: flag surviving topics for regeneration
CREATE OR REPLACE FUNCTION public.apply_canonical_topic_remove_and_commit(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.canonical_topic_jobs%ROWTYPE;
  v_deleted_count integer;
BEGIN
  SELECT * INTO v_job
  FROM public.canonical_topic_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'canonical_topic_job % not found', p_job_id;
  END IF;

  IF v_job.status <> 'PROCESSING' THEN
    RAISE EXCEPTION 'canonical_topic_job % is not PROCESSING (status: %)', p_job_id, v_job.status;
  END IF;

  -- Remove evidence rows for this source and collect affected topics
  CREATE TEMPORARY TABLE _ct_removed ON COMMIT DROP AS
  WITH del AS (
    DELETE FROM public.canonical_topic_evidences
    WHERE source_type = v_job.source_type
      AND source_id = v_job.source_id
    RETURNING canonical_topic_id
  )
  SELECT DISTINCT canonical_topic_id FROM del;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Decrement evidence counts
  UPDATE public.canonical_topics t
  SET evidence_count = t.evidence_count - 1,
      updated_at = now()
  FROM _ct_removed r
  WHERE t.id = r.canonical_topic_id;

  -- Drop topics with no remaining evidence
  DELETE FROM public.canonical_topics t
  USING _ct_removed r
  WHERE t.id = r.canonical_topic_id
    AND t.evidence_count <= 0;

  -- Flag surviving topics for regeneration
  UPDATE public.canonical_topics t
  SET needs_regeneration = true,
      regeneration_requested_at = now()
  FROM _ct_removed r
  WHERE t.id = r.canonical_topic_id
    AND t.evidence_count > 0;

  UPDATE public.canonical_topic_jobs
  SET status = 'COMPLETED',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_job_id;

  RETURN 'removed:' || v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_canonical_topic_remove_and_commit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_canonical_topic_remove_and_commit(uuid) TO service_role;