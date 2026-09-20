import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { FeatureGateError, hasFeature, type FeatureKey, type PlanTier } from "./features";

// List all workspaces the current user belongs to.
export const listMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: memberships, error } = await supabase
      .from("workspace_users")
      .select("id, workspace_id, role_id, workspaces!inner(id, name, plan)")
      .eq("user_id", userId);

    if (error) throw new Error(error.message);

    return (memberships ?? []).map((m: any) => ({
      workspaceUserId: m.id as string,
      workspaceId: m.workspaces.id as string,
      name: m.workspaces.name as string,
      plan: m.workspaces.plan as PlanTier,
    }));
  });

// Shared by bootstrapFirstWorkspace and the invite-based bootstrap flow
// (workspace-bootstrap-invites.functions.ts): create a workspace and make
// the given user its admin.
export async function createWorkspaceAndAssignAdmin(name: string, userId: string): Promise<string> {
  const { data: adminRole, error: roleErr } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("key", "admin")
    .single();
  if (roleErr || !adminRole) throw new Error("Admin role missing");

  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces")
    .insert({ name })
    .select("id")
    .single();
  if (wsErr || !ws) throw new Error(wsErr?.message ?? "Workspace create failed");

  const { error: wuErr } = await supabaseAdmin.from("workspace_users").insert({
    workspace_id: ws.id,
    user_id: userId,
    role_id: adminRole.id,
  });
  if (wuErr) throw new Error(wuErr.message);

  return ws.id as string;
}

// Bootstrap: create the very first workspace + admin membership for the
// current user. Allowed only when zero workspaces exist in the database.
export const bootstrapFirstWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { count, error: countErr } = await supabaseAdmin
      .from("workspaces")
      .select("id", { count: "exact", head: true });
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) {
      throw new Error("Bootstrap not allowed: workspaces already exist.");
    }

    const workspaceId = await createWorkspaceAndAssignAdmin(data.name, context.userId);
    return { workspaceId };
  });

// Self-serve: a confirmed signup creates its own workspace. One per account
// for now, so this refuses when the caller already belongs to a workspace.
export const createOwnWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().trim().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("workspace_users")
      .select("workspace_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (existing) {
      return { workspaceId: existing.workspace_id as string, alreadyExisted: true };
    }

    const workspaceId = await createWorkspaceAndAssignAdmin(data.name, context.userId);
    return { workspaceId, alreadyExisted: false };
  });

// Whether the system has any workspace at all (drives /bootstrap visibility).
export const workspaceCountIsZero = createServerFn({ method: "GET" }).handler(async () => {
  const { count, error } = await supabaseAdmin
    .from("workspaces")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return { isZero: (count ?? 0) === 0 };
});

// Server-side gate. Throws FeatureGateError if the workspace plan doesn't grant
// the feature. Wrap inside any protected server fn.
export async function requireFeature(workspaceId: string, feature: FeatureKey): Promise<PlanTier> {
  const { data, error } = await supabaseAdmin
    .from("workspaces")
    .select("plan")
    .eq("id", workspaceId)
    .single();
  if (error || !data) throw new Error("Workspace not found");
  const plan = data.plan as PlanTier;
  if (!hasFeature(plan, feature)) throw new FeatureGateError(feature, plan);
  return plan;
}
