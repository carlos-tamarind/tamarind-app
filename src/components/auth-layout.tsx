import { Wordmark } from "@/components/brand/wordmark";

/**
 * Split shell for every unauthenticated screen: the form on the left, a quiet
 * accent panel on the right that collapses away below `lg`.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  width = "sm",
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  width?: "sm" | "md";
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="flex flex-1 flex-col px-6 py-8 lg:px-14">
        <Wordmark className="text-sm" />

        <div className="flex flex-1 items-center justify-center py-10">
          <div className={`w-full ${width === "md" ? "max-w-md" : "max-w-sm"}`}>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
            {subtitle ? (
              <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="relative hidden w-[42%] max-w-[640px] overflow-hidden border-l bg-surface lg:block"
      >
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_85%_15%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_95%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_55%)]" />
        <div className="relative flex h-full items-end p-14">
          <p className="max-w-sm text-lg font-medium leading-snug tracking-[-0.015em] text-foreground/80">
            Build, collaborate, and never lose context again.
          </p>
        </div>
      </div>
    </div>
  );
}
