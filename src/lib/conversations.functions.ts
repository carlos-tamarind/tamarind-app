import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getCurrentWorkspaceUser(workspaceId: string, userId: string) {
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

export const listWorkspaceMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await getCurrentWorkspaceUser(data.workspaceId, userId);

    const { data: members, error } = await supabaseAdmin
      .from("workspace_users")
      .select("id, user_id, display_name, avatar_url")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    return (members ?? []).map((m) => ({
      workspaceUserId: m.id as string,
      userId: m.user_id as string,
      displayName: (m.display_name as string | null) ?? null,
      avatarUrl: (m.avatar_url as string | null) ?? null,
    }));
  });

export const findOrCreateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        participantWorkspaceUserIds: z.array(z.string().uuid()).min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, userId);

    const otherIds = data.participantWorkspaceUserIds.filter(
      (id) => id !== meWuId,
    );
    const targetSet = Array.from(new Set([meWuId, ...otherIds])).sort();

    // Find existing conversation in workspace whose participant set equals target set.
    const { data: myConvParts, error: mErr } = await supabaseAdmin
      .from("conversation_participants")
      .select("conversation_id, conversations!inner(workspace_id)")
      .eq("workspace_user_id", meWuId);
    if (mErr) throw new Error(mErr.message);

    const candidateIds = (myConvParts ?? [])
      .filter((p: any) => p.conversations?.workspace_id === data.workspaceId)
      .map((p) => p.conversation_id as string);

    if (candidateIds.length > 0) {
      const { data: allParts, error: pErr } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id, workspace_user_id")
        .in("conversation_id", candidateIds);
      if (pErr) throw new Error(pErr.message);

      const byConv = new Map<string, string[]>();
      for (const row of allParts ?? []) {
        const cid = row.conversation_id as string;
        if (!byConv.has(cid)) byConv.set(cid, []);
        byConv.get(cid)!.push(row.workspace_user_id as string);
      }
      for (const [cid, ids] of byConv) {
        const sorted = Array.from(new Set(ids)).sort();
        if (
          sorted.length === targetSet.length &&
          sorted.every((id, i) => id === targetSet[i])
        ) {
          return { conversationId: cid, created: false };
        }
      }
    }

    // Validate all participants belong to workspace.
    const { data: validMembers, error: vErr } = await supabaseAdmin
      .from("workspace_users")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .in("id", targetSet);
    if (vErr) throw new Error(vErr.message);
    if ((validMembers?.length ?? 0) !== targetSet.length) {
      throw new Error("Some participants are not members of this workspace");
    }

    // Create conversation + participants via admin (bypass chicken-and-egg RLS).
    const { data: conv, error: cErr } = await supabaseAdmin
      .from("conversations")
      .insert({
        workspace_id: data.workspaceId,
        created_by_workspace_user_id: meWuId,
      })
      .select("id")
      .single();
    if (cErr || !conv) throw new Error(cErr?.message ?? "Create failed");

    const rows = targetSet.map((wuId) => ({
      conversation_id: conv.id as string,
      workspace_user_id: wuId,
      role: (wuId === meWuId ? "admin" : "member") as "admin" | "member",
    }));
    const { error: ppErr } = await supabaseAdmin
      .from("conversation_participants")
      .insert(rows);
    if (ppErr) throw new Error(ppErr.message);

    return { conversationId: conv.id as string, created: true };
  });
