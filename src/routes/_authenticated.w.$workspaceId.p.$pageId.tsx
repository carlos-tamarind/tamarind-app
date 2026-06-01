import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { markInputRule } from "@tiptap/core";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { Lock, Globe, Link2 } from "lucide-react";

import { getPage, updatePage, setPageVisibility, getPageBacklinks, listMyPages } from "@/lib/pages.functions";
import { listWorkspaceMembers, listMyConversations } from "@/lib/conversations.functions";
import { SlashCommand } from "@/components/editor/slash-command";
import { PageMention, ConversationMention } from "@/components/editor/custom-mentions";
import { MentionList, type MentionItem } from "@/components/editor/mention-list";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/w/$workspaceId/p/$pageId")({
  component: PageView,
});

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

// Markdown-style underline: __text__
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

function PageView() {
  const { workspaceId, pageId } = useParams({
    from: "/_authenticated/w/$workspaceId/p/$pageId",
  });
  const navigate = useNavigate();
  const fetchPage = useServerFn(getPage);
  const savePage = useServerFn(updatePage);
  const setVis = useServerFn(setPageVisibility);
  const fetchMembers = useServerFn(listWorkspaceMembers);
  const fetchPages = useServerFn(listMyPages);
  const fetchConversations = useServerFn(listMyConversations);
  const fetchBacklinks = useServerFn(getPageBacklinks);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => fetchPage({ data: { pageId } }),
  });

  const { data: backlinks } = useQuery({
    queryKey: ["page-backlinks", pageId, workspaceId],
    queryFn: () => fetchBacklinks({ data: { pageId, workspaceId } }),
  });

  const [title, setTitle] = useState("");
  const [presence, setPresence] = useState<Array<{ userId: string; name: string }>>([]);
  const [publishOpen, setPublishOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the latest unsaved content/title so we can flush on unmount or pageId change.
  const dirtyContentRef = useRef<any>(null);
  const dirtyTitleRef = useRef<string | null>(null);
  const savePageRef = useRef(savePage);
  savePageRef.current = savePage;

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
      Mention.configure({
        HTMLAttributes: { class: "mention-member" },
        suggestion: memberSuggestion,
      }),
      PageMention.configure({
        HTMLAttributes: { class: "mention-page" },
        renderText: ({ node }) => `@@${node.attrs.label ?? node.attrs.id}`,
        suggestion: pageSuggestion,
      }),
      ConversationMention.configure({
        HTMLAttributes: { class: "mention-conversation" },
        renderText: ({ node }) => `\\${node.attrs.label ?? node.attrs.id}`,
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
      handleClickOn: (_view, _pos, node) => {
        if (node.type.name === "pageMention" && node.attrs.id) {
          navigate({
            to: "/w/$workspaceId/p/$pageId",
            params: { workspaceId, pageId: node.attrs.id },
          });
          return true;
        }
        if (node.type.name === "conversationMention" && node.attrs.id) {
          navigate({
            to: "/w/$workspaceId/c/$conversationId",
            params: { workspaceId, conversationId: node.attrs.id },
          });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      dirtyContentRef.current = json;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        savePageRef
          .current({ data: { pageId, content: json } })
          .then(() => {
            dirtyContentRef.current = null;
            queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
            queryClient.invalidateQueries({ queryKey: ["page-backlinks"] });
          })
          .catch(() => {});
      }, 600);
    },
  });

  useEffect(() => {
    if (data && editor) {
      setTitle(data.title ?? "Untitled");
      editor.commands.setContent((data.content as any) ?? { type: "doc", content: [] });
    }
  }, [data, editor]);

  // Realtime presence
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

  // Flush pending save when navigating away / unmounting
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        if (editor) {
          savePage({ data: { pageId, content: editor.getJSON() } }).catch(() => {});
        }
      }
    };
  }, [pageId, editor, savePage]);

  const handleTitleBlur = () => {
    if (title && title !== data?.title) {
      savePage({ data: { pageId, title } })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
        })
        .catch(() => {});
    }
  };

  const applyVisibility = async (value: "private" | "workspace") => {
    await setVis({ data: { pageId, visibility: value } });
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
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const others = presence.filter((p) => p.userId !== user?.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 py-6">
        <div className="mb-4 flex items-center justify-between">
          <Select
            value={data?.visibility === "workspace" ? "workspace" : "private"}
            onValueChange={(v) => handleVisibilityChange(v as "private" | "workspace")}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">
                <span className="flex items-center gap-2">
                  <Lock className="size-3.5" /> Private
                </span>
              </SelectItem>
              <SelectItem value="workspace">
                <span className="flex items-center gap-2">
                  <Globe className="size-3.5" /> Workspace
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1">
            {others.slice(0, 5).map((p) => (
              <div
                key={p.userId}
                title={p.name}
                className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-[10px] font-semibold text-primary-foreground"
              >
                {p.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
            {others.length > 5 && (
              <div className="ml-1 text-xs text-muted-foreground">
                +{others.length - 5}
              </div>
            )}
          </div>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Untitled"
          className="mb-6 w-full bg-transparent text-4xl font-bold outline-none placeholder:text-muted-foreground"
        />
        <EditorContent editor={editor} />

        {backlinks && backlinks.length > 0 && (
          <div className="mt-10 border-t pt-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Link2 className="size-3.5" /> Backlinks
            </div>
            <ul className="space-y-1">
              {backlinks.map((b) => (
                <li key={b.id}>
                  <Link
                    to="/w/$workspaceId/p/$pageId"
                    params={{ workspaceId, pageId: b.id }}
                    className="text-sm text-primary hover:underline"
                  >
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
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
    </div>
  );
}
