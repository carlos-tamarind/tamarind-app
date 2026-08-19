import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { markInputRule } from "@tiptap/core";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { Copy, Building2, FileText, Link2, FileLock, MessageSquareLock, MessageSquareShare, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  getPage,
  updatePage,
  setPageVisibility,
  getPageBacklinks,
  listMyPages,
} from "@/lib/pages.functions";
import {
  listWorkspaceMembers,
  listMyConversations,
} from "@/lib/conversations.functions";
import { SlashCommand } from "@/components/editor/slash-command";
import { PageMention, ConversationMention, MemberMention } from "@/components/editor/custom-mentions";
import { MentionList, type MentionItem } from "@/components/editor/mention-list";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSaveStatus } from "@/lib/save-status-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageSettingsDialog } from "@/components/page/page-settings-dialog";
import { SharePageDialog } from "@/components/page/share-page-dialog";
import { DuplicatePageDialog } from "@/components/page/duplicate-page-dialog";
import { useNavigateToUserConversation } from "@/hooks/use-navigate-to-user-conversation";
import { getMyWorkspaceProfile } from "@/lib/profile.functions";
import { createMentionClickHandler } from "@/lib/tiptap-mention-clicks";
import { UserNavigationContext } from "@/lib/user-navigation-context";

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
          component = new ReactRenderer(MentionList, { props, editor: props.editor });
          popup = tippy(document.body, {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
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

const UnderlineMarkdown = Underline.extend({
  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)(__([^_]+)__)$/,
        type: this.type,
      }),
    ];
  },
});

function VisibilityIcon({
  visibility,
  className,
}: {
  visibility: "private" | "workspace" | "conversation" | "external";
  className?: string;
}) {
  if (visibility === "workspace") return <Building2 className={className} />;
  if (visibility === "conversation") return <MessageSquareLock className={className} />;
  return <FileLock className={className} />;
}

export function PageWindow({
  workspaceId,
  pageId,
}: {
  workspaceId: string;
  pageId: string;
}) {
  const navigate = useNavigate();
  const fetchPage = useServerFn(getPage);
  const savePage = useServerFn(updatePage);
  const setVis = useServerFn(setPageVisibility);
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchPages = useServerFn(listMyPages);
  const fetchConversations = useServerFn(listMyConversations);
  const fetchBacklinks = useServerFn(getPageBacklinks);
  const queryClient = useQueryClient();
  const { user, session } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => fetchPage({ data: { pageId } }),
  });

  const fetchProfile = useServerFn(getMyWorkspaceProfile);
  const { data: profile } = useQuery({
    queryKey: ["my-profile", workspaceId],
    queryFn: () => fetchProfile({ data: { workspaceId } }),
  });
  const myWorkspaceUserId = profile?.workspaceUserId ?? null;
  const { navigateToUser } = useNavigateToUserConversation(
    workspaceId,
    myWorkspaceUserId,
  );
  const navigateToUserRef = useRef(navigateToUser);
  navigateToUserRef.current = navigateToUser;
  const myWorkspaceUserIdRef = useRef(myWorkspaceUserId);
  myWorkspaceUserIdRef.current = myWorkspaceUserId;

  const { data: backlinks } = useQuery({
    queryKey: ["page-backlinks", pageId, workspaceId],
    queryFn: () => fetchBacklinks({ data: { pageId, workspaceId } }),
  });

  const [title, setTitle] = useState("");
  const [titleCondensed, setTitleCondensed] = useState(false);
  const [presence, setPresence] = useState<Array<{ userId: string; name: string }>>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef<any>(null);
  const latestTitleRef = useRef<string | null>(null);
  const latestTitleValueRef = useRef("");
  const contentPendingVersion = useRef(0);
  const contentSavedVersion = useRef(0);
  const titlePendingVersion = useRef(0);
  const titleSavedVersion = useRef(0);
  const isHydratingRef = useRef(false);
  const savePageRef = useRef(savePage);
  const inFlightSaveRef = useRef<Promise<boolean> | null>(null);
  savePageRef.current = savePage;
  const draftKey = useMemo(() => `tamarind:page-draft:${pageId}`, [pageId]);
  const legacyDraftKey = useMemo(() => `mento:page-draft:${pageId}`, [pageId]);
  const hydratedForPageRef = useRef<string | null>(null);
  const { status: saveStatus, setStatus: setSaveStatus } = useSaveStatus();

  // The editor unmounts on page switch and on split-view close; leaving a
  // stale "Saved" in the status bar would misreport the next surface.
  useEffect(() => () => setSaveStatus("idle"), [setSaveStatus]);


  const isValidDoc = (v: any): boolean =>
    !!v &&
    typeof v === "object" &&
    v.type === "doc" &&
    Array.isArray(v.content);

  const writeLocalDraft = () => {
    if (typeof window === "undefined") return;
    // Do not persist anything until hydration has established a baseline.
    if (hydratedForPageRef.current !== pageId) return;
    const contentDirty =
      contentPendingVersion.current > contentSavedVersion.current;
    const titleDirty = titlePendingVersion.current > titleSavedVersion.current;
    if (!contentDirty && !titleDirty) return;
    // Refuse to persist a draft that represents a "wiped" page.
    const contentOk = isValidDoc(latestContentRef.current);
    const titleOk =
      typeof latestTitleValueRef.current === "string" &&
      latestTitleValueRef.current.length > 0;
    if (!contentOk && !titleOk) return;
    try {
      window.localStorage.setItem(
        draftKey,
        JSON.stringify({
          pageId,
          title: latestTitleValueRef.current,
          content: latestContentRef.current,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // ignore local draft failures
    }
  };

  const clearLocalDraft = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  };


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
      }),

    [workspaceId, fetchMembers],
  );

  const pageSuggestion = useMemo(
    () =>
      buildMentionSuggestion("@@", async (query) => {
        const pages = await fetchPages({ data: { workspaceId } });
        return pages
          .filter((p) =>
            (p.title ?? "Untitled").toLowerCase().includes(query.toLowerCase()),
          )
          .filter((p) => p.id !== pageId)
          .slice(0, 8)
          .map((p) => ({ id: p.id, label: p.title || "Untitled" }));
      }),
    [workspaceId, pageId, fetchPages],
  );

  const conversationSuggestion = useMemo(
    () =>
      buildMentionSuggestion("\\", async (query) => {
        const convs = await fetchConversations({ data: { workspaceId } });
        return convs
          .filter((c) => c.title.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
          .map((c) => ({ id: c.id, label: c.title }));
      }),
    [workspaceId, fetchConversations],
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineMarkdown,
      Placeholder.configure({
        placeholder: 'Type "/" for commands, "@" member, "@@" page, "\\" conversation…',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      SlashCommand,
      MemberMention.configure({
        HTMLAttributes: { class: "mention-member" },
        suggestion: memberSuggestion,
      }),
      PageMention.configure({
        HTMLAttributes: { class: "mention-page" },
        suggestion: pageSuggestion,
      }),
      ConversationMention.configure({
        HTMLAttributes: { class: "mention-conversation" },
        suggestion: conversationSuggestion,
      }),
    ],
    content: (data?.content as any) ?? { type: "doc", content: [] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[60vh]",
      },
      handleClickOn: createMentionClickHandler({
        navigate,
        workspaceId,
        getMyWorkspaceUserId: () => myWorkspaceUserIdRef.current,
        navigateToUser: (id) => {
          void navigateToUserRef.current(id);
        },
      }),
    },
    onUpdate: ({ editor: ed }) => {
      if (isHydratingRef.current) return;
      const json = ed.getJSON();
      latestContentRef.current = json;
      contentPendingVersion.current += 1;
      writeLocalDraft();
      scheduleFlushRef.current?.();
    },
  });

  // Flush any pending content/title changes via the RPC. Uses a
  // pending-vs-saved version guard so newer edits arriving mid-flight
  // are never marked as saved.
  const scheduleFlushRef = useRef<(() => void) | null>(null);
  const flushNowRef = useRef<(options?: { silent?: boolean }) => Promise<boolean>>(
    async () => true,
  );

  flushNowRef.current = async (options = {}) => {
    while (true) {
      const inFlight = inFlightSaveRef.current;
      if (inFlight) {
        const ok = await inFlight;
        if (!ok) return false;
        continue;
      }

      const contentVersion = contentPendingVersion.current;
      const titleVersion = titlePendingVersion.current;
      let contentDirty = contentVersion > contentSavedVersion.current;
      let titleDirty = titleVersion > titleSavedVersion.current;

      // Safety: never overwrite the server with an invalid/empty content doc
      // or a null title. Drop the field from the patch; a future real edit
      // will save.
      if (contentDirty && !isValidDoc(latestContentRef.current)) {
        contentDirty = false;
      }
      if (titleDirty && latestTitleRef.current === null) {
        titleDirty = false;
      }

      if (!contentDirty && !titleDirty) {
        clearLocalDraft();
        return true;
      }

      const patch: { pageId: string; title?: string; content?: any } = { pageId };
      if (contentDirty) patch.content = latestContentRef.current;
      if (titleDirty && latestTitleRef.current !== null)
        patch.title = latestTitleRef.current;


      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (maxWaitTimer.current) {
        clearTimeout(maxWaitTimer.current);
        maxWaitTimer.current = null;
      }

      const run = (async () => {
        setSaveStatus("saving");
        try {
          await savePageRef.current({ data: patch });
          if (contentDirty && contentVersion > contentSavedVersion.current)
            contentSavedVersion.current = contentVersion;
          if (titleDirty && titleVersion > titleSavedVersion.current)
            titleSavedVersion.current = titleVersion;
          queryClient.setQueryData(["page", pageId], (prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.content !== undefined ? { content: patch.content } : {}),
            };
          });
      if (patch.title !== undefined) {
        queryClient.setQueryData(["pages-list", workspaceId], (prev: any) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((p) =>
            p.id === pageId ? { ...p, title: patch.title } : p,
          );
        });
        if (data?.conversationId) {
          queryClient.setQueryData(
            ["conversation-pages", data.conversationId],
            (prev: any) => {
              if (!Array.isArray(prev)) return prev;
              return prev.map((p) =>
                p.id === pageId ? { ...p, title: patch.title } : p,
              );
            },
          );
        }
      }
          queryClient.invalidateQueries({ queryKey: ["page", pageId] });
          queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
          if (data?.conversationId) {
            queryClient.invalidateQueries({
              queryKey: ["conversation-pages", data.conversationId],
            });
          }
          if (contentDirty)
            queryClient.invalidateQueries({ queryKey: ["page-backlinks"] });
          setSaveStatus("saved");
          return true;
        } catch {
          // Leave versions unchanged; next scheduleFlush will retry.
          setSaveStatus("error");
          if (!options.silent) {
            toast.error("Page changes could not be saved. Please try again before leaving.");
          }
          scheduleFlushRef.current?.();
          return false;
        }
      })();

      inFlightSaveRef.current = run;
      const ok = await run;
      if (inFlightSaveRef.current === run) inFlightSaveRef.current = null;
      if (!ok) return false;
    }
  };

  useBlocker({
    shouldBlockFn: async () => {
      const contentDirty =
        contentPendingVersion.current > contentSavedVersion.current;
      const titleDirty = titlePendingVersion.current > titleSavedVersion.current;
      if (!contentDirty && !titleDirty) return false;
      const saved = await flushNowRef.current({ silent: false });
      return !saved;
    },
    enableBeforeUnload: false,
  });

  scheduleFlushRef.current = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushNowRef.current();
    }, 250);
    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => {
        maxWaitTimer.current = null;
        void flushNowRef.current();
      }, 2000);
    }
  };

  // hydratedForPageRef declared earlier (near the top of the component).
  useEffect(() => {
    if (!data || !editor) return;
    if (hydratedForPageRef.current === pageId) return;
    hydratedForPageRef.current = pageId;
    isHydratingRef.current = true;
    let nextTitle = data.title ?? "Untitled";
    let nextContent = (data.content as any) ?? { type: "doc", content: [] };
    let draftApplied = false;
    let draftHasTitle = false;
    let draftHasContent = false;
    if (typeof window !== "undefined") {
      try {
        let raw = window.localStorage.getItem(draftKey);
        if (raw === null) {
          // Drafts written before the Mento → Tamarind rename. Migrate once so
          // a rename never silently discards someone's unsaved work.
          const legacy = window.localStorage.getItem(legacyDraftKey);
          if (legacy !== null) {
            raw = legacy;
            window.localStorage.setItem(draftKey, legacy);
            window.localStorage.removeItem(legacyDraftKey);
          }
        }
        const draft = raw ? JSON.parse(raw) : null;
        const serverTime = data.lastModifiedAt
          ? new Date(data.lastModifiedAt).getTime()
          : 0;
        if (
          draft?.pageId === pageId &&
          typeof draft.updatedAt === "number" &&
          draft.updatedAt > serverTime
        ) {
          // Only accept a draft title that is a non-empty string, and only a
          // draft content that is a valid ProseMirror doc. This blocks the
          // "draft wipes the page" class of bugs.
          if (typeof draft.title === "string" && draft.title.length > 0) {
            nextTitle = draft.title;
            draftHasTitle = true;
          }
          if (isValidDoc(draft.content)) {
            nextContent = draft.content;
            draftHasContent = true;
          }
          draftApplied = draftHasTitle || draftHasContent;
          if (!draftApplied) {
            // Draft was invalid — drop it so we don't keep re-reading it.
            try {
              window.localStorage.removeItem(draftKey);
            } catch {
              // ignore
            }
          }
        }

      } catch {
        // ignore invalid drafts
      }
    }
    setTitle(nextTitle);
    latestTitleValueRef.current = nextTitle;
    latestTitleRef.current = null;
    latestContentRef.current = nextContent;
    // false = do not emit an 'update' event → no spurious save on load.
    editor.commands.setContent(
      nextContent,
      { emitUpdate: false },
    );
    // Baseline: everything we just loaded is considered saved.
    contentSavedVersion.current = contentPendingVersion.current;
    titleSavedVersion.current = titlePendingVersion.current;
    if (draftApplied) {
      if (draftHasContent) contentPendingVersion.current += 1;
      if (draftHasTitle) {
        latestTitleRef.current = nextTitle;
        titlePendingVersion.current += 1;
      }
      scheduleFlushRef.current?.();
    }
    isHydratingRef.current = false;
  }, [data, draftKey, legacyDraftKey, editor, pageId]);

  useEffect(() => {
    hydratedForPageRef.current = null;
  }, [pageId]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`page:${pageId}`, {
      config: { presence: { key: user.id } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<
          string,
          Array<{ user_id: string; name: string }>
        >;
        const list: Array<{ userId: string; name: string }> = [];
        for (const [, metas] of Object.entries(state)) {
          const m = metas[0];
          if (m) list.push({ userId: m.user_id, name: m.name });
        }
        setPresence(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: user.id,
            name: user.email ?? user.id.slice(0, 8),
          });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pageId, user]);

  // Best-effort flush on tab close / hide / reload via sendBeacon.
  useEffect(() => {
    const beacon = () => {
      const contentDirty =
        contentPendingVersion.current > contentSavedVersion.current;
      const titleDirty =
        titlePendingVersion.current > titleSavedVersion.current;
      if (!contentDirty && !titleDirty) return;
      if (typeof navigator === "undefined" || !navigator.sendBeacon) return;
      const accessToken = session?.access_token;
      if (!accessToken) return;

      try {
        const payload: {
          accessToken: string;
          pageId: string;
          title?: string;
          content?: any;
        } = { accessToken, pageId };
        if (contentDirty) payload.content = latestContentRef.current;
        if (titleDirty && latestTitleRef.current !== null)
          payload.title = latestTitleRef.current;
        const blob = new Blob([JSON.stringify(payload)], {
          type: "application/json",
        });
        navigator.sendBeacon("/api/pages/save", blob);
      } catch {
        // ignore
      };
    };

    const onBeforeUnload = () => beacon();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") beacon();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pageId, session?.access_token]);

  // SPA-unmount flush (real RPC — reliable during in-app navigation).
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (maxWaitTimer.current) {
        clearTimeout(maxWaitTimer.current);
        maxWaitTimer.current = null;
      }
      void flushNowRef.current({ silent: true });
    };
  }, [pageId, workspaceId, queryClient]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    latestTitleValueRef.current = value;
    latestTitleRef.current = value;
    titlePendingVersion.current += 1;
    writeLocalDraft();
    scheduleFlushRef.current?.();
  };

  const handleTitleBlur = () => {
    if (titlePendingVersion.current > titleSavedVersion.current) {
      void flushNowRef.current();
    }
  };


  const applyVisibility = async (value: "private" | "workspace") => {
    const saved = await flushNowRef.current({ silent: false });
    if (!saved) return;
    try {
      await setVis({ data: { pageId, visibility: value } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not change visibility");
      return;
    }
    queryClient.setQueryData(["page", pageId], (prev: any) =>
      prev ? { ...prev, visibility: value } : prev,
    );
    queryClient.invalidateQueries({ queryKey: ["page", pageId] });
    queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
  };

  const handleVisibilityChange = (value: "private" | "workspace") => {
    if (value === "workspace" && data?.visibility !== "workspace") {
      setPublishOpen(true);
      return;
    }
    void applyVisibility(value);
  };


  if (isLoading) {
    return (
      <div className="flex h-full flex-col" aria-busy="true">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="ml-auto h-6 w-20 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
        <div className="mx-auto w-full max-w-3xl px-8 py-8">
          <Skeleton className="h-10 w-2/3" />
          <div className="mt-8 space-y-3">
            {[100, 92, 78, 96, 64, 88].map((width, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${width}%` }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const others = presence.filter((p) => p.userId !== user?.id);
  const visibility = data?.visibility ?? "private";
  const visibilityLabel =
    visibility === "workspace"
      ? "Workspace"
      : visibility === "conversation"
        ? "Conversation"
        : "Private";

  return (
    <UserNavigationContext.Provider
      value={{ workspaceId, myWorkspaceUserId }}
    >
    <TooltipProvider delayDuration={200}>
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {/* The title only appears here once the in-body title has scrolled
            away, so the header stays quiet while you are reading the top. */}
        <span
          className={`min-w-0 flex-1 truncate text-sm font-medium transition-opacity duration-(--motion-base) ${
            titleCondensed ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {title || "Untitled"}
        </span>

        {saveStatus !== "idle" && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {saveStatus === "saving"
              ? "Saving…"
              : saveStatus === "error"
                ? "Not saved"
                : "Saved"}
          </span>
        )}

        {others.length > 0 && (
          <div className="flex shrink-0 items-center pl-1">
            <div className="flex -space-x-1.5">
              {others.slice(0, 5).map((p) => (
                <Tooltip key={p.userId}>
                  <TooltipTrigger asChild>
                    <div className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-background">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{p.name}</TooltipContent>
                </Tooltip>
              ))}
            </div>
            {others.length > 5 && (
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                +{others.length - 5}
              </span>
            )}
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" aria-label="Page visibility">
              <VisibilityIcon visibility={visibility} className="size-3.5" />
              {visibilityLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {visibility === "private" && (
              <DropdownMenuItem
                title="Makes the page public for the whole workspace"
                onSelect={() => setPublishOpen(true)}
              >
                <Building2 className="size-3.5" /> Publish
              </DropdownMenuItem>
            )}
            {(visibility === "private" || visibility === "conversation") && (
              <DropdownMenuItem
                title="Shares this page with other users or groups"
                onSelect={() => setShareOpen(true)}
              >
                <MessageSquareShare className="size-3.5" /> Share
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              title="Creates a copy of this page and also lets you share it with other users"
              onSelect={() => {
                void flushNowRef.current({ silent: true });
                setDuplicateOpen(true);
              }}
            >
              <Copy className="size-3.5" /> Duplicate
            </DropdownMenuItem>
          </DropdownMenuContent>

        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Page settings"
              onClick={() => setSettingsOpen(true)}
            >
              <MoreHorizontal className="size-4" strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Page settings</TooltipContent>
        </Tooltip>
      </div>

      {/* Page body */}
      <div
        className="flex-1 overflow-y-auto"
        onScroll={(e) => {
          const condensed = e.currentTarget.scrollTop > 40;
          if (condensed !== titleCondensed) setTitleCondensed(condensed);
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-8 py-8">
          <textarea
            value={title}
            onChange={(e) => {
              handleTitleChange(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLTextAreaElement).blur();
              }
            }}
            ref={(el) => {
              if (el) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }
            }}
            rows={1}
            placeholder="Untitled"
            className="mb-6 w-full resize-none overflow-hidden break-words bg-transparent text-3xl font-semibold leading-tight tracking-[-0.022em] outline-none placeholder:text-muted-foreground/50"
          />
          <EditorContent editor={editor} />

          {backlinks && backlinks.length > 0 && (
            <div className="mt-12 rounded-xl border bg-surface p-3">
              <div className="mb-1 flex items-center gap-1.5 px-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                <Link2 className="size-3.5" strokeWidth={1.5} /> Backlinks
              </div>
              <ul className="space-y-0.5">
                {backlinks.map((b) => (
                  <li key={b.id}>
                    <Link
                      to="/w/$workspaceId"
                      params={{ workspaceId }}
                      search={(prev: any) => ({ ...prev, p: b.id })}
                      className="flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-(--motion-fast) hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                    >
                      <FileText
                        className="size-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                      <span className="truncate">{b.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Publish page</DialogTitle>
            <DialogDescription>
              Do you want to publish this page? It will be visible for all users
              inside this workspace.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-between">
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              Keep it private
            </Button>
            <Button
              onClick={async () => {
                setPublishOpen(false);
                await applyVisibility("workspace");
              }}
            >
              Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        workspaceId={workspaceId}
        myWorkspaceUserId={myWorkspaceUserId}
        pageId={pageId}
        title={title}
        onTitleChange={handleTitleChange}
        onTitleCommit={handleTitleBlur}
        ownerDisplayName={data?.ownerDisplayName ?? null}
        ownerWorkspaceUserId={data?.ownerWorkspaceUserId ?? null}
        visibility={visibility}
        isOwner={data?.isOwner ?? false}
        collaborators={data?.collaborators ?? []}
        onPublish={() => {
          setSettingsOpen(false);
          setPublishOpen(true);
        }}
        onShare={() => {
          setSettingsOpen(false);
          setShareOpen(true);
        }}
        onDuplicate={() => {
          setSettingsOpen(false);
          setDuplicateOpen(true);
        }}
      />

      <SharePageDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        pageId={pageId}
        workspaceId={workspaceId}
      />

      <DuplicatePageDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        pageId={pageId}
        workspaceId={workspaceId}
        currentTitle={title || "Untitled"}
      />
    </div>
    </TooltipProvider>
    </UserNavigationContext.Provider>
  );
}
