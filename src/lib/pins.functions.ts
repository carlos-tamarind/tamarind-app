import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCurrentWorkspaceUser } from "@/lib/pages.server";

export type MyPins = {
  conversations: string[];
  pages: string[];
};

async function resolveEntityType(entityId: string) {
  const { data, error } = await supabaseAdmin
    .from("entities")
    .select("id, workspace_id, entity_type_id")
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Entity not found");

  const { data: typeRow, error: typeError } = await supabaseAdmin
    .from("entity_types")
    .select("key")
    .eq("id", data.entity_type_id)
    .maybeSingle();
  if (typeError) throw new Error(typeError.message);
  const key = typeRow?.key;
  if (key !== "conversation" && key !== "page") {
    throw new Error("Entity is not pinnable");
  }
  return {
    workspaceId: data.workspace_id as string,
    key: key as "conversation" | "page",
  };
}

async function assertCanPin(
  entityId: string,
  key: "conversation" | "page",
  workspaceUserId: string,
  userClient: { from: (relation: "pages") => any },
) {
  if (key === "conversation") {
    const { data: part } = await supabaseAdmin
      .from("conversation_participants")
      .select("workspace_user_id")
      .eq("conversation_id", entityId)
      .eq("workspace_user_id", workspaceUserId)
      .maybeSingle();
    if (!part) throw new Error("Not a participant of this conversation");
    return;
  }

  const { data: page, error } = await userClient
    .from("pages")
    .select("id")
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!page) throw new Error("You cannot access this page");
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === "23505";
}

export const listMyPins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MyPins> => {
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, context.userId);

    const { data: pins, error } = await supabaseAdmin
      .from("pinned_entities")
      .select("entity_id")
      .eq("workspace_id", data.workspaceId)
      .eq("workspace_user_id", meWuId);
    if (error) throw new Error(error.message);

    const ids = (pins ?? []).map((p) => p.entity_id as string);
    if (ids.length === 0) return { conversations: [], pages: [] };

    const { data: ents, error: eErr } = await supabaseAdmin
      .from("entities")
      .select("id, entity_type_id")
      .in("id", ids);
    if (eErr) throw new Error(eErr.message);

    const typeIds = [...new Set((ents ?? []).map((e) => e.entity_type_id as string))];
    const { data: types, error: tErr } = await supabaseAdmin
      .from("entity_types")
      .select("id, key")
      .in("id", typeIds);
    if (tErr) throw new Error(tErr.message);
    const keyByTypeId = new Map(
      (types ?? []).map((t) => [t.id as string, t.key as string]),
    );

    const conversations: string[] = [];
    const pages: string[] = [];
    for (const row of ents ?? []) {
      const key = keyByTypeId.get(row.entity_type_id as string);
      const id = row.id as string;
      if (key === "conversation") conversations.push(id);
      else if (key === "page") pages.push(id);
    }
    return { conversations, pages };
  });

export const pinEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        entityId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, context.userId);
    const entity = await resolveEntityType(data.entityId);
    if (entity.workspaceId !== data.workspaceId) {
      throw new Error("Entity does not belong to this workspace");
    }
    await assertCanPin(data.entityId, entity.key, meWuId, context.supabase);

    const { error } = await supabaseAdmin.from("pinned_entities").insert({
      workspace_id: data.workspaceId,
      workspace_user_id: meWuId,
      entity_id: data.entityId,
    });
    if (error && !isUniqueViolation(error)) throw new Error(error.message);
    return { ok: true as const };
  });

export const unpinEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        entityId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const meWuId = await getCurrentWorkspaceUser(data.workspaceId, context.userId);
    const { error } = await supabaseAdmin
      .from("pinned_entities")
      .delete()
      .eq("workspace_id", data.workspaceId)
      .eq("workspace_user_id", meWuId)
      .eq("entity_id", data.entityId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
