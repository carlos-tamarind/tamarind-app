import type { PageSemanticJob } from "../types/job";
import { formatStaleAfterInterval } from "./retry";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function isEmptyClaimError(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST116") return true;
  return error.message?.includes("0 rows") === true;
}

export async function claimPageSemanticJob(): Promise<PageSemanticJob | null> {
  const supabase = await getAdmin();
  const { data, error } = await supabase.rpc("claim_page_semantic_job", {
    p_stale_after: formatStaleAfterInterval(),
  });

  if (error) {
    if (isEmptyClaimError(error)) return null;
    throw error;
  }

  const job = (data as PageSemanticJob | null) ?? null;
  if (!job || !job.id) return null;
  return job;
}
