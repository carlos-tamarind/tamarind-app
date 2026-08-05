import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSearchRequest } from "@/search/buildSearchRequest";
import { searchOrchestrator } from "@/search/SearchOrchestrator";
import { searchScopeSchema } from "@/search/types";

async function getCurrentWorkspaceUser(workspaceId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspace_users")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not a member of this workspace");
  return data.id as string;
}

export const prepareSearchRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string(),
        scope: searchScopeSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await getCurrentWorkspaceUser(data.workspaceId, context.userId);
    const searchRequest = await buildSearchRequest({
      workspaceId: data.workspaceId,
      scope: data.scope,
      rawQuery: data.query,
    });
    return { searchRequest };
  });

export const executeSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string(),
        scope: searchScopeSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await getCurrentWorkspaceUser(data.workspaceId, context.userId);

    const searchRequest = await buildSearchRequest({
      workspaceId: data.workspaceId,
      scope: data.scope,
      rawQuery: data.query,
    });

    if (!searchRequest) {
      return { results: [] };
    }

    const results = await searchOrchestrator.search(context.supabase, searchRequest);
    return { results };
  });
