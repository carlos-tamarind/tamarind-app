import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DebugLogger } from "@/lib/debugLogger";

const LOG_SCOPE = "purge-worker";

export type RunPurgeWorkerResult = {
  purged: number;
  byType: Record<string, number>;
};

/**
 * Purge worker tick.
 *
 * Registry-driven: the delete path never hardcodes table names — `purge_due_entities`
 * walks `purgeable_entity_types` itself, so new deletable entity types need no code change.
 */
export async function runPurgeWorker(): Promise<RunPurgeWorkerResult> {
  // Observability only: log which types the RPC will walk, in purge order.
  try {
    const { data: types, error } = await supabaseAdmin
      .from("purgeable_entity_types")
      .select("entity_type_key, table_name, purge_order")
      .order("purge_order", { ascending: true });

    if (error) throw error;

    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "REGISTRY_LOADED",
      message: (types ?? []).map((t) => `${t.purge_order}:${t.entity_type_key}`).join(" · ") || "empty",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "REGISTRY_LOAD_FAILED",
      message,
      level: "warn",
    });
  }

  // TODO(app-agent): reference rewrite hook.
  // Before the hard delete runs, rewrite mentions/quotes that point at entities about to be
  // purged (e.g. to "[Deleted page]"). Must happen HERE — after this point the rows are gone.
  // Safe today: nothing in the app sets `purged_at`, so the sweep below returns no rows.

  const { data, error } = await supabaseAdmin.rpc("purge_due_entities");
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const byType: Record<string, number> = {};
  for (const row of rows) {
    byType[row.entity_type] = (byType[row.entity_type] ?? 0) + 1;
  }

  const result: RunPurgeWorkerResult = { purged: rows.length, byType };

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "WORKER_TICK_COMPLETE",
    message: `${result.purged} purged · ${JSON.stringify(byType)}`,
  });

  return result;
}
