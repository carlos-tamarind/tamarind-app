import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    if (!page.conversation_id) throw new Error("Page is not linked to a conversation");
    const { data: participant, error: participantError } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_user_id")
      .eq("conversation_id", page.conversation_id as string)
      .eq("workspace_user_id", meWuId)
      .maybeSingle();
    if (participantError) throw new Error(participantError.message);
    if (!participant) throw new Error("You cannot edit this page");
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