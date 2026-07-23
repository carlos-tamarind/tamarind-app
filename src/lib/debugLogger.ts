/* eslint-disable no-console */

export class DebugLogger {
  static enabled =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.DEV
      : process.env.NODE_ENV !== "production";

  static table(params: {
    scope: string;
    event: string;
    data: Record<string, unknown>;
    collapsed?: boolean;
  }) {
    if (!this.enabled) return;

    const header = `[${params.scope}] ${params.event}`;

    const group = params.collapsed ? console.groupCollapsed : console.group;

    group(header);
    console.table(params.data);
    console.groupEnd();
  }

  static log(params: {
    scope: string;
    event: string;
    message: string;
    level?: "log" | "warn" | "error";
  }) {
    if (!this.enabled) return;

    const level = params.level ?? "log";

    console[level](`[${params.scope}] ${params.event} · ${params.message}`);
  }

  static time(scope: string, event: string) {
    if (!this.enabled) {
      return {
        end: () => {},
      };
    }

    const start = performance.now();

    return {
      end: () => {
        const elapsed = performance.now() - start;

        console.log(`[${scope}] ${event} · ${elapsed.toFixed(2)} ms`);
      },
    };
  }
}
