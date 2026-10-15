import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { agentSessionRequestSchema } from "@/search/agents/schema";
import {
  AgentHttpError,
  agentSearchEnabled,
  authenticateAgentRequest,
  authorizeAgentWorkspace,
} from "@/search/agents/auth.server";

export const getMcpSettingsState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => agentSessionRequestSchema.parse(input))
  .handler(async ({ data }) => {
    if (!agentSearchEnabled()) return { enabled: false, eligible: false };
    try {
      await authorizeAgentWorkspace(await authenticateAgentRequest(getRequest()), data.workspaceId);
      return { enabled: true, eligible: true };
    } catch (error) {
      if (error instanceof AgentHttpError && (error.status === 401 || error.status === 403)) {
        return { enabled: true, eligible: false };
      }
      throw new Error("MCP availability could not be checked.");
    }
  });
