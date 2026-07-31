import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  Archive,
  Bookmark,
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus2,
  FolderLock,
  Folders,
  FolderTree,
  Globe,
  LibraryBig,
  Lock,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquareDot,
  MessageSquareMore,
  MessageSquarePlus,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SquarePen,
  User as UserIcon,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

type NavSection = "conversations" | "pages" | "knowledge";

export type NavConversation = {
  id: string;
  title: string;
  type: string;
};

export type NavPage = {
  id: string;
  title: string | null;
  visibility: string;
};

type Props = {
  workspaceId: string;
  folded: boolean;
  railOpen: boolean;
  onToggleRail: () => void;
  panelRef: React.RefObject<PanelImperativeHandle | null>;
  conversations: NavConversation[];
  pages: NavPage[];
  activeConversationId?: string;
  activePageId?: string;
  profile?: { displayName?: string | null; email?: string | null; avatarUrl?: string | null } | null;
  onNewConversation: () => void;
  onNewPage: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
  anyDialogOpen: boolean;
};

function useIsMac() {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return isMac;
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className="relative flex h-12 w-full items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {active ? (
            <span className="absolute left-0 top-0 h-full w-0.5 bg-foreground" />
          ) : null}
          <Icon className="size-[22px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function Section({
  icon: Icon,
  label,
  count,
  children,
  empty,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  children?: React.ReactNode;
  empty?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">
          {label}
          {count !== undefined ? ` (${count})` : ""}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {empty ? (
          <p className="px-2 py-1 pl-7 text-xs text-muted-foreground">Empty</p>
        ) : (
          children
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function NavigationPanel({
  workspaceId,
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
  onLogout,
  anyDialogOpen,
}: Props) {
  const [section, setSection] = useState<NavSection>("conversations");
  const isMac = useIsMac();
  const mod = isMac ? "Cmd" : "Ctrl";
  const profileName = profile?.displayName ?? profile?.email ?? "Me";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== "n") return;
      if (anyDialogOpen) return;
      if (document.querySelector('[data-state="open"][role="dialog"]')) return;
      e.preventDefault();
      if (e.shiftKey) onNewPage();
      else onNewConversation();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [anyDialogOpen, onNewConversation, onNewPage]);

  const directConversations = useMemo(
    () => conversations.filter((c) => c.type === "direct"),
    [conversations],
  );
  const groupConversations = useMemo(
    () => conversations.filter((c) => c.type === "group"),
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
      setSection(next);
      panelRef.current?.expand();
      return;
    }
    if (next === section) {
      panelRef.current?.collapse();
      return;
    }
    setSection(next);
  };

  const createMenu = (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-12 w-full items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Create new"
            >
              <SquarePen className="size-[22px]" />
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
          <FileText className="size-4" />
          New page
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const rail = (
    <TooltipProvider delayDuration={2000}>
      <div className="flex w-14 shrink-0 flex-col items-center border-r">
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
        {folded ? (
          <RailButton icon={Search} label="Search" onClick={() => {}} />
        ) : null}
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

  const conversationItem = (c: NavConversation, Icon: typeof UserIcon) => (
    <li key={c.id}>
      <Link
        to="/w/$workspaceId"
        params={{ workspaceId }}
        search={(prev: any) => ({ ...prev, c: c.id })}
        className={`flex items-center gap-2 rounded-sm py-1.5 pl-7 pr-2 text-sm hover:bg-accent ${
          activeConversationId === c.id ? "bg-accent" : ""
        }`}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{c.title}</span>
      </Link>
    </li>
  );

  const pageItem = (p: NavPage) => (
    <li key={p.id}>
      <Link
        to="/w/$workspaceId"
        params={{ workspaceId }}
        search={(prev: any) => ({ ...prev, p: p.id })}
        className={`flex items-center gap-2 rounded-sm py-1.5 pl-7 pr-2 text-sm hover:bg-accent ${
          activePageId === p.id ? "bg-accent" : ""
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

  if (folded) {
    return (
      <aside className="flex h-full w-full flex-col items-center border-r bg-muted/20">
        <div className="flex h-14 w-full shrink-0 items-center justify-between border-b px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleRail}
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => panelRef.current?.expand()}
                className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Open Navigation panel"
              >
                <PanelLeftOpen className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Open Navigation panel</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex flex-1 w-full flex-col items-center overflow-y-auto py-2">
          <TooltipProvider delayDuration={2000}>
            <div className="flex w-14 flex-col items-center">
              <RailButton
                icon={MessageSquareMore}
                label="Conversations"
                onClick={() => handleRailSelect("conversations")}
              />
              <RailButton
                icon={FileText}
                label="Pages"
                onClick={() => handleRailSelect("pages")}
              />
              <RailButton icon={Search} label="Search" onClick={() => {}} />
              <RailButton
                icon={LibraryBig}
                label="Knowledge base"
                onClick={() => handleRailSelect("knowledge")}
              />
              {createMenu}
            </div>
          </TooltipProvider>
        </div>

        <div className="flex h-14 w-full shrink-0 items-center justify-center border-t">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onOpenProfile}
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
    );
  }

  return (
    <aside className="flex h-full w-full flex-col border-r">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleRail}
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
              onClick={() => panelRef.current?.collapse()}
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close Navigation panel"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close Navigation panel</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-h-0 flex-1">
        {rail}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto py-2 text-sm">
            {section === "conversations" ? (
              <div className="space-y-1">
                <Section icon={Bookmark} label="Pinned conversations" empty />
                <Section icon={MessageSquareDot} label="Unread messages" count={0} empty />
                <Section
                  icon={MessageSquare}
                  label="Private conversations"
                  empty={directConversations.length === 0}
                >
                  <ul className="space-y-0.5">
                    {directConversations.map((c) => conversationItem(c, UserIcon))}
                  </ul>
                </Section>
                <Section
                  icon={MessagesSquare}
                  label="Group conversations"
                  empty={groupConversations.length === 0}
                >
                  <ul className="space-y-0.5">
                    {groupConversations.map((c) => conversationItem(c, Users))}
                  </ul>
                </Section>
              </div>
            ) : section === "pages" ? (
              <div className="space-y-1">
                <Section icon={Bookmark} label="Pinned pages" empty />
                <Section
                  icon={FolderLock}
                  label="Private library"
                  empty={privatePages.length === 0}
                >
                  <ul className="space-y-0.5">{privatePages.map(pageItem)}</ul>
                </Section>
                <Section
                  icon={Folders}
                  label="From conversations"
                  empty={conversationPages.length === 0}
                >
                  <ul className="space-y-0.5">{conversationPages.map(pageItem)}</ul>
                </Section>
                <Section
                  icon={FolderTree}
                  label="Public pages"
                  empty={workspacePages.length === 0}
                >
                  <ul className="space-y-0.5">{workspacePages.map(pageItem)}</ul>
                </Section>
                <Section icon={Archive} label="Archived" empty />
              </div>
            ) : (
              <p className="px-3 py-2 text-muted-foreground">
                Knowledge base coming soon.
              </p>
            )}
          </div>

          {section === "conversations" || section === "pages" ? (
            <div className="flex shrink-0 justify-end border-t bg-background px-2 py-2">
              {section === "conversations" ? (
                <Button variant="secondary" size="sm" onClick={onNewConversation}>
                  <MessageSquarePlus className="size-4" />
                  {mod}+N
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={onNewPage}>
                  <FilePlus2 className="size-4" />
                  {mod}+Shift+N
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex h-14 shrink-0 items-center gap-2 border-t px-2">
        <button
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-accent"
          aria-label="Open profile"
        >
          <Avatar className="size-7">
            {profile?.avatarUrl ? <AvatarImage src={profile.avatarUrl} /> : null}
            <AvatarFallback>
              <UserIcon className="size-3.5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm">{profileName}</span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onLogout} aria-label="Logout">
              <LogOut className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Logout</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
