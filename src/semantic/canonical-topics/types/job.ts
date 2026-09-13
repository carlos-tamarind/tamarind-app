import type { Database } from "@/integrations/supabase/types";

export type CanonicalTopicJob = Database["public"]["Tables"]["canonical_topic_jobs"]["Row"];

export type CanonicalTopicJobType = Database["public"]["Enums"]["canonical_topic_job_type"];

export type CanonicalTopicJobStatus = Database["public"]["Enums"]["canonical_topic_job_status"];

export type ApplyCanonicalTopicResult = "committed" | "not_found" | "not_processing";
