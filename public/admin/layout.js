import { dashboardLayoutShell } from "../shared/layout-shells.js";

export function adminDashboardLayout(options = {}) {
  return dashboardLayoutShell({
    ...options,
    area: "admin"
  });
}
