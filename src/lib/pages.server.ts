import { supabaseAdmin } from "@/integrations/supabase/client.server";

// A ProseMirror doc is "empty" when it's null/undefined, not a doc, or a doc
// with no non-empty children. Used server-side to refuse overwrites that
// would wipe existing page content.
export function isEmptyDoc(content: any): boolean {
  if (content === null || content === undefined) return true;
  if (typeof content !== "object") return true;
  if (content.type !== "doc") return true;
  const children = Array.isArray(content.content) ? content.content : [];
  if (children.length === 0) return true;
  // Treat a doc that only contains an empty paragraph as empty too.
  const hasSubstance = children.some((node: any) => {
    if (!node || typeof node !== "object") return false;
    if (Array.isArray(node.content) && node.content.length > 0) return true;
    if (typeof node.text === "string" && node.text.length > 0) return true;
    return false;
  });
  return !hasSubstance;
}


export async function getCurrentWorkspaceUser(workspaceId: string, userId: string) {
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

export async function assertCanEditPage(pageId: string, userId: string) {
  const { data: page, error } = await supabaseAdmin
    .from("pages")
    .select("id, workspace_id, visibility, owner_workspace_user_id, conversation_id")
    .eq("id", pageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!page) throw new Error("Page not found");

  const meWuId = await getCurrentWorkspaceUser(
    page.workspace_id as string,
    userId,
  );
  const visibility = page.visibility as
    | "private"
    | "workspace"
    | "conversation"
    | "external";

  if (visibility === "private" && page.owner_workspace_user_id !== meWuId) {
    throw new Error("You cannot edit this page");
  }

  if (visibility === "conversation") {
    // A user may edit a conversation-scoped page if they either participate
    // in the linked conversation OR were explicitly added as a collaborator
    // (e.g. via the Share flow, when the page ended up linked to a different
    // conversation than theirs).
    let allowed = false;
    if (page.conversation_id) {
      const { data: participant, error: participantError } = await supabaseAdmin
        .from("conversation_participants")
        .select("workspace_user_id")
        .eq("conversation_id", page.conversation_id as string)
        .eq("workspace_user_id", meWuId)
        .maybeSingle();
      if (participantError) throw new Error(participantError.message);
      if (participant) allowed = true;
    }
    if (!allowed) {
      const { data: collab } = await supabaseAdmin
        .from("page_collaborators")
        .select("workspace_user_id")
        .eq("page_id", pageId)
        .eq("workspace_user_id", meWuId)
        .maybeSingle();
      if (collab) allowed = true;
    }
    if (!allowed) throw new Error("You cannot edit this page");
  }


  return {
    workspaceId: page.workspace_id as string,
    workspaceUserId: meWuId,
    conversationId: (page.conversation_id as string | null) ?? null,
  };
}

export async function recordPageCollaborator(
  pageId: string,
  workspaceUserId: string,
) {
  await supabaseAdmin.from("page_collaborators").upsert(
    {
      page_id: pageId,
      workspace_user_id: workspaceUserId,
      last_edited_at: new Date().toISOString(),
    },
    { onConflict: "page_id,workspace_user_id" },
  );
}