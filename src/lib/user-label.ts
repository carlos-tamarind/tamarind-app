export function formatUserLabel(input: {
  displayName?: string | null;
  email?: string | null;
  archived?: boolean;
}): string {
  if (input.archived) return "Archived user";
  const name = input.displayName?.trim();
  if (name) return name;
  const email = input.email?.trim();
  if (email) return email;
  return "Unknown user";
}
