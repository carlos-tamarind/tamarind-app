import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-semibold tracking-[-0.03em] text-muted-foreground/40">404</p>
        <h1 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Button asChild size="lg">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
