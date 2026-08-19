import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Quiet uppercase label used above grouped content. Deliberately lighter than
 * the content it introduces — a header should not outweigh its section.
 */
const SectionLabel = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
      className,
    )}
    {...props}
  />
));
SectionLabel.displayName = "SectionLabel";

export { SectionLabel };
