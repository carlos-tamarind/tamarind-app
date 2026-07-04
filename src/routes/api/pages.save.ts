import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

const bodySchema = z.object({
  accessToken: z.string().min(1),
  pageId: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
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

        const patch: {
          title?: string;
          content?: unknown;
          last_modified_at: string;
        } = { last_modified_at: new Date().toISOString() };
        if (title !== undefined) patch.title = title;
        if (content !== undefined) patch.content = content;

        const { error } = await supabase
          .from("pages")
          .update(patch)
          .eq("id", pageId);
        if (error) {
          return new Response(error.message, { status: 400 });
        }

        // Best-effort collaborator upsert with service role (mirrors updatePage).
        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          const { data: pageRow } = await supabaseAdmin
            .from("pages")
            .select("workspace_id")
            .eq("id", pageId)
            .maybeSingle();
          if (pageRow?.workspace_id) {
            const { data: wu } = await supabaseAdmin
              .from("workspace_users")
              .select("id")
              .eq("workspace_id", pageRow.workspace_id as string)
              .eq("user_id", userId)
              .maybeSingle();
            if (wu?.id) {
              await supabaseAdmin.from("page_collaborators").upsert(
                {
                  page_id: pageId,
                  workspace_user_id: wu.id as string,
                  last_edited_at: new Date().toISOString(),
                },
                { onConflict: "page_id,workspace_user_id" },
              );
            }
          }
        } catch {
          // ignore
        }

        return new Response("ok");
      },
    },
  },
});
