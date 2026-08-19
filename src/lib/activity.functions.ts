import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCurrentWorkspaceUser } from "@/lib/pages.server";
import { fetchEmailsForUserIds, resolveLabel } from "@/lib/user-label.server";

export type RecentActivityItem = {
  kind: "conversation" | "page";
  id: string;
  title: string;
  /** Conversation type, or page visibility — drives the icon. */
  subtype: string;
  at: string;
};

// How far back to look for the caller's own contributions. Generous enough
// that the top few distinct assets are always found, small enough to stay a
// single cheap indexed read.
const MESSAGE_SCAN_LIMIT = 120;
const PAGE_SCAN_LIMIT = 40;

/**
 * The conversations and pages the caller has personally contributed to, most
 * recent first.
 *
 * Deliberately not derived from `conversations.last_modified_at` or
 * `pages.last_modified_at`: those track anyone's activity, so they would
 * surface a conversation a colleague just posted in that the caller has never
 * written a word in. Authorship is the whole point here, so this reads from
 * message authorship and page collaboration instead.
 */
export const listRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const limit = data.limit ?? 4;
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, context.userId);

    const [myMessages, myCollaborations, myOwnedPages, myParticipations] =
      await Promise.all([
        supabaseAdmin
          .from("messages")
          .select("conversation_id, created_at")
          .eq("workspace_id", data.workspaceId)
          .eq("author_workspace_user_id", meWuId)
          .order("created_at", { ascending: false })
          .limit(MESSAGE_SCAN_LIMIT),
        supabaseAdmin
          .from("page_collaborators")
          .select("page_id, last_edited_at")
          .eq("workspace_user_id", meWuId)
          .order("last_edited_at", { ascending: false })
          .limit(PAGE_SCAN_LIMIT),
        supabaseAdmin
          .from("pages")
          .select("id, last_modified_at")
          .eq("workspace_id", data.workspaceId)
          .eq("owner_workspace_user_id", meWuId)
          .order("last_modified_at", { ascending: false })
          .limit(PAGE_SCAN_LIMIT),
        supabaseAdmin
          .from("conversation_participants")
          .select("conversation_id")
          .eq("workspace_user_id", meWuId),
      ]);

    // Rows arrive newest-first, so the first sighting of an id is its latest.
    const stillParticipating = new Set(
      (myParticipations.data ?? []).map((r) => r.conversation_id as string),
    );
    const convAt = new Map<string, string>();
    for (const row of myMessages.data ?? []) {
      const id = row.conversation_id as string;
      if (!id || convAt.has(id)) continue;
      if (!stillParticipating.has(id)) continue;
      convAt.set(id, row.created_at as string);
    }

    const pageAt = new Map<string, string>();
    for (const row of myCollaborations.data ?? []) {
      const id = row.page_id as string;
      if (!id || pageAt.has(id)) continue;
      pageAt.set(id, row.last_edited_at as string);
    }
    // Pages created but never re-edited have no collaborator row yet.
    for (const row of myOwnedPages.data ?? []) {
      const id = row.id as string;
      const at = row.last_modified_at as string;
      const existing = pageAt.get(id);
      if (!existing || at > existing) pageAt.set(id, at);
    }

    const convIds = [...convAt.keys()];
    const pageIds = [...pageAt.keys()];
    if (convIds.length === 0 && pageIds.length === 0) return [];

    const [convRows, pageRows] = await Promise.all([
      convIds.length
        ? supabaseAdmin
            .from("conversations")
            .select("id, title, type")
            .eq("workspace_id", data.workspaceId)
            .in("id", convIds)
        : Promise.resolve({ data: [] as any[] }),
      pageIds.length
        ? supabaseAdmin
            .from("pages")
            .select("id, title, visibility")
            .eq("workspace_id", data.workspaceId)
            .in("id", pageIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Unnamed direct conversations show the other participants' names, the
    // same way the navigation panel labels them.
    const untitled = (convRows.data ?? [])
      .filter((c: any) => !((c.title as string | null) ?? "").trim())
      .map((c: any) => c.id as string);
    const labelByConv = new Map<string, string>();
    if (untitled.length > 0) {
      const { data: parts } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id, workspace_users!inner(id, display_name, user_id)")
        .in("conversation_id", untitled);
      const byConv = new Map<string, { displayName: string | null; userId: string }[]>();
      for (const row of parts ?? []) {
        const wu: any = (row as any).workspace_users;
        if (!wu || wu.id === meWuId) continue;
        const cid = row.conversation_id as string;
        if (!byConv.has(cid)) byConv.set(cid, []);
        byConv.get(cid)!.push({
          displayName: (wu.display_name as string | null) ?? null,
          userId: wu.user_id as string,
        });
      }
      const emails = await fetchEmailsForUserIds(
        [...byConv.values()]
          .flat()
          .filter((e) => !(e.displayName ?? "").trim())
          .map((e) => e.userId),
      );
      for (const [cid, entries] of byConv) {
        labelByConv.set(
          cid,
          entries
            .map((e) =>
              resolveLabel({ display_name: e.displayName, user_id: e.userId }, emails),
            )
            .slice(0, 3)
            .join(", "),
        );
      }
    }

    const items: RecentActivityItem[] = [
      ...(convRows.data ?? []).map((c: any) => ({
        kind: "conversation" as const,
        id: c.id as string,
        title:
          ((c.title as string | null) ?? "").trim() ||
          labelByConv.get(c.id as string) ||
          "Conversation",
        subtype: (c.type as string) ?? "direct",
        at: convAt.get(c.id as string)!,
      })),
      ...(pageRows.data ?? []).map((p: any) => ({
        kind: "page" as const,
        id: p.id as string,
        title: ((p.title as string | null) ?? "").trim() || "Untitled",
        subtype: (p.visibility as string) ?? "private",
        at: pageAt.get(p.id as string)!,
      })),
    ];

    items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return items.slice(0, limit);
  });
