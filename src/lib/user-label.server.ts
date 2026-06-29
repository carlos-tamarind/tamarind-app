import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function resolveLabel(
  row: { display_name?: string | null; user_id?: string | null } | null | undefined,
  emails: Map<string, string>,
): string {
  if (!row) return "Archived user";
  const name = (row.display_name ?? "").trim();
  if (name) return name;
  const uid = row.user_id ?? "";
  const email = emails.get(uid)?.trim();
  if (email) return email;
  return "Unknown user";
}

export async function fetchEmailsForUserIds(
  userIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(userIds.filter((u): u is string => typeof u === "string" && !!u)),
  );
  const out = new Map<string, string>();
  await Promise.all(
    unique.map(async (uid) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user?.email) out.set(uid, data.user.email);
      } catch {
        // ignore
      }
    }),
  );
  return out;
}
