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
  FilePlusCorner,
  
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
import { NavigationPanel } from "@/components/navigation-panel";


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
        <div
          className={`shrink-0 overflow-hidden border-r bg-muted/80 shadow-[2px_0_8px_-2px_hsl(0_0%_0%/0.10)] transition-[width] duration-150 ${
            railOpen ? "w-[57px]" : "w-0"
          }`}
        >
          <div className="flex h-full w-[57px] flex-col">
            <div className="h-14 shrink-0 border-b" />
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
                  className={`flex size-8 items-center justify-center rounded-md text-sm font-semibold ${
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
            <div className="flex h-14 shrink-0 items-center justify-center border-t">
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
        </div>

        <ResizablePanelGroup
          orientation="horizontal"
          className="h-full flex-1"
        >


          <ResizablePanel
            id="nav"
            panelRef={navPanelRef}
            defaultSize="22%"
            minSize="18%"
            maxSize="33%"
            collapsible
            collapsedSize="56px"
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
              onNewConversation={() => setConvDialogOpen(true)}
              onNewPage={handleNewPage}
              onOpenProfile={() => setProfileOpen(true)}
              onLogout={handleLogout}
            />

          </ResizablePanel>

          <ResizableHandle />

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
                  <ResizableHandle />
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
          <FilePlusCorner className="size-4" />
          New page
        </Button>
      </div>
    </div>
  );
}
