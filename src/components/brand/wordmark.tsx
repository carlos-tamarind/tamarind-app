import { cn } from "@/lib/utils";

/**
 * Typographic wordmark. There is no logo asset yet, so branding is carried by
 * type alone — swap in a mark here when one exists and every surface follows.
 */
export function Wordmark({
  className,
  as: Tag = "span",
}: {
  className?: string;
  as?: "span" | "h1" | "h2";
}) {
  return (
    <Tag className={cn("font-semibold tracking-[-0.02em] text-foreground", className)}>
      Tamarind
    </Tag>
  );
}
