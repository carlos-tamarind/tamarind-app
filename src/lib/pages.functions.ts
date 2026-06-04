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

export const createBlankPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, context.userId);
    const { data: page, error } = await supabaseAdmin
      .from("pages")
      .insert({
        workspace_id: data.workspaceId,
        created_by_workspace_user_id: meWuId,
        owner_workspace_user_id: meWuId,
        visibility: "private",
        page_type: "standard",
        origin_type: "user",
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
    const { supabase } = context;
    const { data: page, error } = await supabase
      .from("pages")
      .select("id, title, content, workspace_id, visibility, owner_workspace_user_id")
      .eq("id", data.pageId)
      .single();
    if (error || !page) throw new Error(error?.message ?? "Page not found");

    let ownerDisplayName: string | null = null;
    if (page.owner_workspace_user_id) {
      const { data: owner } = await supabaseAdmin
        .from("workspace_users")
        .select("display_name, user_id")
        .eq("id", page.owner_workspace_user_id as string)
        .maybeSingle();
      if (owner) {
        ownerDisplayName =
          (owner.display_name as string | null) ??
          (owner.user_id as string).slice(0, 6);
      }
    }

    const { data: collabs } = await supabaseAdmin
      .from("page_collaborators")
      .select(
        "workspace_user_id, last_edited_at, workspace_users!inner(display_name, user_id)",
      )
      .eq("page_id", data.pageId)
      .order("last_edited_at", { ascending: false });
    const collaborators = (collabs ?? []).map((c: any) => ({
      workspaceUserId: c.workspace_user_id as string,
      displayName:
        (c.workspace_users.display_name as string | null) ??
        (c.workspace_users.user_id as string).slice(0, 6),
      lastEditedAt: c.last_edited_at as string,
    }));

    return {
      id: page.id as string,
      title: page.title as string,
      content: page.content,
      workspaceId: page.workspace_id as string,
      visibility: page.visibility as "private" | "workspace" | "conversation" | "external",
      ownerWorkspaceUserId: page.owner_workspace_user_id as string | null,
      ownerDisplayName,
      collaborators,
    };
  });

export const updatePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        pageId: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        content: z.any().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { title?: string; content?: any; last_modified_at: string } = {
      last_modified_at: new Date().toISOString(),
    };
    if (data.title !== undefined) patch.title = data.title;
    if (data.content !== undefined) patch.content = data.content;
    const { error } = await supabase.from("pages").update(patch).eq("id", data.pageId);
    if (error) throw new Error(error.message);

    // Record collaborator (best-effort)
    try {
      const { data: pageRow } = await supabaseAdmin
        .from("pages")
        .select("workspace_id")
        .eq("id", data.pageId)
        .maybeSingle();
      if (pageRow?.workspace_id) {
        const meWuId = await getCurrentWorkspaceUser(
          pageRow.workspace_id as string,
          userId,
        );
        await supabaseAdmin
          .from("page_collaborators")
          .upsert(
            {
              page_id: data.pageId,
              workspace_user_id: meWuId,
              last_edited_at: new Date().toISOString(),
            },
            { onConflict: "page_id,workspace_user_id" },
          );
      }
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
    const { supabase } = context;
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
