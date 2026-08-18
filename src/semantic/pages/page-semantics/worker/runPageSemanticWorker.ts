export type PageSemanticWorkerResult = {
  analyzed: number;
  skipped: number;
  failed: number;
};

/**
 * Placeholder runner for the page semantic analysis pipeline.
 *
 * The database groundwork (page_semantics, page_semantic_jobs,
 * list_pages_due_for_semantics, claim_page_semantic_job,
 * enqueue_page_semantic_job, apply_page_semantic_result) and the HTTP/cron
 * plumbing are in place. The analysis engine (sweep, token threshold, LLM call,
 * retry policy) lands separately and replaces this body.
 */
export async function runPageSemanticWorker(): Promise<PageSemanticWorkerResult> {
  return { analyzed: 0, skipped: 0, failed: 0 };
}
