import { dashboardLayoutShell } from "../shared/layout-shells.js";

export function partnerDashboardLayout(options = {}) {
  return dashboardLayoutShell({
    ...options,
    className: [options.className, "partner-wide-shell"].filter(Boolean).join(" "),
    area: "partner"
  });
}
