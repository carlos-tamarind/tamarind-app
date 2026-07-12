## Versioning & display

**Version source of truth**
- New file `src/lib/version.ts` exporting:
  - `APP_VERSION = "0.1.12"` (bumped from 0.1.1 per this prompt's patch rule).
  - `BUILD_TIME` — populated at build time via a Vite `define` in `vite.config.ts` (`__APP_BUILD_TIME__ = new Date().toISOString()`), formatted to `YYYY-MM-DD HH:MM`.
  - `ENVIRONMENT = "Development"` (hardcoded for now).
  - No `COMMIT` — we don't have reliable access to a commit SHA in this environment, so that row is omitted from the banner per the "ignore the whole row" rule.
- Going forward, every codebase-changing turn bumps `APP_VERSION` by +0.1 patch (0.1.12 → 0.1.22 → …) unless you say otherwise. Major/minor stay at `0.1` until you tell me.

**Boot console log**
- New file `src/lib/log-version.ts` that logs the ASCII "TAMARIND" banner (exactly as provided, minus the Commit row) with Version / Built / Environment filled in.
- Called once at client boot from `src/routes/__root.tsx` inside a `useEffect` in `RootComponent` (guards against SSR double-log and StrictMode double-invoke via a module-level `hasLogged` flag).

**In-app version label**
- New small component `src/components/version-badge.tsx` — fixed-position element at `bottom-right`, styled subtly (muted foreground, small text), reading `Version {APP_VERSION}`, positioned so it sits directly under the Lovable badge (Lovable badge is bottom-right; ours goes above the very bottom edge with enough margin to clear it — `bottom-12 right-4` roughly, tokens only, no hardcoded colors).
- Mounted once in `RootComponent` in `src/routes/__root.tsx` alongside `<Toaster />`.
- Rendered on every route (including `/login`, `/bootstrap`, authenticated routes) since it lives in the root.

**Files touched**
- new: `src/lib/version.ts`, `src/lib/log-version.ts`, `src/components/version-badge.tsx`
- edited: `vite.config.ts` (add `define` for `__APP_BUILD_TIME__`), `src/routes/__root.tsx` (mount badge, call boot log)

**Out of scope**
- Wiring a real git commit SHA (skipped per your rule).
- Any environment detection beyond the hardcoded `"Development"`.
