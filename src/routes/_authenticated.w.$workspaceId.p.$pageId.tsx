import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { Lock, Globe, Link2 } from "lucide-react";

import { getPage, updatePage, setPageVisibility, getPageBacklinks } from "@/lib/pages.functions";
import { listWorkspaceMembers } from "@/lib/conversations.functions";
import { SlashCommand } from "@/components/editor/slash-command";
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

export const Route = createFileRoute("/_authenticated/w/$workspaceId/p/$pageId")({
  component: PageView,
});

function buildMentionSuggestion(getItems: (query: string) => Promise<MentionItem[]>) {
  return {
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

function PageView() {
  const { workspaceId, pageId } = useParams({
    from: "/_authenticated/w/$workspaceId/p/$pageId",
  });
  const fetchPage = useServerFn(getPage);
  const savePage = useServerFn(updatePage);
  const setVis = useServerFn(setPageVisibility);
  const fetchMembers = useServerFn(listWorkspaceMembers);
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const memberSuggestion = useMemo(
    () =>
      buildMentionSuggestion(async (query) => {
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Type "/" for commands, "@" to mention…',
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      SlashCommand,
      Mention.configure({
        HTMLAttributes: { class: "mention-member" },
        suggestion: { char: "@", ...memberSuggestion },
      }),
    ],
    content: (data?.content as any) ?? { type: "doc", content: [] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[60vh]",
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        savePage({ data: { pageId, content: ed.getJSON() } })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
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

  const handleTitleBlur = () => {
    if (title && title !== data?.title) {
      savePage({ data: { pageId, title } })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
        })
        .catch(() => {});
    }
  };

  const handleVisibilityChange = async (value: "private" | "workspace") => {
    await setVis({ data: { pageId, visibility: value } });
    queryClient.invalidateQueries({ queryKey: ["page", pageId] });
    queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
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
    </div>
  );
}
