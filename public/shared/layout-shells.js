function passthrough(value) {
  return String(value ?? "");
}

export function appAreaShell(area, inner, options = {}) {
  const esc = options.escapeAttr || passthrough;
  const normalizedArea = String(area || "guest");
  const className = [options.className, `${normalizedArea}-app-layout`, "app-area-layout"].filter(Boolean).join(" ");
  return `
    <main class="${esc(className)}" data-app-area="${esc(normalizedArea)}">
      ${inner || ""}
    </main>
  `;
}

export function heroLayoutShell(options = {}) {
  const esc = options.escapeAttr || passthrough;
  const escHtml = options.escapeHtml || passthrough;
  const copy = options.copy || {};
  const heroClassName = ["mvp-hero", options.heroClassName].filter(Boolean).join(" ");
  return `
    <section class="${esc(heroClassName)}" style="--hero-image: url('${esc(options.image || "")}')">
      <div class="hero-media" aria-hidden="true"></div>
      <div class="mvp-hero-copy">
        <p class="eyebrow">${escHtml(copy.kicker || "")}</p>
        <h1>${escHtml(copy.title || "")}</h1>
        <p>${escHtml(copy.subtitle || "")}</p>
        ${options.actions || ""}
      </div>
      ${options.inner || ""}
    </section>
  `;
}

export function dashboardLayoutShell(options = {}) {
  const esc = options.escapeAttr || passthrough;
  const escHtml = options.escapeHtml || passthrough;
  const items = Array.isArray(options.items) ? options.items : [];
  const activeHash = options.activeHash || "";
  const area = String(options.area || "partner");
  const layoutClassName = ["saas-layout", options.hideSidebar ? "dashboard-tabbed-layout" : ""].filter(Boolean).join(" ");
  if (options.hideSidebar) {
    return appAreaShell(area, `
      <section class="${esc(layoutClassName)}" data-dashboard-area="${esc(area)}">
        <div class="dashboard-content">
          ${options.inner || ""}
        </div>
      </section>
    `, { className: ["dashboard-app-layout", options.className].filter(Boolean).join(" "), escapeAttr: esc });
  }
  return appAreaShell(area, `
    <section class="${esc(layoutClassName)}" data-dashboard-area="${esc(area)}">
      <aside class="dashboard-sidebar">
        <div>
          <span class="section-kicker">${escHtml(options.kicker || "")}</span>
          <h2>${escHtml(options.title || "")}</h2>
        </div>
        <nav aria-label="${esc(options.navLabel || "Dashboard sections")}">
          ${items.map((item, index) => {
            const active = (!activeHash && index === 0) || activeHash === `#${item.id}`;
            return `<a class="${active ? "active" : ""}" href="#${esc(item.id)}">${escHtml(item.label || "")}</a>`;
          }).join("")}
        </nav>
      </aside>
      <div class="dashboard-content">
        ${options.inner || ""}
      </div>
    </section>
  `, { className: "dashboard-app-layout", escapeAttr: esc });
}
