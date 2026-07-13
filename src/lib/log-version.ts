import { APP_VERSION, BUILD_TIME, ENVIRONMENT, LAST_COMMIT } from "./version";

let hasLogged = false;

export function logVersionBanner() {
  if (hasLogged) return;
  hasLogged = true;
  const lines = [
    "// ======================================================= //",
    "//   ████████╗ █████╗ ███╗   ███╗ █████╗ ██████╗ ██╗███╗   ██╗██████╗",
    "//   ╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗██╔══██╗██║████╗  ██║██╔══██╗",
    "//      ██║   ███████║██╔████╔██║███████║██████╔╝██║██╔██╗ ██║██║  ██║",
    "//      ██║   ██╔══██║██║╚██╔╝██║██╔══██║██╔══██╗██║██║╚██╗██║██║  ██║",
    "//      ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██║██║██║ ╚████║██████╔╝",
    "//      ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝",
    "//",
    `//  Version     : ${APP_VERSION}`,
    `//  Built       : ${BUILD_TIME}`,
  ];
  if (LAST_COMMIT) {
    lines.push(`//  Last commit : ${LAST_COMMIT}`);
  }
  lines.push(`//  Environment : ${ENVIRONMENT}`);
  lines.push("// ======================================================= //");
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}
