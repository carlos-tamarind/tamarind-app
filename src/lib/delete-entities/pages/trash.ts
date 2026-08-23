import { DELETE_PAGE_GRACE_PERIOD_MS } from "@/lib/delete-entities/config";

export function computeTrashPurgedAt(nowMs = Date.now()): string {
  return new Date(nowMs + DELETE_PAGE_GRACE_PERIOD_MS).toISOString();
}
