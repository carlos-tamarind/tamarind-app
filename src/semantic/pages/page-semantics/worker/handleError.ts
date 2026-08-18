import { DebugLogger } from "@/lib/debugLogger";

import type { PageSemanticJob } from "../types/job";
import {
  markPageSemanticJobFailed,
  markPageSemanticJobRetryWait,
} from "../persistence/pageSemanticsRepository";
import { classifyPageSemanticError } from "./classifyError";
import { getCooldownUntil, getNextRetryAt, hasExceededTransientBackoffs } from "./retry";

const LOG_SCOPE = "page-semantic-worker";

export type HandlePageSemanticJobErrorResult =
  | { kind: "permanent" }
  | { kind: "transient"; globalInfra: boolean }
  | { kind: "halted" };

export async function handlePageSemanticJobError(
  job: PageSemanticJob,
  error: unknown,
): Promise<HandlePageSemanticJobErrorResult> {
  const classification = classifyPageSemanticError(error);

  if (classification.kind === "permanent") {
    await markPageSemanticJobFailed(job.id, classification.summary);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_FAILED",
      message: `${job.id} · permanent · ${classification.summary}`,
      level: "error",
    });
    return { kind: "permanent" };
  }

  if (hasExceededTransientBackoffs(job.attempts)) {
    const haltUntil = getCooldownUntil();
    await markPageSemanticJobRetryWait(job.id, {
      nextRetryAt: haltUntil,
      lastError: `${classification.summary} (24h cooldown after ${job.attempts} attempts)`,
      attempts: 0,
    });
    DebugLogger.table({
      scope: LOG_SCOPE,
      event: "JOB_RETRY_WAIT",
      data: {
        jobId: job.id,
        pageId: job.page_id,
        kind: "cooldown",
        attempts: job.attempts,
        haltUntil: haltUntil.toISOString(),
        error: classification.summary,
      },
    });
    return { kind: "halted" };
  }

  const nextRetryAt = getNextRetryAt(job.attempts);
  await markPageSemanticJobRetryWait(job.id, {
    nextRetryAt,
    lastError: classification.summary,
  });

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "JOB_RETRY_WAIT",
    data: {
      jobId: job.id,
      pageId: job.page_id,
      kind: "transient",
      attempts: job.attempts,
      nextRetryAt: nextRetryAt.toISOString(),
      error: classification.summary,
    },
  });

  return { kind: "transient", globalInfra: classification.globalInfra };
}
