import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { workspaceSearch } from "@/search/search.server";
import { searchScopeSchema } from "@/search/types";

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
    const searchRequest = await workspaceSearch.prepare(context, data);
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
        enableKeywordSearch: z.boolean().default(true),
        enableSemanticSearch: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    return workspaceSearch.execute(context, data, {
      enableKeywordSearch: data.enableKeywordSearch,
      enableSemanticSearch: data.enableSemanticSearch,
    });
  });
