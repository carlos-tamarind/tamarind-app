import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createBlankPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        title: z.string().trim().max(50).optional(),
        visibility: z.enum(["private", "workspace"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCurrentWorkspaceUser } = await import("@/lib/pages.server");
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, context.userId);
    const { data: page, error } = await supabaseAdmin
      .from("pages")
      .insert({
        workspace_id: data.workspaceId,
        created_by_workspace_user_id: meWuId,
        owner_workspace_user_id: meWuId,
        visibility: data.visibility ?? "private",
        page_type: "standard",
        origin_type: "user",
        ...(data.title ? { title: data.title } : {}),
      })
      .select("id")
      .single();
    if (error || !page) throw new Error(error?.message ?? "Create failed");
    return { pageId: page.id as string };
  });

export const listMyPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pages, error } = await supabase
      .from("pages")
      .select("id, title, visibility, last_modified_at")
      .eq("workspace_id", data.workspaceId)
      .order("last_modified_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (pages ?? []).map((p) => ({
      id: p.id as string,
      title: (p.title as string) ?? "Untitled",
      visibility: p.visibility as "private" | "workspace" | "conversation" | "external",
      lastModifiedAt: p.last_modified_at as string,
    }));
  });

export const getPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ pageId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchEmailsForUserIds, resolveLabel } = await import(
      "@/lib/user-label.server"
    );
    const { supabase } = context;
    const { data: page, error } = await supabase
      .from("pages")
      .select("id, title, content, workspace_id, visibility, owner_workspace_user_id, conversation_id, last_modified_at")
      .eq("id", data.pageId)
      .single();
    if (error || !page) throw new Error(error?.message ?? "Page not found");

    let ownerRow: { display_name: string | null; user_id: string } | null = null;
    if (page.owner_workspace_user_id) {
      const { data: owner } = await supabaseAdmin
        .from("workspace_users")
        .select("display_name, user_id")
        .eq("id", page.owner_workspace_user_id as string)
        .maybeSingle();
      if (owner) {
        ownerRow = {
          display_name: (owner.display_name as string | null) ?? null,
          user_id: owner.user_id as string,
        };
      }
    }

    const { data: collabs } = await supabaseAdmin
      .from("page_collaborators")
      .select(
        "workspace_user_id, last_edited_at, workspace_users(display_name, user_id)",
      )
      .eq("page_id", data.pageId)
      .order("last_edited_at", { ascending: false });

    const allRows: Array<{ display_name: string | null; user_id: string } | null> = [
      ownerRow,
      ...((collabs ?? []).map((c: any) =>
        c.workspace_users
          ? {
              display_name: (c.workspace_users.display_name as string | null) ?? null,
              user_id: c.workspace_users.user_id as string,
            }
          : null,
      )),
    ];
    const emails = await fetchEmailsForUserIds(
      allRows
        .filter((r): r is { display_name: string | null; user_id: string } =>
          !!r && !(r.display_name ?? "").trim(),
        )
        .map((r) => r.user_id),
    );

    const ownerLabel = page.owner_workspace_user_id
      ? resolveLabel(ownerRow, emails)
      : null;

    const collaborators = (collabs ?? []).map((c: any) => {
      const row = c.workspace_users
        ? {
            display_name: (c.workspace_users.display_name as string | null) ?? null,
            user_id: c.workspace_users.user_id as string,
          }
        : null;
      return {
        workspaceUserId: c.workspace_user_id as string,
        displayName: resolveLabel(row, emails),
        label: resolveLabel(row, emails),
        lastEditedAt: c.last_edited_at as string,
      };
    });

    return {
      id: page.id as string,
      title: page.title as string,
      content: page.content,
      workspaceId: page.workspace_id as string,
      conversationId: (page.conversation_id as string | null) ?? null,
      lastModifiedAt: page.last_modified_at as string,
      visibility: page.visibility as "private" | "workspace" | "conversation" | "external",
      ownerWorkspaceUserId: page.owner_workspace_user_id as string | null,
      ownerDisplayName: ownerLabel,
      ownerLabel,
      collaborators,
    };
  });


export const updatePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        pageId: z.string().uuid(),
        title: z.string().max(500).optional(),
        content: z.any().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertCanEditPage, recordPageCollaborator } = await import(
      "@/lib/pages.server"
    );
    const { isEmptyDoc } = await import("@/lib/pages.server");
    const { userId } = context;
    const access = await assertCanEditPage(data.pageId, userId);

    let title = data.title;
    let content = data.content;

    // Safety net: refuse to overwrite non-empty stored title/content with
    // empty values. Prevents client-side draft/hydration bugs from wiping
    // pages.
    if (title !== undefined || content !== undefined) {
      const { data: current } = await supabaseAdmin
        .from("pages")
        .select("title, content")
        .eq("id", data.pageId)
        .maybeSingle();
      if (current) {
        if (
          title !== undefined &&
          title === "" &&
          typeof current.title === "string" &&
          current.title.length > 0
        ) {
          console.warn("[pages] blocked empty-title overwrite", {
            pageId: data.pageId,
            userId,
          });
          title = undefined;
        }
        if (
          content !== undefined &&
          isEmptyDoc(content) &&
          !isEmptyDoc(current.content)
        ) {
          console.warn("[pages] blocked empty-content overwrite", {
            pageId: data.pageId,
            userId,
          });
          content = undefined;
        }
      }
    }

    const patch: { title?: string; content?: any; last_modified_at: string } = {
      last_modified_at: new Date().toISOString(),
    };
    if (title !== undefined) patch.title = title;
    if (content !== undefined) patch.content = content;

    // Nothing meaningful to write — still record collaborator activity.
    if (title === undefined && content === undefined) {
      try {
        await recordPageCollaborator(data.pageId, access.workspaceUserId);
      } catch {
        // ignore
      }
      return { ok: true, skipped: true as const };
    }

    const { error } = await supabaseAdmin
      .from("pages")
      .update(patch)
      .eq("id", data.pageId);
    if (error) throw new Error(error.message);

    // Record collaborator (best-effort)
    try {
      await recordPageCollaborator(data.pageId, access.workspaceUserId);
    } catch {
      // ignore
    }

    return { ok: true };
  });


export const setPageVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        pageId: z.string().uuid(),
        visibility: z.enum(["private", "workspace"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCurrentWorkspaceUser } = await import("@/lib/pages.server");
    const { supabase } = context;

    const { data: page, error: readErr } = await supabaseAdmin
      .from("pages")
      .select("visibility, owner_workspace_user_id, workspace_id")
      .eq("id", data.pageId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!page) throw new Error("Page not found");

    const meWuId = await getCurrentWorkspaceUser(
      page.workspace_id as string,
      context.userId,
    );

    const current = page.visibility as
      | "private"
      | "workspace"
      | "conversation"
      | "external";

    // Only allowed transition: private -> workspace, by the owner.
    if (current === data.visibility) {
      return { ok: true, skipped: true as const };
    }
    if (current !== "private" || data.visibility !== "workspace") {
      throw new Error("This page's visibility is locked");
    }
    if (page.owner_workspace_user_id !== meWuId) {
      throw new Error("Only the owner can promote a private page to workspace");
    }

    const { error } = await supabase
      .from("pages")
      .update({ visibility: data.visibility, last_modified_at: new Date().toISOString() })
      .eq("id", data.pageId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Scan all pages content for mention nodes that point to the given page id.
// Returns pages that reference it (backlinks).
export const getPageBacklinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ pageId: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: pages, error } = await supabase
      .from("pages")
      .select("id, title, content")
      .eq("workspace_id", data.workspaceId)
      .neq("id", data.pageId);
    if (error) throw new Error(error.message);

    const backlinks: Array<{ id: string; title: string }> = [];
    const target = data.pageId;
    const walk = (node: any): boolean => {
      if (!node || typeof node !== "object") return false;
      if (
        node.type === "pageMention" &&
        node.attrs &&
        node.attrs.id === target
      )
        return true;
      if (Array.isArray(node.content)) {
        for (const child of node.content) if (walk(child)) return true;
      }
      return false;
    };
    for (const p of pages ?? []) {
      if (walk(p.content)) {
        backlinks.push({ id: p.id as string, title: (p.title as string) ?? "Untitled" });
      }
    }
    return backlinks;
  });
