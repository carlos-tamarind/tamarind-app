import { z } from "zod/v4";
import { searchScopeSchema } from "../types";

export const agentScopeSchema = z.enum(searchScopeSchema.options);
export const agentSessionRequestSchema = z.object({ workspaceId: z.string().uuid() }).strict();
export const agentSearchRequestSchema = agentSessionRequestSchema
  .extend({
    query: z.string().max(2000).trim().min(1),
    scope: agentScopeSchema.default("all"),
  })
  .strict();
export const agentSessionSchema = z
  .object({
    userId: z.string().uuid(),
    email: z.string().email(),
    workspaceId: z.string().uuid(),
    expiresAt: z.number().int().positive(), // Unix milliseconds
  })
  .strict();
export const agentSearchResponseSchema = z
  .object({
    workspaceId: z.string().uuid(),
    scope: agentScopeSchema,
    results: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            sourceType: z.enum(["page", "conversation", "message"]),
            title: z.string().max(300),
            snippet: z.string().max(500),
            url: z.string().url(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export type AgentSearchInput = z.input<typeof agentSearchRequestSchema>;
export type AgentSearchRequest = z.output<typeof agentSearchRequestSchema>;
export type AgentSearchResponse = z.infer<typeof agentSearchResponseSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
