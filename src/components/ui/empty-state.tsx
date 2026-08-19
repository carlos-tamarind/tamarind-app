import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * Centred placeholder for surfaces with nothing to show yet. Keeps loading,
 * empty and error states visually consistent across the app.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-surface text-muted-foreground">
          <Icon className="size-5" strokeWidth={1.5} />
        </div>
      ) : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

export { EmptyState };
