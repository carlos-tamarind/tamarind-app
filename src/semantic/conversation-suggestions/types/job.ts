import type { Database } from "@/integrations/supabase/types";

export type ConversationSuggestionJob =
  Database["public"]["Tables"]["conversation_suggestion_jobs"]["Row"];

export type ConversationSuggestionJobStatus =
  Database["public"]["Enums"]["conversation_suggestion_job_status"];

export type ApplyConversationSuggestionResult =
  "committed" | "committed_none" | "already_pending" | "not_processing" | "not_found";

export type EnqueueConversationSuggestionResult =
  "enqueued" | "requeued" | "processing" | "not_found";

export type SuggestionEntityType = "message" | "page_chunk";
