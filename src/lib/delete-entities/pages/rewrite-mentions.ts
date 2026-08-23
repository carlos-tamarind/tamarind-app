import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DELETED_PAGE_LABEL } from "@/lib/delete-entities/config";

const MENTION_SPAN =
  /<span\b[^>]*\bmention-page\b[^>]*>[\s\S]*?<\/span>/gi;

function replaceMentionsInDoc(node: unknown, ids: Set<string>): boolean {
  if (!node || typeof node !== "object") return false;
  const record = node as { type?: string; attrs?: { id?: string }; content?: unknown[] };
  let mutated = false;
  if (!Array.isArray(record.content)) return false;

  const next: unknown[] = [];
  for (const child of record.content) {
    if (
      child &&
      typeof child === "object" &&
      (child as { type?: string }).type === "pageMention" &&
      ids.has(String((child as { attrs?: { id?: string } }).attrs?.id ?? ""))
    ) {
      next.push({ type: "text", text: DELETED_PAGE_LABEL });
      mutated = true;
    } else {
      if (replaceMentionsInDoc(child, ids)) mutated = true;
      next.push(child);
    }
  }
  record.content = next;
  return mutated;
}

function replaceMentionsInHtml(html: string, ids: Set<string>): string {
  return html.replace(MENTION_SPAN, (match) => {
    const id = match.match(/data-id="([^"]+)"/)?.[1];
    if (id && ids.has(id)) return DELETED_PAGE_LABEL;
    return match;
  });
}

export async function rewritePageMentions(pageIds: string[]): Promise<void> {
  if (pageIds.length === 0) return;
  const ids = new Set(pageIds);

  const { data: pages, error: pagesErr } = await supabaseAdmin
    .from("pages")
    .select("id, content");
  if (pagesErr) throw new Error(pagesErr.message);

  for (const page of pages ?? []) {
    if (ids.has(page.id as string)) continue;
    const content = page.content;
    if (!content || typeof content !== "object") continue;
    const clone = JSON.parse(JSON.stringify(content));
    if (!replaceMentionsInDoc(clone, ids)) continue;
    const { error } = await supabaseAdmin
      .from("pages")
      .update({ content: clone, last_modified_at: new Date().toISOString() })
      .eq("id", page.id);
    if (error) throw new Error(error.message);
  }

  const { data: messages, error: msgErr } = await supabaseAdmin
    .from("messages")
    .select("id, raw_text")
    .not("raw_text", "is", null);
  if (msgErr) throw new Error(msgErr.message);

  for (const message of messages ?? []) {
    const raw = message.raw_text as string | null;
    if (!raw || !ids.size) continue;
    if (![...ids].some((id) => raw.includes(id))) continue;
    const next = replaceMentionsInHtml(raw, ids);
    if (next === raw) continue;
    const { error } = await supabaseAdmin
      .from("messages")
      .update({ raw_text: next })
      .eq("id", message.id);
    if (error) throw new Error(error.message);
  }
}
