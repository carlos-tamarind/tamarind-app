import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function loadPurgeableEntityTypes() {
  const { data, error } = await supabaseAdmin
    .from("purgeable_entity_types")
    .select("entity_type_key, table_name, purge_order")
    .order("purge_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}
