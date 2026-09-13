import { DebugLogger } from "@/lib/debugLogger";

import { canonicalTopicEngine } from "../engine/canonicalTopicEngine";
import type { ApplyCanonicalTopicResult } from "../types/job";
import { claimCanonicalTopicJob } from "./claimJob";
import { CANONICAL_TOPIC_WORKER_CONFIG } from "./config";
import { handleCanonicalTopicJobError } from "./handleCanonicalTopicError";

const LOG_SCOPE = "canonical-topics-worker";

type ProcessClaimedJobResult =
  { kind: "empty" } | { kind: "processed"; circuitBreak: boolean; added: number; removed: number };

async function processClaimedJob(): Promise<ProcessClaimedJobResult> {
  const job = await claimCanonicalTopicJob();
  if (!job) return { kind: "empty" };

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "JOB_CLAIMED",
    message: `${job.id} · ${job.job_type} · ${job.source_type} ${job.source_id}`,
  });

  try {
    const result: ApplyCanonicalTopicResult =
      job.job_type === "ADD"
        ? await canonicalTopicEngine.planAdd(job)
        : await canonicalTopicEngine.planRemove(job);

    if (result === "not_processing" || result === "not_found") {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "COMMIT_SKIPPED",
        message: `${job.id} · ${result}`,
        level: "warn",
      });
      return { kind: "processed", circuitBreak: false, added: 0, removed: 0 };
    }

    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_COMPLETED",
      message: `${job.id} · ${job.job_type}`,
    });
    return {
      kind: "processed",
      circuitBreak: false,
      added: job.job_type === "ADD" ? 1 : 0,
      removed: job.job_type === "REMOVE" ? 1 : 0,
    };
  } catch (error) {
    const outcome = await handleCanonicalTopicJobError(job, error);
    const circuitBreak = outcome.kind === "transient" && outcome.globalInfra;
    return { kind: "processed", circuitBreak, added: 0, removed: 0 };
  }
}

export type RunCanonicalTopicsWorkerResult = {
  jobsProcessed: number;
  added: number;
  removed: number;
};

export async function runCanonicalTopicsWorker(): Promise<RunCanonicalTopicsWorkerResult> {
  const result: RunCanonicalTopicsWorkerResult = {
    jobsProcessed: 0,
    added: 0,
    removed: 0,
  };

  while (result.jobsProcessed < CANONICAL_TOPIC_WORKER_CONFIG.MAX_JOBS_PER_TICK) {
    const outcome = await processClaimedJob();
    if (outcome.kind === "empty") break;

    result.jobsProcessed += 1;
    result.added += outcome.added;
    result.removed += outcome.removed;

    if (outcome.circuitBreak) {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "TICK_CIRCUIT_BREAK",
        message: "global infra transient error; stopping tick early",
        level: "warn",
      });
      break;
    }
  }

  if (result.jobsProcessed > 0) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "WORKER_TICK_COMPLETE",
      message: `${result.jobsProcessed} jobs · ${result.added} added · ${result.removed} removed`,
    });
  }

  return result;
}
