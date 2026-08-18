import { DebugLogger } from "@/lib/debugLogger";

import { computeMessageChecksum } from "@/semantic/messages/message-checksum/computeMessageChecksum";

import { PAGE_SEMANTIC_ENGINE_CONFIG } from "../engine/config";
import { interpretPageSemanticLlm } from "../engine/llm/interpretPageSemanticLlm";
import { buildPageSemanticPrompt } from "../engine/llm/prompts";
import { applyPageSemanticResult, loadPageForSemantics } from "../persistence/pageSemanticsRepository";
import { claimPageSemanticJob } from "./claimJob";
import { PAGE_SEMANTIC_WORKER_CONFIG } from "./config";
import { enqueueDuePageSemanticJobs } from "./enqueueDuePages";
import { handlePageSemanticJobError } from "./handleError";

const LOG_SCOPE = "page-semantic-worker";

/** Satisfies apply() NOT NULL args on the drift path; never written when hashes mismatch. */
const DRIFT_PLACEHOLDER = "drift";

export type RunPageSemanticWorkerResult = {
  analyzed: number;
  skipped: number;
  failed: number;
};

type ProcessClaimedJobResult =
  | { kind: "empty" }
  | { kind: "processed"; circuitBreak: boolean; analyzed: number; skipped: number; failed: number };

async function applyDrift(jobId: string, jobHash: string, snapshot: string): Promise<void> {
  await applyPageSemanticResult({
    jobId,
    topicName: DRIFT_PLACEHOLDER,
    topicDescription: DRIFT_PLACEHOLDER,
    pageSnapshot: snapshot.trim().length > 0 ? snapshot : DRIFT_PLACEHOLDER,
    pageSnapshotHash: jobHash,
    llmModel: PAGE_SEMANTIC_ENGINE_CONFIG.PAGE_SEMANTIC_LLM_MODEL,
  });
}

async function processClaimedJob(): Promise<ProcessClaimedJobResult> {
  const job = await claimPageSemanticJob();
  if (!job) return { kind: "empty" };

  DebugLogger.log({
    scope: LOG_SCOPE,
    event: "JOB_CLAIMED",
    message: `${job.id} · page ${job.page_id}`,
  });

  try {
    const page = await loadPageForSemantics(job.page_id);
    const liveText = page?.plainText ?? "";
    const liveHash = liveText.trim().length > 0 ? computeMessageChecksum(liveText) : "";

    if (!page || liveText.trim().length === 0 || liveHash !== job.page_snapshot_hash) {
      await applyDrift(job.id, job.page_snapshot_hash, liveText);
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "SNAPSHOT_DRIFT",
        message: `${job.id} · page ${job.page_id}`,
        level: "warn",
      });
      return { kind: "processed", circuitBreak: false, analyzed: 0, skipped: 1, failed: 0 };
    }

    const prompt = buildPageSemanticPrompt({
      title: page.title,
      plainText: liveText,
    });
    const output = await interpretPageSemanticLlm(prompt);

    const applyResult = await applyPageSemanticResult({
      jobId: job.id,
      topicName: output.name,
      topicDescription: output.description,
      pageSnapshot: liveText,
      pageSnapshotHash: liveHash,
      llmModel: PAGE_SEMANTIC_ENGINE_CONFIG.PAGE_SEMANTIC_LLM_MODEL,
    });

    if (applyResult === "committed") {
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "JOB_COMPLETED",
        message: job.id,
      });
      DebugLogger.log({
        scope: LOG_SCOPE,
        event: "SEMANTICS_UPSERT",
        message: `${job.page_id} · ${output.name}`,
      });
      return { kind: "processed", circuitBreak: false, analyzed: 1, skipped: 0, failed: 0 };
    }

    DebugLogger.log({
      scope: LOG_SCOPE,
      event: applyResult === "drifted" ? "SNAPSHOT_DRIFT" : "COMMIT_SKIPPED",
      message: `${job.id} · ${applyResult}`,
      level: "warn",
    });
    return { kind: "processed", circuitBreak: false, analyzed: 0, skipped: 1, failed: 0 };
  } catch (error) {
    const outcome = await handlePageSemanticJobError(job, error);
    const failed = outcome.kind === "permanent" ? 1 : 0;
    const circuitBreak = outcome.kind === "transient" && outcome.globalInfra;
    return { kind: "processed", circuitBreak, analyzed: 0, skipped: 0, failed };
  }
}

export async function runPageSemanticWorker(): Promise<RunPageSemanticWorkerResult> {
  try {
    const sweep = await enqueueDuePageSemanticJobs();
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "SWEEP_COMPLETE",
      message: `${sweep.pagesDue} due · ${sweep.enqueued + sweep.requeued} queued · ${sweep.cleaned} cleaned · ${sweep.errors} errors`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "SWEEP_FAILED",
      message,
      level: "error",
    });
  }

  const result: RunPageSemanticWorkerResult = {
    analyzed: 0,
    skipped: 0,
    failed: 0,
  };

  let jobsProcessed = 0;
  while (jobsProcessed < PAGE_SEMANTIC_WORKER_CONFIG.MAX_JOBS_PER_TICK) {
    const outcome = await processClaimedJob();
    if (outcome.kind === "empty") break;

    jobsProcessed += 1;
    result.analyzed += outcome.analyzed;
    result.skipped += outcome.skipped;
    result.failed += outcome.failed;

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

  if (jobsProcessed > 0) {
    DebugLogger.log({
      scope: LOG_SCOPE,
      event: "WORKER_TICK_COMPLETE",
      message: `${result.analyzed} analyzed · ${result.skipped} skipped · ${result.failed} failed`,
    });
  }

  return result;
}
