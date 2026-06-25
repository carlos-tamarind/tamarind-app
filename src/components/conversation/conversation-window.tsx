import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bold,
  Code,
  FilePlus,
  Italic,
  Loader2,
  MoreHorizontal,
  Send,
  User,
  Users,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  getConversation,
  listMessages,
  sendMessage,
  createConversationPage,
} from "@/lib/conversations.functions";
import { ConversationSettingsDialog } from "@/components/conversation/conversation-settings-dialog";
import { AddParticipantsDialog } from "@/components/conversation/add-participants-dialog";

type Message = {
  id: string;
  rawText: string;
  authorWorkspaceUserId: string | null;
  createdAt: string;
};

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}-${pad(
    d.getMonth() + 1,
  )}-${d.getFullYear()}`;
}

const ALLOWED_MESSAGE_TAGS = new Set([
  "P",
  "STRONG",
  "B",
  "EM",
  "I",
  "CODE",
  "BR",
]);

function sanitizeMessageHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (!ALLOWED_MESSAGE_TAGS.has(el.tagName)) {
          el.replaceWith(document.createTextNode(el.textContent ?? ""));
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }
        walk(el);
      }
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

export function ConversationWindow({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchConv = useServerFn(getConversation);
  const fetchMessages = useServerFn(listMessages);
  const sendMsg = useServerFn(sendMessage);
  const newPage = useServerFn(createConversationPage);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const { data: conv } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConv({ data: { conversationId } }),
  });

  const { data: initialMessages } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversationId } }),
  });

  useEffect(() => {
    setLiveMessages([]);
  }, [conversationId]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as any;
          setLiveMessages((prev) => {
            if (prev.some((p) => p.id === m.id)) return prev;
            return [
              ...prev,
              {
                id: m.id,
                rawText: m.raw_text ?? "",
                authorWorkspaceUserId: m.author_workspace_user_id,
                createdAt: m.created_at,
              },
            ];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const messages = useMemo<Message[]>(() => {
    const seen = new Set<string>();
    const out: Message[] = [];
    for (const m of initialMessages ?? []) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    for (const m of liveMessages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [initialMessages, liveMessages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        horizontalRule: false,
      }),
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[60px] focus:outline-none px-3 py-2",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor }) => setIsEmpty(editor.isEmpty),
    onUpdate: ({ editor }) => setIsEmpty(editor.isEmpty),
  });

  const handleSend = async () => {
    if (!editor || sending) return;
    const plain = editor.getText().trim();
    if (!plain) return;
    const html = editor.getHTML();
    setSending(true);
    try {
      await sendMsg({ data: { conversationId, rawText: html } });
      editor.commands.clearContent();
      setIsEmpty(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleNewPage = async () => {
    if (creatingPage) return;
    setCreatingPage(true);
    try {
      const { pageId } = await newPage({ data: { conversationId } });
      queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
      queryClient.invalidateQueries({
        queryKey: ["conversation-pages", conversationId],
      });
      navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev: any) => ({ ...prev, p: pageId }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingPage(false);
    }
  };

  if (!conv) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const isGroup = conv.type === "group";
  const TypeIcon = isGroup ? Users : User;

  return (
    <div className="grid h-full grid-rows-[auto_8fr_2fr]">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h1 className="truncate text-base font-semibold">{conv.title}</h1>
        <div className="flex items-center gap-1">
          {isGroup ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" aria-label="Participants">
                  <TypeIcon className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">
                  Participants ({conv.participants.length})
                </div>
                <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto text-sm">
                  {conv.participants.map((p) => (
                    <li key={p.workspaceUserId}>
                      {p.displayName}
                      {p.isMe && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => setAddOpen(true)}
                >
                  Add participants
                </Button>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Conversation type"
              onClick={() => setAddOpen(true)}
            >
              <TypeIcon className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollerRef} className="min-h-0 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No messages yet — say hi.
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => {
              const author = conv.participants.find(
                (p) => p.workspaceUserId === m.authorWorkspaceUserId,
              );
              const isMe = author?.isMe ?? false;
              const prev = messages[i - 1];
              const showName =
                !isMe &&
                (!prev || prev.authorWorkspaceUserId !== m.authorWorkspaceUserId);
              return (
                <li
                  key={m.id}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  {showName && (
                    <span className="mb-0.5 px-2 text-xs text-muted-foreground">
                      {author?.displayName ?? "Unknown"}
                    </span>
                  )}
                  <div
                    className={`prose prose-sm max-w-[75%] break-words rounded-2xl px-3 py-2 text-sm [&>p]:my-0 ${
                      isMe
                        ? "prose-invert bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                    dangerouslySetInnerHTML={{
                      __html: sanitizeMessageHtml(m.rawText),
                    }}
                  />
                  <span className="mt-0.5 px-2 text-[10px] text-muted-foreground">
                    {formatTimestamp(m.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex min-h-0 flex-col border-t">
        <div className="flex items-center gap-1 border-b px-2 py-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            aria-label="Bold"
          >
            <Bold className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            aria-label="Italic"
          >
            <Italic className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => editor?.chain().focus().toggleCode().run()}
            aria-label="Code"
          >
            <Code className="size-3.5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-stretch gap-2 p-2">
          <div className="flex min-h-0 flex-1 overflow-y-auto rounded-md border [&>div]:w-full">
            <EditorContent editor={editor} />
          </div>

          <div className="flex flex-col justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleNewPage}
              disabled={creatingPage}
              aria-label="New page"
            >
              {creatingPage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FilePlus className="size-4" />
              )}
            </Button>
            <Button
              size="icon"
              onClick={handleSend}
              disabled={isEmpty || sending}
              aria-label="Send"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <ConversationSettingsDialog
        workspaceId={workspaceId}
        conversationId={conversationId}
        title={conv.title}
        participants={conv.participants}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <AddParticipantsDialog
        workspaceId={workspaceId}
        conversationId={conversationId}
        existingWorkspaceUserIds={conv.participants.map((p) => p.workspaceUserId)}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  );
}
