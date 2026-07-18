CREATE POLICY "Users can update their own membership profile"
ON public.workspace_users
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());