import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Shortcut hint chip. Pass already-formatted glyphs from `formatShortcut()`
 * so the Cmd/Ctrl decision stays in one place.
 */
const Kbd = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, children, ...props }, ref) => (
    <kbd
      ref={ref}
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium leading-none text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  ),
);
Kbd.displayName = "Kbd";

export { Kbd };
