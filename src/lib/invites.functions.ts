import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "crypto";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireFeature } from "./workspaces.functions";

const INVITE_TTL_HOURS = 24;
const ROLE_KEYS = ["admin", "member", "viewer"] as const;

async function assertWorkspaceAdmin(workspaceId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("workspace_users")
    .select("id, user_roles!inner(key)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data as any).user_roles.key !== "admin") {
    throw new Error("Forbidden: workspace admin only");
  }
  return data.id as string;
}

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertWorkspaceAdmin(data.workspaceId, context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, email, token, expires_at, accepted_at, created_at, user_roles!inner(key)")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      email: r.email as string,
      token: r.token as string,
      roleKey: r.user_roles.key as string,
      expiresAt: r.expires_at as string,
      acceptedAt: r.accepted_at as string | null,
      createdAt: r.created_at as string,
    }));
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        email: z.string().email().max(320),
        roleKey: z.enum(ROLE_KEYS),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const inviterWorkspaceUserId = await assertWorkspaceAdmin(
      data.workspaceId,
      context.userId,
    );
    await requireFeature(data.workspaceId, "invites.create");

    const { data: role, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("key", data.roleKey)
      .single();
    if (roleErr || !role) throw new Error("Role not found");

    const email = data.email.trim().toLowerCase();

    // Prevent duplicate active (unaccepted, unexpired) invites for same email
    const { data: existing } = await supabaseAdmin
      .from("workspace_invites")
      .select("id")
      .eq("workspace_id", data.workspaceId)
      .eq("email", email)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing) throw new Error("An active invite already exists for this email");

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

    const { data: row, error } = await supabaseAdmin
      .from("workspace_invites")
      .insert({
        workspace_id: data.workspaceId,
        email,
        role_id: role.id,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by_workspace_user_id: inviterWorkspaceUserId,
      })
      .select("id, token, expires_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create invite");

    return {
      id: row.id as string,
      token: row.token as string,
      expiresAt: row.expires_at as string,
    };
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ workspaceId: z.string().uuid(), inviteId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWorkspaceAdmin(data.workspaceId, context.userId);
    const { error } = await supabaseAdmin
      .from("workspace_invites")
      .delete()
      .eq("id", data.inviteId)
      .eq("workspace_id", data.workspaceId)
      .is("accepted_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public — used by /accept-invite to preview an invite before sign-in.
export const getInviteByToken = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("workspace_invites")
      .select(
        "id, email, expires_at, accepted_at, workspaces!inner(id, name), user_roles!inner(key)",
      )
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { status: "not_found" as const };
    if (row.accepted_at) return { status: "accepted" as const };
    if (new Date(row.expires_at as string) < new Date())
      return { status: "expired" as const };
    return {
      status: "valid" as const,
      email: row.email as string,
      workspaceId: (row as any).workspaces.id as string,
      workspaceName: (row as any).workspaces.name as string,
      roleKey: (row as any).user_roles.key as string,
    };
  });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: userRow, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userErr || !userRow.user?.email) throw new Error("User email unavailable");
    const userEmail = userRow.user.email.toLowerCase();

    const { data: invite, error } = await supabaseAdmin
      .from("workspace_invites")
      .select("id, workspace_id, email, role_id, expires_at, accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    if (invite.accepted_at) throw new Error("Invite already used");
    if (new Date(invite.expires_at as string) < new Date()) throw new Error("Invite expired");
    if ((invite.email as string).toLowerCase() !== userEmail) {
      throw new Error("Invite email does not match the signed-in account");
    }

    // Idempotent membership: skip if already a member
    const { data: existing } = await supabaseAdmin
      .from("workspace_users")
      .select("id")
      .eq("workspace_id", invite.workspace_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      const { error: insErr } = await supabaseAdmin.from("workspace_users").insert({
        workspace_id: invite.workspace_id,
        user_id: userId,
        role_id: invite.role_id,
      });
      if (insErr) throw new Error(insErr.message);
    }

    const { error: updErr } = await supabaseAdmin
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (updErr) throw new Error(updErr.message);

    return { workspaceId: invite.workspace_id as string };
  });
