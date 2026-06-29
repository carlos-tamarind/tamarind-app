import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchEmailsForUserIds, resolveLabel } from "@/lib/user-label.server";


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

async function assertParticipant(conversationId: string, userId: string) {
  const { data: conv, error: cErr } = await supabaseAdmin
    .from("conversations")
    .select("id, workspace_id")
    .eq("id", conversationId)
    .single();
  if (cErr || !conv) throw new Error("Conversation not found");
  const meWuId = await getCurrentWorkspaceUser(conv.workspace_id as string, userId);
  const { data: part } = await supabaseAdmin
    .from("conversation_participants")
    .select("workspace_user_id")
    .eq("conversation_id", conversationId)
    .eq("workspace_user_id", meWuId)
    .maybeSingle();
  if (!part) throw new Error("Not a participant of this conversation");
  return { meWuId, workspaceId: conv.workspace_id as string };
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

    const rows = members ?? [];
    const emails = await fetchEmailsForUserIds(
      rows.filter((m) => !((m.display_name ?? "") as string).trim()).map((m) => m.user_id as string),
    );

    return rows.map((m) => ({
      workspaceUserId: m.id as string,
      userId: m.user_id as string,
      displayName: (m.display_name as string | null) ?? null,
      email: emails.get(m.user_id as string) ?? null,
      label: resolveLabel(
        { display_name: m.display_name as any, user_id: m.user_id as any },
        emails,
      ),
      avatarUrl: (m.avatar_url as string | null) ?? null,
    }));
  });


export const listMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, userId);

    const { data: parts, error } = await supabaseAdmin
      .from("conversation_participants")
      .select(
        "conversation_id, conversations!inner(id, title, type, workspace_id, last_modified_at)",
      )
      .eq("workspace_user_id", meWuId);
    if (error) throw new Error(error.message);

    const convs = (parts ?? [])
      .map((p: any) => p.conversations)
      .filter((c: any) => c && c.workspace_id === data.workspaceId);

    const convIds = convs.map((c: any) => c.id as string);
    const labelByConv = new Map<string, string>();
    if (convIds.length > 0) {
      const { data: allParts } = await supabaseAdmin
        .from("conversation_participants")
        .select(
          "conversation_id, workspace_users!inner(id, display_name, user_id)",
        )
        .in("conversation_id", convIds);
      const byConv = new Map<
        string,
        { displayName: string | null; userId: string }[]
      >();
      for (const row of allParts ?? []) {
        const cid = row.conversation_id as string;
        const wu: any = (row as any).workspace_users;
        if (wu.id === meWuId) continue;
        if (!byConv.has(cid)) byConv.set(cid, []);
        byConv.get(cid)!.push({
          displayName: (wu.display_name as string | null) ?? null,
          userId: wu.user_id as string,
        });
      }
      const emails = await fetchEmailsForUserIds(
        Array.from(byConv.values())
          .flat()
          .filter((e) => !(e.displayName ?? "").trim())
          .map((e) => e.userId),
      );
      for (const [cid, entries] of byConv) {
        const names = entries.map((e) =>
          resolveLabel({ display_name: e.displayName, user_id: e.userId }, emails),
        );
        labelByConv.set(cid, names.slice(0, 3).join(", "));
      }
    }


    return convs.map((c: any) => ({
      id: c.id as string,
      title:
        (c.title as string | null) ??
        labelByConv.get(c.id as string) ??
        "Conversation",
      type: (c.type as "direct" | "group" | "channel") ?? "direct",
      lastModifiedAt: c.last_modified_at as string,
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

    const { data: validMembers, error: vErr } = await supabaseAdmin
      .from("workspace_users")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .in("id", targetSet);
    if (vErr) throw new Error(vErr.message);
    if ((validMembers?.length ?? 0) !== targetSet.length) {
      throw new Error("Some participants are not members of this workspace");
    }

    const convType = targetSet.length <= 2 ? "direct" : "group";

    const { data: conv, error: cErr } = await supabaseAdmin
      .from("conversations")
      .insert({
        workspace_id: data.workspaceId,
        created_by_workspace_user_id: meWuId,
        type: convType,
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

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId } = await assertParticipant(data.conversationId, context.userId);

    const { data: conv, error } = await supabaseAdmin
      .from("conversations")
      .select("id, title, type, image_url, workspace_id")
      .eq("id", data.conversationId)
      .single();
    if (error || !conv) throw new Error(error?.message ?? "Not found");

    const { data: parts } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_users!inner(id, display_name, avatar_url, user_id)")
      .eq("conversation_id", data.conversationId);

    const rawParts = (parts ?? []).map((p: any) => p.workspace_users);
    const missingNameUserIds = Array.from(
      new Set(
        rawParts
          .filter((wu: any) => !wu.display_name)
          .map((wu: any) => wu.user_id as string),
      ),
    );
    const emailByUserId = new Map<string, string>();
    await Promise.all(
      missingNameUserIds.map(async (uid) => {
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          if (u?.user?.email) emailByUserId.set(uid, u.user.email);
        } catch {}
      }),
    );

    const participants = rawParts.map((wu: any) => ({
      workspaceUserId: wu.id as string,
      displayName:
        (wu.display_name as string | null) ??
        emailByUserId.get(wu.user_id as string) ??
        "Unknown",
      avatarUrl: (wu.avatar_url as string | null) ?? null,
      isMe: wu.id === meWuId,
    }));


    let title = conv.title as string | null;
    if (!title) {
      const others = participants.filter((p) => !p.isMe).map((p) => p.displayName);
      title = others.slice(0, 3).join(", ") || "Conversation";
    }

    return {
      id: conv.id as string,
      title,
      type: (conv.type as "direct" | "group" | "channel") ?? "direct",
      imageUrl: (conv.image_url as string | null) ?? null,
      workspaceId: conv.workspace_id as string,
      participants,
    };
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.conversationId, context.userId);
    const { data: msgs, error } = await supabaseAdmin
      .from("messages")
      .select("id, raw_text, author_workspace_user_id, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(data.limit ?? 200);
    if (error) throw new Error(error.message);
    return (msgs ?? []).map((m) => ({
      id: m.id as string,
      rawText: m.raw_text as string,
      authorWorkspaceUserId: m.author_workspace_user_id as string | null,
      createdAt: m.created_at as string,
    }));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        rawText: z.string().min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId, workspaceId } = await assertParticipant(
      data.conversationId,
      context.userId,
    );
    const { data: msg, error } = await supabaseAdmin
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        workspace_id: workspaceId,
        author_workspace_user_id: meWuId,
        raw_text: data.rawText,
      })
      .select("id, created_at")
      .single();
    if (error || !msg) throw new Error(error?.message ?? "Send failed");

    await supabaseAdmin
      .from("conversations")
      .update({ last_modified_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return { id: msg.id as string, createdAt: msg.created_at as string };
  });

export const addParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        workspaceUserIds: z.array(z.string().uuid()).min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { workspaceId } = await assertParticipant(
      data.conversationId,
      context.userId,
    );

    const { data: valid } = await supabaseAdmin
      .from("workspace_users")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("id", data.workspaceUserIds);
    const validIds = (valid ?? []).map((v) => v.id as string);
    if (validIds.length === 0) return { added: 0 };

    const { data: existing } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_user_id")
      .eq("conversation_id", data.conversationId);
    const existingSet = new Set(
      (existing ?? []).map((e) => e.workspace_user_id as string),
    );
    const newIds = validIds.filter((id) => !existingSet.has(id));
    if (newIds.length === 0) return { added: 0 };

    const rows = newIds.map((wuId) => ({
      conversation_id: data.conversationId,
      workspace_user_id: wuId,
      role: "member" as const,
    }));
    const { error: insErr } = await supabaseAdmin
      .from("conversation_participants")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);

    // Promote to group if needed
    const totalParticipants = existingSet.size + newIds.length;
    if (totalParticipants > 2) {
      await supabaseAdmin
        .from("conversations")
        .update({ type: "group" })
        .eq("id", data.conversationId);
    }

    return { added: newIds.length };
  });

export const listConversationPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.conversationId, context.userId);
    const { data: pages, error } = await supabaseAdmin
      .from("pages")
      .select("id, title, last_modified_at")
      .eq("conversation_id", data.conversationId)
      .order("last_modified_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (pages ?? []).map((p) => ({
      id: p.id as string,
      title: (p.title as string) ?? "Untitled",
      lastModifiedAt: p.last_modified_at as string,
    }));
  });

export const createConversationPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId, workspaceId } = await assertParticipant(
      data.conversationId,
      context.userId,
    );
    const { data: page, error } = await supabaseAdmin
      .from("pages")
      .insert({
        workspace_id: workspaceId,
        created_by_workspace_user_id: meWuId,
        owner_workspace_user_id: meWuId,
        visibility: "conversation",
        page_type: "standard",
        origin_type: "conversation",
        origin_source_id: data.conversationId,
        conversation_id: data.conversationId,
      })
      .select("id")
      .single();
    if (error || !page) throw new Error(error?.message ?? "Create failed");
    return { pageId: page.id as string };
  });

export const listMentionablePages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        conversationId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.conversationId, context.userId);
    const { data: pages, error } = await supabaseAdmin
      .from("pages")
      .select("id, title, visibility, conversation_id")
      .eq("workspace_id", data.workspaceId)
      .or(
        `visibility.eq.workspace,conversation_id.eq.${data.conversationId}`,
      );
    if (error) throw new Error(error.message);
    return (pages ?? []).map((p: any) => ({
      id: p.id as string,
      title: (p.title as string) ?? "Untitled",
      visibility: p.visibility as string,
    }));
  });

export const renameConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.conversationId, context.userId);

    const { data: conv, error: cErr } = await supabaseAdmin
      .from("conversations")
      .select("type")
      .eq("id", data.conversationId)
      .single();
    if (cErr || !conv) throw new Error(cErr?.message ?? "Not found");

    const { count } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_user_id", { count: "exact", head: true })
      .eq("conversation_id", data.conversationId);

    if ((conv.type as string) === "direct" || (count ?? 0) <= 2) {
      throw new Error("Only group conversations can be renamed");
    }

    const { error } = await supabaseAdmin
      .from("conversations")
      .update({ title: data.title, last_modified_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
