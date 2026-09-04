import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { randomBytes } from "crypto";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createWorkspaceAndAssignAdmin } from "./workspaces.functions";

async function getAuthoritativeEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email.toLowerCase();
}

function isPlatformOwner(email: string | null): boolean {
  if (!email) return false;
  const allowlist = (process.env.PLATFORM_OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email);
}

async function assertPlatformOwner(userId: string) {
  const email = await getAuthoritativeEmail(userId);
  if (!isPlatformOwner(email)) {
    throw new Error("Forbidden: platform owner only");
  }
}

export const getIsPlatformOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = await getAuthoritativeEmail(context.userId);
    return { isOwner: isPlatformOwner(email) };
  });

export const createWorkspaceBootstrapInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        expiresInHours: z
          .number()
          .int()
          .min(1)
          .max(24 * 30),
        adminEmail: z.string().email().max(320).optional(),
        welcomeMessage: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformOwner(context.userId);

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);

    const { data: row, error } = await supabaseAdmin
      .from("workspace_bootstrap_invites")
      .insert({
        token,
        admin_email: data.adminEmail?.trim().toLowerCase(),
        welcome_message: data.welcomeMessage,
        created_by: context.userId,
        expires_at: expiresAt.toISOString(),
      })
      .select("id, token, admin_email, welcome_message, expires_at, created_at")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Failed to create invite");

    return {
      id: row.id as string,
      token: row.token as string,
      adminEmail: row.admin_email as string | null,
      welcomeMessage: row.welcome_message as string | null,
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
    };
  });

export const listWorkspaceBootstrapInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformOwner(context.userId);

    const { data, error } = await supabaseAdmin
      .from("workspace_bootstrap_invites")
      .select(
        "id, token, admin_email, welcome_message, expires_at, used_at, created_workspace_id, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      id: r.id as string,
      token: r.token as string,
      adminEmail: r.admin_email as string | null,
      welcomeMessage: r.welcome_message as string | null,
      expiresAt: r.expires_at as string,
      usedAt: r.used_at as string | null,
      createdWorkspaceId: r.created_workspace_id as string | null,
      createdAt: r.created_at as string,
    }));
  });

export const revokeWorkspaceBootstrapInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertPlatformOwner(context.userId);

    const { error } = await supabaseAdmin
      .from("workspace_bootstrap_invites")
      .delete()
      .eq("id", data.id)
      .is("used_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public — used by /bootstrap?token=... to preview an invite before sign-in.
export const getWorkspaceBootstrapInviteByToken = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { data: invite, error } = await supabaseAdmin
      .from("workspace_bootstrap_invites")
      .select("id, admin_email, welcome_message, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) return { status: "not_found" as const };
    if (invite.used_at) return { status: "used" as const };
    if (new Date(invite.expires_at as string) < new Date()) return { status: "expired" as const };

    return {
      status: "valid" as const,
      adminEmail: invite.admin_email as string | null,
      welcomeMessage: invite.welcome_message as string | null,
      expiresAt: invite.expires_at as string,
    };
  });

// Redeem a bootstrap invite: create a brand-new workspace and make the
// signed-in caller its admin. One-time use is enforced by an atomic claim
// (UPDATE ... WHERE used_at IS NULL ... RETURNING) rather than a
// check-then-write, so two concurrent redemptions of the same token can't
// both succeed.
export const bootstrapWorkspaceWithInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        token: z.string().min(8).max(128),
        name: z.string().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: invite, error } = await supabaseAdmin
      .from("workspace_bootstrap_invites")
      .select("id, admin_email, expires_at, used_at")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Invite not found");
    if (invite.used_at) throw new Error("Invite already used");
    if (new Date(invite.expires_at as string) < new Date()) throw new Error("Invite expired");

    if (invite.admin_email) {
      const userEmail = await getAuthoritativeEmail(context.userId);
      if (userEmail !== (invite.admin_email as string).toLowerCase()) {
        throw new Error("This invite is locked to a different admin email");
      }
    }

    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("workspace_bootstrap_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("token", data.token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) throw new Error("Invite already used or expired");

    const workspaceId = await createWorkspaceAndAssignAdmin(data.name, context.userId);

    await supabaseAdmin
      .from("workspace_bootstrap_invites")
      .update({ created_workspace_id: workspaceId })
      .eq("id", claimed.id);

    return { workspaceId };
  });
