import { DELETE_GRACE_PERIOD_MS } from "@/lib/delete-entities/config";

export function computeTrashPurgedAt(nowMs = Date.now()): string {
  return new Date(nowMs + DELETE_GRACE_PERIOD_MS).toISOString();
}
