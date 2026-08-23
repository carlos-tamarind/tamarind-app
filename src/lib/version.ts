export const APP_VERSION = "0.3.153";

declare const __APP_BUILT_AT__: string | undefined;
declare const __APP_COMMIT_HASH__: string | undefined;

function resolveEnvironment(): string {
  const mode = import.meta.env.MODE;
  if (mode === "production") return "Production";
  if (mode === "development") return "Development";
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

export const ENVIRONMENT = resolveEnvironment();

export const LAST_COMMIT =
  typeof __APP_COMMIT_HASH__ !== "undefined" ? __APP_COMMIT_HASH__ : "";

function formatBuildTime(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const BUILD_TIME = formatBuildTime(
  typeof __APP_BUILT_AT__ !== "undefined" ? __APP_BUILT_AT__ : undefined,
);
