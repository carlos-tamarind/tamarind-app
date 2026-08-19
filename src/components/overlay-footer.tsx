import { Kbd } from "@/components/ui/kbd";

/**
 * Keyboard hint strip shared by the command palette and the search overlay so
 * the two read as one system.
 */
export function OverlayFooter({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-4 border-t px-3.5 py-2 text-[0.6875rem] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Kbd className="h-4">↑</Kbd>
        <Kbd className="h-4">↓</Kbd>
        navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd className="h-4">↵</Kbd>
        select
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd className="h-4">Esc</Kbd>
        close
      </span>
      {children ? <span className="ml-auto">{children}</span> : null}
    </div>
  );
}
