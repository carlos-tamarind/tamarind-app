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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Resolve target conversations (creating 1:1 conversations as needed),
// post a "shared page" announcement into each, and upsert page_collaborators
// for every unique participant (excluding the owner). Does NOT mutate page
// visibility — the caller is responsible for that.
export async function shareToConversations(params: {
  pageId: string;
  workspaceId: string;
  ownerWuId: string | null;
  meWuId: string;
  pageTitle: string | null;
  workspaceUserIds: string[];
  conversationIds: string[];
}): Promise<{ conversationIds: string[] }> {
  const { pageId, workspaceId, ownerWuId, meWuId, pageTitle } = params;
  const targetConvIds: string[] = [];
  const seen = new Set<string>();

  // 1a) 1:1 conversations with each selected user.
  for (const otherWuId of params.workspaceUserIds) {
    if (otherWuId === meWuId) continue;
    const pair = Array.from(new Set([meWuId, otherWuId])).sort();

    const { data: myParts, error: mErr } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(workspace_id, type)")
      .eq("workspace_user_id", meWuId);
    if (mErr) throw new Error(mErr.message);

    const candidateIds = (myParts ?? [])
      .filter((p: any) => p.conversations?.workspace_id === workspaceId)
      .map((p) => p.conversation_id as string);

    let foundId: string | null = null;
    if (candidateIds.length > 0) {
      const { data: allParts, error: apErr } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id, workspace_user_id")
        .in("conversation_id", candidateIds);
      if (apErr) throw new Error(apErr.message);
      const byConv = new Map<string, string[]>();
      for (const row of allParts ?? []) {
        const cid = row.conversation_id as string;
        if (!byConv.has(cid)) byConv.set(cid, []);
        byConv.get(cid)!.push(row.workspace_user_id as string);
      }
      for (const [cid, ids] of byConv) {
        const sorted = Array.from(new Set(ids)).sort();
        if (
          sorted.length === pair.length &&
          sorted.every((id, i) => id === pair[i])
        ) {
          foundId = cid;
          break;
        }
      }
    }

    if (!foundId) {
      const { data: valid } = await supabaseAdmin
        .from("workspace_users")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", otherWuId)
        .maybeSingle();
      if (!valid) throw new Error("Recipient is not a member of this workspace");

      const { data: newConv, error: cErr } = await supabaseAdmin
        .from("conversations")
        .insert({
          workspace_id: workspaceId,
          created_by_workspace_user_id: meWuId,
          type: "direct",
        })
        .select("id")
        .single();
      if (cErr || !newConv) throw new Error(cErr?.message ?? "Create failed");
      const rows = pair.map((wuId) => ({
        conversation_id: newConv.id as string,
        workspace_user_id: wuId,
        role: (wuId === meWuId ? "admin" : "member") as "admin" | "member",
      }));
      const { error: ppErr } = await supabaseAdmin
        .from("conversation_participants")
        .insert(rows);
      if (ppErr) throw new Error(ppErr.message);
      foundId = newConv.id as string;
    }

    if (!seen.has(foundId)) {
      seen.add(foundId);
      targetConvIds.push(foundId);
    }
  }

  // 1b) Group conversations.
  for (const cid of params.conversationIds) {
    if (seen.has(cid)) continue;
    const { data: conv, error: cErr } = await supabaseAdmin
      .from("conversations")
      .select("id, type, workspace_id")
      .eq("id", cid)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!conv || conv.workspace_id !== workspaceId) {
      throw new Error("Conversation not found");
    }
    if (conv.type !== "group") {
      throw new Error("Only group conversations can be shared with");
    }
    const { data: mePart } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_user_id")
      .eq("conversation_id", cid)
      .eq("workspace_user_id", meWuId)
      .maybeSingle();
    if (!mePart) throw new Error("You are not a participant of this conversation");
    seen.add(cid);
    targetConvIds.push(cid);
  }

  if (targetConvIds.length === 0) {
    throw new Error("Select at least one user or conversation to share with");
  }

  // 2) Announcement + bump each conversation.
  const title = (pageTitle ?? "")?.trim() || "Untitled";
  const safeTitle = escapeHtml(title);
  const html =
    `<p>Hey! I just shared this page with you:</p>` +
    `<p><span class="mention-page" data-id="${escapeHtml(pageId)}" data-label="${safeTitle}">${safeTitle}</span></p>`;

  for (const cid of targetConvIds) {
    const { error: mErr } = await supabaseAdmin.from("messages").insert({
      conversation_id: cid,
      workspace_id: workspaceId,
      author_workspace_user_id: meWuId,
      raw_text: html,
    });
    if (mErr) throw new Error(mErr.message);
    await supabaseAdmin
      .from("conversations")
      .update({ last_modified_at: new Date().toISOString() })
      .eq("id", cid);
  }

  // 3) Upsert collaborators = union of all participants, minus the owner.
  const { data: allParts, error: apErr } = await supabaseAdmin
    .from("conversation_participants")
    .select("workspace_user_id")
    .in("conversation_id", targetConvIds);
  if (apErr) throw new Error(apErr.message);
  const collabWuIds = Array.from(
    new Set(
      (allParts ?? [])
        .map((p) => p.workspace_user_id as string)
        .filter((id) => id && id !== ownerWuId),
    ),
  );
  if (collabWuIds.length > 0) {
    const rows = collabWuIds.map((wuId) => ({
      page_id: pageId,
      workspace_user_id: wuId,
      last_edited_at: new Date().toISOString(),
    }));
    const { error: cErr } = await supabaseAdmin
      .from("page_collaborators")
      .upsert(rows, {
        onConflict: "page_id,workspace_user_id",
        ignoreDuplicates: true,
      });
    if (cErr) throw new Error(cErr.message);
  }

  return { conversationIds: targetConvIds };
}