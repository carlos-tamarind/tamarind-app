CREATE OR REPLACE FUNCTION public.can_read_evidence_owner(_source_type text, _owning_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _source_type
    WHEN 'page_topic' THEN public.can_read_page(_owning_entity_id)
      AND EXISTS (SELECT 1 FROM public.pages p WHERE p.id = _owning_entity_id AND p.purged_at IS NULL)
    WHEN 'conversation_topic' THEN public.is_conversation_participant(_owning_entity_id)
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.can_read_canonical_topic(_topic_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.canonical_topics t
    WHERE t.id = _topic_id
      AND public.is_workspace_member(t.workspace_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.canonical_topic_evidences e
        WHERE e.canonical_topic_id = t.id
          AND NOT public.can_read_evidence_owner(e.source_type, e.owning_entity_id)
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_evidence_owner(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_canonical_topic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_evidence_owner(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_canonical_topic(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Workspace members can read canonical topics" ON public.canonical_topics;
CREATE POLICY "Readers of all evidence can read canonical topics" ON public.canonical_topics
  FOR SELECT TO authenticated USING (public.can_read_canonical_topic(id));

DROP POLICY IF EXISTS "Workspace members can read canonical topic evidences" ON public.canonical_topic_evidences;
CREATE POLICY "Readers of the topic can read canonical topic evidences" ON public.canonical_topic_evidences
  FOR SELECT TO authenticated USING (public.can_read_canonical_topic(canonical_topic_id));

CREATE INDEX IF NOT EXISTS idx_canonical_topic_evidences_topic_owner
  ON public.canonical_topic_evidences (canonical_topic_id, source_type, owning_entity_id);

CREATE OR REPLACE FUNCTION public.enqueue_page_topic_canonical_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.pages WHERE id = OLD.page_id;
    IF v_workspace_id IS NULL THEN
      SELECT t.workspace_id INTO v_workspace_id
      FROM public.canonical_topic_evidences e
      JOIN public.canonical_topics t ON t.id = e.canonical_topic_id
      WHERE e.source_type = 'page_topic' AND e.source_id = OLD.id
      LIMIT 1;
    END IF;
    IF v_workspace_id IS NOT NULL THEN
      PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'page_topic', OLD.id);
    END IF;
    RETURN OLD;
  END IF;

  SELECT workspace_id INTO v_workspace_id FROM public.pages WHERE id = NEW.page_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'page_topic', NEW.id);
    RETURN NEW;
  END IF;

  IF NEW.topic_name IS DISTINCT FROM OLD.topic_name
     OR NEW.topic_description IS DISTINCT FROM OLD.topic_description THEN
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'page_topic', NEW.id);
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'page_topic', NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;