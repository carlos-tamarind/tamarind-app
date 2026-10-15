import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isPlatformOwnerEmail } from "@/lib/platform-owner.server";
import type { SearchIdentity } from "../search.server";
import type { AgentSession } from "./schema";

export class AgentHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type AgentIdentity = SearchIdentity & { accessToken: string; expiresAt: number };
export const agentSearchEnabled = () => process.env.TAMARIND_AGENT_SEARCH_ENABLED === "true";

export async function authenticateAgentRequest(
  request: Request,
  env = process.env,
  clientFactory = createClient<Database>,
): Promise<AgentIdentity> {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new AgentHttpError(401, "UNAUTHORIZED", "A user Bearer token is required.");
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new AgentHttpError(500, "SERVER_ERROR", "Agent search is not configured.");
  }
  const accessToken = match[1];
  const supabase = clientFactory(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getClaims(accessToken);
  const claims = data?.claims;
  if (
    error ||
    !claims?.sub ||
    claims.role !== "authenticated" ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= Date.now()
  ) {
    throw new AgentHttpError(401, "UNAUTHORIZED", "The user session is invalid or expired.");
  }
  return { supabase, accessToken, userId: claims.sub, expiresAt: claims.exp * 1000 };
}

export async function authorizeAgentWorkspace(
  identity: AgentIdentity,
  workspaceId: string,
  configuredEmails = process.env.PLATFORM_OWNER_EMAILS ?? "",
): Promise<AgentSession> {
  const { data, error } = await identity.supabase.auth.getUser(identity.accessToken);
  if (error || !data.user || data.user.id !== identity.userId) {
    throw new AgentHttpError(401, "UNAUTHORIZED", "The user session is invalid or expired.");
  }
  if (!isPlatformOwnerEmail(data.user.email, configuredEmails)) {
    throw new AgentHttpError(
      403,
      "FORBIDDEN",
      "Platform owner and workspace admin access is required.",
    );
  }
  const { data: membership, error: membershipError } = await identity.supabase
    .from("workspace_users")
    .select("id, user_roles!inner(key)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", identity.userId)
    .maybeSingle();
  if (membershipError)
    throw new AgentHttpError(500, "SERVER_ERROR", "Workspace authorization failed.");
  const role = membership?.user_roles as { key?: string } | null | undefined;
  if (!membership || role?.key !== "admin") {
    throw new AgentHttpError(
      403,
      "FORBIDDEN",
      "Platform owner and workspace admin access is required.",
    );
  }
  return {
    userId: identity.userId,
    email: data.user.email!,
    workspaceId,
    expiresAt: identity.expiresAt,
  };
}
