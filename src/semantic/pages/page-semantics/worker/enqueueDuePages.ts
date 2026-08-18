import { DebugLogger } from "@/lib/debugLogger";

import { computeMessageChecksum } from "@/semantic/messages/message-checksum/computeMessageChecksum";
import { countTokens } from "@/semantic/pages/page-chunks/engine/countTokens";

import {
  PAGE_SEMANTIC_ENGINE_CONFIG,
  PAGE_SEMANTIC_IDLE_INTERVAL,
} from "../engine/config";
import {
  completeInflightQueuedJobs,
  deletePageSemantics,
  enqueuePageSemanticJob,
  listPagesDueForSemantics,
} from "../persistence/pageSemanticsRepository";

const LOG_SCOPE = "page-semantic";

export type EnqueueDuePageSemanticJobsResult = {
  pagesDue: number;
  enqueued: number;
  requeued: number;
  skipped: number;
  cleaned: number;
  errors: number;
};

function hasSnapshot(snapshot: string | null | undefined, hash: string | null | undefined): boolean {
  return Boolean(snapshot && snapshot.trim().length > 0 && hash && hash.length === 64);
}

export async function enqueueDuePageSemanticJobs(): Promise<EnqueueDuePageSemanticJobsResult> {
  const due = await listPagesDueForSemantics(
    PAGE_SEMANTIC_IDLE_INTERVAL,
    PAGE_SEMANTIC_ENGINE_CONFIG.PAGE_SEMANTIC_SWEEP_BATCH_SIZE,
  );

  const result: EnqueueDuePageSemanticJobsResult = {
    pagesDue: due.length,
    enqueued: 0,
    requeued: 0,
    skipped: 0,
    cleaned: 0,
    errors: 0,
  };

  for (const page of due) {
    try {
      const plainText = page.plain_text ?? "";
      const liveHash = plainText.trim().length > 0 ? computeMessageChecksum(plainText) : "";
      const snapshot = page.page_snapshot;
      const storedHash = page.page_snapshot_hash;

      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "SNAPSHOT_DIFF",
        message: `${page.page_id} · liveHash=${liveHash || "(empty)"} · storedHash=${storedHash || "(none)"}`,
      });

      if (plainText.trim().length === 0 && hasSnapshot(snapshot, storedHash)) {
        await deletePageSemantics(page.page_id);
        await completeInflightQueuedJobs(page.page_id);
        result.cleaned += 1;
        continue;
      }

      if (plainText.trim().length === 0) {
        result.skipped += 1;
        continue;
      }

      if (!hasSnapshot(snapshot, storedHash)) {
        const outcome = await enqueuePageSemanticJob(page.page_id, liveHash);
        if (outcome === "enqueued") result.enqueued += 1;
        else if (outcome === "requeued") result.requeued += 1;
        else result.skipped += 1;
        if (outcome !== "processing") {
          DebugLogger.log({
            scope: LOG_SCOPE,
            event: "JOB_ENQUEUED",
            message: `${page.page_id} · ${outcome} · first analysis`,
          });
        }
        continue;
      }

      if (liveHash === storedHash) {
        result.skipped += 1;
        continue;
      }

      const tokenDelta = Math.abs(countTokens(plainText) - countTokens(snapshot ?? ""));
      if (tokenDelta < PAGE_SEMANTIC_ENGINE_CONFIG.PAGE_SEMANTIC_SNAPSHOT_DIFF_THRESHOLD_TOKENS) {
        result.skipped += 1;
        continue;
      }

      const outcome = await enqueuePageSemanticJob(page.page_id, liveHash);
      if (outcome === "enqueued") result.enqueued += 1;
      else if (outcome === "requeued") result.requeued += 1;
      else result.skipped += 1;
      if (outcome !== "processing") {
        DebugLogger.log({
          scope: LOG_SCOPE,
          event: "JOB_ENQUEUED",
          message: `${page.page_id} · ${outcome} · tokenDelta=${tokenDelta}`,
        });
      }
    } catch (error) {
      result.errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "SWEEP_PAGE_FAILED",
        message: `${page.page_id} · ${message}`,
        level: "error",
      });
    }
  }

  return result;
}
