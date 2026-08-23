import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rewriteMessageReferences } from "@/lib/delete-entities/messages/rewrite";
import { rewritePageMentions } from "@/lib/delete-entities/pages/rewrite-mentions";
import type { PurgeDueOptions, PurgeDueResult } from "@/lib/delete-entities/types";

async function listDuePageIds(entityIds?: string[]): Promise<string[]> {
  let query = supabaseAdmin
    .from("pages")
    .select("id")
    .not("purged_at", "is", null)
    .lte("purged_at", new Date().toISOString());
  if (entityIds && entityIds.length > 0) {
    query = query.in("id", entityIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}

async function listDueMessageIds(entityIds?: string[]): Promise<string[]> {
  let query = supabaseAdmin
    .from("messages")
    .select("id")
    .not("purged_at", "is", null)
    .lte("purged_at", new Date().toISOString());
  if (entityIds && entityIds.length > 0) {
    query = query.in("id", entityIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}

export async function purgeDueEntities(
  options: PurgeDueOptions = {},
): Promise<PurgeDueResult> {
  const pageIds = await listDuePageIds(options.entityIds);
  const messageIds = await listDueMessageIds(options.entityIds);

  await rewritePageMentions(pageIds);
  await rewriteMessageReferences(messageIds);

  const { data, error } = await supabaseAdmin.rpc("purge_due_entities", {
    p_entity_ids: options.entityIds ?? undefined,
  });
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byType: Record<string, number> = {};
  for (const row of rows) {
    byType[row.entity_type] = (byType[row.entity_type] ?? 0) + 1;
  }
  return { purged: rows.length, byType };
}
