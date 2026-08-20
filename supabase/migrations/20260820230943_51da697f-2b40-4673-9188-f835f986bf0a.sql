CREATE OR REPLACE FUNCTION public.entity_type_id_for(_key text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.entity_types WHERE key = _key;
$$;
REVOKE ALL ON FUNCTION public.entity_type_id_for(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.entity_type_id_for(text) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_entity_from_page()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.entities (id, workspace_id, entity_type_id, created_by_workspace_user_id, created_at, last_modified_at)
    VALUES (NEW.id, NEW.workspace_id, public.entity_type_id_for('page'), NEW.created_by_workspace_user_id, NEW.created_at, NEW.last_modified_at)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.entities WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_entity_from_page() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_entity_from_page() TO service_role;
DROP TRIGGER IF EXISTS trg_sync_entity_from_page ON public.pages;
CREATE TRIGGER trg_sync_entity_from_page
  AFTER INSERT OR DELETE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_from_page();

CREATE OR REPLACE FUNCTION public.sync_entity_from_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.entities (id, workspace_id, entity_type_id, created_by_workspace_user_id, created_at, last_modified_at)
    VALUES (NEW.id, NEW.workspace_id, public.entity_type_id_for('message'), NEW.author_workspace_user_id, NEW.created_at, NEW.last_modified_at)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.entities WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_entity_from_message() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_entity_from_message() TO service_role;
DROP TRIGGER IF EXISTS trg_sync_entity_from_message ON public.messages;
CREATE TRIGGER trg_sync_entity_from_message
  AFTER INSERT OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_from_message();

CREATE OR REPLACE FUNCTION public.sync_entity_from_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.entities (id, workspace_id, entity_type_id, created_by_workspace_user_id, created_at, last_modified_at)
    VALUES (NEW.id, NEW.workspace_id, public.entity_type_id_for('conversation'), NEW.created_by_workspace_user_id, NEW.created_at, NEW.last_modified_at)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.entities WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_entity_from_conversation() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_entity_from_conversation() TO service_role;
DROP TRIGGER IF EXISTS trg_sync_entity_from_conversation ON public.conversations;
CREATE TRIGGER trg_sync_entity_from_conversation
  AFTER INSERT OR DELETE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_from_conversation();

CREATE OR REPLACE FUNCTION public.sync_entity_from_workspace_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.entities (id, workspace_id, entity_type_id, created_at, last_modified_at)
    VALUES (NEW.id, NEW.workspace_id, public.entity_type_id_for('user'), NEW.created_at, NEW.last_modified_at)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.entities WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_entity_from_workspace_user() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_entity_from_workspace_user() TO service_role;
DROP TRIGGER IF EXISTS trg_sync_entity_from_workspace_user ON public.workspace_users;
CREATE TRIGGER trg_sync_entity_from_workspace_user
  AFTER INSERT OR DELETE ON public.workspace_users
  FOR EACH ROW EXECUTE FUNCTION public.sync_entity_from_workspace_user();