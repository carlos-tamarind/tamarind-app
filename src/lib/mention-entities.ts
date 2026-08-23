export type MentionEntityItem = {
  id: string;
  label: string;
  kind: "member" | "conversation";
  avatarUrl?: string | null;
};

type WorkspaceMember = {
  workspaceUserId: string;
  label: string;
  avatarUrl: string | null;
};

type ConversationSummary = {
  id: string;
  title: string;
  type: "direct" | "group" | "channel";
  avatarUrl?: string | null;
};

export function buildMentionEntityList(
  members: WorkspaceMember[],
  conversations: ConversationSummary[],
  query: string,
): MentionEntityItem[] {
  const q = query.toLowerCase();
  const memberItems: MentionEntityItem[] = members
    .filter((m) => m.label.toLowerCase().includes(q))
    .map((m) => ({
      id: m.workspaceUserId,
      label: m.label,
      kind: "member" as const,
      avatarUrl: m.avatarUrl,
    }));

  const conversationItems: MentionEntityItem[] = conversations
    .filter((c) => c.type !== "direct")
    .filter((c) => c.title.toLowerCase().includes(q))
    .map((c) => ({
      id: c.id,
      label: c.title,
      kind: "conversation" as const,
      avatarUrl: c.avatarUrl ?? null,
    }));

  return [...memberItems, ...conversationItems]
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
    .slice(0, 8);
}

export async function fetchMentionEntities(options: {
  workspaceId: string;
  query: string;
  fetchMembers: (args: { data: { workspaceId: string } }) => Promise<WorkspaceMember[]>;
  fetchConversations: (args: { data: { workspaceId: string } }) => Promise<ConversationSummary[]>;
}): Promise<MentionEntityItem[]> {
  const [members, conversations] = await Promise.all([
    options.fetchMembers({ data: { workspaceId: options.workspaceId } }),
    options.fetchConversations({ data: { workspaceId: options.workspaceId } }),
  ]);
  return buildMentionEntityList(members, conversations, options.query);
}
