export type WorkspaceRoleKey = "admin" | "member" | "viewer";

const ROLE_LABELS: Record<WorkspaceRoleKey, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Guest",
};

export function formatWorkspaceRoleLabel(
  roleKey: WorkspaceRoleKey | null | undefined,
): string | null {
  if (!roleKey) return null;
  return ROLE_LABELS[roleKey] ?? null;
}
