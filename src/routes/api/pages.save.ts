import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

const bodySchema = z.object({
  accessToken: z.string().min(1),
  pageId: z.string().uuid(),
  title: z.string().max(500).optional(),
  content: z.any().optional(),
});

export const Route = createFileRoute("/api/pages/save")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured", { status: 500 });
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return new Response("Invalid payload", { status: 400 });
        }
        const { accessToken, pageId, title, content } = parsed.data;

        if (title === undefined && content === undefined) {
          return new Response("ok");
        }

        const supabase = createClient<Database>(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            global: { headers: { Authorization: `Bearer ${accessToken}` } },
            auth: {
              storage: undefined,
              persistSession: false,
              autoRefreshToken: false,
            },
          },
        );

        const { data: userData, error: userErr } =
          await supabase.auth.getUser(accessToken);
        if (userErr || !userData?.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = userData.user.id;

        let workspaceUserId: string | null = null;
        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );

          const { data: pageRow, error: pageError } = await supabaseAdmin
            .from("pages")
            .select("workspace_id, visibility, owner_workspace_user_id, conversation_id, title, content")
            .eq("id", pageId)
            .maybeSingle();
          if (pageError) return new Response(pageError.message, { status: 400 });
          if (!pageRow) return new Response("Page not found", { status: 404 });

          const { data: wu, error: wuError } = await supabaseAdmin
            .from("workspace_users")
            .select("id")
            .eq("workspace_id", pageRow.workspace_id as string)
            .eq("user_id", userId)
            .maybeSingle();
          if (wuError) return new Response(wuError.message, { status: 400 });
          if (!wu?.id) return new Response("Forbidden", { status: 403 });
          workspaceUserId = wu.id as string;

          const visibility = pageRow.visibility as string;
          if (visibility === "private" && pageRow.owner_workspace_user_id !== workspaceUserId) {
            return new Response("Forbidden", { status: 403 });
          }

          if (visibility === "conversation") {
            if (!pageRow.conversation_id) return new Response("Forbidden", { status: 403 });
            const { data: participant, error: participantError } = await supabaseAdmin
              .from("conversation_participants")
              .select("workspace_user_id")
              .eq("conversation_id", pageRow.conversation_id as string)
              .eq("workspace_user_id", workspaceUserId)
              .maybeSingle();
            if (participantError) {
              return new Response(participantError.message, { status: 400 });
            }
            if (!participant) return new Response("Forbidden", { status: 403 });
          }

          // Safety: refuse to overwrite non-empty stored title/content with
          // empty values (mirrors the guard in updatePage).
          const { isEmptyDoc } = await import("@/lib/pages.server");
          let safeTitle = title;
          let safeContent = content;
          if (
            safeTitle !== undefined &&
            safeTitle === "" &&
            typeof pageRow.title === "string" &&
            (pageRow.title as string).length > 0
          ) {
            console.warn("[pages] blocked empty-title overwrite (beacon)", {
              pageId,
              userId,
            });
            safeTitle = undefined;
          }
          if (
            safeContent !== undefined &&
            isEmptyDoc(safeContent) &&
            !isEmptyDoc(pageRow.content)
          ) {
            console.warn("[pages] blocked empty-content overwrite (beacon)", {
              pageId,
              userId,
            });
            safeContent = undefined;
          }

          if (safeTitle === undefined && safeContent === undefined) {
            // Nothing meaningful left to write.
            return new Response("ok");
          }

          const patch: {
            title?: string;
            content?: any;
            last_modified_at: string;
          } = { last_modified_at: new Date().toISOString() };
          if (safeTitle !== undefined) patch.title = safeTitle;
          if (safeContent !== undefined) patch.content = safeContent;

          const { error } = await supabaseAdmin
            .from("pages")
            .update(patch)
            .eq("id", pageId);
          if (error) return new Response(error.message, { status: 400 });


          // Best-effort collaborator upsert with service role (mirrors updatePage).
          try {
            await supabaseAdmin.from("page_collaborators").upsert(
              {
                page_id: pageId,
                workspace_user_id: workspaceUserId,
                last_edited_at: new Date().toISOString(),
              },
              { onConflict: "page_id,workspace_user_id" },
            );
          } catch {
            // ignore collaborator bookkeeping failures
          }
        } catch {
          return new Response("Save failed", { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
