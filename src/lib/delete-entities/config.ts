export const DELETE_PAGE_GRACE_PERIOD_MS = 60 * 60 * 24 * 30 * 1000;

export const DELETE_MESSAGE_GRACE_PERIOD_MS = 60 * 60 * 1000;

export const DELETED_PAGE_LABEL = "[Deleted page]";

export const DELETED_MESSAGE_LABEL = "[Message deleted]";

const DAY_MS = 60 * 60 * 24 * 1000;

export function isTrashed(purgedAt: string | null | undefined): boolean {
  return purgedAt != null && purgedAt !== "";
}

export function isMessageUndoAvailable(
  purgedAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!isTrashed(purgedAt)) return false;
  return new Date(purgedAt!).getTime() > nowMs;
}

export function daysUntilPurge(purgedAt: string | null | undefined): number {
  if (!isTrashed(purgedAt)) return 0;
  return Math.ceil((new Date(purgedAt!).getTime() - Date.now()) / DAY_MS);
}

export function formatDaysUntilPurge(purgedAt: string | null | undefined): string {
  const days = daysUntilPurge(purgedAt);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
