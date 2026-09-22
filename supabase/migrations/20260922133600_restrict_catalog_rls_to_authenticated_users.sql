DROP POLICY IF EXISTS "Anyone authed can read role catalog" ON public.user_roles;
CREATE POLICY "Authenticated users can read role catalog"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone authed can read entity types" ON public.entity_types;
CREATE POLICY "Authenticated users can read entity types"
  ON public.entity_types
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);