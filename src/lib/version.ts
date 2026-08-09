export const APP_VERSION = "0.2.01";
export const ENVIRONMENT = "Development";
export const LAST_COMMIT = "";

declare const __APP_BUILT_AT__: string | undefined;

function formatBuildTime(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const BUILD_TIME = formatBuildTime(
  typeof __APP_BUILT_AT__ !== "undefined" ? __APP_BUILT_AT__ : undefined,
);
