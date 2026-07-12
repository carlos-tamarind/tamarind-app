import { APP_VERSION, BUILD_TIME, ENVIRONMENT } from "./version";

let hasLogged = false;

export function logVersionBanner() {
  if (hasLogged) return;
  hasLogged = true;
  const banner = `// ======================================================= //
//   ████████╗ █████╗ ███╗   ███╗ █████╗ ██████╗ ██╗███╗   ██╗██████╗
//   ╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗██╔══██╗██║████╗  ██║██╔══██╗
//      ██║   ███████║██╔████╔██║███████║██████╔╝██║██╔██╗ ██║██║  ██║
//      ██║   ██╔══██║██║╚██╔╝██║██╔══██║██╔══██╗██║██║╚██╗██║██║  ██║
//      ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║██║  ██║██║██║ ╚████║██████╔╝
//      ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚═════╝
//
//  Version : ${APP_VERSION}
//  Built   : ${BUILD_TIME}
//  Environment : ${ENVIRONMENT}
// ======================================================= //`;
  // eslint-disable-next-line no-console
  console.log(banner);
}
