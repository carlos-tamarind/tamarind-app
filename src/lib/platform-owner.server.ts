/** Shared by platform invites and the read-only agent entrypoints. */
export function isPlatformOwnerEmail(
  email: string | null | undefined,
  configuredEmails = process.env.PLATFORM_OWNER_EMAILS ?? "",
): boolean {
  if (!email) return false;
  return configuredEmails
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
