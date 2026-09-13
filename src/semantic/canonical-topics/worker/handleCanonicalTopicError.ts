import { DebugLogger } from "@/lib/debugLogger";

import type { CanonicalTopicJob } from "../types/job";
import {
  markCanonicalTopicJobQuarantined,
  markCanonicalTopicJobRetryWait,
} from "./canonicalTopicJobsRepository";
import { classifyCanonicalTopicError } from "./classifyCanonicalTopicError";
import { getCooldownUntil, getNextRetryAt, hasExceededTransientBackoffs } from "./retry";

const LOG_SCOPE = "canonical-topics-worker";

export type HandleCanonicalTopicJobErrorResult =
  { kind: "permanent" } | { kind: "transient"; globalInfra: boolean };

export async function handleCanonicalTopicJobError(
  job: CanonicalTopicJob,
  error: unknown,
): Promise<HandleCanonicalTopicJobErrorResult> {
  const classification = classifyCanonicalTopicError(error);

  if (classification.kind === "permanent") {
    await markCanonicalTopicJobQuarantined(job.id, classification.summary);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_QUARANTINED",
      message: `${job.id} · permanent · ${classification.summary}`,
      level: "error",
    });
    return { kind: "permanent" };
  }

  if (hasExceededTransientBackoffs(job.attempts)) {
    const cooldownUntil = getCooldownUntil();
    await markCanonicalTopicJobRetryWait(job.id, {
      nextRetryAt: cooldownUntil,
      lastError: `${classification.summary} (cooldown after ${job.attempts} attempts)`,
      attempts: 0,
    });
    DebugLogger.table({
      scope: LOG_SCOPE,
      event: "JOB_COOLDOWN",
      data: {
        jobId: job.id,
        sourceType: job.source_type,
        sourceId: job.source_id,
        attempts: job.attempts,
        cooldownUntil: cooldownUntil.toISOString(),
        error: classification.summary,
      },
    });
    return { kind: "transient", globalInfra: classification.globalInfra };
  }

  const nextRetryAt = getNextRetryAt(job.attempts);
  await markCanonicalTopicJobRetryWait(job.id, {
    nextRetryAt,
    lastError: classification.summary,
  });

  DebugLogger.table({
    scope: LOG_SCOPE,
    event: "JOB_RETRY_WAIT",
    data: {
      jobId: job.id,
      sourceType: job.source_type,
      sourceId: job.source_id,
      attempts: job.attempts,
      nextRetryAt: nextRetryAt.toISOString(),
      error: classification.summary,
    },
  });

  return { kind: "transient", globalInfra: classification.globalInfra };
}
