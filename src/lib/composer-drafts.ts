const STORAGE_KEY = "tamarind:composer-drafts";

function readMap(): Record<string, string> {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getComposerDraft(conversationId: string): string | null {
  const html = readMap()[conversationId];
  return html && html.trim() ? html : null;
}

export function setComposerDraft(conversationId: string, html: string) {
  const map = readMap();
  map[conversationId] = html;
  writeMap(map);
}

export function removeComposerDraft(conversationId: string) {
  const map = readMap();
  if (!(conversationId in map)) return;
  delete map[conversationId];
  writeMap(map);
}

export function clearComposerDrafts() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
