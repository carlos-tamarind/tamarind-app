import { DELETE_MESSAGE_GRACE_PERIOD_MS } from "@/lib/delete-entities/config";

export function computeMessageTrashPurgedAt(nowMs = Date.now()): string {
  return new Date(nowMs + DELETE_MESSAGE_GRACE_PERIOD_MS).toISOString();
}
