import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  PanelLeftOpen,
  Settings,
  LogOut,
  FileText,
  Lock,
  Globe,
  MessageSquare,
  MessageSquarePlus,
  
  PanelLeftClose,
  User as UserIcon,
  Users,
  Menu,
  CirclePlus,
} from "lucide-react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { z } from "zod";

import { listMyWorkspaces } from "@/lib/workspaces.functions";
import { listMyPages } from "@/lib/pages.functions";
import { listMyConversations } from "@/lib/conversations.functions";
import { getMyWorkspaceProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { NewConversationDialog } from "@/components/new-conversation-dialog";
import { NewPageDialog } from "@/components/page/new-page-dialog";
import { ProfileDialog } from "@/components/profile/profile-dialog";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  
  const [railOpen, setRailOpen] = useState(false);
  const [tab, setTab] = useState<"conversations" | "pages">("conversations");
  const [convDialogOpen, setConvDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [folded, setFolded] = useState(false);
  const navPanelRef = useRef<PanelImperativeHandle>(null);
  const railPanelRef = useRef<PanelImperativeHandle>(null);

  const fetchPages = useServerFn(listMyPages);
  const fetchConvs = useServerFn(listMyConversations);
  const fetchProfile = useServerFn(getMyWorkspaceProfile);

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

  const { data: profile } = useQuery({
    queryKey: ["my-profile", workspaceId],
    queryFn: () => fetchProfile({ data: { workspaceId } }),
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
  const profileName = profile?.displayName ?? profile?.email ?? "Me";

  const handleNewPage = () => setNewPageOpen(true);

  const conversationId = search.c;
  const pageId = search.p;
  const hasConversation = !!conversationId;
  const hasPage = !!pageId;
  const bothOpen = hasConversation && hasPage;

  const handleMainLayout = useCallback(
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




  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen bg-background text-foreground">
        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full flex-1"
        >


          <ResizablePanel
            id="rail"
            panelRef={railPanelRef}
            defaultSize="0%"
            minSize="5%"
            maxSize="5%"
            collapsible
            collapsedSize="0%"
            onResize={(size) => {
              const open = size.asPercentage > 0;
              setRailOpen((prev) => (prev === open ? prev : open));
            }}
          >
            <div className="flex h-full flex-col border-r bg-muted/30">
              <div className="h-10 border-b" />

              <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto py-3">
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
              <div className="flex items-center justify-center border-t py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/w/$workspaceId/settings"
                      params={{ workspaceId }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Workspace settings"
                    >
                      <Settings className="size-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">Workspace settings</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </ResizablePanel>


          <ResizablePanel
            id="nav"
            panelRef={navPanelRef}
            defaultSize="22%"
            minSize="18%"
            maxSize="33%"
            collapsible
            collapsedSize="5%"
            onResize={(size) => {
              const pct = size.asPercentage;
              if (pct <= 17) {
                if (!folded) setFolded(true);
              } else if (folded) {
                setFolded(false);
              }
            }}
          >
            {folded ? (
              <aside className="flex h-full w-full flex-col items-center border-r bg-muted/20">
                <div className="flex w-full items-center justify-center border-b py-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          const p = railPanelRef.current;
                          if (!p) return;
                          if (p.isCollapsed()) p.expand(); else p.collapse();
                        }}
                        className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                        aria-label={railOpen ? "Close Workspaces panel" : "Open Workspaces panel"}
                      >
                        <Menu className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {railOpen ? "Close Workspaces panel" : "Open Workspaces panel"}
                    </TooltipContent>
                  </Tooltip>

                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navPanelRef.current?.expand()}
                      className="flex flex-1 w-full items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Open Navigation panel"
                    >
                      <PanelLeftOpen className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Open Navigation panel</TooltipContent>
                </Tooltip>

                <div className="flex w-full items-center justify-center border-t py-2">
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                            aria-label="Create new"
                          >
                            <CirclePlus className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right">Create new</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent side="right" align="end">
                      <DropdownMenuItem onClick={() => setConvDialogOpen(true)}>
                        <MessageSquarePlus className="size-4" />
                        New conversation
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleNewPage}>
                        <FileText className="size-4" />
                        New page
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex w-full items-center justify-center py-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setProfileOpen(true)}
                        className="rounded-full"
                        aria-label="Open profile"
                      >
                        <Avatar className="size-7">
                          {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} /> : null}
                          <AvatarFallback>
                            <UserIcon className="size-3.5 text-muted-foreground" />
                          </AvatarFallback>
                        </Avatar>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{profileName}</TooltipContent>
                  </Tooltip>
                </div>
              </aside>
            ) : (
            <aside className="flex h-full w-full flex-col border-r">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        const p = railPanelRef.current;
                        if (!p) return;
                        if (p.isCollapsed()) p.expand(); else p.collapse();
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label={railOpen ? "Close Workspaces panel" : "Open Workspaces panel"}
                    >
                      <Menu className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {railOpen ? "Close Workspaces panel" : "Open Workspaces panel"}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navPanelRef.current?.collapse()}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Close Navigation panel"
                    >
                      <PanelLeftClose className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close Navigation panel</TooltipContent>
                </Tooltip>
                <div className="ml-auto truncate text-sm font-semibold">
                  {current?.name ?? "Workspace"}
                </div>
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
                                      <UserIcon className="size-3.5 shrink-0 text-muted-foreground" />
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
                      className="w-44"
                    >
                      <MessageSquarePlus className="size-4" />
                      New conversation
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleNewPage}
                      className="w-44"
                    >
                      <FileText className="size-4" />
                      New page
                    </Button>
                  )}
                </div>
              </Tabs>

              <div className="flex items-center gap-2 border-t px-2 py-2">
                <button
                  onClick={() => setProfileOpen(true)}
                  className="flex flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent"
                  aria-label="Open profile"
                >
                  <Avatar className="size-7">
                    {profile?.avatarUrl ? (
                      <AvatarImage src={profile.avatarUrl} />
                    ) : null}
                    <AvatarFallback>
                      <UserIcon className="size-3.5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{profileName}</span>
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleLogout}
                      aria-label="Logout"
                    >
                      <LogOut className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Logout</TooltipContent>
                </Tooltip>
              </div>
            </aside>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle={!folded} />

          <ResizablePanel id="main" minSize="40%">
            <main className="h-full overflow-hidden">
              {!hasConversation && !hasPage ? (
                <EmptyState
                  workspaceId={workspaceId}
                  onNewConversation={() => setConvDialogOpen(true)}
                  onNewPage={handleNewPage}
                />
              ) : bothOpen ? (
                <ResizablePanelGroup
                  orientation="horizontal"
                  onLayoutChanged={handleMainLayout}
                  key={`split-${conversationId}-${pageId}`}
                >
                  <ResizablePanel id="conv" defaultSize="50%" minSize="10%">
                    <ConversationWindow
                      key={conversationId}
                      workspaceId={workspaceId}
                      conversationId={conversationId!}
                    />
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel id="page" defaultSize="50%" minSize="10%">
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
          </ResizablePanel>
        </ResizablePanelGroup>

        <NewConversationDialog
          workspaceId={workspaceId}
          open={convDialogOpen}
          onOpenChange={setConvDialogOpen}
        />

        <NewPageDialog
          workspaceId={workspaceId}
          open={newPageOpen}
          onOpenChange={setNewPageOpen}
        />

        <ProfileDialog
          workspaceId={workspaceId}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />

        <Outlet />
      </div>
    </TooltipProvider>
  );
}

function EmptyState({
  onNewConversation,
  onNewPage,
}: {
  workspaceId: string;
  onNewConversation: () => void;
  onNewPage: () => void;
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
        <Button variant="secondary" onClick={onNewPage}>
          <FileText className="size-4" />
          New page
        </Button>
      </div>
    </div>
  );
}
