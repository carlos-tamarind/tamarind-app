import type { ApplyCanonicalTopicResult, CanonicalTopicJob } from "../types/job";
import { applyCanonicalTopicRemove } from "./persistence/applyCanonicalTopicResult";

/** REMOVE has no decision to make — the RPC does the entire fan-out delete/decrement/auto-drop. */
export async function planRemove(job: CanonicalTopicJob): Promise<ApplyCanonicalTopicResult> {
  return applyCanonicalTopicRemove(job.id);
}
