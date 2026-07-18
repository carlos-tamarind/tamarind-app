import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyWorkspaceProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: row, error } = await supabase
      .from("workspace_users")
      .select("id, display_name, avatar_url")
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const email = (claims as any)?.email ?? null;
    return {
      workspaceUserId: row?.id ?? null,
      displayName: row?.display_name ?? null,
      avatarUrl: row?.avatar_url ?? null,
      email: email as string | null,
    };
  });

export const updateMyDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        displayName: z.string().trim().min(3).max(40),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("workspace_users")
      .update({ display_name: data.displayName })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("Failed to update display name");
    }
    return { ok: true as const };
  });

