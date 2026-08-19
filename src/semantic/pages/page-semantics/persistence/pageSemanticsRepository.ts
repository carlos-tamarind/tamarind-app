import type { Database } from "@/integrations/supabase/types";

import type { ApplyPageSemanticResult, EnqueuePageSemanticResult } from "../types/job";

export type DuePageForSemantics =
  Database["public"]["Functions"]["list_pages_due_for_topics"]["Returns"][number];

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function listPagesDueForSemantics(
  idle: string,
  limit: number,
): Promise<DuePageForSemantics[]> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("list_pages_due_for_topics", {
    p_idle: idle,
    p_limit: limit,
  });
  if (error) throw error;
  return data ?? [];
}

export async function enqueuePageSemanticJob(
  pageId: string,
  hash: string,
): Promise<EnqueuePageSemanticResult> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("enqueue_page_topic_job", {
    p_page_id: pageId,
    p_hash: hash,
  });
  if (error) throw error;

  if (data === "enqueued" || data === "requeued" || data === "processing") {
    return data;
  }
  throw new Error(`Unexpected enqueue_page_topic_job result: ${String(data)}`);
}

export async function applyPageSemanticResult(params: {
  jobId: string;
  topicName: string;
  topicDescription: string;
  pageSnapshot: string;
  pageSnapshotHash: string;
  llmModel: string;
}): Promise<ApplyPageSemanticResult> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("apply_page_topic_result", {
    p_job_id: params.jobId,
    p_topic_name: params.topicName,
    p_topic_description: params.topicDescription,
    p_page_snapshot: params.pageSnapshot,
    p_page_snapshot_hash: params.pageSnapshotHash,
    p_llm_model: params.llmModel,
  });
  if (error) throw error;

  if (
    data === "committed" ||
    data === "drifted" ||
    data === "not_processing" ||
    data === "not_found"
  ) {
    return data;
  }
  throw new Error(`Unexpected apply_page_topic_result result: ${String(data)}`);
}

export async function loadPageForSemantics(
  pageId: string,
): Promise<{ title: string; plainText: string } | null> {
  const supabase = await getAdmin();
  const { data, error } = await supabase
    .from("pages")
    .select("title, plain_text")
    .eq("id", pageId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { title: data.title ?? "", plainText: data.plain_text ?? "" };
}

export async function deletePageSemantics(pageId: string): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase.from("page_topics").delete().eq("page_id", pageId);
  if (error) throw error;
}

export async function completeInflightQueuedJobs(pageId: string): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("page_topic_jobs")
    .update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
      last_error: null,
      next_retry_at: null,
      started_at: null,
    })
    .eq("page_id", pageId)
    .in("status", ["QUEUED", "RETRY_WAIT"]);
  if (error) throw error;
}

export async function markPageSemanticJobFailed(id: string, lastError: string): Promise<void> {
  const supabase = await getAdmin();
  const { error } = await supabase
    .from("page_topic_jobs")
    .update({
      status: "FAILED",
      last_error: lastError,
      started_at: null,
      next_retry_at: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markPageSemanticJobRetryWait(
  id: string,
  params: {
    nextRetryAt: Date;
    lastError: string;
    attempts?: number;
  },
): Promise<void> {
  const supabase = await getAdmin();
  const payload: Record<string, unknown> = {
    status: "RETRY_WAIT",
    next_retry_at: params.nextRetryAt.toISOString(),
    last_error: params.lastError,
    started_at: null,
  };
  if (params.attempts !== undefined) {
    payload.attempts = params.attempts;
  }
  const { error } = await supabase
    .from("page_topic_jobs")
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;
}
