
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.plan_tier AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE public.workspace_role AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE public.conversation_role AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE public.page_visibility AS ENUM ('private', 'conversation', 'workspace', 'external');
CREATE TYPE public.page_type AS ENUM ('standard', 'template', 'generated', 'imported');
CREATE TYPE public.page_origin AS ENUM ('user', 'conversation', 'import', 'ai');
CREATE TYPE public.annotation_type AS ENUM ('mention_user', 'mention_entity', 'ticket_ref', 'inline_page_match', 'semantic_hint');
CREATE TYPE public.relation_type AS ENUM ('quoted_from', 'derived_from_message', 'cited_in', 'child_of', 'attached_to', 'linked_by_user');

-- =========================================================
-- Shared triggers
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_last_modified_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_modified_at := now();
  RETURN NEW;
END $$;

-- =========================================================
-- WORKSPACES
-- =========================================================
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan public.plan_tier NOT NULL DEFAULT 'free',
  plan_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_workspaces_lm BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  previous_plan public.plan_tier,
  new_plan public.plan_tier NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);
GRANT SELECT ON public.workspace_plan_history TO authenticated;
GRANT ALL ON public.workspace_plan_history TO service_role;
ALTER TABLE public.workspace_plan_history ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- USER ROLES (catalog)
-- =========================================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key public.workspace_role NOT NULL UNIQUE,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO public.user_roles (key, description) VALUES
  ('admin', 'Full control of the workspace'),
  ('member', 'Create and edit own pages, participate in conversations'),
  ('viewer', 'Read-only access to visible content');
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authed can read role catalog" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

-- =========================================================
-- WORKSPACE USERS
-- =========================================================
CREATE TABLE public.workspace_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.user_roles(id),
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE TRIGGER trg_workspace_users_lm BEFORE UPDATE ON public.workspace_users
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_workspace_users_user ON public.workspace_users(user_id);
CREATE INDEX idx_workspace_users_workspace ON public.workspace_users(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_users TO authenticated;
GRANT ALL ON public.workspace_users TO service_role;
ALTER TABLE public.workspace_users ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- Membership / role helpers (SECURITY DEFINER to avoid recursive RLS)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_users
    WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _role public.workspace_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_users wu
    JOIN public.user_roles r ON r.id = wu.role_id
    WHERE wu.workspace_id = _workspace_id
      AND wu.user_id = auth.uid()
      AND r.key = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.current_workspace_user_id(_workspace_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.workspace_users
  WHERE workspace_id = _workspace_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Workspaces policies
CREATE POLICY "Members can view their workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_workspace_member(id));
CREATE POLICY "Admins can update workspace" ON public.workspaces
  FOR UPDATE TO authenticated USING (public.has_workspace_role(id, 'admin'));
-- Inserts handled by service_role only (bootstrap)

-- Workspace_users policies
CREATE POLICY "Members can view membership of their workspaces" ON public.workspace_users
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
CREATE POLICY "Admins can manage members" ON public.workspace_users
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, 'admin'))
  WITH CHECK (public.has_workspace_role(workspace_id, 'admin'));

-- Plan history policies
CREATE POLICY "Members can view plan history" ON public.workspace_plan_history
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

-- =========================================================
-- INVITES
-- =========================================================
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.user_roles(id),
  token text NOT NULL UNIQUE,
  invited_by_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_workspace_invites_lm BEFORE UPDATE ON public.workspace_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_invites_workspace ON public.workspace_invites(workspace_id);
CREATE INDEX idx_invites_email ON public.workspace_invites(email);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invites TO authenticated;
GRANT ALL ON public.workspace_invites TO service_role;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invites" ON public.workspace_invites
  FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, 'admin'))
  WITH CHECK (public.has_workspace_role(workspace_id, 'admin'));

-- =========================================================
-- ENTITY TYPES + ENTITIES (semantic layer)
-- =========================================================
CREATE TABLE public.entity_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  display_name text NOT NULL
);
INSERT INTO public.entity_types (key, display_name) VALUES
  ('page', 'Page'), ('message', 'Message'), ('user', 'User');
GRANT SELECT ON public.entity_types TO authenticated;
GRANT ALL ON public.entity_types TO service_role;
ALTER TABLE public.entity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authed can read entity types" ON public.entity_types
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type_id uuid NOT NULL REFERENCES public.entity_types(id),
  source_id uuid NOT NULL,
  title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_by_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, entity_type_id, source_id)
);
CREATE TRIGGER trg_entities_lm BEFORE UPDATE ON public.entities
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_entities_workspace ON public.entities(workspace_id);
CREATE INDEX idx_entities_source ON public.entities(workspace_id, entity_type_id, source_id);
CREATE INDEX idx_entities_embedding ON public.entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_entities_title_fts ON public.entities USING gin (to_tsvector('simple', coalesce(title, '')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entities TO authenticated;
GRANT ALL ON public.entities TO service_role;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view entities" ON public.entities
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));
-- Writes go through server fns (service_role)

-- =========================================================
-- CONVERSATIONS
-- =========================================================
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text,
  created_by_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_conversations_lm BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_conversations_workspace ON public.conversations(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workspace_user_id uuid NOT NULL REFERENCES public.workspace_users(id) ON DELETE CASCADE,
  role public.conversation_role NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, workspace_user_id)
);
CREATE INDEX idx_conv_participants_user ON public.conversation_participants(workspace_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    JOIN public.workspace_users wu ON wu.id = cp.workspace_user_id
    WHERE cp.conversation_id = _conversation_id AND wu.user_id = auth.uid()
  );
$$;

CREATE POLICY "Participants can view conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (public.is_conversation_participant(id) OR public.has_workspace_role(workspace_id, 'admin'));
CREATE POLICY "Members can create conversations" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Participants can update conversations" ON public.conversations
  FOR UPDATE TO authenticated USING (public.is_conversation_participant(id));

CREATE POLICY "Participants view participants" ON public.conversation_participants
  FOR SELECT TO authenticated USING (public.is_conversation_participant(conversation_id));
CREATE POLICY "Participants manage participants" ON public.conversation_participants
  FOR ALL TO authenticated
  USING (public.is_conversation_participant(conversation_id))
  WITH CHECK (public.is_conversation_participant(conversation_id));

-- =========================================================
-- MESSAGES
-- =========================================================
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  author_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  raw_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_messages_lm BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at);
CREATE INDEX idx_messages_fts ON public.messages USING gin (to_tsvector('simple', raw_text));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants view messages" ON public.messages
  FOR SELECT TO authenticated USING (public.is_conversation_participant(conversation_id));
CREATE POLICY "Participants send messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (public.is_conversation_participant(conversation_id));
CREATE POLICY "Authors edit own messages" ON public.messages
  FOR UPDATE TO authenticated
  USING (author_workspace_user_id = public.current_workspace_user_id(workspace_id));

-- =========================================================
-- PAGES (TipTap JSON)
-- =========================================================
-- Helper: extract plaintext from TipTap doc
CREATE OR REPLACE FUNCTION public.tiptap_to_plaintext(doc jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
    string_agg(value, ' '),
    ''
  )
  FROM jsonb_path_query(doc, 'strict $.**.text') AS t(value_json),
       LATERAL (SELECT value_json #>> '{}' AS value) AS u
$$;

CREATE TABLE public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  owner_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  visibility public.page_visibility NOT NULL DEFAULT 'private',
  page_type public.page_type NOT NULL DEFAULT 'standard',
  parent_page_id uuid REFERENCES public.pages(id) ON DELETE SET NULL,
  origin_type public.page_origin NOT NULL DEFAULT 'user',
  origin_source_id uuid,
  title text NOT NULL DEFAULT 'Untitled',
  content jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  plain_text text GENERATED ALWAYS AS (public.tiptap_to_plaintext(content)) STORED,
  created_by_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_pages_lm BEFORE UPDATE ON public.pages
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_pages_workspace ON public.pages(workspace_id);
CREATE INDEX idx_pages_conversation ON public.pages(conversation_id);
CREATE INDEX idx_pages_owner ON public.pages(owner_workspace_user_id);
CREATE INDEX idx_pages_plaintext_fts ON public.pages USING gin (to_tsvector('simple', plain_text));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pages TO authenticated;
GRANT ALL ON public.pages TO service_role;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Page visibility read" ON public.pages
  FOR SELECT TO authenticated USING (
    public.is_workspace_member(workspace_id) AND (
      visibility = 'workspace'
      OR visibility = 'external'
      OR (visibility = 'private' AND owner_workspace_user_id = public.current_workspace_user_id(workspace_id))
      OR (visibility = 'conversation' AND conversation_id IS NOT NULL AND public.is_conversation_participant(conversation_id))
    )
  );
CREATE POLICY "Members create pages" ON public.pages
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));
CREATE POLICY "Owners and admins update pages" ON public.pages
  FOR UPDATE TO authenticated USING (
    owner_workspace_user_id = public.current_workspace_user_id(workspace_id)
    OR public.has_workspace_role(workspace_id, 'admin')
  );
CREATE POLICY "Owners and admins delete pages" ON public.pages
  FOR DELETE TO authenticated USING (
    owner_workspace_user_id = public.current_workspace_user_id(workspace_id)
    OR public.has_workspace_role(workspace_id, 'admin')
  );

-- =========================================================
-- ENTITY ANNOTATIONS
-- =========================================================
CREATE TABLE public.entity_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  annotation_type public.annotation_type NOT NULL,
  raw_text text NOT NULL,
  start_offset integer,
  end_offset integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence real NOT NULL DEFAULT 1.0,
  created_by_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_annot_lm BEFORE UPDATE ON public.entity_annotations
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_annot_source ON public.entity_annotations(workspace_id, source_entity_id);
CREATE INDEX idx_annot_target ON public.entity_annotations(workspace_id, target_entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_annotations TO authenticated;
GRANT ALL ON public.entity_annotations TO service_role;
ALTER TABLE public.entity_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view annotations" ON public.entity_annotations
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

-- =========================================================
-- ENTITY RELATIONS (explicit structural links only)
-- =========================================================
CREATE TABLE public.entity_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relation_type public.relation_type NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_workspace_user_id uuid REFERENCES public.workspace_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_modified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, source_entity_id, target_entity_id, relation_type)
);
CREATE TRIGGER trg_rel_lm BEFORE UPDATE ON public.entity_relations
  FOR EACH ROW EXECUTE FUNCTION public.set_last_modified_at();
CREATE INDEX idx_rel_source ON public.entity_relations(workspace_id, source_entity_id);
CREATE INDEX idx_rel_target ON public.entity_relations(workspace_id, target_entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_relations TO authenticated;
GRANT ALL ON public.entity_relations TO service_role;
ALTER TABLE public.entity_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view relations" ON public.entity_relations
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));

-- =========================================================
-- Realtime publications
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;
