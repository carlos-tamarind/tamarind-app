import { DebugLogger } from "@/lib/debugLogger";
import { purgeDueEntities } from "@/lib/delete-entities/purge";
import { loadPurgeableEntityTypes } from "@/lib/delete-entities/registry";
import type { PurgeDueResult } from "@/lib/delete-entities/types";

const LOG_SCOPE = "purge-worker";

export type RunPurgeWorkerResult = PurgeDueResult;

/**
 * Purge worker tick.
 *
 * Registry-driven: the delete path never hardcodes table names — `purge_due_entities`
 * walks `purgeable_entity_types` itself, so new deletable entity types need no code change.
 */
export async function runPurgeWorker(options?: {
  entityIds?: string[];
}): Promise<RunPurgeWorkerResult> {
  try {
    const types = await loadPurgeableEntityTypes();
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "REGISTRY_LOADED",
      message: types.map((t) => `${t.purge_order}:${t.entity_type_key}`).join(" · ") || "empty",
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

  const result = await purgeDueEntities({ entityIds: options?.entityIds });

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "WORKER_TICK_COMPLETE",
    message: `${result.purged} purged · ${JSON.stringify(result.byType)}`,
  });

  return result;
}
