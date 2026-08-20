import {
  Building2,
  Check,
  FileLock,
  FileText,
  Loader2,
  MessageSquareLock,
  Monitor,
  Moon,
  Sun,
  TriangleAlert,
  User as UserIcon,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Theme } from "@/lib/theme-context";
import { useSaveStatus } from "@/lib/save-status-context";
import { HOTKEYS, useShortcutLabel } from "@/hooks/use-hotkeys";
import { APP_VERSION, BUILD_TIME, ENVIRONMENT, LAST_COMMIT } from "@/lib/version";

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function SaveIndicator() {
  const { status } = useSaveStatus();
  if (status === "idle") return null;

  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" strokeWidth={2} />
        Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-destructive">
        <TriangleAlert className="size-3" strokeWidth={2} />
        Not saved
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <Check className="size-3" strokeWidth={2} />
      Saved
    </span>
  );
}

function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-5 items-center gap-1.5 rounded px-1.5 text-muted-foreground transition-colors duration-(--motion-fast) hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-label="Change theme"
            >
              <Icon className="size-3" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Change theme</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="end">
        {THEME_OPTIONS.map(({ value, label, icon: OptionIcon }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <OptionIcon className="size-4" />
            {label}
            {theme === value ? <Check className="ml-auto size-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VersionSegment() {
  const detail = LAST_COMMIT
    ? `Built ${BUILD_TIME} · ${LAST_COMMIT}`
    : `Built ${BUILD_TIME}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default truncate text-muted-foreground/70">
          Version {APP_VERSION} {ENVIRONMENT}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{detail}</TooltipContent>
    </Tooltip>
  );
}

export type StatusContextItem = {
  kind: "conversation" | "page";
  title: string;
  subtype?: string | null;
};

function contextIcon(item: StatusContextItem): LucideIcon {
  if (item.kind === "conversation") {
    return item.subtype === "group" || item.subtype === "channel" ? Users : UserIcon;
  }
  if (item.subtype === "private") return FileLock;
  if (item.subtype === "conversation") return MessageSquareLock;
  if (item.subtype === "workspace") return Building2;
  return FileText;
}

/**
 * Slim bottom bar carrying ambient state. Sits in normal document flow so it
 * can never overlap the composer or the editor the way a fixed badge did.
 */
export function StatusBar({
  workspaceName,
  context,
  onOpenPalette,
}: {
  workspaceName?: string | null;
  context?: StatusContextItem[];
  onOpenPalette: () => void;
}) {
  const paletteLabel = useShortcutLabel(HOTKEYS.commandPalette);

  return (
    <footer className="flex h-[calc(1.5rem+4px)] shrink-0 items-center gap-3 border-t bg-surface px-3 text-[0.6875rem] leading-none">
      {workspaceName ? (
        <span className="shrink-0 truncate font-medium text-muted-foreground">
          {workspaceName}
        </span>
      ) : null}
      {context?.map((item, index) => {
        const Icon = contextIcon(item);
        return (
          <span
            key={`${item.kind}-${index}`}
            className="flex min-w-0 items-center gap-3 text-muted-foreground/70"
          >
            {index > 0 ? (
              <span className="text-muted-foreground/40" aria-hidden="true">
                ·
              </span>
            ) : null}
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon className="size-3 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{item.title}</span>
            </span>
          </span>
        );
      })}

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <SaveIndicator />
        <VersionSegment />
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-1.5 rounded px-1 text-muted-foreground transition-colors duration-(--motion-fast) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
        >
          <span className="hidden sm:inline">Commands</span>
          <Kbd className="h-4">{paletteLabel}</Kbd>
        </button>
      </div>
    </footer>
  );
}
