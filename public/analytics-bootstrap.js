(() => {
  const productionHosts = new Set(["smarttablenyc.com", "www.smarttablenyc.com"]);
  const sensitiveQueryKeys = new Set([
    "token",
    "code",
    "access_token",
    "refresh_token",
    "email",
    "phone",
    "reservation_id",
    "user_id",
    "guest_id"
  ]);
  const excludedPrefixes = [
    "/admin",
    "/superadmin",
    "/partner",
    "/api",
    "/auth",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/signup/check-email",
    "/signup/welcome",
    "/account",
    "/guest/rewards",
    "/guest/privacy",
    "/review/verified",
    "/post-visit/action",
    "/internal",
    "/diagnostics",
    "/qa"
  ];

  function normalizedAnalyticsPath(value) {
    try {
      const url = new URL(value || window.location.href, window.location.origin);
      if (!productionHosts.has(url.hostname)) return null;
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      if (excludedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
      for (const key of url.searchParams.keys()) {
        if (sensitiveQueryKeys.has(String(key).toLowerCase())) return null;
      }
      return `${url.origin}${pathname === "/" ? "/" : pathname}`;
    } catch {
      return null;
    }
  }

  const initialUrl = normalizedAnalyticsPath(window.location.href);
  if (!initialUrl) return;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  window.va("beforeSend", (event) => {
    const cleanUrl = normalizedAnalyticsPath(event && event.url);
    if (!cleanUrl) return null;
    return { ...event, url: cleanUrl };
  });
  const script = document.createElement("script");
  script.defer = true;
  script.src = "/_vercel/insights/script.js";
  script.setAttribute("data-smarttable-analytics", "vercel-web-analytics");
  document.head.appendChild(script);
})();
