import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bold,
  Check,
  Code,
  Copy,
  FilePlus,
  FileText,
  Italic,
  MessageSquareDashed,
  MoreHorizontal,
  Quote,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { HOTKEYS, useHotkey, useShortcutLabel } from "@/hooks/use-hotkeys";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { supabase } from "@/integrations/supabase/client";
import {
  getConversation,
  listMessages,
  sendMessage,
  trashMessages,
  recoverMessage,
  listMentionablePages,
  listWorkspaceMembers,
  renameConversation,
} from "@/lib/conversations.functions";
import { PinToggle } from "@/components/pin-toggle";
import { ConversationSettingsDialog } from "@/components/conversation/conversation-settings-dialog";
import { AddParticipantsDialog } from "@/components/conversation/add-participants-dialog";
import { ConversationSuggestionNudge } from "@/components/conversation/conversation-suggestion-nudge";
import { EditableTitle } from "@/components/conversation/editable-title";
import { NewPageDialog } from "@/components/page/new-page-dialog";
import { MemberMention, PageMention } from "@/components/editor/custom-mentions";
import { MentionList, type MentionItem } from "@/components/editor/mention-list";
import { QuoteBlock } from "@/components/editor/quote-node";
import { UserLink } from "@/components/user-link";
import { useNavigateToUserConversation } from "@/hooks/use-navigate-to-user-conversation";
import { useConversationSuggestion } from "@/hooks/use-conversation-suggestion";
import { openExternalUrl, isSafeExternalUrl } from "@/lib/open-external-url";
import { createMentionClickHandler } from "@/lib/tiptap-mention-clicks";
import { UserNavigationContext } from "@/lib/user-navigation-context";
import {
  DELETED_MESSAGE_LABEL,
  isMessageUndoAvailable,
  isTrashed,
} from "@/lib/delete-entities/config";
import { computeMessageTrashPurgedAt } from "@/lib/delete-entities/messages/trash";
import { withPage } from "@/lib/workspace-search";
import {
  getComposerDraft,
  removeComposerDraft,
  setComposerDraft,
} from "@/lib/composer-drafts";

type Message = {
  id: string;
  rawText: string;
  authorWorkspaceUserId: string | null;
  authorLabel?: string;
  createdAt: string;
  purgedAt?: string | null;
};

function mapRealtimeMessage(row: any, prev?: Message): Message {
  return {
    id: row.id as string,
    rawText: (row.raw_text as string | undefined) ?? prev?.rawText ?? "",
    authorWorkspaceUserId:
      (row.author_workspace_user_id as string | null | undefined) ??
      prev?.authorWorkspaceUserId ??
      null,
    authorLabel: prev?.authorLabel,
    createdAt: (row.created_at as string | undefined) ?? prev?.createdAt ?? "",
    purgedAt:
      ("purged_at" in (row ?? {})
        ? ((row.purged_at as string | null) ?? null)
        : prev?.purgedAt) ?? null,
  };
}

type MessageRun = {
  dateKey: string;
  authorWorkspaceUserId: string | null;
  isMe: boolean;
  messages: Message[];
};

function groupMessagesIntoRuns(
  messages: Message[],
  getIsMe: (authorWorkspaceUserId: string | null) => boolean,
): MessageRun[] {
  const runs: MessageRun[] = [];
  for (const m of messages) {
    const dateKey = localDateKey(m.createdAt);
    const last = runs[runs.length - 1];
    if (
      last &&
      last.dateKey === dateKey &&
      last.authorWorkspaceUserId === m.authorWorkspaceUserId
    ) {
      last.messages.push(m);
    } else {
      runs.push({
        dateKey,
        authorWorkspaceUserId: m.authorWorkspaceUserId,
        isMe: getIsMe(m.authorWorkspaceUserId),
        messages: [m],
      });
    }
  }
  return runs;
}


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
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return "Today";
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
  "A",
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
  "data-author-id",
  "data-created-at",
]);
const KEEP_ATTRS_ON_QUOTE_HEADER = new Set([
  "class",
  "data-author",
  "data-author-id",
]);
const KEEP_ATTRS_ON_LINK = new Set(["href", "target", "rel", "class"]);
// Drop event handlers and unsafe attrs; allow svg/path geometry attrs.
const DROP_ATTRS = new Set(["onclick", "onmouseover", "xlink:href", "style"]);

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

function sanitizeMessageHtml(
  html: string,
  myWorkspaceUserId?: string | null,
  purgedQuoteIds?: ReadonlySet<string>,
): string {
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
        if (el.classList.contains("msg-quote-header")) {
          for (const attr of Array.from(el.attributes)) {
            if (!KEEP_ATTRS_ON_QUOTE_HEADER.has(attr.name)) {
              el.removeAttribute(attr.name);
            }
          }
          el.setAttribute("class", "msg-quote-header");
          const authorId = el.getAttribute("data-author-id");
          if (authorId && myWorkspaceUserId && authorId === myWorkspaceUserId) {
            el.classList.add("msg-quote-header-self");
          }
          walk(el);
          continue;
        }
        if (el.classList.contains("msg-quote")) {
          for (const attr of Array.from(el.attributes)) {
            if (!KEEP_ATTRS_ON_QUOTE.has(attr.name)) {
              el.removeAttribute(attr.name);
            }
          }
          el.setAttribute("class", "msg-quote");
          walk(el);
          const quoteId = el.getAttribute("data-quote-id");
          if (quoteId && purgedQuoteIds?.has(quoteId)) {
            const header = el.querySelector(".msg-quote-header");
            for (const child of Array.from(el.childNodes)) {
              if (child === header) continue;
              el.removeChild(child);
            }
            const body = document.createElement("p");
            body.textContent = DELETED_MESSAGE_LABEL;
            el.appendChild(body);
          }
          continue;
        }
        // Unwrap unknown divs but keep their children.
        const frag = document.createDocumentFragment();
        while (el.firstChild) frag.appendChild(el.firstChild);
        el.replaceWith(frag);
        walk(frag);
        continue;
      }
      if (tag === "A") {
        const href = el.getAttribute("href") ?? "";
        if (!isSafeExternalUrl(href)) {
          el.replaceWith(document.createTextNode(el.textContent ?? ""));
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          if (!KEEP_ATTRS_ON_LINK.has(attr.name)) {
            el.removeAttribute(attr.name);
          }
        }
        el.setAttribute("class", "message-link");
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow");
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
        const isSelf =
          mentionClass === "mention-member" &&
          myWorkspaceUserId &&
          el.getAttribute("data-id") === myWorkspaceUserId;
        el.setAttribute(
          "class",
          isSelf ? "mention-member mention-member-self" : mentionClass,
        );
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
  const search = useSearch({ from: "/_authenticated/w/$workspaceId" });
  const targetMessageId = search.m;
  const queryClient = useQueryClient();

  const fetchConv = useServerFn(getConversation);
  const fetchMessages = useServerFn(listMessages);
  const sendMsg = useServerFn(sendMessage);
  const trashMsgs = useServerFn(trashMessages);
  const recoverMsg = useServerFn(recoverMessage);
  
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchMentionPages = useServerFn(listMentionablePages);
  const renameConv = useServerFn(renameConversation);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageFromMessages, setNewPageFromMessages] = useState(false);
  const [newPagePresetTitle, setNewPagePresetTitle] = useState<string>("");
  const [newPageMessageIds, setNewPageMessageIds] = useState<string[]>([]);
  const [isEmpty, setIsEmpty] = useState(true);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const composerPanelRef = useRef<PanelImperativeHandle>(null);
  const composerWrapperRef = useRef<HTMLDivElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendLockRef = useRef(false);
  const handleSendRef = useRef<() => void>(() => {});
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const flashedMessageRef = useRef<string | null>(null);
  const sendLabel = useShortcutLabel(HOTKEYS.send);
  const boldLabel = useShortcutLabel(HOTKEYS.bold);
  const italicLabel = useShortcutLabel(HOTKEYS.italic);
  const codeLabel = useShortcutLabel(HOTKEYS.code);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const isMessageSelectionTarget = (target: HTMLElement) =>
    !target.closest("span.mention-page") &&
    !target.closest("span.mention-member") &&
    !target.closest("a[href]") &&
    !target.closest(".msg-quote-header[data-author-id]") &&
    !target.closest("div.msg-quote") &&
    !target.closest("[data-quick-actions]");

  const { data: conv } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => fetchConv({ data: { conversationId } }),
  });

  const myWorkspaceUserId =
    conv?.participants.find((p) => p.isMe)?.workspaceUserId ?? null;
  const suggestion = useConversationSuggestion({
    workspaceId,
    conversationId,
  });
  const { navigateToUser } = useNavigateToUserConversation(
    workspaceId,
    myWorkspaceUserId,
  );
  const navigateToUserRef = useRef(navigateToUser);
  navigateToUserRef.current = navigateToUser;
  const myWorkspaceUserIdRef = useRef(myWorkspaceUserId);
  myWorkspaceUserIdRef.current = myWorkspaceUserId;

  const { data: initialMessages } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => fetchMessages({ data: { conversationId } }),
  });

  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string } | null)?.id;
            if (!id) return;
            setRemovedIds((prev) => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            setLiveMessages((prev) => prev.filter((m) => m.id !== id));
            return;
          }
          const row = payload.new as any;
          if (!row?.id) return;
          setRemovedIds((prev) => {
            if (!prev.has(row.id)) return prev;
            const next = new Set(prev);
            next.delete(row.id);
            return next;
          });
          setLiveMessages((prev) => {
            const existing = prev.find((m) => m.id === row.id);
            const mapped = mapRealtimeMessage(row, existing);
            if (existing) {
              return prev.map((m) => (m.id === row.id ? { ...m, ...mapped } : m));
            }
            return [...prev, mapped];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    setLiveMessages([]);
    setRemovedIds(new Set());
  }, [conversationId]);

  const messages = useMemo<Message[]>(() => {
    const byId = new Map<string, Message>();
    for (const m of initialMessages ?? []) {
      if (removedIds.has(m.id)) continue;
      byId.set(m.id, { ...m, purgedAt: m.purgedAt ?? null });
    }
    for (const m of liveMessages) {
      if (removedIds.has(m.id)) continue;
      const prev = byId.get(m.id);
      byId.set(m.id, prev ? { ...prev, ...m } : { ...m, purgedAt: m.purgedAt ?? null });
    }
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [initialMessages, liveMessages, removedIds]);

  const purgedMessageIds = useMemo(
    () => new Set(messages.filter((m) => isTrashed(m.purgedAt)).map((m) => m.id)),
    [messages],
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (purgedMessageIds.has(id)) {
          changed = true;
          continue;
        }
        next.add(id);
      }
      return changed ? next : prev;
    });
  }, [purgedMessageIds]);

  useEffect(() => {
    const times = messages
      .map((m) => m.purgedAt)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime())
      .filter((t) => t > nowMs);
    if (times.length === 0) return;
    const delay = Math.max(0, Math.min(...times) - Date.now());
    const id = window.setTimeout(() => setNowMs(Date.now()), delay + 30);
    return () => window.clearTimeout(id);
  }, [messages, nowMs]);

  const messageRuns = useMemo(() => {
    if (!conv) return [];
    const isMeByAuthor = new Map(
      conv.participants.map((p) => [p.workspaceUserId, p.isMe]),
    );
    return groupMessagesIntoRuns(
      messages,
      (authorId) => isMeByAuthor.get(authorId ?? "") ?? false,
    );
  }, [messages, conv]);

  useEffect(() => {
    if (targetMessageId) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, targetMessageId]);

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
      }, mentionOpenRef),

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
      handleClickOn: createMentionClickHandler({
        navigate,
        workspaceId,
        getMyWorkspaceUserId: () => myWorkspaceUserIdRef.current,
        navigateToUser: (id) => {
          void navigateToUserRef.current(id);
        },
      }),
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleSendRef.current();
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          _view.dom.blur();
          return true;
        }
        return false;
      },


    },
    onCreate: ({ editor }) => setIsEmpty(!hasSendableContent(editor)),
    onUpdate: ({ editor }) => {
      const empty = !hasSendableContent(editor);
      setIsEmpty(empty);
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        if (empty) removeComposerDraft(conversationId);
        else setComposerDraft(conversationId, editor.getHTML());
      }, 200);
    },
  });

  // Composer focus takes priority over selection clear so Esc exits the editor first.
  useHotkey(
    "escape",
    () => {
      const active = document.activeElement;
      if (
        composerExpanded &&
        active &&
        composerWrapperRef.current?.contains(active)
      ) {
        if (editor?.isFocused) {
          editor.commands.blur();
        } else if (active instanceof HTMLElement) {
          active.blur();
        }
        return;
      }
      if (selectedIds.size > 0) clearSelection();
    },
    { enabled: composerExpanded || selectedIds.size > 0 },
  );

  const handleSend = () => {
    if (!editor || sendLockRef.current) return;
    if (!hasSendableContent(editor) || !myWorkspaceUserId) return;
    sendLockRef.current = true;
    const html = editor.getHTML();
    const id = crypto.randomUUID();
    setLiveMessages((prev) => [
      ...prev,
      {
        id,
        rawText: html,
        authorWorkspaceUserId: myWorkspaceUserId,
        createdAt: new Date().toISOString(),
        purgedAt: null,
      },
    ]);
    editor.commands.clearContent();
    setIsEmpty(true);
    removeComposerDraft(conversationId);
    clearSelection();
    sendLockRef.current = false;

    void sendMsg({ data: { conversationId, rawText: html, id } }).catch((e) => {
      console.error(e);
      setLiveMessages((prev) => prev.filter((m) => m.id !== id));
      if (!hasSendableContent(editor)) {
        editor.commands.setContent(html);
        setIsEmpty(!hasSendableContent(editor));
        setComposerDraft(conversationId, html);
      }
      toast.error("Could not send message.");
    });
  };
  handleSendRef.current = handleSend;

  const expandComposer = () => {
    const panel = composerPanelRef.current;
    if (panel?.isCollapsed()) panel.expand();
    panel?.resize("20%");
    setComposerExpanded(true);
    requestAnimationFrame(() => editor?.commands.focus());
  };

  const collapseComposerIfEmpty = () => {
    if (editor && hasSendableContent(editor)) return;
    composerPanelRef.current?.collapse();
    setComposerExpanded(false);
  };

  useEffect(() => {
    if (!editor) return;
    const draft = getComposerDraft(conversationId);
    if (!draft) return;
    editor.commands.setContent(draft);
    setIsEmpty(!hasSendableContent(editor));
    const id = requestAnimationFrame(() => {
      const panel = composerPanelRef.current;
      if (panel?.isCollapsed()) panel.expand();
      panel?.resize("20%");
      setComposerExpanded(true);
    });
    return () => cancelAnimationFrame(id);
  }, [editor, conversationId]);

  // Chronological order regardless of the order ids were selected in. Shared
  // by every bulk action so the hover bar and the selection bar can never
  // diverge in behaviour.
  const sortByOrder = (ids: string[]) => {
    const orderIndex = new Map(messages.map((m, i) => [m.id, i]));
    return [...ids].sort(
      (a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0),
    );
  };

  const handleQuoteSelection = (targetIds?: string[]) => {
    const ids = sortByOrder(targetIds ?? Array.from(selectedIds));
    if (!editor || ids.length === 0) return;
    const byId = new Map(messages.map((m) => [m.id, m]));
    const nodes: string[] = [];
    for (const id of ids) {
      const m = byId.get(id);
      if (!m || isTrashed(m.purgedAt)) continue;
      const author = escapeAttr(
        conv?.participants.find((p) => p.workspaceUserId === m.authorWorkspaceUserId)
          ?.label ??
          m.authorLabel ??
          "Archived user",
      );
      const authorId = m.authorWorkspaceUserId
        ? escapeAttr(m.authorWorkspaceUserId)
        : "";
      const createdAt = escapeAttr(m.createdAt);
      const inner =
        sanitizeMessageHtml(m.rawText || "", myWorkspaceUserId, purgedMessageIds) || "<p></p>";
      const headerDate = formatMessageTimestamp(m.createdAt);
      const authorIdAttr = authorId ? ` data-author-id="${authorId}"` : "";
      nodes.push(
        `<div class="msg-quote" data-quote-id="${escapeAttr(m.id)}" data-author="${author}" data-created-at="${createdAt}"><div class="msg-quote-header"${authorIdAttr} data-author="${author}">${author} · ${escapeAttr(headerDate)}</div>${inner}</div>`,
      );
    }
    if (nodes.length === 0) return;
    // Append trailing empty paragraph so caret lands somewhere writable.
    const html = nodes.join("") + "<p></p>";
    editor.chain().focus("end").insertContent(html).run();
    composerPanelRef.current?.expand();
    composerPanelRef.current?.resize("20%");
    setComposerExpanded(true);
    clearSelection();
  };

  const handleCopySelection = async (targetIds?: string[]) => {
    const ids = sortByOrder(targetIds ?? Array.from(selectedIds));
    if (ids.length === 0) return;
    const byId = new Map(messages.map((m) => [m.id, m]));
    const parts: string[] = [];
    for (const id of ids) {
      const m = byId.get(id);
      if (!m || isTrashed(m.purgedAt)) continue;
      const tmp = document.createElement("div");
      tmp.innerHTML = m.rawText || "";
      const text = (tmp.innerText || tmp.textContent || "").trim();
      if (text) parts.push(text);
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      toast("Messages copied successfully.");
      clearSelection();
    } catch (e) {
      console.error(e);
      toast.error("Could not copy to clipboard.");
    }
  };

  const overlayPurgedAt = (ids: string[], purgedAt: string | null) => {
    setLiveMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const id of ids) {
        const current = messages.find((m) => m.id === id) ?? byId.get(id);
        if (!current) continue;
        byId.set(id, { ...current, purgedAt });
      }
      return Array.from(byId.values());
    });
  };

  const canDeleteSelection =
    selectedIds.size > 0 &&
    !!myWorkspaceUserId &&
    Array.from(selectedIds).every((id) => {
      const m = messages.find((row) => row.id === id);
      return (
        !!m &&
        !isTrashed(m.purgedAt) &&
        m.authorWorkspaceUserId === myWorkspaceUserId
      );
    });

  const handleTrashMessages = async (ids: string[]) => {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) return;
    overlayPurgedAt(unique, computeMessageTrashPurgedAt());
    clearSelection();
    setDeleteConfirmOpen(false);
    try {
      await trashMsgs({ data: { messageIds: unique } });
      await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    } catch (e) {
      console.error(e);
      toast.error("Could not delete messages.");
      await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    }
  };

  const handleRecoverMessage = async (id: string) => {
    overlayPurgedAt([id], null);
    try {
      await recoverMsg({ data: { messageId: id } });
      await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    } catch (e) {
      console.error(e);
      toast.error("Could not undo deletion.");
      await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    }
  };

  const handleDeleteClick = () => {
    if (!canDeleteSelection) return;
    if (selectedIds.size === 1) {
      void handleTrashMessages(Array.from(selectedIds));
      return;
    }
    setDeleteConfirmOpen(true);
  };

  const handleNewPage = () => {
    setNewPageFromMessages(false);
    setNewPagePresetTitle("");
    setNewPageMessageIds([]);
    setNewPageOpen(true);
  };

  const handleCreatePageFromSelection = (targetIds?: string[]) => {
    const ids = sortByOrder(targetIds ?? Array.from(selectedIds)).filter(
      (id) => !purgedMessageIds.has(id),
    );
    if (ids.length === 0) return;
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

  useEffect(() => {
    if (!targetMessageId) return;
    if (initialMessages === undefined) return;
    if (flashedMessageRef.current === targetMessageId) return;

    const exists = messages.some((m) => m.id === targetMessageId);
    if (!exists) {
      flashedMessageRef.current = targetMessageId;
      toast.error("Message not found");
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const el = scrollerRef.current?.querySelector(
        `[data-message-id="${CSS.escape(targetMessageId)}"]`,
      );
      flashedMessageRef.current = targetMessageId;
      if (!el) {
        toast.error("Message not found");
        return;
      }
      flashMessage(targetMessageId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [targetMessageId, messages, initialMessages]);

  const handleMessageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement;

    const linkEl = targetEl.closest("a[href]");
    if (linkEl) {
      e.preventDefault();
      e.stopPropagation();
      openExternalUrl(linkEl.getAttribute("href") ?? "");
      return;
    }

    const memberEl = targetEl.closest(
      "span.mention-member:not(.mention-member-self)",
    ) as HTMLElement | null;
    if (memberEl) {
      e.preventDefault();
      e.stopPropagation();
      const id = memberEl.getAttribute("data-id");
      if (id) void navigateToUser(id);
      return;
    }

    const pageEl = targetEl.closest("span.mention-page") as HTMLElement | null;
    if (pageEl) {
      e.preventDefault();
      e.stopPropagation();
      const id = pageEl.getAttribute("data-id");
      if (id) {
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId },
          search: (prev) => withPage(prev, id),
        });
      }
      return;
    }

    const authorHeaderEl = targetEl.closest(
      ".msg-quote-header[data-author-id]",
    ) as HTMLElement | null;
    if (authorHeaderEl) {
      e.preventDefault();
      e.stopPropagation();
      const id = authorHeaderEl.getAttribute("data-author-id");
      if (id && id !== myWorkspaceUserId) void navigateToUser(id);
      return;
    }

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
  };

  const handleRename = async (title: string) => {
    await renameConv({ data: { conversationId, title } });
    queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    queryClient.invalidateQueries({ queryKey: ["conversations-list", workspaceId] });
  };

  if (!conv) {
    return (
      <div className="flex h-full min-h-0 flex-col" aria-busy="true">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto size-7 rounded-md" />
        </div>
        <div className="flex-1 space-y-5 overflow-hidden px-6 py-5">
          {[68, 52, 80, 44, 62].map((width, i) => (
            <div key={i} className="flex gap-2.5">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4" style={{ width: `${width}%` }} />
              </div>
            </div>
          ))}
        </div>
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
    <UserNavigationContext.Provider
      value={{ workspaceId, myWorkspaceUserId, purgedMessageIds }}
    >
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
          <div className="min-w-0 flex-1 pr-2">
            <EditableTitle
              value={displayTitle}
              editable={isGroup}
              onSave={handleRename}
              className="text-sm font-semibold tracking-[-0.01em]"
            />
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {isGroup ? (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label="Participants">
                        <Users className="size-4" strokeWidth={1.5} />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Participants</TooltipContent>
                </Tooltip>
                <PopoverContent align="end" className="w-64">
                  <div className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                    Participants ({conv.participants.length})
                  </div>
                  <ul className="mb-2 max-h-48 space-y-1 overflow-y-auto text-sm">
                    {conv.participants.map((p) => (
                      <li key={p.workspaceUserId}>
                        <UserLink
                          workspaceId={workspaceId}
                          workspaceUserId={p.workspaceUserId}
                          myWorkspaceUserId={myWorkspaceUserId}
                          label={p.displayName}
                          isMe={p.isMe}
                        />
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
                    <Users className="size-4" strokeWidth={1.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Participants</TooltipContent>
              </Tooltip>
            )}
            <PinToggle
              workspaceId={workspaceId}
              entityId={conversationId}
              kind="conversation"
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <MoreHorizontal className="size-4" strokeWidth={1.5} />
            </Button>
          </div>
        </header>

        <ResizablePanelGroup
          orientation="vertical"
          className="flex min-h-[520px] flex-1 flex-col"
        >
          <ResizablePanel id="messages" defaultSize="80%" minSize="50%">
            <div className="relative h-full">
            {suggestion.visible && (
              <ConversationSuggestionNudge
                suggestion={suggestion.visible}
                feedback={suggestion.feedback}
                onOpen={() => void suggestion.onOpen()}
                onDismiss={() => void suggestion.onDismiss()}
                onFeedback={(type) => void suggestion.onFeedback(type)}
              />
            )}
            <div
              ref={scrollerRef}
              className="h-full overflow-y-auto overflow-x-hidden"
              onClick={handleMessageClick}
            >
              {messages.length === 0 ? (
                <EmptyState
                  icon={MessageSquareDashed}
                  title="No messages yet"
                  description="Say hi to get the conversation started."
                />
              ) : (
                <div role="log" className="px-4 pb-14 pt-2">
                  {messageRuns.map((run, runIndex) => {
                    const prevRun = messageRuns[runIndex - 1];
                    const showDaySeparator =
                      !prevRun || run.dateKey !== prevRun.dateKey;
                    const anySelected = selectedIds.size > 0;

                    return (
                      <div key={`${run.dateKey}-${run.authorWorkspaceUserId}-${run.messages[0].id}`}>
                        {showDaySeparator && (
                          <div className="sticky top-0 z-10 flex justify-center py-3">
                            <span className="rounded-full border bg-surface/90 px-2.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground backdrop-blur-sm">
                              {formatDaySeparator(run.messages[0].createdAt)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`mb-2 rounded-lg border shadow-sm ${
                            run.isMe
                              ? "border-border bg-accent-subtle/55"
                              : "border-border/60 bg-surface-raised/80"
                          }`}
                        >
                          {run.messages.map((m, i) => {
                            const author = conv.participants.find(
                              (p) => p.workspaceUserId === m.authorWorkspaceUserId,
                            );
                            const startsRun = i === 0;
                            const label =
                              author?.label ?? m.authorLabel ?? "Archived user";
                            const isSelected = selectedIds.has(m.id);
                            const isPurged = isTrashed(m.purgedAt);
                            const showUndo =
                              isPurged &&
                              m.authorWorkspaceUserId === myWorkspaceUserId &&
                              isMessageUndoAvailable(m.purgedAt, nowMs);

                            return (
                              <div
                                key={m.id}
                                data-message-id={m.id}
                                onMouseDown={(e) => {
                                  if (e.button !== 0) return;
                                  if (isPurged) return;
                                  const t = e.target as HTMLElement;
                                  if (!isMessageSelectionTarget(t)) return;
                                  toggleSelected(m.id);
                                }}
                                className={`group/msg relative flex gap-2.5 rounded-md px-2 transition-colors duration-(--motion-fast) ${
                                  isPurged ? "cursor-default" : "cursor-pointer"
                                } ${
                                  startsRun ? "pb-0.5 pt-1.5" : "py-0.5"
                                } ${isSelected ? "bg-primary/50" : ""}`}
                              >
                                <div className="w-6 shrink-0">
                                  {startsRun ? (
                                    <Avatar className="size-6">
                                      {author?.avatarUrl ? (
                                        <AvatarImage src={author.avatarUrl} />
                                      ) : null}
                                      <AvatarFallback className="text-[10px] font-medium">
                                        {label.slice(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                  ) : (
                                    <span className="mt-px block text-right text-[10px] leading-5 tabular-nums text-muted-foreground opacity-0 transition-opacity duration-(--motion-fast) group-hover/msg:opacity-100">
                                      {formatMessageTimestamp(m.createdAt).slice(-8, -3)}
                                    </span>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  {startsRun && (
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-sm font-medium">
                                        <UserLink
                                          workspaceId={workspaceId}
                                          workspaceUserId={m.authorWorkspaceUserId}
                                          myWorkspaceUserId={myWorkspaceUserId}
                                          label={label}
                                        />
                                      </span>
                                      <span className="text-[10px] tabular-nums text-muted-foreground">
                                        {formatMessageTimestamp(m.createdAt)}
                                      </span>
                                    </div>
                                  )}
                                  {isPurged ? (
                                    <div className="text-sm text-muted-foreground">
                                      {DELETED_MESSAGE_LABEL}
                                      {showUndo ? (
                                        <>
                                          {" "}
                                          <button
                                            type="button"
                                            className="underline underline-offset-2 hover:text-foreground"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleRecoverMessage(m.id);
                                            }}
                                          >
                                            Undo
                                          </button>
                                        </>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div
                                      className="prose prose-sm max-w-none break-words text-sm text-foreground [&>p]:my-0.5"
                                      dangerouslySetInnerHTML={{
                                        __html: sanitizeMessageHtml(
                                          m.rawText,
                                          myWorkspaceUserId,
                                          purgedMessageIds,
                                        ),
                                      }}
                                    />
                                  )}
                                </div>

                                {isSelected && (
                                  <Check
                                    className="mt-1 size-3.5 shrink-0 text-primary"
                                    strokeWidth={2.5}
                                  />
                                )}

                                {!anySelected && !isPurged && (
                                  <div
                                    data-quick-actions=""
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="absolute right-3 top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-md border bg-surface-raised p-0.5 opacity-0 shadow-sm transition-opacity duration-(--motion-fast) focus-within:opacity-100 group-hover/msg:opacity-100"
                                  >
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="size-6"
                                          aria-label="Quote & reply"
                                          onClick={() => handleQuoteSelection([m.id])}
                                        >
                                          <Quote className="size-3.5" strokeWidth={1.5} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">Quote & reply</TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="size-6"
                                          aria-label="Create page"
                                          onClick={() =>
                                            handleCreatePageFromSelection([m.id])
                                          }
                                        >
                                          <FilePlus className="size-3.5" strokeWidth={1.5} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">Create page</TooltipContent>
                                    </Tooltip>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

              {selectedIds.size > 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-4">
                  <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-surface-raised p-1 shadow-md">
                    <span className="px-2 text-xs font-medium tabular-nums text-muted-foreground">
                      {selectedIds.size} selected
                    </span>
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCreatePageFromSelection()}
                        >
                          <FilePlus className="size-3.5" strokeWidth={1.5} />
                          New page
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Creates a new page using the selected message as placeholder.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="ghost" onClick={() => {}}>
                          <FileText className="size-3.5" strokeWidth={1.5} />
                          Add to page
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Adds the contents of the selected message to an existing page.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleQuoteSelection()}
                        >
                          <Quote className="size-3.5" strokeWidth={1.5} />
                          Quote
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Quotes the selected message inside the new message area.
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Copy to clipboard"
                          onClick={() => handleCopySelection()}
                        >
                          <Copy className="size-3.5" strokeWidth={1.5} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Copy to clipboard</TooltipContent>
                    </Tooltip>
                    {canDeleteSelection && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={handleDeleteClick}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.5} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Delete</TooltipContent>
                    </Tooltip>
                    )}
                    <span className="mx-0.5 h-5 w-px bg-border" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Cancel selection"
                          onClick={clearSelection}
                        >
                          <X className="size-3.5" strokeWidth={1.5} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="gap-2">
                        Cancel
                        <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
                          Esc
                        </Kbd>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle disabled={!composerExpanded} />
          <ResizablePanel
            id="composer"
            panelRef={composerPanelRef}
            collapsible
            // Literal rem: react-resizable-panels does not parse CSS variables.
            // Keep in sync with --footer-row in styles.css.
            collapsedSize="3rem"
            defaultSize="3rem"
            minSize="16%"
            maxSize="45%"
          >
            <div className="flex h-full min-w-0 flex-col border-t bg-background p-2">
              <div
                ref={composerWrapperRef}
                className="group/composer flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-surface transition-colors duration-(--motion-fast) focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
                onBlur={(event) => {
                  const next = event.relatedTarget as Node | null;
                  if (next && event.currentTarget.contains(next)) return;
                  collapseComposerIfEmpty();
                }}
              >
                {!composerExpanded ? (
                  <button
                    type="button"
                    className="flex h-full w-full items-center px-3 text-left text-sm text-muted-foreground"
                    onClick={expandComposer}
                  >
                    Start writing a message…
                  </button>
                ) : (
                  <>
                <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto [&>div]:h-full [&>div]:w-full [&>div]:min-w-0">
                  <EditorContent editor={editor} />
                </div>

                <div className="flex shrink-0 items-center gap-0.5 px-1.5 pb-1.5">
                  <div className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => editor?.chain().focus().toggleBold().run()}
                          aria-label="Bold"
                        >
                          <Bold className="size-3.5" strokeWidth={2} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="gap-2">
                        Bold text
                        <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
                          {boldLabel}
                        </Kbd>
                      </TooltipContent>
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
                          <Italic className="size-3.5" strokeWidth={2} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="gap-2">
                        Italic text
                        <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
                          {italicLabel}
                        </Kbd>
                      </TooltipContent>
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
                          <Code className="size-3.5" strokeWidth={2} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="gap-2">
                        Inline code
                        <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
                          {codeLabel}
                        </Kbd>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleNewPage}
                      aria-label="New conversation page"
                    >
                      <FilePlus className="size-4" strokeWidth={1.5} />
                      New page
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={isEmpty}
                      aria-label="Send message"
                    >
                      <Send className="size-3.5" strokeWidth={2} />
                      Send
                      <Kbd className="h-4 border-primary-foreground/25 bg-primary-foreground/15 text-primary-foreground/80">
                        {sendLabel}
                      </Kbd>
                    </Button>
                  </div>
                </div>
                  </>
                )}
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
              search: (prev) => withPage(prev, pageId),
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
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Confirm deletion</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove these messages?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-between">
              <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleTrashMessages(Array.from(selectedIds))}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
    </UserNavigationContext.Provider>
  );
}
