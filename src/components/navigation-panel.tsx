import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  Archive,
  Bookmark,
  Building2,
  ChevronRight,
  FileLock,
  FileText,
  FilePlusCorner,
  LibraryBig,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquareDot,
  MessageSquareLock,
  MessageSquareMore,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  SquarePen,
  User as UserIcon,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HOTKEYS, useShortcutLabel } from "@/hooks/use-hotkeys";

type NavSection = "conversations" | "pages" | "knowledge";

export type NavConversation = {
  id: string;
  title: string;
  type: string;
  lastModifiedAt?: string | null;
};

export type NavPage = {
  id: string;
  title: string | null;
  visibility: string;
  lastModifiedAt?: string | null;
};

type Props = {
  workspaceId: string;
  workspaceName?: string | null;
  folded: boolean;
  railOpen: boolean;
  onToggleRail: () => void;
  panelRef: React.RefObject<PanelImperativeHandle | null>;
  conversations: NavConversation[];
  pages: NavPage[];
  activeConversationId?: string;
  activePageId?: string;
  profile?: {
    displayName?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null;
  onNewConversation: () => void;
  onNewPage: () => void;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  onLogout: () => void;
};

const SECTION_STORAGE_KEY = "tamarind:nav-section";
const COLLAPSED_STORAGE_KEY = "tamarind:nav-collapsed-sections";

function readCollapsedSections(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function RailButton({
  icon: Icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          aria-current={active ? "true" : undefined}
          className={`relative flex h-10 w-full items-center justify-center transition-colors duration-(--motion-fast) ${
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {active ? (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
          ) : null}
          <Icon className="size-[1.125rem]" strokeWidth={1.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className={shortcut ? "gap-2" : undefined}>
        {label}
        {shortcut ? (
          <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
            {shortcut}
          </Kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function Section({
  id,
  icon: Icon,
  label,
  count,
  children,
  empty,
  emptyHint,
  onAdd,
  addLabel,
  isCollapsed,
  onToggle,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
  children?: React.ReactNode;
  empty?: boolean;
  emptyHint?: string;
  onAdd?: () => void;
  addLabel?: string;
  isCollapsed: boolean;
  onToggle: (id: string, open: boolean) => void;
}) {
  const open = !isCollapsed;
  return (
    <Collapsible open={open} onOpenChange={(next) => onToggle(id, next)}>
      <div className="group/section flex items-center gap-1 pr-1.5">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 pl-1.5 pr-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-(--motion-fast) hover:text-foreground">
          <ChevronRight
            className={`size-3 shrink-0 opacity-0 transition-[transform,opacity] duration-(--motion-fast) group-hover/section:opacity-100 ${
              open ? "rotate-90" : ""
            }`}
            strokeWidth={2.5}
          />
          <Icon className="size-3.5 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{label}</span>
          {count !== undefined ? (
            <span className="tabular-nums opacity-70">{count}</span>
          ) : null}
        </CollapsibleTrigger>
        {onAdd ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onAdd}
                aria-label={addLabel}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-[opacity,color,background-color] duration-(--motion-fast) hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 group-hover/section:opacity-100"
              >
                <Plus className="size-3.5" strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{addLabel}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <CollapsibleContent>
        {empty ? (
          <p className="px-2 pb-1 pl-7 text-xs text-muted-foreground/60">
            {emptyHint ?? "Nothing here yet"}
          </p>
        ) : (
          children
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function NavigationPanel({
  workspaceId,
  workspaceName,
  folded,
  railOpen,
  onToggleRail,
  panelRef,
  conversations,
  pages,
  activeConversationId,
  activePageId,
  profile,
  onNewConversation,
  onNewPage,
  onOpenProfile,
  onOpenSearch,
  onLogout,
}: Props) {
  const [section, setSection] = useState<NavSection>("conversations");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const profileName = profile?.displayName ?? profile?.email ?? "Me";
  const searchLabel = useShortcutLabel(HOTKEYS.search);
  const navLabel = useShortcutLabel(HOTKEYS.toggleNav);
  const workspacesLabel = useShortcutLabel(HOTKEYS.toggleWorkspaces);

  // Restored after mount so the server render stays deterministic.
  useEffect(() => {
    setCollapsedSections(readCollapsedSections());
    try {
      const stored = window.localStorage.getItem(SECTION_STORAGE_KEY);
      if (stored === "conversations" || stored === "pages" || stored === "knowledge") {
        setSection(stored);
      }
    } catch {
      // Storage unavailable — defaults are fine.
    }
  }, []);

  const selectSection = useCallback((next: NavSection) => {
    setSection(next);
    try {
      window.localStorage.setItem(SECTION_STORAGE_KEY, next);
    } catch {
      // Non-fatal.
    }
  }, []);

  const toggleSectionOpen = useCallback((id: string, open: boolean) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (open) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // Non-fatal.
      }
      return next;
    });
  }, []);

  const directConversations = useMemo(
    () => conversations.filter((c) => c.type === "direct"),
    [conversations],
  );
  const groupConversations = useMemo(
    () => conversations.filter((c) => c.type !== "direct"),
    [conversations],
  );
  const privatePages = useMemo(
    () => pages.filter((p) => p.visibility === "private"),
    [pages],
  );
  const conversationPages = useMemo(
    () => pages.filter((p) => p.visibility === "conversation"),
    [pages],
  );
  const workspacePages = useMemo(
    () => pages.filter((p) => p.visibility === "workspace"),
    [pages],
  );

  const handleRailSelect = (next: NavSection) => {
    if (folded) {
      selectSection(next);
      panelRef.current?.expand();
      return;
    }
    if (next === section) {
      panelRef.current?.collapse();
      return;
    }
    selectSection(next);
  };

  const createMenu = (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-10 w-full items-center justify-center text-muted-foreground transition-colors duration-(--motion-fast) hover:text-foreground"
              aria-label="Create new"
            >
              <SquarePen className="size-[1.125rem]" strokeWidth={1.5} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Create new</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="start">
        <DropdownMenuItem onClick={onNewConversation}>
          <MessageSquarePlus className="size-4" />
          New conversation
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewPage}>
          <FilePlusCorner className="size-4" />
          New page
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const rail = (
    <TooltipProvider delayDuration={500}>
      <div className="flex w-[var(--nav-rail)] shrink-0 flex-col items-center border-r">
        <RailButton
          icon={MessageSquareMore}
          label="Conversations"
          active={!folded && section === "conversations"}
          onClick={() => handleRailSelect("conversations")}
        />
        <RailButton
          icon={FileText}
          label="Pages"
          active={!folded && section === "pages"}
          onClick={() => handleRailSelect("pages")}
        />
        <RailButton
          icon={Search}
          label="Search"
          shortcut={searchLabel}
          onClick={onOpenSearch}
        />
        <RailButton
          icon={LibraryBig}
          label="Knowledge base"
          active={!folded && section === "knowledge"}
          onClick={() => handleRailSelect("knowledge")}
        />
        {createMenu}
      </div>
    </TooltipProvider>
  );

  const rowClass = (active: boolean) =>
    `relative flex h-7 items-center gap-2 rounded-md pl-6 pr-2 text-sm transition-colors duration-(--motion-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 ${
      active
        ? "bg-accent-subtle text-foreground font-medium"
        : "text-foreground/80 hover:bg-accent hover:text-foreground"
    }`;

  const conversationItem = (c: NavConversation, Icon: typeof UserIcon) => {
    const active = activeConversationId === c.id;
    return (
      <li key={c.id}>
        <Link
          to="/w/$workspaceId"
          params={{ workspaceId }}
          search={(prev: any) => ({ ...prev, c: c.id })}
          className={rowClass(active)}
        >
          {active ? (
            <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
          ) : null}
          <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          <span className="truncate">{c.title}</span>
        </Link>
      </li>
    );
  };

  const pageItem = (p: NavPage) => {
    const active = activePageId === p.id;
    const VisibilityIcon =
      p.visibility === "private"
        ? FileLock
        : p.visibility === "workspace"
          ? Building2
          : p.visibility === "conversation"
            ? MessageSquareLock
            : null;
    return (
      <li key={p.id}>
        <Link
          to="/w/$workspaceId"
          params={{ workspaceId }}
          search={(prev: any) => ({ ...prev, p: p.id })}
          className={rowClass(active)}
        >
          {active ? (
            <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
          ) : null}
          <span className="truncate">{p.title || "Untitled"}</span>
          {VisibilityIcon ? (
            <VisibilityIcon
              className="ml-auto size-3.5 shrink-0 text-muted-foreground/70"
              strokeWidth={1.5}
            />
          ) : null}
        </Link>
      </li>
    );
  };

  if (folded) {
    return (
      <aside className="flex h-full w-full flex-col items-center border-r bg-surface">
        <div className="flex h-12 w-full shrink-0 items-center justify-evenly border-b">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggleRail}
                  className="rounded-md text-muted-foreground transition-colors duration-(--motion-fast) hover:bg-accent hover:text-foreground"
                  aria-label={
                    railOpen ? "Close Workspaces panel" : "Open Workspaces panel"
                  }
                >
                  <Menu className="size-4" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="gap-2">
                {railOpen ? "Close Workspaces panel" : "Open Workspaces panel"}
                <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
                  {workspacesLabel}
                </Kbd>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => panelRef.current?.expand()}
                  className="rounded-md text-muted-foreground transition-colors duration-(--motion-fast) hover:bg-accent hover:text-foreground"
                  aria-label="Open Navigation panel"
                >
                  <PanelLeftOpen className="size-4" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="gap-2">
                Open Navigation panel
                <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
                  {navLabel}
                </Kbd>
              </TooltipContent>
            </Tooltip>
        </div>

        <div className="flex w-full flex-1 flex-col items-center overflow-y-auto py-2">
          {rail}
        </div>

        <div className="flex h-12 w-full shrink-0 items-center justify-center border-t">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenProfile}
                className="rounded-full ring-offset-background transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1"
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
    );
  }

  return (
    <aside className="flex h-full w-full flex-col border-r bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b px-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleRail}
              className="rounded-md p-1.5 text-muted-foreground transition-colors duration-(--motion-fast) hover:bg-accent hover:text-foreground"
              aria-label={railOpen ? "Close Workspaces panel" : "Open Workspaces panel"}
            >
              <Menu className="size-4" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="gap-2">
            {railOpen ? "Close Workspaces panel" : "Open Workspaces panel"}
            <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
              {workspacesLabel}
            </Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => panelRef.current?.collapse()}
              className="rounded-md p-1.5 text-muted-foreground transition-colors duration-(--motion-fast) hover:bg-accent hover:text-foreground"
              aria-label="Close Navigation panel"
            >
              <PanelLeftClose className="size-4" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="gap-2">
            Close Navigation panel
            <Kbd className="h-4 border-background/25 bg-background/15 text-background/80">
              {navLabel}
            </Kbd>
          </TooltipContent>
        </Tooltip>
        <Link
          to="/w/$workspaceId/settings"
          params={{ workspaceId }}
          className="ml-auto min-w-0 truncate rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition-colors duration-(--motion-fast) hover:bg-accent hover:text-foreground"
          aria-label="Workspace settings"
        >
          {workspaceName ?? ""}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {rail}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2 text-sm">
            {section === "conversations" ? (
              <div className="space-y-2">
                <Section
                  id="pinned-conversations"
                  icon={Bookmark}
                  label="Pinned"
                  empty
                  emptyHint="Pinned conversations will appear here"
                  isCollapsed={collapsedSections.has("pinned-conversations")}
                  onToggle={toggleSectionOpen}
                />
                <Section
                  id="unread"
                  icon={MessageSquareDot}
                  label="Unread"
                  count={0}
                  empty
                  emptyHint="You're all caught up"
                  isCollapsed={collapsedSections.has("unread")}
                  onToggle={toggleSectionOpen}
                />
                <Section
                  id="direct"
                  icon={MessageSquare}
                  label="Private"
                  empty={directConversations.length === 0}
                  emptyHint="No direct conversations yet"
                  onAdd={onNewConversation}
                  addLabel="New conversation"
                  isCollapsed={collapsedSections.has("direct")}
                  onToggle={toggleSectionOpen}
                >
                  <ul className="space-y-px">
                    {directConversations.map((c) => conversationItem(c, UserIcon))}
                  </ul>
                </Section>
                <Section
                  id="groups"
                  icon={MessagesSquare}
                  label="Groups"
                  empty={groupConversations.length === 0}
                  emptyHint="No group conversations yet"
                  onAdd={onNewConversation}
                  addLabel="New conversation"
                  isCollapsed={collapsedSections.has("groups")}
                  onToggle={toggleSectionOpen}
                >
                  <ul className="space-y-px">
                    {groupConversations.map((c) => conversationItem(c, Users))}
                  </ul>
                </Section>
              </div>
            ) : section === "pages" ? (
              <div className="space-y-2">
                <Section
                  id="pinned-pages"
                  icon={Bookmark}
                  label="Pinned"
                  empty
                  emptyHint="Pinned pages will appear here"
                  isCollapsed={collapsedSections.has("pinned-pages")}
                  onToggle={toggleSectionOpen}
                />
                <Section
                  id="private-pages"
                  icon={FileLock}
                  label="Private library"
                  empty={privatePages.length === 0}
                  emptyHint="No private pages yet"
                  onAdd={onNewPage}
                  addLabel="New page"
                  isCollapsed={collapsedSections.has("private-pages")}
                  onToggle={toggleSectionOpen}
                >
                  <ul className="space-y-px">{privatePages.map(pageItem)}</ul>
                </Section>
                <Section
                  id="conversation-pages"
                  icon={MessageSquareLock}
                  label="From conversations"
                  empty={conversationPages.length === 0}
                  emptyHint="Pages made from messages land here"
                  isCollapsed={collapsedSections.has("conversation-pages")}
                  onToggle={toggleSectionOpen}
                >
                  <ul className="space-y-px">{conversationPages.map(pageItem)}</ul>
                </Section>
                <Section
                  id="workspace-pages"
                  icon={Building2}
                  label="Public pages"
                  empty={workspacePages.length === 0}
                  emptyHint="Nothing published to the workspace yet"
                  onAdd={onNewPage}
                  addLabel="New page"
                  isCollapsed={collapsedSections.has("workspace-pages")}
                  onToggle={toggleSectionOpen}
                >
                  <ul className="space-y-px">{workspacePages.map(pageItem)}</ul>
                </Section>
                <Section
                  id="archived"
                  icon={Archive}
                  label="Archived"
                  empty
                  emptyHint="Archived pages will appear here"
                  isCollapsed={collapsedSections.has("archived")}
                  onToggle={toggleSectionOpen}
                />
              </div>
            ) : (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Knowledge base coming soon.
              </p>
            )}
          </div>

          {section === "conversations" || section === "pages" ? (
            <div className="flex shrink-0 justify-end px-2 py-2">
              {section === "conversations" ? (
                <Button variant="secondary" size="sm" onClick={onNewConversation}>
                  <MessageSquarePlus className="size-4" />
                  New conversation
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={onNewPage}>
                  <FilePlusCorner className="size-4" />
                  New page
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex h-12 shrink-0 items-center gap-2 border-t px-2">
        <button
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors duration-(--motion-fast) hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
          aria-label="Open profile"
        >
          <Avatar className="size-6">
            {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} /> : null}
            <AvatarFallback>
              <UserIcon className="size-3 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm">{profileName}</span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" onClick={onLogout} aria-label="Logout">
              <LogOut className="size-3.5" strokeWidth={1.5} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Logout</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
