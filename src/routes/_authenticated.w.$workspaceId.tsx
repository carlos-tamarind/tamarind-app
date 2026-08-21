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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback, useMemo, useRef, useState } from "react";
import { Settings } from "lucide-react";
import type { PanelImperativeHandle } from "react-resizable-panels";

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
import { ConversationWindow } from "@/components/conversation/conversation-window";
import { PageWindow } from "@/components/page/page-window";
import { NavigationPanel } from "@/components/navigation-panel";
import { SearchOverlay } from "@/components/search/search-overlay";
import { CommandPalette } from "@/components/command-palette";
import { CloseHintOverlay } from "@/components/close-hint-overlay";
import { StatusBar, type StatusContextItem } from "@/components/status-bar";
import { EmptyStateHome } from "@/components/empty-state-home";
import { SaveStatusProvider } from "@/lib/save-status-context";
import { clearComposerDrafts } from "@/lib/composer-drafts";
import { HOTKEYS, useHotkey } from "@/hooks/use-hotkeys";
import {
  workspaceSearchSchema,
  withConversation,
  withPage,
} from "@/lib/workspace-search";

export const Route = createFileRoute("/_authenticated/w/$workspaceId")({
  validateSearch: (search) => workspaceSearchSchema.parse(search),
  component: WorkspaceShell,
});

const COLLAPSE_THRESHOLD = 20;
const CLOSE_HINT_START = 32;

function closeHintIntensity(size: number | undefined) {
  if (size === undefined || size >= CLOSE_HINT_START) return 0;
  return Math.min(1, (CLOSE_HINT_START - size) / (CLOSE_HINT_START - COLLAPSE_THRESHOLD));
}

function WorkspaceShell() {
  const { workspaceId } = useParams({ from: "/_authenticated/w/$workspaceId" });
  const search = useSearch({ from: "/_authenticated/w/$workspaceId" });
  const navigate = useNavigate();

  const [railOpen, setRailOpen] = useState(false);
  const [convDialogOpen, setConvDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [folded, setFolded] = useState(false);
  const [closeHint, setCloseHint] = useState<{
    target: "conv" | "page";
    intensity: number;
  } | null>(null);
  const navPanelRef = useRef<PanelImperativeHandle>(null);
  const toggleRail = useCallback(() => setRailOpen((v) => !v), []);

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

  const current = workspaces?.find((w) => w.workspaceId === workspaceId);

  const handleNewPage = useCallback(() => setNewPageOpen(true), []);
  const handleNewConversation = useCallback(() => setConvDialogOpen(true), []);
  const handleOpenSearch = useCallback(() => setSearchOpen(true), []);
  const handleOpenProfile = useCallback(() => setProfileOpen(true), []);

  const toggleNavPanel = useCallback(() => {
    const panel = navPanelRef.current;
    if (!panel) return;
    if (folded) panel.expand();
    else panel.collapse();
  }, [folded]);

  useHotkey(HOTKEYS.commandPalette, () => setPaletteOpen((v) => !v), {
    allowInInput: true,
  });
  useHotkey(HOTKEYS.search, () => setSearchOpen(true), { allowInInput: true });
  useHotkey(HOTKEYS.toggleNav, toggleNavPanel);
  useHotkey(HOTKEYS.toggleWorkspaces, toggleRail);
  useHotkey(HOTKEYS.workspaceSettings, () => {
    void navigate({
      to: "/w/$workspaceId/settings",
      params: { workspaceId },
      search: (prev) => prev,
    });
  });
  useHotkey(HOTKEYS.profile, () => handleOpenProfile(), { allowInInput: true });

  const conversationId = search.c;
  const pageId = search.p;
  const hasConversation = !!conversationId;
  const hasPage = !!pageId;
  const bothOpen = hasConversation && hasPage;

  const statusContext = useMemo((): StatusContextItem[] => {
    const items: StatusContextItem[] = [];
    if (conversationId) {
      const conv = sortedConversations.find((c) => c.id === conversationId);
      if (conv) {
        items.push({
          kind: "conversation",
          title: conv.title,
          subtype: conv.type,
        });
      }
    }
    if (pageId) {
      const page = sortedPages.find((p) => p.id === pageId);
      if (page) {
        items.push({
          kind: "page",
          title: page.title || "Untitled",
          subtype: page.visibility,
        });
      }
    }
    return items;
  }, [conversationId, pageId, sortedConversations, sortedPages]);

  const handleSplitLayoutChange = useCallback((layout: Record<string, number>) => {
    const convIntensity = closeHintIntensity(layout.conv);
    const pageIntensity = closeHintIntensity(layout.page);
    if (convIntensity > 0 && convIntensity >= pageIntensity) {
      setCloseHint({ target: "conv", intensity: convIntensity });
    } else if (pageIntensity > 0) {
      setCloseHint({ target: "page", intensity: pageIntensity });
    } else {
      setCloseHint(null);
    }
  }, []);

  const handleMainLayout = useCallback(
    (layout: Record<string, number>) => {
      if (!bothOpen) return;
      const convSize = layout.conv;
      const pageSize = layout.page;
      if (convSize !== undefined && convSize < COLLAPSE_THRESHOLD) {
        setCloseHint(null);
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId },
          search: (prev) => withConversation(prev, undefined),
          replace: true,
        });
      } else if (pageSize !== undefined && pageSize < COLLAPSE_THRESHOLD) {
        setCloseHint(null);
        navigate({
          to: "/w/$workspaceId",
          params: { workspaceId },
          search: (prev) => withPage(prev, undefined),
          replace: true,
        });
      } else {
        setCloseHint(null);
      }
    },
    [bothOpen, navigate, workspaceId],
  );

  const handleLogout = async () => {
    clearComposerDrafts();
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <SaveStatusProvider>
        <div className="flex h-screen w-screen flex-col bg-background text-foreground">
          <div className="flex min-h-0 flex-1">
            <div
              className={`shrink-0 overflow-hidden border-r bg-surface-workspace transition-[width] duration-(--motion-base) ease-(--ease-out) ${
                railOpen ? "w-[var(--nav-rail)]" : "w-0"
              }`}
            >
              <div className="flex h-full w-[var(--nav-rail)] flex-col">
                <div className="h-12 shrink-0 border-b" />
                <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
                  {(workspaces ?? []).map((w) => {
                    const active = w.workspaceId === workspaceId;
                    return (
                      <Tooltip key={w.workspaceId}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() =>
                              navigate({
                                to: "/w/$workspaceId",
                                params: { workspaceId: w.workspaceId },
                              })
                            }
                            className="relative flex h-9 w-full items-center justify-center"
                            aria-label={w.name}
                            aria-current={active ? "true" : undefined}
                          >
                            {active ? (
                              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                            ) : null}
                            <span
                              className={`flex size-7 items-center justify-center rounded-md text-[0.6875rem] font-semibold transition-colors duration-(--motion-fast) ${
                                active
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                              }`}
                            >
                              {w.name.slice(0, 2).toUpperCase()}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{w.name}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
                <div className="flex h-12 shrink-0 items-center justify-center border-t">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to="/w/$workspaceId/settings"
                        params={{ workspaceId }}
                        search={(prev) => prev}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors duration-(--motion-fast) hover:bg-accent hover:text-foreground"
                        aria-label="Workspace settings"
                      >
                        <Settings className="size-4" strokeWidth={1.5} />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">Workspace settings</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            <ResizablePanelGroup orientation="horizontal" className="h-full flex-1">
              <ResizablePanel
                id="nav"
                panelRef={navPanelRef}
                defaultSize="22%"
                minSize="18%"
                maxSize="33%"
                collapsible
                collapsedSize="3.75rem"
                onResize={(size) => {
                  const pct = size.asPercentage;
                  if (pct <= 17) {
                    if (!folded) setFolded(true);
                  } else if (folded) {
                    setFolded(false);
                  }
                }}
              >
                <NavigationPanel
                  workspaceId={workspaceId}
                  workspaceName={current?.name}
                  folded={folded}
                  railOpen={railOpen}
                  onToggleRail={toggleRail}
                  panelRef={navPanelRef}
                  conversations={sortedConversations}
                  pages={sortedPages}
                  activeConversationId={conversationId}
                  activePageId={pageId}
                  profile={profile}
                  onNewConversation={handleNewConversation}
                  onNewPage={handleNewPage}
                  onOpenProfile={handleOpenProfile}
                  onOpenSearch={handleOpenSearch}
                  onLogout={handleLogout}
                />
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel id="main" minSize="40%">
                <main className="h-full overflow-hidden">
                  {!hasConversation && !hasPage ? (
                    <EmptyStateHome
                      workspaceId={workspaceId}
                      onNewConversation={handleNewConversation}
                      onNewPage={handleNewPage}
                      onOpenSearch={handleOpenSearch}
                    />
                  ) : bothOpen ? (
                    <ResizablePanelGroup
                      orientation="horizontal"
                      onLayoutChange={handleSplitLayoutChange}
                      onLayoutChanged={handleMainLayout}
                      key={`split-${conversationId}-${pageId}`}
                    >
                      <ResizablePanel id="conv" defaultSize="50%" minSize="10%">
                        <div className="relative h-full">
                          <ConversationWindow
                            key={conversationId}
                            workspaceId={workspaceId}
                            conversationId={conversationId!}
                          />
                          {closeHint?.target === "conv" ? (
                            <CloseHintOverlay
                              intensity={closeHint.intensity}
                              label="Close conversation"
                            />
                          ) : null}
                        </div>
                      </ResizablePanel>
                      <ResizableHandle />
                      <ResizablePanel id="page" defaultSize="50%" minSize="10%">
                        <div className="relative h-full">
                          <PageWindow
                            key={pageId}
                            workspaceId={workspaceId}
                            pageId={pageId!}
                          />
                          {closeHint?.target === "page" ? (
                            <CloseHintOverlay
                              intensity={closeHint.intensity}
                              label="Close page"
                            />
                          ) : null}
                        </div>
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
          </div>

          <StatusBar
            workspaceName={current?.name}
            context={statusContext}
            onOpenPalette={() => setPaletteOpen(true)}
          />

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

          <SearchOverlay
            open={searchOpen}
            onOpenChange={setSearchOpen}
            workspaceId={workspaceId}
          />

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            workspaceId={workspaceId}
            workspaces={workspaces ?? []}
            conversations={sortedConversations}
            pages={sortedPages}
            onNewConversation={handleNewConversation}
            onNewPage={handleNewPage}
            onOpenProfile={handleOpenProfile}
            onOpenSearch={handleOpenSearch}
            onToggleNav={toggleNavPanel}
            onToggleWorkspaces={toggleRail}
            onLogout={() => {
              void handleLogout();
            }}
          />

          <Outlet />
        </div>
      </SaveStatusProvider>
    </TooltipProvider>
  );
}
