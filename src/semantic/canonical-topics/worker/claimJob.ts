import type { CanonicalTopicJob } from "../types/job";
import { formatStaleAfterInterval } from "./retry";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function isEmptyClaimError(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST116") return true;
  return error.message?.includes("0 rows") === true;
}

export async function claimCanonicalTopicJob(): Promise<CanonicalTopicJob | null> {
  const supabase = await getAdmin();

  const { data, error } = await supabase.rpc("claim_canonical_topic_job", {
    p_stale_after: formatStaleAfterInterval(),
  });

  if (error) {
    if (isEmptyClaimError(error)) return null;
    throw error;
  }

  // A composite-returning RPC yields an all-null row when nothing is claimable.
  const job = (data as CanonicalTopicJob | null) ?? null;
  if (!job || !job.id) return null;

  return job;
}
