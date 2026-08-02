CREATE TYPE public.pinned_asset_type AS ENUM ('conversation', 'page');

CREATE TABLE public.pinned_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  asset_type public.pinned_asset_type NOT NULL,
  asset_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinned_assets_unique UNIQUE (user_id, workspace_id, asset_type, asset_id)
);

GRANT SELECT, INSERT, DELETE ON public.pinned_assets TO authenticated;
GRANT ALL ON public.pinned_assets TO service_role;

ALTER TABLE public.pinned_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pins"
ON public.pinned_assets FOR SELECT TO authenticated
USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

CREATE POLICY "Users can create their own pins"
ON public.pinned_assets FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

CREATE POLICY "Users can delete their own pins"
ON public.pinned_assets FOR DELETE TO authenticated
USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id));

CREATE INDEX idx_pinned_assets_workspace_user
  ON public.pinned_assets (workspace_id, user_id, created_at DESC);