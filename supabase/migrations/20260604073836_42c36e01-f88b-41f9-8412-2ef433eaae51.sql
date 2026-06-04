
CREATE TABLE IF NOT EXISTS public.page_collaborators (
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  workspace_user_id uuid NOT NULL REFERENCES public.workspace_users(id) ON DELETE CASCADE,
  first_edited_at timestamptz NOT NULL DEFAULT now(),
  last_edited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, workspace_user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.page_collaborators TO authenticated;
GRANT ALL ON public.page_collaborators TO service_role;

ALTER TABLE public.page_collaborators ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can read the page can read its collaborators
CREATE POLICY "Read page collaborators if page is readable"
ON public.page_collaborators
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pages p
    WHERE p.id = page_collaborators.page_id
      AND public.is_workspace_member(p.workspace_id)
  )
);

-- Insert/update: only the workspace user themself, and only if they belong to the page's workspace
CREATE POLICY "Record self as collaborator"
ON public.page_collaborators
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pages p
    JOIN public.workspace_users wu ON wu.id = page_collaborators.workspace_user_id
    WHERE p.id = page_collaborators.page_id
      AND wu.user_id = auth.uid()
      AND wu.workspace_id = p.workspace_id
  )
);

CREATE POLICY "Update own collaborator row"
ON public.page_collaborators
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.id = page_collaborators.workspace_user_id
      AND wu.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.id = page_collaborators.workspace_user_id
      AND wu.user_id = auth.uid()
  )
);
