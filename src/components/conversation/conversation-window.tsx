import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bold,
  ChevronDown,
  ChevronUp,
  CircleCheckBig,
  Code,
  Copy,
  FilePlus,
  FileText,
  Italic,
  Loader2,
  MoreHorizontal,
  Quote,
  Send,
  Trash2,
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
  listMentionablePages,
  listWorkspaceMembers,
  renameConversation,
} from "@/lib/conversations.functions";
import { ConversationSettingsDialog } from "@/components/conversation/conversation-settings-dialog";
import { AddParticipantsDialog } from "@/components/conversation/add-participants-dialog";
import { EditableTitle } from "@/components/conversation/editable-title";
import { NewPageDialog } from "@/components/page/new-page-dialog";
import { MemberMention, PageMention } from "@/components/editor/custom-mentions";
import { MentionList, type MentionItem } from "@/components/editor/mention-list";
import { QuoteBlock } from "@/components/editor/quote-node";

type Message = {
  id: string;
  rawText: string;
  authorWorkspaceUserId: string | null;
  authorLabel?: string;
  createdAt: string;
};


const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function localDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDaySeparator(iso: string) {
  const d = new Date(iso);
  const weekday = SHORT_WEEKDAYS[d.getDay()];
  const day = pad2(d.getDate());
  const month = SHORT_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  return `${weekday}, ${day} ${month} ${year}`;
}

function formatMessageTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) return time;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${time}`;
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
  "DIV",
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
const KEEP_ATTRS_ON_QUOTE = new Set([
  "class",
  "data-quote-id",
  "data-author",
  "data-created-at",
]);
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
      if (tag === "DIV") {
        if (!el.classList.contains("msg-quote")) {
          // Unwrap unknown divs but keep their children.
          const frag = document.createDocumentFragment();
          while (el.firstChild) frag.appendChild(el.firstChild);
          el.replaceWith(frag);
          walk(frag);
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          if (!KEEP_ATTRS_ON_QUOTE.has(attr.name)) {
            el.removeAttribute(attr.name);
          }
        }
        el.setAttribute("class", "msg-quote");
        walk(el);
        continue;
      }
      if (tag === "SPAN") {
        const mentionClass = Array.from(el.classList).find((cls) =>
          ALLOWED_MENTION_CLASSES.has(cls),
        );
        if (!mentionClass) {
          // unwrap unknown spans
          const text = document.createTextNode(el.textContent ?? "");
          el.replaceWith(text);
          continue;
        }
        el.setAttribute("class", mentionClass);
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

function escapeAttr(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function hasSendableContent(editor: { state: any; getText: () => string }) {
  if (editor.getText().trim().length > 0) return true;
  let found = false;
  editor.state.doc.descendants((n: any) => {
    if (found) return false;
    if (n.type?.name === "quoteBlock") {
      found = true;
      return false;
    }
    return true;
  });
  return found;
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
  openCounter?: { current: number },
) {
  return {
    char,
    items: ({ query }: any) => getItems(query),
    render: () => {
      let component: ReactRenderer | null = null;
      let popup: TippyInstance | null = null;
      let counted = false;
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
          if (openCounter) {
            openCounter.current += 1;
            counted = true;
          }
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
          if (openCounter && counted) {
            openCounter.current = Math.max(0, openCounter.current - 1);
            counted = false;
          }
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
  
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchMentionPages = useServerFn(listMentionablePages);
  const renameConv = useServerFn(renameConversation);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageFromMessages, setNewPageFromMessages] = useState(false);
  const [newPagePresetTitle, setNewPagePresetTitle] = useState<string>("");
  const [newPageMessageIds, setNewPageMessageIds] = useState<string[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mcmExpanded, setMcmExpanded] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedIds(new Set());
    setMcmExpanded(false);
  };

  useEffect(() => {
    if (selectedIds.size === 0 && mcmExpanded) setMcmExpanded(false);
  }, [selectedIds, mcmExpanded]);

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
    setSelectedIds(new Set());
    return () => {
      setSelectedIds(new Set());
    };
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

  const mentionOpenRef = useRef(0);

  const memberSuggestion = useMemo(

    () =>
      buildMentionSuggestion("@", async (query) => {
        const members = await fetchMembers({ data: { workspaceId } });
        return members
          .filter((m) => m.label.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
          .map((m) => ({
            id: m.workspaceUserId,
            label: m.label,
          }));
      }, mentionOpenRef),


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
      QuoteBlock,
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-full focus:outline-none px-3 py-2",
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
    onCreate: ({ editor }) => setIsEmpty(!hasSendableContent(editor)),
    onUpdate: ({ editor }) => setIsEmpty(!hasSendableContent(editor)),
  });

  const handleSend = async () => {
    if (!editor || sending) return;
    if (!hasSendableContent(editor)) return;
    const html = editor.getHTML();
    setSending(true);
    try {
      await sendMsg({ data: { conversationId, rawText: html } });
      editor.commands.clearContent();
      setIsEmpty(true);
      clearSelection();
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleQuoteSelection = () => {
    if (!editor || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const orderIndex = new Map(messages.map((m, i) => [m.id, i]));
    ids.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
    const byId = new Map(messages.map((m) => [m.id, m]));
    const nodes: string[] = [];
    for (const id of ids) {
      const m = byId.get(id);
      if (!m) continue;
      const author = escapeAttr(
        conv?.participants.find((p) => p.workspaceUserId === m.authorWorkspaceUserId)
          ?.label ??
          m.authorLabel ??
          "Archived user",
      );
      const createdAt = escapeAttr(m.createdAt);
      const inner = sanitizeMessageHtml(m.rawText || "") || "<p></p>";
      nodes.push(
        `<div class="msg-quote" data-quote-id="${escapeAttr(m.id)}" data-author="${author}" data-created-at="${createdAt}">${inner}</div>`,
      );
    }
    if (nodes.length === 0) return;
    // Append trailing empty paragraph so caret lands somewhere writable.
    const html = nodes.join("") + "<p></p>";
    editor.chain().focus("end").insertContent(html).run();
    clearSelection();
  };

  const handleNewPage = () => {
    setNewPageFromMessages(false);
    setNewPagePresetTitle("");
    setNewPageMessageIds([]);
    setNewPageOpen(true);
  };

  const handleCreatePageFromSelection = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Preserve chronological order using current messages list.
    const orderIndex = new Map(messages.map((m, i) => [m.id, i]));
    ids.sort(
      (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0),
    );
    const now = new Date();
    const stamp = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const preset = `Messages from ${displayTitle} on ${stamp}`.slice(0, 50);
    setNewPageMessageIds(ids);
    setNewPagePresetTitle(preset);
    setNewPageFromMessages(true);
    setNewPageOpen(true);
  };

  const flashMessage = (id: string) => {
    const el = scrollerRef.current?.querySelector(
      `[data-message-id="${CSS.escape(id)}"]`,
    ) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("msg-flash");
    window.setTimeout(() => el.classList.remove("msg-flash"), 1400);
  };

  const handleMessageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement;
    const quoteEl = targetEl.closest("div.msg-quote") as HTMLElement | null;
    if (quoteEl) {
      const qid = quoteEl.getAttribute("data-quote-id");
      if (qid) {
        e.preventDefault();
        e.stopPropagation();
        flashMessage(qid);
        return;
      }
    }
    const target = targetEl.closest("span.mention-page") as HTMLElement | null;
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
        {selectedIds.size > 0 ? (
          (() => {
            const plural = selectedIds.size > 1 ? "messages" : "message";
            const noop = () => {};
            return (
              <div className="flex flex-col gap-2 border-b px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    ← {selectedIds.size} selected
                  </span>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Cancel
                  </Button>
                </div>
                {mcmExpanded ? (
                  <div className="flex flex-col rounded-md border bg-popover/40 p-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={handleCreatePageFromSelection}
                        >
                          <FilePlus className="size-4" />
                          Create new page
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        Creates a new page using the selected message as placeholder.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={noop}
                        >
                          <FileText className="size-4" />
                          Add to page
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        Adds the contents of the selected message to an existing page.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={handleQuoteSelection}
                        >
                          <Quote className="size-4" />
                          Quote {plural}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        Quotes the selected message inside the new message area.
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={noop}
                    >
                      <Copy className="size-4" />
                      Copy {plural} to clipboard
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full justify-start text-destructive hover:text-destructive"
                      onClick={noop}
                    >
                      <Trash2 className="size-4" />
                      Delete {plural}
                    </Button>
                    <div className="mt-1 flex justify-end border-t pt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setMcmExpanded(false)}
                      >
                        Less <ChevronUp className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 items-center">
                    <div className="justify-self-start">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleCreatePageFromSelection}
                      >
                        New page
                      </Button>
                    </div>
                    <div className="justify-self-center">
                      <Button size="sm" variant="ghost" onClick={handleQuoteSelection}>
                        Quote
                      </Button>
                    </div>
                    <div className="justify-self-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setMcmExpanded(true)}
                      >
                        More <ChevronDown className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : (
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
        )}

        <ResizablePanelGroup
          orientation="vertical"
          className="flex min-h-[520px] flex-1 flex-col"
        >
          <ResizablePanel id="messages" defaultSize="80%" minSize="65%">
            <div
              ref={scrollerRef}
              className="h-full overflow-y-auto overflow-x-hidden px-6 py-4"
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
                    const currentDate = localDateKey(m.createdAt);
                    const previousDate = prev ? localDateKey(prev.createdAt) : null;
                    const showDaySeparator = !prev || currentDate !== previousDate;

                    const isSelected = selectedIds.has(m.id);
                    return (
                      <>
                        {showDaySeparator && (
                          <li
                            key={`day-${currentDate}`}
                            className="flex flex-col items-center pt-6 pb-4 first:pt-0"
                          >
                            <span className="text-xs italic text-muted-foreground">
                              {formatDaySeparator(m.createdAt)}
                            </span>
                            <hr className="mt-2 w-2/3 border-t border-border/60" />
                          </li>
                        )}
                        <li
                          key={m.id}
                          data-message-id={m.id}
                          onClick={(e) => {
                            const t = e.target as HTMLElement;
                            if (
                              t.closest("span.mention-page") ||
                              t.closest("div.msg-quote")
                            )
                              return;
                            toggleSelected(m.id);
                          }}
                          className={`-mx-6 cursor-pointer rounded-sm px-6 py-1 transition-colors ${
                            isSelected ? "bg-muted/60" : "hover:bg-muted/40"
                          }`}
                        >
                          <div
                            className={`flex items-center gap-2 ${
                              isMe ? "justify-end" : "justify-start"
                            }`}
                          >
                            {!isMe && isSelected && (
                              <CircleCheckBig className="size-4 shrink-0 text-primary" />
                            )}
                            <div
                              className={`flex min-w-0 flex-col transition-transform ${
                                isMe ? "items-end" : "items-start"
                              } ${
                                isSelected
                                  ? isMe
                                    ? "-translate-x-2"
                                    : "translate-x-2"
                                  : ""
                              }`}
                            >
                              {showName && (
                                <span className="mb-0.5 px-2 text-xs text-muted-foreground">
                                  {author?.label ?? m.authorLabel ?? "Archived user"}
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
                                {formatMessageTimestamp(m.createdAt)}
                              </span>
                            </div>
                            {isMe && isSelected && (
                              <CircleCheckBig className="size-4 shrink-0 text-primary" />
                            )}
                          </div>
                        </li>
                      </>
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
            minSize="22%"
            maxSize="45%"
          >
            <div className="flex h-full flex-col border-t bg-background">
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
                <div className="flex min-h-0 flex-1 overflow-y-auto rounded-md border [&>div]:h-full [&>div]:w-full">
                  <EditorContent editor={editor} />
                </div>

                <div className="flex flex-col justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleNewPage}
                        aria-label="New conversation page"
                      >
                        <FilePlus className="size-4" />
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
          createdBy={conv.createdBy ?? null}

          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onRename={handleRename}
        />
        <NewPageDialog
          workspaceId={workspaceId}
          conversationId={conversationId}
          open={newPageOpen}
          onOpenChange={setNewPageOpen}
          mode={newPageFromMessages ? "fromMessages" : "blank"}
          presetTitle={newPageFromMessages ? newPagePresetTitle : undefined}
          messageIds={newPageFromMessages ? newPageMessageIds : undefined}
          onCreated={(pageId) => {
            clearSelection();
            navigate({
              to: "/w/$workspaceId",
              params: { workspaceId },
              search: (prev: any) => ({ ...prev, p: pageId }),
            });
          }}
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
