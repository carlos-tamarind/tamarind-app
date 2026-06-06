import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCallback, useMemo, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  LogOut,
  FileText,
  Lock,
  Globe,
  MessageSquare,
  MessageSquarePlus,
  Loader2,
  User,
  Users,
} from "lucide-react";
import { z } from "zod";

import { listMyWorkspaces } from "@/lib/workspaces.functions";
import { listMyPages, createBlankPage } from "@/lib/pages.functions";
import { listMyConversations } from "@/lib/conversations.functions";
import { supabase } from "@/integrations/supabase/client";
import { NewConversationDialog } from "@/components/new-conversation-dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ConversationWindow } from "@/components/conversation/conversation-window";
import { PageWindow } from "@/components/page/page-window";

const workspaceSearchSchema = z.object({
  c: z.string().uuid().optional(),
  p: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/w/$workspaceId")({
  validateSearch: (search) => workspaceSearchSchema.parse(search),
  component: WorkspaceShell,
});

const COLLAPSE_THRESHOLD = 20;

function WorkspaceShell() {
  const { workspaceId } = useParams({ from: "/_authenticated/w/$workspaceId" });
  const search = useSearch({ from: "/_authenticated/w/$workspaceId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [railOpen, setRailOpen] = useState(true);
  const [tab, setTab] = useState<"conversations" | "pages">("conversations");
  const [convDialogOpen, setConvDialogOpen] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);

  const fetchPages = useServerFn(listMyPages);
  const fetchConvs = useServerFn(listMyConversations);
  const newPage = useServerFn(createBlankPage);

  const { data: workspaces } = useQuery({
    queryKey: ["my-workspaces"],
    queryFn: () => listMyWorkspaces(),
  });

  const { data: pages } = useQuery({
    queryKey: ["pages-list", workspaceId],
    queryFn: () => fetchPages({ data: { workspaceId } }),
  });

  const { data: conversations } = useQuery({
    queryKey: ["conversations-list", workspaceId],
    queryFn: () => fetchConvs({ data: { workspaceId } }),
  });

  const sortedPages = useMemo(
    () =>
      [...(pages ?? [])].sort((a, b) =>
        (a.title || "Untitled").localeCompare(b.title || "Untitled", undefined, {
          sensitivity: "base",
        }),
      ),
    [pages],
  );

  const sortedConversations = useMemo(
    () =>
      [...(conversations ?? [])].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      ),
    [conversations],
  );
  const directConversations = sortedConversations.filter((c) => c.type === "direct");
  const groupConversations = sortedConversations.filter((c) => c.type === "group");

  const current = workspaces?.find((w) => w.workspaceId === workspaceId);

  const handleNewPage = async () => {
    if (creatingPage) return;
    setCreatingPage(true);
    try {
      const { pageId } = await newPage({ data: { workspaceId } });
      queryClient.invalidateQueries({ queryKey: ["pages-list", workspaceId] });
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

  const conversationId = search.c;
  const pageId = search.p;
  const hasConversation = !!conversationId;
  const hasPage = !!pageId;
  const bothOpen = hasConversation && hasPage;

  const handleLayout = useCallback(
    (layout: Record<string, number>) => {
      if (!bothOpen) return;
      const convSize = layout.conv;
      const pageSize = layout.page;
      if (convSize !== undefined && convSize < COLLAPSE_THRESHOLD) {
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId },
          search: (prev: any) => ({ ...prev, c: undefined }),
          replace: true,
        });
      } else if (pageSize !== undefined && pageSize < COLLAPSE_THRESHOLD) {
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId },
          search: (prev: any) => ({ ...prev, p: undefined }),
          replace: true,
        });
      }
    },
    [bothOpen, navigate, workspaceId],
  );

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      {railOpen && (
        <div className="flex h-full w-[10%] min-w-[64px] flex-col items-center gap-2 border-r bg-muted/30 py-3">
          <button
            onClick={() => setRailOpen(false)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Hide workspace rail"
          >
            <PanelLeftClose className="size-4" />
          </button>
          <div className="mt-2 flex flex-col gap-2">
            {(workspaces ?? []).map((w) => (
              <button
                key={w.workspaceId}
                onClick={() =>
                  navigate({
                    to: "/w/$workspaceId",
                    params: { workspaceId: w.workspaceId },
                  })
                }
                className={`flex size-10 items-center justify-center rounded-md text-sm font-semibold ${
                  w.workspaceId === workspaceId
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent"
                }`}
                title={w.name}
              >
                {w.name.slice(0, 2).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      <aside className="flex h-full w-[20vw] min-w-[200px] flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="truncate text-sm font-semibold">{current?.name ?? "Workspace"}</div>
          {!railOpen && (
            <button
              onClick={() => setRailOpen(true)}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="Show workspace rail"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          )}
        </div>
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "conversations" | "pages")}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-3 mt-3 grid grid-cols-2">
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto p-2 text-sm">
            {tab === "conversations" ? (
              sortedConversations.length === 0 ? (
                <p className="px-1 py-2 text-muted-foreground">No conversations yet.</p>
              ) : (
                <div className="space-y-3">
                  <section>
                    <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Direct messages
                    </h3>
                    {directConversations.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-muted-foreground">None yet.</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {directConversations.map((c) => {
                          const isActive = conversationId === c.id;
                          return (
                            <li key={c.id}>
                              <Link
                                to="/w/$workspaceId"
                                params={{ workspaceId }}
                                search={(prev: any) => ({ ...prev, c: c.id })}
                                className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${
                                  isActive ? "bg-accent" : ""
                                }`}
                              >
                                <User className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{c.title}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                  <section>
                    <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Groups
                    </h3>
                    {groupConversations.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-muted-foreground">None yet.</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {groupConversations.map((c) => {
                          const isActive = conversationId === c.id;
                          return (
                            <li key={c.id}>
                              <Link
                                to="/w/$workspaceId"
                                params={{ workspaceId }}
                                search={(prev: any) => ({ ...prev, c: c.id })}
                                className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${
                                  isActive ? "bg-accent" : ""
                                }`}
                              >
                                <Users className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{c.title}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                </div>
              )
            ) : sortedPages.length === 0 ? (
              <p className="px-1 py-2 text-muted-foreground">No pages yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {sortedPages.map((p) => {
                  const isActive = pageId === p.id;
                  return (
                    <li key={p.id}>
                      <Link
                        to="/w/$workspaceId"
                        params={{ workspaceId }}
                        search={(prev: any) => ({ ...prev, p: p.id })}
                        className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent ${
                          isActive ? "bg-accent" : ""
                        }`}
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{p.title || "Untitled"}</span>
                        {p.visibility === "private" ? (
                          <Lock className="ml-auto size-3 shrink-0 text-muted-foreground" />
                        ) : p.visibility === "workspace" ? (
                          <Globe className="ml-auto size-3 shrink-0 text-muted-foreground" />
                        ) : p.visibility === "conversation" ? (
                          <MessageSquare className="ml-auto size-3 shrink-0 text-muted-foreground" />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex justify-center px-3 pb-3">
            {tab === "conversations" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConvDialogOpen(true)}
                className="w-full"
              >
                <MessageSquarePlus className="size-4" />
                New conversation
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleNewPage}
                disabled={creatingPage}
                className="w-full"
              >
                {creatingPage ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileText className="size-4" />
                )}
                New page
              </Button>
            )}
          </div>
        </Tabs>
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Link
            to="/w/$workspaceId/settings"
            params={{ workspaceId }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-3.5" /> Settings
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </aside>

      {/* Central split panel */}
      <main className="h-full flex-1 overflow-hidden">
        {!hasConversation && !hasPage ? (
          <EmptyState
            workspaceId={workspaceId}
            onNewConversation={() => setConvDialogOpen(true)}
            onNewPage={handleNewPage}
            creatingPage={creatingPage}
          />
        ) : bothOpen ? (
          <ResizablePanelGroup
            orientation="horizontal"
            onLayoutChanged={handleLayout}
            // Key forces a fresh group when both panels first appear so default sizes apply.
            key={`split-${conversationId}-${pageId}`}
          >
            <ResizablePanel id="conv" defaultSize={50} minSize={10}>
              <ConversationWindow
                key={conversationId}
                workspaceId={workspaceId}
                conversationId={conversationId!}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel id="page" defaultSize={50} minSize={10}>
              <PageWindow
                key={pageId}
                workspaceId={workspaceId}
                pageId={pageId!}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : hasConversation ? (
          <ConversationWindow
            key={conversationId}
            workspaceId={workspaceId}
            conversationId={conversationId!}
          />
        ) : (
          <PageWindow
            key={pageId}
            workspaceId={workspaceId}
            pageId={pageId!}
          />
        )}
      </main>

      <NewConversationDialog
        workspaceId={workspaceId}
        open={convDialogOpen}
        onOpenChange={setConvDialogOpen}
      />

      <Outlet />
    </div>
  );
}

function EmptyState({
  onNewConversation,
  onNewPage,
  creatingPage,
}: {
  workspaceId: string;
  onNewConversation: () => void;
  onNewPage: () => void;
  creatingPage: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="max-w-md text-base text-muted-foreground">
        Pick a conversation or page from the sidebar to get started, or create a
        new one:
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button variant="secondary" onClick={onNewConversation}>
          <MessageSquarePlus className="size-4" />
          New conversation
        </Button>
        <Button variant="secondary" onClick={onNewPage} disabled={creatingPage}>
          {creatingPage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileText className="size-4" />
          )}
          New page
        </Button>
      </div>
    </div>
  );
}
