import { DebugLogger } from "@/lib/debugLogger";

import { claimConversationTopicJob } from "./claimJob";
import { commitCtiJob, releaseConversationTopicJob } from "./commitCtiJob";
import { CTI_CONFIG } from "./config";
import { conversationTopicEngine } from "./engine";
import { handleCtiJobError } from "./handleCtiError";

const LOG_SCOPE = "cti-worker";

async function processClaimedJob(): Promise<number> {
  const job = await claimConversationTopicJob();
  if (!job) return 0;

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
      return 1;
    }

    if (result === "not_processing" || result === "not_found") {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "COMMIT_SKIPPED",
        message: `${job.id} · ${result}`,
        level: "warn",
      });
      return 1;
    }

    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "JOB_COMPLETED",
      message: job.id,
    });
    return 1;
  } catch (error) {
    await handleCtiJobError(job, error);
    return 1;
  }
}

export type RunCtiWorkerResult = {
  jobsProcessed: number;
};

export async function runCtiWorker(): Promise<RunCtiWorkerResult> {
  let jobsProcessed = 0;

  while (jobsProcessed < CTI_CONFIG.MAX_JOBS_PER_TICK) {
    const count = await processClaimedJob();
    if (count === 0) break;
    jobsProcessed += count;
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
