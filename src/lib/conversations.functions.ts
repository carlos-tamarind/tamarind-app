import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DebugLogger } from "@/lib/debugLogger";
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

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function postPageAnnouncementMessage(params: {
  conversationId: string;
  workspaceId: string;
  authorWuId: string;
  pageId: string;
  pageTitle: string;
}) {
  try {
    const title = params.pageTitle && params.pageTitle.trim().length > 0
      ? params.pageTitle
      : "Untitled";
    const safeTitle = escapeHtml(title);
    const html =
      `<p>Hey! I just created this page:</p>` +
      `<p><span class="mention-page" data-id="${escapeHtml(params.pageId)}" data-label="${safeTitle}">${safeTitle}</span></p>`;
    const { data: msg, error } = await supabaseAdmin.from("messages").insert({
      conversation_id: params.conversationId,
      workspace_id: params.workspaceId,
      author_workspace_user_id: params.authorWuId,
      raw_text: html,
    }).select("id").single();
    if (error || !msg) throw error;
    const { enqueueMessageSemanticsProcessing } = await import(
      "@/semantic/enqueueMessageSemanticsProcessing"
    );
    enqueueMessageSemanticsProcessing({
      messageId: msg.id as string,
      rawMessage: html,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ last_modified_at: new Date().toISOString() })
      .eq("id", params.conversationId);
  } catch (e) {
    console.warn("[conversations] failed to post page announcement", e);
  }
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
        "conversation_id, conversations!inner(id, title, type, workspace_id, last_modified_at, image_url)",
      )
      .eq("workspace_user_id", meWuId);
    if (error) throw new Error(error.message);

    const convs = (parts ?? [])
      .map((p: any) => p.conversations)
      .filter((c: any) => c && c.workspace_id === data.workspaceId);

    const convIds = convs.map((c: any) => c.id as string);
    const labelByConv = new Map<string, string>();
    const avatarByConv = new Map<string, string | null>();
    const countByConv = new Map<string, number>();
    if (convIds.length > 0) {
      const { data: allParts } = await supabaseAdmin
        .from("conversation_participants")
        .select(
          "conversation_id, workspace_users!inner(id, display_name, user_id, avatar_url)",
        )
        .in("conversation_id", convIds);
      const byConv = new Map<
        string,
        { displayName: string | null; userId: string; avatarUrl: string | null }[]
      >();
      for (const row of allParts ?? []) {
        const cid = row.conversation_id as string;
        countByConv.set(cid, (countByConv.get(cid) ?? 0) + 1);
        const wu: any = (row as any).workspace_users;
        if (wu.id === meWuId) continue;
        if (!byConv.has(cid)) byConv.set(cid, []);
        byConv.get(cid)!.push({
          displayName: (wu.display_name as string | null) ?? null,
          userId: wu.user_id as string,
          avatarUrl: (wu.avatar_url as string | null) ?? null,
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
        const other = entries[0];
        if (other) avatarByConv.set(cid, other.avatarUrl);
      }
    }


    const results = convs.map((c: any) => {
      const type = (c.type as "direct" | "group" | "channel") ?? "direct";
      const imageUrl = (c.image_url as string | null) ?? null;
      const avatarUrl =
        type === "direct" ? (avatarByConv.get(c.id as string) ?? null) : imageUrl;
      return {
        id: c.id as string,
        title:
          (c.title as string | null) ??
          labelByConv.get(c.id as string) ??
          "Conversation",
        type,
        lastModifiedAt: c.last_modified_at as string,
        avatarUrl,
        participantCount: countByConv.get(c.id as string) ?? 0,
      };
    });

    DebugLogger.table({
      scope: "conversations",
      event: "listMyConversations",
      collapsed: true,
      data: Object.fromEntries(
        results.map((c) => [
          c.id,
          { title: c.title, type: c.type, lastModifiedAt: c.lastModifiedAt },
        ]),
      ),
    });

    return results;
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
      .select("id, title, type, image_url, workspace_id, created_by_workspace_user_id")
      .eq("id", data.conversationId)
      .single();
    if (error || !conv) throw new Error(error?.message ?? "Not found");

    const { data: parts } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_users!inner(id, display_name, avatar_url, user_id)")
      .eq("conversation_id", data.conversationId);

    const rawParts = (parts ?? []).map((p: any) => p.workspace_users);

    const creatorWuId = (conv.created_by_workspace_user_id as string | null) ?? null;
    let creatorRow: { id: string; display_name: string | null; user_id: string | null } | null =
      null;
    if (creatorWuId) {
      const fromParts = rawParts.find((wu: any) => wu.id === creatorWuId);
      if (fromParts) {
        creatorRow = {
          id: fromParts.id,
          display_name: fromParts.display_name ?? null,
          user_id: fromParts.user_id ?? null,
        };
      } else {
        const { data: wu } = await supabaseAdmin
          .from("workspace_users")
          .select("id, display_name, user_id")
          .eq("id", creatorWuId)
          .maybeSingle();
        if (wu) {
          creatorRow = {
            id: wu.id as string,
            display_name: (wu.display_name as string | null) ?? null,
            user_id: (wu.user_id as string | null) ?? null,
          };
        }
      }
    }

    const emailUserIds = rawParts
      .filter((wu: any) => !((wu.display_name ?? "") as string).trim())
      .map((wu: any) => wu.user_id as string);
    if (
      creatorRow &&
      !((creatorRow.display_name ?? "") as string).trim() &&
      creatorRow.user_id
    ) {
      emailUserIds.push(creatorRow.user_id);
    }
    const emails = await fetchEmailsForUserIds(emailUserIds);

    const participants = rawParts.map((wu: any) => {
      const label = resolveLabel(
        { display_name: wu.display_name, user_id: wu.user_id },
        emails,
      );
      return {
        workspaceUserId: wu.id as string,
        displayName: label,
        label,
        avatarUrl: (wu.avatar_url as string | null) ?? null,
        isMe: wu.id === meWuId,
      };
    });

    const createdBy = creatorRow
      ? {
          workspaceUserId: creatorRow.id,
          label: resolveLabel(
            { display_name: creatorRow.display_name, user_id: creatorRow.user_id },
            emails,
          ),
        }
      : null;

    let title = conv.title as string | null;
    if (!title) {
      const others = participants.filter((p) => !p.isMe).map((p) => p.label);
      title = others.slice(0, 3).join(", ") || "Conversation";
    }


    return {
      id: conv.id as string,
      title,
      type: (conv.type as "direct" | "group" | "channel") ?? "direct",
      imageUrl: (conv.image_url as string | null) ?? null,
      workspaceId: conv.workspace_id as string,
      participants,
      createdBy,
    };
  });


const LIST_MESSAGES_LIMIT = 200;
const MESSAGE_AROUND_RADIUS = 25;
const MESSAGE_LIST_COLUMNS =
  "id, raw_text, author_workspace_user_id, created_at, purged_at";

type MessageListRow = {
  id: string;
  raw_text: string | null;
  author_workspace_user_id: string | null;
  created_at: string;
  purged_at: string | null;
};

async function mapMessageRows(rows: MessageListRow[]) {
  const labelByWuId = await loadAuthorLabels(rows);
  return rows.map((m) => ({
    id: m.id,
    rawText: m.raw_text ?? "",
    authorWorkspaceUserId: m.author_workspace_user_id,
    authorLabel: m.author_workspace_user_id
      ? labelByWuId.get(m.author_workspace_user_id) ?? "Archived user"
      : "Unknown user",
    createdAt: m.created_at,
    purgedAt: m.purged_at ?? null,
  }));
}

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        limit: z.number().int().min(1).max(LIST_MESSAGES_LIMIT).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.conversationId, context.userId);
    const { data: msgs, error } = await supabaseAdmin
      .from("messages")
      .select(MESSAGE_LIST_COLUMNS)
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? LIST_MESSAGES_LIMIT);
    if (error) throw new Error(error.message);

    const newestFirst = (msgs ?? []) as MessageListRow[];
    return mapMessageRows(newestFirst.slice().reverse());
  });

export const listMessagesAround = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        messageId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertParticipant(data.conversationId, context.userId);

    const { data: target, error: targetError } = await supabaseAdmin
      .from("messages")
      .select(MESSAGE_LIST_COLUMNS)
      .eq("id", data.messageId)
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    if (targetError) throw new Error(targetError.message);
    if (!target) throw new Error("Message not found");

    const targetRow = target as MessageListRow;

    const [olderResult, newerResult] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select(MESSAGE_LIST_COLUMNS)
        .eq("conversation_id", data.conversationId)
        .lt("created_at", targetRow.created_at)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_AROUND_RADIUS),
      supabaseAdmin
        .from("messages")
        .select(MESSAGE_LIST_COLUMNS)
        .eq("conversation_id", data.conversationId)
        .gt("created_at", targetRow.created_at)
        .order("created_at", { ascending: true })
        .limit(MESSAGE_AROUND_RADIUS),
    ]);
    if (olderResult.error) throw new Error(olderResult.error.message);
    if (newerResult.error) throw new Error(newerResult.error.message);

    const older = ((olderResult.data ?? []) as MessageListRow[]).slice().reverse();
    const newer = (newerResult.data ?? []) as MessageListRow[];
    return mapMessageRows([...older, targetRow, ...newer]);
  });


export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        rawText: z.string().min(1).max(10000),
        id: z.string().uuid().optional(),
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
        ...(data.id ? { id: data.id } : {}),
        conversation_id: data.conversationId,
        workspace_id: workspaceId,
        author_workspace_user_id: meWuId,
        raw_text: data.rawText,
      })
      .select("id, created_at")
      .single();
    if (error || !msg) throw new Error(error?.message ?? "Send failed");

    const { enqueueMessageSemanticsProcessing } = await import(
      "@/semantic/enqueueMessageSemanticsProcessing"
    );
    enqueueMessageSemanticsProcessing({
      messageId: msg.id as string,
      rawMessage: data.rawText,
    });

    await supabaseAdmin
      .from("conversations")
      .update({ last_modified_at: new Date().toISOString() })
      .eq("id", data.conversationId);

    return { id: msg.id as string, createdAt: msg.created_at as string };
  });

export const trashMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        messageIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { computeMessageTrashPurgedAt } = await import(
      "@/lib/delete-entities/messages/trash"
    );
    const uniqueIds = Array.from(new Set(data.messageIds));
    const { data: rows, error } = await supabaseAdmin
      .from("messages")
      .select("id, conversation_id, author_workspace_user_id, purged_at")
      .in("id", uniqueIds);
    if (error) throw new Error(error.message);
    if (!rows || rows.length !== uniqueIds.length) {
      throw new Error("Message not found");
    }

    const conversationIds = Array.from(
      new Set(rows.map((r) => r.conversation_id as string)),
    );
    const meByConversation = new Map<string, string>();
    for (const conversationId of conversationIds) {
      const { meWuId } = await assertParticipant(conversationId, context.userId);
      meByConversation.set(conversationId, meWuId);
    }

    for (const row of rows) {
      const meWuId = meByConversation.get(row.conversation_id as string);
      if (row.author_workspace_user_id !== meWuId) {
        throw new Error("Only the author can delete this message");
      }
    }

    const toTrash = rows.filter((r) => !r.purged_at).map((r) => r.id as string);
    if (toTrash.length === 0) return { ok: true as const, skipped: true as const };

    const { error: updateError } = await supabaseAdmin
      .from("messages")
      .update({ purged_at: computeMessageTrashPurgedAt() })
      .in("id", toTrash);
    if (updateError) throw new Error(updateError.message);
    return { ok: true as const };
  });

export const recoverMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ messageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { RECOVERED_PURGED_AT } = await import(
      "@/lib/delete-entities/pages/recover"
    );
    const { data: row, error } = await supabaseAdmin
      .from("messages")
      .select("id, conversation_id, author_workspace_user_id, purged_at")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Message not found");

    const { meWuId } = await assertParticipant(
      row.conversation_id as string,
      context.userId,
    );
    if (row.author_workspace_user_id !== meWuId) {
      throw new Error("Only the author can undo this deletion");
    }
    if (!row.purged_at) return { ok: true as const, skipped: true as const };
    if (new Date(row.purged_at as string).getTime() <= Date.now()) {
      throw new Error("Undo window has expired");
    }

    const { error: updateError } = await supabaseAdmin
      .from("messages")
      .update({ purged_at: RECOVERED_PURGED_AT })
      .eq("id", data.messageId);
    if (updateError) throw new Error(updateError.message);
    return { ok: true as const };
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
    z
      .object({
        conversationId: z.string().uuid(),
        title: z.string().trim().max(50).optional(),
        visibility: z.enum(["workspace", "conversation"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId, workspaceId } = await assertParticipant(
      data.conversationId,
      context.userId,
    );
    const visibility = data.visibility ?? "conversation";
    const linksConversation = visibility === "conversation";
    const { data: page, error } = await supabaseAdmin
      .from("pages")
      .insert({
        workspace_id: workspaceId,
        created_by_workspace_user_id: meWuId,
        owner_workspace_user_id: meWuId,
        visibility,
        page_type: "standard",
        origin_type: "conversation",
        origin_source_id: data.conversationId,
        ...(linksConversation ? { conversation_id: data.conversationId } : {}),
        ...(data.title ? { title: data.title } : {}),
      })
      .select("id, title")
      .single();
    if (error || !page) throw new Error(error?.message ?? "Create failed");

    await postPageAnnouncementMessage({
      conversationId: data.conversationId,
      workspaceId,
      authorWuId: meWuId,
      pageId: page.id as string,
      pageTitle: (page.title as string | null) ?? data.title ?? "Untitled",
    });

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
      .select("id, title, visibility, conversation_id, purged_at")
      .eq("workspace_id", data.workspaceId)
      .is("purged_at", null)
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

// -------- Create page from selected messages --------

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtDateTimeMinute(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function fmtDateOnly(d: Date) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )}`;
}

function fmtRfc2822NoTz(d: Date) {
  // "Wed, 08 Jul 2026 14:03:00 GMT" -> strip trailing " GMT"
  return d.toUTCString().replace(/\sGMT$/, "");
}

// Very small HTML -> plain-text-paragraph converter. Splits on block-ish
// separators, strips remaining tags, decodes minimal entities.
type InlineNode = any;

// Hand-rolled HTML tokenizer -> ProseMirror inline nodes. Supports basic
// marks (bold/italic/underline/strike/code/link) and custom mention spans
// emitted by src/components/editor/custom-mentions.ts.
function htmlToInlineParagraphs(html: string): any[] {
  if (!html) return [];

  const paragraphs: InlineNode[][] = [[]];
  const markStack: Array<{ type: string; attrs?: any }> = [];
  const tagStack: string[] = []; // parallel: what mark/tag pushed, or "" for structural

  const pushText = (raw: string) => {
    if (!raw) return;
    const text = decodeEntities(raw);
    if (!text) return;
    const marks = markStack.map((m) =>
      m.attrs ? { type: m.type, attrs: m.attrs } : { type: m.type },
    );
    paragraphs[paragraphs.length - 1].push(
      marks.length > 0
        ? { type: "text", text, marks }
        : { type: "text", text },
    );
  };

  const breakParagraph = () => {
    if (paragraphs[paragraphs.length - 1].length > 0) {
      paragraphs.push([]);
    }
  };

  const tokenRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html))) {
    if (m.index > last) pushText(html.slice(last, m.index));
    last = m.index + m[0].length;
    const full = m[0];
    if (full.startsWith("<!--")) continue;
    const tag = (m[1] || "").toLowerCase();
    const attrs = m[2] || "";
    const isClose = full.startsWith("</");
    const isSelfClose = /\/\s*>$/.test(full);

    // Block-level break tags
    if (tag === "br") {
      breakParagraph();
      continue;
    }
    const blockTags = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);
    if (blockTags.has(tag)) {
      if (isClose) breakParagraph();
      continue;
    }

    // Inline mention span?
    if (tag === "span" && !isClose) {
      const classMatch = /class="([^"]*)"/i.exec(attrs);
      const cls = classMatch ? classMatch[1] : "";
      let mentionType: string | null = null;
      if (/\bmention-member\b/.test(cls)) mentionType = "mention";
      else if (/\bmention-page\b/.test(cls)) mentionType = "pageMention";
      else if (/\bmention-conversation\b/.test(cls)) mentionType = "conversationMention";
      if (mentionType) {
        const idMatch = /data-id="([^"]*)"/i.exec(attrs);
        const labelMatch = /data-label="([^"]*)"/i.exec(attrs);
        const avatarMatch = /data-avatar-url="([^"]*)"/i.exec(attrs);
        const id = idMatch ? decodeEntities(idMatch[1]) : "";
        const label = labelMatch ? decodeEntities(labelMatch[1]) : id;
        const avatarUrl = avatarMatch ? decodeEntities(avatarMatch[1]) : null;
        paragraphs[paragraphs.length - 1].push({
          type: mentionType,
          attrs: { id, label, avatarUrl },
        });
        // Skip content until matching </span>
        const closeIdx = html.toLowerCase().indexOf("</span>", last);
        if (closeIdx !== -1) {
          tokenRe.lastIndex = closeIdx + "</span>".length;
          last = tokenRe.lastIndex;
        }
        continue;
      }
    }

    // Inline mark tags
    const markMap: Record<string, { type: string; attrs?: any } | null> = {
      strong: { type: "bold" },
      b: { type: "bold" },
      em: { type: "italic" },
      i: { type: "italic" },
      u: { type: "underline" },
      s: { type: "strike" },
      strike: { type: "strike" },
      del: { type: "strike" },
      code: { type: "code" },
    };
    if (tag === "a") {
      if (isClose) {
        // pop last matching
        for (let i = markStack.length - 1; i >= 0; i--) {
          if (markStack[i].type === "link") {
            markStack.splice(i, 1);
            break;
          }
        }
      } else if (!isSelfClose) {
        const hrefMatch = /href="([^"]*)"/i.exec(attrs);
        markStack.push({
          type: "link",
          attrs: { href: hrefMatch ? decodeEntities(hrefMatch[1]) : "" },
        });
      }
      continue;
    }
    if (tag in markMap) {
      const mk = markMap[tag]!;
      if (isClose) {
        for (let i = markStack.length - 1; i >= 0; i--) {
          if (markStack[i].type === mk.type) {
            markStack.splice(i, 1);
            break;
          }
        }
      } else if (!isSelfClose) {
        markStack.push(mk);
      }
      continue;
    }
    // Unknown tag: ignore, keep text flow.
  }
  if (last < html.length) pushText(html.slice(last));

  return paragraphs.map((inline) =>
    inline.length === 0
      ? { type: "paragraph" }
      : { type: "paragraph", content: inline },
  );
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function paragraph(text?: string) {
  return text && text.length > 0
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

type HtmlChunk =
  | { kind: "text"; html: string }
  | { kind: "quote"; author: string | null; createdAt: string | null; inner: string };

type StructuredHtmlChunk =
  | { kind: "text"; html: string }
  | { kind: "list"; ordered: boolean; inner: string }
  | { kind: "code"; inner: string };

type ProseMirrorNode = {
  type: string;
  text?: string;
  content?: ProseMirrorNode[];
};

function splitStructuredBlocks(html: string): StructuredHtmlChunk[] {
  const chunks: StructuredHtmlChunk[] = [];
  const openRe = /<(ul|ol|pre)\b[^>]*>/gi;
  let offset = 0;

  while (offset < html.length) {
    openRe.lastIndex = offset;
    const open = openRe.exec(html);
    if (!open) {
      const rest = html.slice(offset);
      if (rest) chunks.push({ kind: "text", html: rest });
      break;
    }

    if (open.index > offset) {
      chunks.push({ kind: "text", html: html.slice(offset, open.index) });
    }

    const tag = open[1].toLowerCase();
    const tokenRe = tag === "pre" ? /<\/?pre\b[^>]*>/gi : /<\/?(?:ul|ol)\b[^>]*>/gi;
    tokenRe.lastIndex = open.index + open[0].length;
    let depth = 1;
    let closeStart = -1;
    let after = html.length;
    let token: RegExpExecArray | null;

    while ((token = tokenRe.exec(html))) {
      if (token[0].startsWith("</")) depth--;
      else depth++;
      if (depth === 0) {
        closeStart = token.index;
        after = token.index + token[0].length;
        break;
      }
    }

    if (closeStart === -1) {
      chunks.push({ kind: "text", html: html.slice(open.index) });
      break;
    }

    const inner = html.slice(open.index + open[0].length, closeStart);
    chunks.push(tag === "pre" ? { kind: "code", inner } : { kind: "list", ordered: tag === "ol", inner });
    offset = after;
  }

  return chunks;
}

function splitDirectListItems(html: string): string[] {
  const items: string[] = [];
  const tokenRe = /<\/?(?:ul|ol|li)\b[^>]*>/gi;
  let listDepth = 0;
  let itemDepth = 0;
  let itemStart = -1;
  let token: RegExpExecArray | null;

  while ((token = tokenRe.exec(html))) {
    const full = token[0];
    const tagMatch = /^<\/?([a-z]+)/i.exec(full);
    const tag = tagMatch?.[1].toLowerCase();
    const isClose = full.startsWith("</");

    if (tag === "ul" || tag === "ol") {
      listDepth += isClose ? -1 : 1;
      continue;
    }
    if (tag !== "li" || listDepth !== 0) continue;

    if (!isClose) {
      if (itemDepth === 0) itemStart = token.index + full.length;
      itemDepth++;
    } else if (itemDepth > 0) {
      itemDepth--;
      if (itemDepth === 0 && itemStart !== -1) {
        items.push(html.slice(itemStart, token.index));
        itemStart = -1;
      }
    }
  }

  return items;
}

function codeBlockFromHtml(inner: string): ProseMirrorNode {
  const withoutWrapper = inner
    .replace(/^\s*<code\b[^>]*>/i, "")
    .replace(/<\/code>\s*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  const text = decodeEntities(withoutWrapper);
  return text ? { type: "codeBlock", content: [{ type: "text", text }] } : { type: "codeBlock" };
}

function listItemFromHtml(html: string): ProseMirrorNode {
  const content: ProseMirrorNode[] = [];
  for (const chunk of splitStructuredBlocks(html)) {
    if (chunk.kind === "text") {
      const paragraphs = htmlToInlineParagraphs(chunk.html) as ProseMirrorNode[];
      while (
        paragraphs.length > 0 &&
        paragraphs[paragraphs.length - 1].type === "paragraph" &&
        !paragraphs[paragraphs.length - 1].content
      ) {
        paragraphs.pop();
      }
      content.push(...paragraphs);
    } else if (chunk.kind === "code") {
      content.push(codeBlockFromHtml(chunk.inner));
    } else {
      content.push(listFromHtml(chunk.inner, chunk.ordered));
    }
  }
  if (content.length === 0 || content[0].type !== "paragraph") {
    content.unshift({ type: "paragraph" });
  }
  return { type: "listItem", content };
}

function listFromHtml(inner: string, ordered: boolean): ProseMirrorNode {
  const items = splitDirectListItems(inner).map(listItemFromHtml);
  return {
    type: ordered ? "orderedList" : "bulletList",
    content: items.length > 0 ? items : [{ type: "listItem", content: [{ type: "paragraph" }] }],
  };
}

function structuredHtmlToBlocks(html: string): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  for (const chunk of splitStructuredBlocks(html)) {
    if (chunk.kind === "text") {
      nodes.push(...htmlToInlineParagraphs(chunk.html));
    } else if (chunk.kind === "code") {
      nodes.push(codeBlockFromHtml(chunk.inner));
    } else {
      nodes.push(listFromHtml(chunk.inner, chunk.ordered));
    }
  }
  return nodes;
}

// Split HTML into top-level text chunks and msg-quote blocks. Handles nested
// <div> tags inside quotes by tracking depth.
function splitQuotes(html: string): HtmlChunk[] {
  const out: HtmlChunk[] = [];
  const openRe = /<div\b[^>]*\bclass="[^"]*\bmsg-quote\b[^"]*"[^>]*>/gi;
  let i = 0;
  while (i < html.length) {
    openRe.lastIndex = i;
    const m = openRe.exec(html);
    if (!m) {
      const rest = html.slice(i);
      if (rest) out.push({ kind: "text", html: rest });
      break;
    }
    if (m.index > i) out.push({ kind: "text", html: html.slice(i, m.index) });
    const divRe = /<\/?div\b[^>]*>/gi;
    divRe.lastIndex = m.index + m[0].length;
    let depth = 1;
    let closeStart = -1;
    let after = html.length;
    let dm: RegExpExecArray | null;
    while ((dm = divRe.exec(html))) {
      if (dm[0].startsWith("</")) {
        depth--;
        if (depth === 0) {
          closeStart = dm.index;
          after = dm.index + dm[0].length;
          break;
        }
      } else {
        depth++;
      }
    }
    if (closeStart === -1) {
      out.push({ kind: "text", html: html.slice(m.index) });
      break;
    }
    const inner = html.slice(m.index + m[0].length, closeStart);
    const authorMatch = /data-author="([^"]*)"/i.exec(m[0]);
    const dateMatch = /data-created-at="([^"]*)"/i.exec(m[0]);
    out.push({
      kind: "quote",
      author: authorMatch ? decodeEntities(authorMatch[1]) : null,
      createdAt: dateMatch ? decodeEntities(dateMatch[1]) : null,
      inner,
    });
    i = after;
  }
  return out;
}

function htmlToBlocks(html: string): any[] {
  const chunks = splitQuotes(html);
  const nodes: any[] = [];
  for (const c of chunks) {
    if (c.kind === "text") {
      nodes.push(...structuredHtmlToBlocks(c.html));
    } else {
      const dateShort = c.createdAt
        ? fmtDateOnly(new Date(c.createdAt))
        : "";
      const headerText = [c.author, dateShort].filter(Boolean).join(" on ");
      const bqContent: any[] = [];
      if (headerText) {
        bqContent.push({
          type: "paragraph",
          content: [
            { type: "text", marks: [{ type: "bold" }], text: `${headerText}:` },
          ],
        });
      }
      const innerNodes = htmlToBlocks(c.inner);
      if (innerNodes.length === 0) bqContent.push({ type: "paragraph" });
      else bqContent.push(...innerNodes);
      nodes.push({ type: "blockquote", content: bqContent });
    }
  }
  return nodes;
}

type SelectedMessage = {
  id: string;
  raw_text: string | null;
  author_workspace_user_id: string | null;
  created_at: string;
};

async function loadSelectedMessages(
  conversationId: string,
  messageIds: string[],
): Promise<SelectedMessage[]> {
  const { data: msgs, error: mErr } = await supabaseAdmin
    .from("messages")
    .select("id, raw_text, author_workspace_user_id, created_at")
    .eq("conversation_id", conversationId)
    .in("id", messageIds)
    .is("purged_at", null)
    .order("created_at", { ascending: true });
  if (mErr) throw new Error(mErr.message);
  if (!msgs || msgs.length === 0) {
    throw new Error("No messages found for selection");
  }
  return msgs as SelectedMessage[];
}

async function loadAuthorLabels(
  msgs: { author_workspace_user_id: string | null }[],
): Promise<Map<string, string>> {
  const authorIds = Array.from(
    new Set(
      msgs
        .map((m) => m.author_workspace_user_id)
        .filter((v): v is string => !!v),
    ),
  );
  const authorLabels = new Map<string, string>();
  if (authorIds.length === 0) return authorLabels;
  const { data: wus } = await supabaseAdmin
    .from("workspace_users")
    .select("id, user_id, display_name")
    .in("id", authorIds);
  const rows = wus ?? [];
  const emails = await fetchEmailsForUserIds(
    rows
      .filter((r) => !((r.display_name ?? "") as string).trim())
      .map((r) => r.user_id as string),
  );
  for (const r of rows) {
    authorLabels.set(
      r.id as string,
      resolveLabel(
        { display_name: r.display_name as any, user_id: r.user_id as any },
        emails,
      ),
    );
  }
  return authorLabels;
}

async function resolveConversationTitle(
  conversationId: string,
  meWuId: string,
): Promise<string> {
  const { data: convRow, error: cErr } = await supabaseAdmin
    .from("conversations")
    .select("id, title")
    .eq("id", conversationId)
    .single();
  if (cErr || !convRow) throw new Error(cErr?.message ?? "Conversation not found");

  const { data: partsRaw } = await supabaseAdmin
    .from("conversation_participants")
    .select("workspace_users!inner(id, display_name, user_id)")
    .eq("conversation_id", conversationId);
  const partRows = (partsRaw ?? []).map((p: any) => p.workspace_users);
  const partEmails = await fetchEmailsForUserIds(
    partRows
      .filter((wu: any) => !((wu.display_name ?? "") as string).trim())
      .map((wu: any) => wu.user_id as string),
  );
  const participants = partRows.map((wu: any) => ({
    workspaceUserId: wu.id as string,
    label: resolveLabel(
      { display_name: wu.display_name, user_id: wu.user_id },
      partEmails,
    ),
  }));

  return (
    (convRow.title as string | null) ||
    (participants
      .filter((p) => p.workspaceUserId !== meWuId)
      .slice(0, 3)
      .map((p) => p.label)
      .join(", ") ||
      "Conversation")
  );
}

function buildAuthorRunNodes(
  msgs: SelectedMessage[],
  authorLabels: Map<string, string>,
): any[] {
  type Run = {
    authorWuId: string | null;
    authorLabel: string;
    dateKey: string;
    messages: SelectedMessage[];
  };
  const runs: Run[] = [];
  for (const m of msgs) {
    const authorWuId = m.author_workspace_user_id ?? null;
    const authorLabel = authorWuId
      ? authorLabels.get(authorWuId) ?? "Archived user"
      : "Unknown user";
    const dateKey = fmtDateOnly(new Date(m.created_at));
    const last = runs[runs.length - 1];
    if (last && last.authorWuId === authorWuId && last.dateKey === dateKey) {
      last.messages.push(m);
    } else {
      runs.push({ authorWuId, authorLabel, dateKey, messages: [m] });
    }
  }

  const contentNodes: any[] = [];
  runs.forEach((run, i) => {
    if (i > 0) contentNodes.push({ type: "paragraph" });
    contentNodes.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "bold" }],
          text: `${run.authorLabel} on ${run.dateKey}`,
        },
      ],
    });
    for (const msg of run.messages) {
      const blocks = htmlToBlocks(msg.raw_text ?? "");
      if (blocks.length === 0) {
        contentNodes.push(paragraph(""));
      } else {
        for (const b of blocks) contentNodes.push(b);
      }
    }
  });
  return contentNodes;
}

function buildAppendSectionNodes(
  headingText: string,
  msgs: SelectedMessage[],
  authorLabels: Map<string, string>,
): any[] {
  return [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: headingText }],
    },
    { type: "horizontalRule" },
    ...buildAuthorRunNodes(msgs, authorLabels),
  ];
}

function existingDocContent(content: unknown): any[] {
  if (
    content &&
    typeof content === "object" &&
    (content as any).type === "doc" &&
    Array.isArray((content as any).content)
  ) {
    return (content as any).content;
  }
  return [];
}

export const createPageFromMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        messageIds: z.array(z.string().uuid()).min(1).max(500),
        title: z.string().trim().max(200).optional(),
        visibility: z.enum(["workspace", "conversation"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId, workspaceId } = await assertParticipant(
      data.conversationId,
      context.userId,
    );

    // Conversation (title + type)
    const { data: convRow, error: cErr } = await supabaseAdmin
      .from("conversations")
      .select("id, title, type")
      .eq("id", data.conversationId)
      .single();
    if (cErr || !convRow) throw new Error(cErr?.message ?? "Conversation not found");

    // Participants (label + wu id + user id)
    const { data: partsRaw } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_users!inner(id, display_name, user_id)")
      .eq("conversation_id", data.conversationId);
    const partRows = (partsRaw ?? []).map((p: any) => p.workspace_users);
    const partEmails = await fetchEmailsForUserIds(
      partRows
        .filter((wu: any) => !((wu.display_name ?? "") as string).trim())
        .map((wu: any) => wu.user_id as string),
    );
    const participants = partRows.map((wu: any) => ({
      workspaceUserId: wu.id as string,
      label: resolveLabel(
        { display_name: wu.display_name, user_id: wu.user_id },
        partEmails,
      ),
    }));

    // Me label
    const meRow = partRows.find((wu: any) => wu.id === meWuId) as any;
    const meLabel = meRow
      ? resolveLabel(
          { display_name: meRow.display_name, user_id: meRow.user_id },
          partEmails,
        )
      : "Me";

    // Conversation display title (fallback like getConversation)
    const convTitle =
      (convRow.title as string | null) ||
      (participants
        .filter((p) => p.workspaceUserId !== meWuId)
        .slice(0, 3)
        .map((p) => p.label)
        .join(", ") ||
        "Conversation");

    const msgs = await loadSelectedMessages(data.conversationId, data.messageIds);
    const authorLabels = await loadAuthorLabels(msgs);

    const now = new Date();
    const canonicalTitle = `Messages from ${convTitle} on ${fmtDateTimeMinute(now)}`;
    const finalTitle =
      data.title && data.title.trim().length > 0 ? data.title.trim() : canonicalTitle;

    // ---- Build ProseMirror content ----

    const participantMentionSpans: any[] = [];
    participants.forEach((p, idx) => {
      if (idx > 0)
        participantMentionSpans.push({ type: "text", text: ", " });
      participantMentionSpans.push({
        type: "mention",
        attrs: { id: p.workspaceUserId, label: p.label },
      });
    });

    const propsList = {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Original conversation: " },
                {
                  type: "conversationMention",
                  attrs: { id: data.conversationId, label: convTitle },
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Original participants: " },
                ...participantMentionSpans,
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Creation date: ${fmtRfc2822NoTz(now)}`,
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Created by: " },
                {
                  type: "mention",
                  attrs: { id: meWuId, label: meLabel },
                },
              ],
            },
          ],
        },
      ],
    };

    const contentNodes: any[] = [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Page properties" }],
      },
      { type: "horizontalRule" },
      propsList,
      { type: "paragraph" },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Contents" }],
      },
      { type: "horizontalRule" },
      ...buildAuthorRunNodes(msgs, authorLabels),
    ];

    const doc = { type: "doc", content: contentNodes };

    const visibility = data.visibility ?? "conversation";
    const linksConversation = visibility === "conversation";

    const { data: page, error: insErr } = await supabaseAdmin
      .from("pages")
      .insert({
        workspace_id: workspaceId,
        created_by_workspace_user_id: meWuId,
        owner_workspace_user_id: meWuId,
        visibility,
        page_type: "standard",
        origin_type: "conversation",
        origin_source_id: data.conversationId,
        ...(linksConversation ? { conversation_id: data.conversationId } : {}),
        title: finalTitle,
        content: doc,
      })
      .select("id")
      .single();
    if (insErr || !page) throw new Error(insErr?.message ?? "Create failed");

    await postPageAnnouncementMessage({
      conversationId: data.conversationId,
      workspaceId,
      authorWuId: meWuId,
      pageId: page.id as string,
      pageTitle: finalTitle,
    });

    return { pageId: page.id as string };
  });

export const appendMessagesToPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        pageId: z.string().uuid(),
        messageIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { meWuId, workspaceId } = await assertParticipant(
      data.conversationId,
      context.userId,
    );

    const { assertCanEditPage, assertPageNotTrashed, recordPageCollaborator } =
      await import("@/lib/pages.server");

    const access = await assertCanEditPage(data.pageId, context.userId);

    const { data: page, error: pageErr } = await supabaseAdmin
      .from("pages")
      .select("id, workspace_id, content, purged_at")
      .eq("id", data.pageId)
      .maybeSingle();
    if (pageErr) throw new Error(pageErr.message);
    if (!page) throw new Error("Page not found");
    assertPageNotTrashed(page.purged_at as string | null);
    if ((page.workspace_id as string) !== workspaceId) {
      throw new Error("Page is not in this workspace");
    }

    const msgs = await loadSelectedMessages(data.conversationId, data.messageIds);
    const authorLabels = await loadAuthorLabels(msgs);
    const convTitle = await resolveConversationTitle(data.conversationId, meWuId);
    const headingText = `Messages from ${convTitle} on ${fmtDateTimeMinute(new Date())}`;
    const appendNodes = buildAppendSectionNodes(headingText, msgs, authorLabels);
    const doc = {
      type: "doc",
      content: [...existingDocContent(page.content), ...appendNodes],
    };

    const { error: updErr } = await supabaseAdmin
      .from("pages")
      .update({
        content: doc,
        last_modified_at: new Date().toISOString(),
      })
      .eq("id", data.pageId);
    if (updErr) throw new Error(updErr.message);

    try {
      await recordPageCollaborator(data.pageId, access.workspaceUserId);
    } catch {
      // ignore
    }

    return { pageId: data.pageId };
  });
