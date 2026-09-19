// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { execSync } from "node:child_process";
import path from "node:path";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Server-side env (no VITE_ prefix) for server routes such as the email webhook.
// Never added to define/envDefine — these must not reach the client bundle.
Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), ""));

function resolveCommitHash(): string {
  const ciHash =
    process.env.GITHUB_SHA ??
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA;
  if (ciHash) return ciHash.slice(0, 7);

  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
      __APP_COMMIT_HASH__: JSON.stringify(resolveCommitHash()),
    },
    build: {
      rollupOptions: {
        external: ["cloudflare:workers"],
      },
    },
    ssr: {
      external: ["cloudflare:workers"],
    },
    resolve: {
      alias: {
        "entities/lib/decode.js": path.resolve(process.cwd(), "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(process.cwd(), "node_modules/entities/lib/encode.js"),
        entities: path.resolve(process.cwd(), "node_modules/entities"),
      },
    },
  },
});
