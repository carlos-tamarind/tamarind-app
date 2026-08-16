import { DebugLogger } from "@/lib/debugLogger";

import { conversationTopicEngine } from "../engine/conversationTopicEngine";
import { claimConversationTopicJob } from "./claimJob";
import { commitCtiJob, releaseConversationTopicJob } from "./commitCtiJob";
import { CTI_CONFIG } from "./config";
import { handleCtiJobError } from "./handleCtiError";

const LOG_SCOPE = "cti-worker";

type ProcessClaimedJobResult =
  | { kind: "empty" }
  | { kind: "processed"; circuitBreak: boolean };

async function processClaimedJob(): Promise<ProcessClaimedJobResult> {
  const job = await claimConversationTopicJob();
  if (!job) return { kind: "empty" };

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "JOB_CLAIMED",
    message: `${job.id} · message ${job.message_id}`,
  });

  try {
    await conversationTopicEngine.planTransition({ job });

    const result = await commitCtiJob(job.id);

    if (result === "not_next") {
      await releaseConversationTopicJob(job.id);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "JOB_RELEASED",
        message: `${job.id} · not_next`,
      });
      return { kind: "processed", circuitBreak: false };
    }

    if (result === "not_processing" || result === "not_found") {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "COMMIT_SKIPPED",
        message: `${job.id} · ${result}`,
        level: "warn",
      });
      return { kind: "processed", circuitBreak: false };
    }

    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_COMPLETED",
      message: job.id,
    });
    return { kind: "processed", circuitBreak: false };
  } catch (error) {
    const outcome = await handleCtiJobError(job, error);
    const circuitBreak = outcome.kind === "transient" && outcome.globalInfra;
    return { kind: "processed", circuitBreak };
  }
}

export type RunCtiWorkerResult = {
  jobsProcessed: number;
};

export async function runCtiWorker(): Promise<RunCtiWorkerResult> {
  let jobsProcessed = 0;

  while (jobsProcessed < CTI_CONFIG.MAX_JOBS_PER_TICK) {
    const result = await processClaimedJob();
    if (result.kind === "empty") break;

    jobsProcessed += 1;

    if (result.circuitBreak) {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "TICK_CIRCUIT_BREAK",
        message: "global infra transient error; stopping tick early",
        level: "warn",
      });
      break;
    }
  }

  if (jobsProcessed > 0) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "WORKER_TICK_COMPLETE",
      message: `${jobsProcessed} jobs`,
    });
  }

  return { jobsProcessed };
}
