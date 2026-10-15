import { buildSearchRequest } from "./buildSearchRequest";
import { searchOrchestrator, type SearchOrchestratorOptions } from "./SearchOrchestrator";
import type { SearchScope, SearchSupabaseClient } from "./types";

export type SearchIdentity = { supabase: SearchSupabaseClient; userId: string };
type SearchInput = { workspaceId: string; query: string; scope: SearchScope };

export async function authorizeSearchWorkspace(identity: SearchIdentity, workspaceId: string) {
  const { data, error } = await identity.supabase
    .from("workspace_users")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", identity.userId)
    .maybeSingle();
  if (error) throw new Error("Workspace authorization failed");
  if (!data) throw new Error("Not a member of this workspace");
  return data.id;
}

/** Injection keeps authorization-before-retrieval testable without a database. */
export function createWorkspaceSearch(
  dependencies = {
    build: buildSearchRequest,
    search: searchOrchestrator.search.bind(searchOrchestrator),
  },
) {
  async function prepare(identity: SearchIdentity, input: SearchInput) {
    await authorizeSearchWorkspace(identity, input.workspaceId);
    return dependencies.build({
      workspaceId: input.workspaceId,
      scope: input.scope,
      rawQuery: input.query,
    });
  }
  return {
    prepare,
    async execute(
      identity: SearchIdentity,
      input: SearchInput,
      options: SearchOrchestratorOptions = {},
    ) {
      const request = await prepare(identity, input);
      if (!request) return { keywordResults: [], semanticResults: [], mergedResults: [] };
      return dependencies.search(identity.supabase, request, options);
    },
  };
}

export const workspaceSearch = createWorkspaceSearch();
