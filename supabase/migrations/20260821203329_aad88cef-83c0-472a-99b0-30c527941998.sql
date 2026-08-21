DROP TABLE IF EXISTS public.pinned_assets;
DROP TYPE IF EXISTS public.pinned_asset_type;

CREATE TABLE public.pinned_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workspace_user_id uuid NOT NULL REFERENCES public.workspace_users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinned_entities_unique UNIQUE (workspace_user_id, entity_id)
);

CREATE INDEX idx_pinned_entities_workspace_user
  ON public.pinned_entities (workspace_id, workspace_user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.pinned_entities TO authenticated;
GRANT ALL ON public.pinned_entities TO service_role;

ALTER TABLE public.pinned_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pins"
  ON public.pinned_entities FOR SELECT TO authenticated
  USING (
    public.is_workspace_member(workspace_id)
    AND workspace_user_id = public.current_workspace_user_id(workspace_id)
  );

CREATE POLICY "Users can create their own pins"
  ON public.pinned_entities FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id)
    AND workspace_user_id = public.current_workspace_user_id(workspace_id)
    AND (
      public.is_conversation_participant(entity_id)
      OR public.can_read_page(entity_id)
    )
  );

CREATE POLICY "Users can delete their own pins"
  ON public.pinned_entities FOR DELETE TO authenticated
  USING (
    public.is_workspace_member(workspace_id)
    AND workspace_user_id = public.current_workspace_user_id(workspace_id)
  );

-- Real guard: server functions use the admin client and bypass RLS.
CREATE OR REPLACE FUNCTION public.pinned_entities_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_entity_workspace uuid;
BEGIN
  SELECT et.key, e.workspace_id
    INTO v_key, v_entity_workspace
  FROM public.entities e
  JOIN public.entity_types et ON et.id = e.entity_type_id
  WHERE e.id = NEW.entity_id;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'pinned_entities: unknown entity %', NEW.entity_id;
  END IF;

  IF v_entity_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'pinned_entities: entity % does not belong to workspace %', NEW.entity_id, NEW.workspace_id;
  END IF;

  IF NOT public.is_workspace_member_as(NEW.workspace_id, NEW.workspace_user_id) THEN
    RAISE EXCEPTION 'pinned_entities: workspace user % is not a member of workspace %', NEW.workspace_user_id, NEW.workspace_id;
  END IF;

  IF v_key = 'conversation' THEN
    IF NOT public.is_conversation_participant_as(NEW.entity_id, NEW.workspace_user_id) THEN
      RAISE EXCEPTION 'pinned_entities: no access to conversation %', NEW.entity_id;
    END IF;
  ELSIF v_key = 'page' THEN
    IF NOT public.can_read_page_as(NEW.entity_id, NEW.workspace_user_id) THEN
      RAISE EXCEPTION 'pinned_entities: no access to page %', NEW.entity_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'pinned_entities: entity type % is not pinnable', v_key;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pinned_entities_validate
BEFORE INSERT ON public.pinned_entities
FOR EACH ROW EXECUTE FUNCTION public.pinned_entities_validate();

-- Access revocation: conversation participant removed
CREATE OR REPLACE FUNCTION public.unpin_on_conversation_participant_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pinned_entities p
  WHERE p.workspace_user_id = OLD.workspace_user_id
    AND p.entity_id = OLD.conversation_id;

  DELETE FROM public.pinned_entities p
  USING public.entities e, public.entity_types et
  WHERE p.entity_id = e.id
    AND e.entity_type_id = et.id
    AND et.key = 'page'
    AND p.workspace_user_id = OLD.workspace_user_id
    AND NOT public.can_read_page_as(p.entity_id, p.workspace_user_id);

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_unpin_on_conversation_participant_delete
AFTER DELETE ON public.conversation_participants
FOR EACH ROW EXECUTE FUNCTION public.unpin_on_conversation_participant_delete();

-- Access revocation: page collaborator removed
CREATE OR REPLACE FUNCTION public.unpin_on_page_collaborator_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pinned_entities p
  WHERE p.entity_id = OLD.page_id
    AND p.workspace_user_id = OLD.workspace_user_id
    AND NOT public.can_read_page_as(p.entity_id, p.workspace_user_id);
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_unpin_on_page_collaborator_delete
AFTER DELETE ON public.page_collaborators
FOR EACH ROW EXECUTE FUNCTION public.unpin_on_page_collaborator_delete();

-- Access revocation: page sharing settings changed
CREATE OR REPLACE FUNCTION public.unpin_on_page_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pinned_entities p
  WHERE p.entity_id = NEW.id
    AND NOT public.can_read_page_as(p.entity_id, p.workspace_user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_unpin_on_page_access_change
AFTER UPDATE OF visibility, owner_workspace_user_id, conversation_id ON public.pages
FOR EACH ROW EXECUTE FUNCTION public.unpin_on_page_access_change();