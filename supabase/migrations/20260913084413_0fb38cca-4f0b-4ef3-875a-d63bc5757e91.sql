CREATE OR REPLACE FUNCTION public.enqueue_conversation_topic_canonical_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_candidate IS FALSE THEN
      SELECT workspace_id INTO v_workspace_id FROM public.conversations WHERE id = OLD.conversation_id;
      PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'conversation_topic', OLD.id);
    END IF;
    RETURN OLD;
  END IF;

  SELECT workspace_id INTO v_workspace_id FROM public.conversations WHERE id = NEW.conversation_id;

  IF TG_OP = 'INSERT' THEN
    -- Rows start as candidates; candidates are not canonical-topic sources.
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.is_candidate IS TRUE AND NEW.is_candidate IS FALSE THEN
    -- promotion: candidate became an established topic
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'conversation_topic', NEW.id);
  ELSIF OLD.is_candidate IS FALSE AND NEW.is_candidate IS TRUE THEN
    -- demotion: established topic reverted to candidate
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'conversation_topic', NEW.id);
  ELSIF NEW.is_candidate IS FALSE AND (
       NEW.name IS DISTINCT FROM OLD.name
       OR NEW.description IS DISTINCT FROM OLD.description) THEN
    -- content drift on an established topic
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'REMOVE', 'conversation_topic', NEW.id);
    PERFORM public.enqueue_canonical_topic_job(v_workspace_id, 'ADD', 'conversation_topic', NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_conversation_topic_canonical_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_conversation_topic_canonical_job() TO service_role;