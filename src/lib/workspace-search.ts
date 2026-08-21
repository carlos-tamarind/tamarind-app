import { z } from "zod";

export const workspaceSearchSchema = z.object({
  c: z.string().uuid().optional(),
  p: z.string().uuid().optional(),
  m: z.string().uuid().optional(),
  k: z.string().uuid().optional(),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

export function withConversation(
  prev: WorkspaceSearch,
  conversationId: string | undefined,
  messageId?: string,
): WorkspaceSearch {
  return {
    ...prev,
    c: conversationId,
    m: conversationId ? messageId : undefined,
  };
}

export function withPage(
  prev: WorkspaceSearch,
  pageId: string | undefined,
  chunkId?: string,
): WorkspaceSearch {
  return {
    ...prev,
    p: pageId,
    k: pageId ? chunkId : undefined,
  };
}
