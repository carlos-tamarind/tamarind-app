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
    const { error } = await supabaseAdmin.from("messages").insert({
      conversation_id: params.conversationId,
      workspace_id: params.workspaceId,
      author_workspace_user_id: params.authorWuId,
      raw_text: html,
    });
    if (error) throw error;
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
    const emails = await fetchEmailsForUserIds(
      rawParts
        .filter((wu: any) => !((wu.display_name ?? "") as string).trim())
        .map((wu: any) => wu.user_id as string),
    );

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

    const authorIds = Array.from(
      new Set(
        (msgs ?? [])
          .map((m) => m.author_workspace_user_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const labelByWuId = new Map<string, string>();
    if (authorIds.length > 0) {
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
      const byId = new Map(rows.map((r) => [r.id as string, r]));
      for (const wuId of authorIds) {
        const row = byId.get(wuId);
        labelByWuId.set(
          wuId,
          resolveLabel(
            row ? { display_name: row.display_name as any, user_id: row.user_id as any } : null,
            emails,
          ),
        );
      }
    }

    return (msgs ?? []).map((m) => ({
      id: m.id as string,
      rawText: m.raw_text as string,
      authorWorkspaceUserId: m.author_workspace_user_id as string | null,
      authorLabel: m.author_workspace_user_id
        ? labelByWuId.get(m.author_workspace_user_id as string) ?? "Archived user"
        : "Unknown user",
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
function htmlToParagraphs(html: string): string[] {
  if (!html) return [];
  const normalized = html
    .replace(/\r\n?/g, "\n")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  const decoded = decodeEntities(normalized);
  return decoded
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
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
      for (const p of htmlToParagraphs(c.html)) nodes.push(paragraph(p));
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

    // Messages (chronological, restricted to given ids AND this conversation)
    const { data: msgs, error: mErr } = await supabaseAdmin
      .from("messages")
      .select("id, raw_text, author_workspace_user_id, created_at")
      .eq("conversation_id", data.conversationId)
      .in("id", data.messageIds)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);
    if (!msgs || msgs.length === 0) {
      throw new Error("No messages found for selection");
    }

    // Author labels
    const authorIds = Array.from(
      new Set(
        msgs
          .map((m) => m.author_workspace_user_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const authorLabels = new Map<string, string>();
    if (authorIds.length > 0) {
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
    }

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

    // Group messages into contiguous runs by author.
    type Run = {
      authorWuId: string | null;
      authorLabel: string;
      dateKey: string;
      messages: typeof msgs;
    };
    const runs: Run[] = [];
    for (const m of msgs) {
      const authorWuId = (m.author_workspace_user_id as string | null) ?? null;
      const authorLabel = authorWuId
        ? authorLabels.get(authorWuId) ?? "Archived user"
        : "Unknown user";
      const dateKey = fmtDateOnly(new Date(m.created_at as string));
      const last = runs[runs.length - 1];
      if (last && last.authorWuId === authorWuId && last.dateKey === dateKey) {
        last.messages.push(m);
      } else {
        runs.push({ authorWuId, authorLabel, dateKey, messages: [m] });
      }
    }

    const contentNodes: any[] = [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: finalTitle }],
      },
      propsList,
      { type: "paragraph" },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Contents" }],
      },
      { type: "horizontalRule" },
    ];

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
        const blocks = htmlToBlocks((msg.raw_text as string) ?? "");
        if (blocks.length === 0) {
          contentNodes.push(paragraph(""));
        } else {
          for (const b of blocks) contentNodes.push(b);
        }
      }
    });

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
