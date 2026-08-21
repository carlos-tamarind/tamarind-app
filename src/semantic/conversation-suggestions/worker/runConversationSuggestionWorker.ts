/**
 * Conversation suggestion worker — placeholder.
 *
 * The database groundwork (tables, queue RPCs, user-scoped search wrappers) is in
 * place; the engine that claims jobs and produces suggestions lands in a later pass.
 * Until then this tick is inert so the cron endpoint can be wired and monitored.
 */
export type RunConversationSuggestionWorkerResult = {
  enqueued: number;
  processed: number;
  suggested: number;
  failed: number;
};

export async function runConversationSuggestionWorker(): Promise<RunConversationSuggestionWorkerResult> {
  return { enqueued: 0, processed: 0, suggested: 0, failed: 0 };
}
