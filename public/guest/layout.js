import { appAreaShell, heroLayoutShell } from "../shared/layout-shells.js";

export function guestHeroLayout(options = {}) {
  return appAreaShell("guest", heroLayoutShell(options), {
    className: "hero-app-layout",
    escapeAttr: options.escapeAttr
  });
}
