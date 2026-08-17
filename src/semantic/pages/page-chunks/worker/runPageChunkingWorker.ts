import { DebugLogger } from "@/lib/debugLogger";

import { chunkPageContent } from "../engine/chunkPageContent";
import { reconcilePageChunks } from "../persistence/reconcilePageChunks";
import { listPagesDueForChunking } from "./listDuePages";

const LOG_SCOPE = "page-chunks";

export type RunPageChunkingWorkerResult = {
  pagesDue: number;
  processed: number;
  inserted: number;
  deleted: number;
  queued: number;
  errors: number;
  pageIds: string[];
};

export async function runPageChunkingWorker(): Promise<RunPageChunkingWorkerResult> {
  const due = await listPagesDueForChunking();
  const pageIds = due.map((page) => page.id);

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "TICK_START",
    message: `${due.length} pages due`,
  });

  const result: RunPageChunkingWorkerResult = {
    pagesDue: due.length,
    processed: 0,
    inserted: 0,
    deleted: 0,
    queued: 0,
    errors: 0,
    pageIds,
  };

  for (const page of due) {
    try {
      const proposed = chunkPageContent(page.content);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "RECHUNK",
        message: `${page.id} · ${proposed.length} chunks`,
      });
      const recon = await reconcilePageChunks(page.id, proposed);
      result.processed += 1;
      result.inserted += recon.inserted;
      result.deleted += recon.deleted;
      result.queued += recon.queued;
    } catch (error) {
      result.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "PAGE_FAILED",
        message: `${page.id} · ${message}`,
        level: "error",
      });
    }
  }

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "TICK_COMPLETE",
    message: `${result.processed} processed · ${result.queued} queued · ${result.errors} errors`,
  });

  return result;
}
