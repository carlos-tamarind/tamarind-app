import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronsDown,
  FileLock,
  FilePlusCorner,
  FileText,
  LogOut,
  Menu,
  Monitor,
  Moon,
  MessageSquareLock,
  MessageSquarePlus,
  PanelLeft,
  Search,
  Settings,
  Sun,
  User as UserIcon,
  Users,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { OverlayFooter } from "@/components/overlay-footer";
import { useTheme } from "@/lib/theme-context";
import { HOTKEYS, useShortcutLabel } from "@/hooks/use-hotkeys";
import type { NavConversation, NavPage } from "@/components/navigation-panel";

type Workspace = { workspaceId: string; name: string };

const PALETTE_PREVIEW = 3;
const PALETTE_CAP = 30;

function pageIcon(visibility: string) {
  if (visibility === "private") return FileLock;
  if (visibility === "conversation") return MessageSquareLock;
  if (visibility === "workspace") return Building2;
  return FileText;
}

function byLastModified<T extends { lastModifiedAt?: string | null }>(a: T, b: T) {
  return (b.lastModifiedAt ?? "").localeCompare(a.lastModifiedAt ?? "");
}

export function CommandPalette({
  open,
  onOpenChange,
  workspaceId,
  workspaces,
  conversations,
  pages,
  onNewConversation,
  onNewPage,
  onOpenProfile,
  onOpenSearch,
  onToggleNav,
  onToggleWorkspaces,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaces: Workspace[];
  conversations: NavConversation[];
  pages: NavPage[];
  onNewConversation: () => void;
  onNewPage: () => void;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  onToggleNav: () => void;
  onToggleWorkspaces: () => void;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const searchLabel = useShortcutLabel(HOTKEYS.search);
  const navLabel = useShortcutLabel(HOTKEYS.toggleNav);
  const workspacesLabel = useShortcutLabel(HOTKEYS.toggleWorkspaces);
  const settingsLabel = useShortcutLabel(HOTKEYS.workspaceSettings);
  const [query, setQuery] = useState("");
  const [showAllConversations, setShowAllConversations] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);

  useEffect(() => {
    if (open) return;
    setQuery("");
    setShowAllConversations(false);
    setShowAllPages(false);
  }, [open]);

  const sortedConversations = useMemo(
    () => [...conversations].sort(byLastModified).slice(0, PALETTE_CAP),
    [conversations],
  );
  const sortedPages = useMemo(
    () => [...pages].sort(byLastModified).slice(0, PALETTE_CAP),
    [pages],
  );

  const searching = query.trim().length > 0;
  const visibleConversations =
    searching || showAllConversations
      ? sortedConversations
      : sortedConversations.slice(0, PALETTE_PREVIEW);
  const visiblePages =
    searching || showAllPages ? sortedPages : sortedPages.slice(0, PALETTE_PREVIEW);

  const run = (action: () => void) => {
    onOpenChange(false);
    requestAnimationFrame(action);
  };

  const openConversation = (id: string) =>
    run(() =>
      navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev: any) => ({ ...prev, c: id }),
      }),
    );

  const openPage = (id: string) =>
    run(() =>
      navigate({
        to: "/w/$workspaceId",
        params: { workspaceId },
        search: (prev: any) => ({ ...prev, p: id }),
      }),
    );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search commands, conversations and pages…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="max-h-[min(24rem,60vh)]">
        <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
          No matches.
        </CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => run(onNewConversation)}
            keywords={["create", "chat", "message", "dm"]}
          >
            <MessageSquarePlus />
            New conversation
          </CommandItem>
          <CommandItem
            onSelect={() => run(onNewPage)}
            keywords={["create", "document", "note"]}
          >
            <FilePlusCorner />
            New page
          </CommandItem>
          <CommandItem onSelect={() => run(onOpenSearch)} keywords={["find", "query"]}>
            <Search />
            Search everything
            <CommandShortcut>
              <Kbd>{searchLabel}</Kbd>
            </CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {sortedConversations.length > 0 ? (
          <CommandGroup heading="Conversations">
            {visibleConversations.map((c) => {
              const Icon = c.type === "direct" ? UserIcon : Users;
              return (
                <CommandItem
                  key={c.id}
                  value={`conversation ${c.title} ${c.id}`}
                  onSelect={() => openConversation(c.id)}
                >
                  <Icon />
                  <span className="truncate">{c.title}</span>
                </CommandItem>
              );
            })}
            {!searching &&
            !showAllConversations &&
            sortedConversations.length > PALETTE_PREVIEW ? (
              <CommandItem
                value="show more conversations"
                onSelect={() => setShowAllConversations(true)}
              >
                <ChevronsDown />
                Show more conversations
              </CommandItem>
            ) : null}
          </CommandGroup>
        ) : null}

        {sortedPages.length > 0 ? (
          <CommandGroup heading="Pages">
            {visiblePages.map((p) => {
              const Icon = pageIcon(p.visibility);
              return (
                <CommandItem
                  key={p.id}
                  value={`page ${p.title ?? "Untitled"} ${p.id}`}
                  onSelect={() => openPage(p.id)}
                >
                  <Icon />
                  <span className="truncate">{p.title || "Untitled"}</span>
                </CommandItem>
              );
            })}
            {!searching && !showAllPages && sortedPages.length > PALETTE_PREVIEW ? (
              <CommandItem value="show more pages" onSelect={() => setShowAllPages(true)}>
                <ChevronsDown />
                Show more pages
              </CommandItem>
            ) : null}
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => run(onToggleNav)}
            keywords={["sidebar", "collapse", "expand"]}
          >
            <PanelLeft />
            Toggle navigation panel
            <CommandShortcut>
              <Kbd>{navLabel}</Kbd>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => run(onToggleWorkspaces)}
            keywords={["rail", "switch workspace"]}
          >
            <Menu />
            Toggle workspaces panel
            <CommandShortcut>
              <Kbd>{workspacesLabel}</Kbd>
            </CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() =>
                navigate({ to: "/w/$workspaceId/settings", params: { workspaceId } }),
              )
            }
            keywords={["invites", "members", "admin"]}
          >
            <Settings />
            Workspace settings
            <CommandShortcut>
              <Kbd>{settingsLabel}</Kbd>
            </CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onOpenProfile)} keywords={["account", "me"]}>
            <UserIcon />
            Profile
          </CommandItem>
          <CommandItem onSelect={() => run(onLogout)} keywords={["sign out", "exit"]}>
            <LogOut />
            Logout
          </CommandItem>
          {workspaces
            .filter((w) => w.workspaceId !== workspaceId)
            .map((w) => (
              <CommandItem
                key={w.workspaceId}
                value={`workspace ${w.name}`}
                onSelect={() =>
                  run(() =>
                    navigate({
                      to: "/w/$workspaceId",
                      params: { workspaceId: w.workspaceId },
                    }),
                  )
                }
              >
                <Building2 />
                Switch to {w.name}
              </CommandItem>
            ))}
        </CommandGroup>

        <CommandGroup heading="Theme">
          <CommandItem
            onSelect={() => run(() => setTheme("light"))}
            keywords={["appearance", "colour", "color"]}
          >
            <Sun />
            Light theme
            {theme === "light" ? (
              <CommandShortcut className="text-[0.6875rem] text-muted-foreground">
                Active
              </CommandShortcut>
            ) : null}
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setTheme("dark"))}
            keywords={["appearance", "colour", "color", "night"]}
          >
            <Moon />
            Dark theme
            {theme === "dark" ? (
              <CommandShortcut className="text-[0.6875rem] text-muted-foreground">
                Active
              </CommandShortcut>
            ) : null}
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setTheme("system"))}
            keywords={["appearance", "auto"]}
          >
            <Monitor />
            System theme
            {theme === "system" ? (
              <CommandShortcut className="text-[0.6875rem] text-muted-foreground">
                Active
              </CommandShortcut>
            ) : null}
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <OverlayFooter />
    </CommandDialog>
  );
}
