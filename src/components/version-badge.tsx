import { APP_VERSION } from "@/lib/version";

export function VersionBadge() {
  return (
    <div
      className="pointer-events-none fixed bottom-14 right-4 z-50 text-[10px] font-medium text-muted-foreground/70 select-none"
      aria-hidden="true"
    >
      Version {APP_VERSION}
    </div>
  );
}
