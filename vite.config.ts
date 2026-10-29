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
    plugins: [
      {
        // htmlparser2@10 imports entities@7 subpaths ("entities/decode", "entities/escape");
        // the root entities@4 lacks them, so point those imports at htmlparser2's nested copy in every environment.
        name: "entities-v7-subpaths",
        enforce: "pre",
        resolveId(id: string) {
          const m = /^entities\/(decode|escape)$/.exec(id);
          if (!m) return null;
          return path.resolve(
            process.cwd(),
            `node_modules/htmlparser2/node_modules/entities/dist/esm/${m[1]}.js`,
          );
        },
      },
    ],
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
      alias: [
        // htmlparser2@10 needs entities@7 subpaths, which the root entities@4 lacks.
        {
          find: /^entities\/decode$/,
          replacement: path.resolve(process.cwd(), "node_modules/htmlparser2/node_modules/entities/dist/esm/decode.js"),
        },
        {
          find: /^entities\/escape$/,
          replacement: path.resolve(process.cwd(), "node_modules/htmlparser2/node_modules/entities/dist/esm/escape.js"),
        },
        { find: "entities/lib/decode.js", replacement: path.resolve(process.cwd(), "node_modules/entities/lib/decode.js") },
        { find: "entities/lib/encode.js", replacement: path.resolve(process.cwd(), "node_modules/entities/lib/encode.js") },
        { find: /^entities$/, replacement: path.resolve(process.cwd(), "node_modules/entities") },
      ],
    },
  },
});
