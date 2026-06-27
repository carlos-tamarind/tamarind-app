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
  Users,
} from "lucide-react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import tippy, { type Instance as TippyInstance } from "tippy.js";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import { supabase } from "@/integrations/supabase/client";
import {
  getConversation,
  listMessages,
  sendMessage,
  createConversationPage,
  listMentionablePages,
  listWorkspaceMembers,
  renameConversation,
} from "@/lib/conversations.functions";
import { ConversationSettingsDialog } from "@/components/conversation/conversation-settings-dialog";
import { AddParticipantsDialog } from "@/components/conversation/add-participants-dialog";
import { EditableTitle } from "@/components/conversation/editable-title";
import { MemberMention, PageMention } from "@/components/editor/custom-mentions";
import { MentionList, type MentionItem } from "@/components/editor/mention-list";

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
  "SPAN",
  "SVG",
  "CIRCLE",
  "PATH",
  "RECT",
  "LINE",
  "POLYLINE",
  "POLYGON",
  "G",
]);

const ALLOWED_MENTION_CLASSES = new Set(["mention-member", "mention-page"]);
const KEEP_ATTRS_ON_MENTION = new Set(["class", "data-id", "data-label"]);
// Drop event handlers and href-like attributes; allow svg/path geometry attrs.
const DROP_ATTRS = new Set(["onclick", "onmouseover", "href", "xlink:href", "style"]);

function sanitizeAttrs(el: Element) {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (DROP_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
    }
  }
}

function sanitizeMessageHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (!ALLOWED_MESSAGE_TAGS.has(tag)) {
        el.replaceWith(document.createTextNode(el.textContent ?? ""));
        continue;
      }
      if (tag === "SPAN") {
        const cls = el.getAttribute("class") ?? "";
        if (!ALLOWED_MENTION_CLASSES.has(cls)) {
          // unwrap unknown spans
          const text = document.createTextNode(el.textContent ?? "");
          el.replaceWith(text);
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          if (!KEEP_ATTRS_ON_MENTION.has(attr.name)) {
            el.removeAttribute(attr.name);
          }
        }
        walk(el);
        continue;
      }
      sanitizeAttrs(el);
      walk(el);
    }
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

function defaultGroupTitle(participants: { isMe: boolean; displayName: string }[]) {
  const names = participants
    .filter((p) => !p.isMe)
    .map((p) => p.displayName)
    .filter(Boolean);
  if (names.length === 0) return "Conversation";
  const MAX = 64;
  let acc = "";
  for (let i = 0; i < names.length; i++) {
    const next = i === 0 ? names[i] : `${acc}, ${names[i]}`;
    if (next.length > MAX) {
      return acc ? `${acc} ...` : `${names[0].slice(0, MAX - 4)} ...`;
    }
    acc = next;
  }
  return acc;
}

function buildMentionSuggestion(
  char: string,
  getItems: (query: string) => Promise<MentionItem[]>,
) {
  return {
    char,
    items: ({ query }: any) => getItems(query),
    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance | null = null;
      return {
        onStart: (props: any) => {
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          });
          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "top-start",
          });
        },
        onUpdate: (props: any) => {
          component?.updateProps(props);
          popup?.setProps({ getReferenceClientRect: props.clientRect });
        },
        onKeyDown: (props: any) => {
          if (props.event.key === "Escape") {
            popup?.hide();
            return true;
          }
          return (component?.ref as any)?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          popup?.destroy();
          component?.destroy();
        },
      };
    },
  };
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
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchMentionPages = useServerFn(listMentionablePages);
  const renameConv = useServerFn(renameConversation);

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

  const memberSuggestion = useMemo(
    () =>
      buildMentionSuggestion("@", async (query) => {
        const members = await fetchMembers({ data: { workspaceId } });
        return members
          .filter((m) =>
            (m.displayName ?? m.userId)
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .slice(0, 8)
          .map((m) => ({
            id: m.workspaceUserId,
            label: m.displayName ?? m.userId.slice(0, 8),
          }));
      }),
    [workspaceId, fetchMembers],
  );

  const pageSuggestion = useMemo(
    () =>
      buildMentionSuggestion("@@", async (query) => {
        const pages = await fetchMentionPages({
          data: { workspaceId, conversationId },
        });
        return pages
          .filter((p) =>
            (p.title ?? "Untitled").toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, 8)
          .map((p) => ({ id: p.id, label: p.title || "Untitled" }));
      }),
    [workspaceId, conversationId, fetchMentionPages],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        horizontalRule: false,
      }),
      MemberMention.configure({
        HTMLAttributes: { class: "mention-member" },
        suggestion: memberSuggestion,
      }),
      PageMention.configure({
        HTMLAttributes: { class: "mention-page" },
        suggestion: pageSuggestion,
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

  const handleMessageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest(
      "span.mention-page",
    ) as HTMLElement | null;
    if (!target) return;
    const id = target.getAttribute("data-id");
    if (!id) return;
    e.preventDefault();
    navigate({
      to: "/w/$workspaceId",
      params: { workspaceId },
      search: (prev: any) => ({ ...prev, p: id }),
    });
  };

  const handleRename = async (title: string) => {
    await renameConv({ data: { conversationId, title } });
    queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    queryClient.invalidateQueries({ queryKey: ["conversations-list", workspaceId] });
  };

  if (!conv) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const isGroup = conv.type === "group" || conv.participants.length > 2;
  const displayTitle = conv.title
    ? conv.title
    : isGroup
      ? defaultGroupTitle(conv.participants)
      : conv.participants.find((p) => !p.isMe)?.displayName ?? "Conversation";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1 pr-3">
            <EditableTitle
              value={displayTitle}
              editable={isGroup}
              onSave={handleRename}
              className="text-base font-semibold"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isGroup ? (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Participants">
                        <Users className="size-4" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Participants</TooltipContent>
                </Tooltip>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Participants"
                    onClick={() => setAddOpen(true)}
                  >
                    <Users className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Participants</TooltipContent>
              </Tooltip>
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

        <ResizablePanelGroup
          orientation="vertical"
          className="flex min-h-[520px] flex-1 flex-col"
        >
          <ResizablePanel id="messages" defaultSize="80%" minSize="65%">
            <div
              ref={scrollerRef}
              className="h-full overflow-y-auto px-4 py-4"
              onClick={handleMessageClick}
            >
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
                      (!prev ||
                        prev.authorWorkspaceUserId !== m.authorWorkspaceUserId);
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
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="composer"
            defaultSize="20%"
            minSize="15%"
            maxSize="35%"
          >
            <div className="flex h-full min-h-[180px] flex-col border-t bg-background">
              <div className="flex items-center gap-1 border-b px-2 py-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => editor?.chain().focus().toggleBold().run()}
                      aria-label="Bold"
                    >
                      <Bold className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Bold text</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => editor?.chain().focus().toggleItalic().run()}
                      aria-label="Italic"
                    >
                      <Italic className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Italic text</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={() => editor?.chain().focus().toggleCode().run()}
                      aria-label="Code"
                    >
                      <Code className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Inline code</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex min-h-0 flex-1 items-stretch gap-2 p-2">
                <div className="flex min-h-0 flex-1 overflow-y-auto rounded-md border [&>div]:w-full">
                  <EditorContent editor={editor} />
                </div>

                <div className="flex flex-col justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleNewPage}
                        disabled={creatingPage}
                        aria-label="New conversation page"
                      >
                        {creatingPage ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <FilePlus className="size-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">New conversation page</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={isEmpty || sending}
                        aria-label="Send message"
                      >
                        {sending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Send className="size-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Send message</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        <ConversationSettingsDialog
          workspaceId={workspaceId}
          conversationId={conversationId}
          title={displayTitle}
          isGroup={isGroup}
          participants={conv.participants}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onRename={handleRename}
        />
        <AddParticipantsDialog
          workspaceId={workspaceId}
          conversationId={conversationId}
          existingWorkspaceUserIds={conv.participants.map((p) => p.workspaceUserId)}
          open={addOpen}
          onOpenChange={setAddOpen}
        />
      </div>
    </TooltipProvider>
  );
}
