import { expect, test } from "@playwright/test";

const ROLE_ACCOUNTS = {
  partner: {
    email: process.env.SMARTTABLE_TEST_PARTNER_EMAIL,
    password: process.env.SMARTTABLE_TEST_PARTNER_PASSWORD
  },
  admin: {
    email: process.env.SMARTTABLE_TEST_ADMIN_EMAIL,
    password: process.env.SMARTTABLE_TEST_ADMIN_PASSWORD
  },
  superadmin: {
    email: process.env.SMARTTABLE_TEST_SUPERADMIN_EMAIL,
    password: process.env.SMARTTABLE_TEST_SUPERADMIN_PASSWORD
  }
};

async function authenticatedSession(request, role) {
  const account = ROLE_ACCOUNTS[role];
  expect(account?.email, `${role} contrast account email is required`).toBeTruthy();
  expect(account?.password, `${role} contrast account password is required`).toBeTruthy();
  const response = await request.post("/api/auth/login", { data: account });
  const payload = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  expect(payload.access_token).toBeTruthy();
  return payload;
}

async function storeSession(page, session) {
  await page.goto("/");
  await page.evaluate((value) => {
    localStorage.setItem("smarttable.session", JSON.stringify({
      ...value,
      expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
    }));
    sessionStorage.removeItem("smarttable.session");
  }, session);
}

async function contrastAudit(page, rootSelector = "body") {
  return page.locator(rootSelector).evaluate((root) => {
    const parseColor = (value) => {
      const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    };
    const blend = (foreground, background) => {
      const alpha = Math.max(0, Math.min(1, foreground[3]));
      return [
        foreground[0] * alpha + background[0] * (1 - alpha),
        foreground[1] * alpha + background[1] * (1 - alpha),
        foreground[2] * alpha + background[2] * (1 - alpha),
        1
      ];
    };
    const luminance = (color) => {
      const channels = color.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const contrast = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const ownText = (element) => Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const backgroundFor = (element) => {
      let current = element;
      while (current instanceof Element) {
        const style = getComputedStyle(current);
        const background = parseColor(style.backgroundColor);
        if (background && background[3] >= 0.94) return background;
        if (style.backgroundImage !== "none" && current !== document.body && current !== document.documentElement) return null;
        current = current.parentElement;
      }
      return [16, 23, 19, 1];
    };
    const selectorFor = (element) => {
      if (element.id) return `#${element.id}`;
      const classes = Array.from(element.classList).slice(0, 3);
      return `${element.tagName.toLowerCase()}${classes.length ? `.${classes.join(".")}` : ""}`;
    };

    const failures = [];
    for (const element of [root, ...root.querySelectorAll("*")]) {
      if (!(element instanceof HTMLElement)) continue;
      const text = ownText(element);
      if (!text) continue;
      if (element.closest(".sr-only, [aria-hidden='true']")) continue;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || rect.width < 2 || rect.height < 2) continue;
      let clipped = false;
      let visibilityAncestor = element.parentElement;
      while (visibilityAncestor && visibilityAncestor !== root.parentElement) {
        const ancestorStyle = getComputedStyle(visibilityAncestor);
        const ancestorRect = visibilityAncestor.getBoundingClientRect();
        if ((ancestorStyle.overflow === "hidden" || ancestorStyle.overflowX === "hidden" || ancestorStyle.overflowY === "hidden")
          && (ancestorRect.width < 2 || ancestorRect.height < 2)) {
          clipped = true;
          break;
        }
        visibilityAncestor = visibilityAncestor.parentElement;
      }
      if (clipped) continue;
      const background = backgroundFor(element);
      const foreground = parseColor(style.color);
      if (!background || !foreground) continue;

      let effectiveOpacity = Number(style.opacity);
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== root.parentElement) {
        effectiveOpacity *= Number(getComputedStyle(ancestor).opacity);
        ancestor = ancestor.parentElement;
      }
      const effectiveForeground = blend([
        foreground[0],
        foreground[1],
        foreground[2],
        foreground[3] * Math.max(0, Math.min(1, effectiveOpacity))
      ], background);
      const ratio = contrast(effectiveForeground, background);
      const fontSize = Number.parseFloat(style.fontSize) || 16;
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const threshold = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
      if (ratio + 0.01 < threshold) {
        failures.push({
          selector: selectorFor(element),
          text: text.slice(0, 80),
          ratio: Number(ratio.toFixed(2)),
          threshold
        });
      }
    }
    return failures;
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("smarttable.theme", "dark"));
});

test("dark-mode header menus keep active and upcoming choices readable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.locator("#citySelectorButton").click();
  await expect(page.locator("#citySelectorMenu")).toBeVisible();
  await expect(page.locator(".city-selector__option").first()).toHaveCSS("background-color", "rgb(38, 51, 41)");
  await expect(page.locator(".city-selector__option:disabled")).toHaveCSS("opacity", "1");
  expect(await contrastAudit(page, "#citySelectorMenu")).toEqual([]);

  await page.locator("#citySelectorButton").click();
  await page.locator("#languageSelectorButton").click();
  await expect(page.locator("#languageSelectorMenu")).toBeVisible();
  expect(await contrastAudit(page, "#languageSelectorMenu")).toEqual([]);

  await page.locator("#languageSelectorButton").click();
  await page.locator("#headerSearchButton").click();
  await expect(page.locator("#headerSearchPanel")).toBeVisible();
  expect(await contrastAudit(page, "#headerSearchPanel")).toEqual([]);
});

for (const route of ["/", "/offers", "/restaurants", "/signup", "/login", "/forgot-password", "/terms", "/privacy"]) {
  test(`dark-mode text contrast remains readable on ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#app")).not.toBeEmpty();
    expect(await contrastAudit(page, "#app")).toEqual([]);
  });
}

const authenticatedRoutes = {
  partner: [
    "/partner",
    "/partner/reservations",
    "/partner/offers",
    "/partner/profile",
    "/partner/capacity",
    "/partner/availability",
    "/partner/notifications",
    "/partner/billing",
    "/partner/analytics"
  ],
  admin: ["/admin"],
  superadmin: [
    "/superadmin",
    "/superadmin/restaurants",
    "/superadmin/food-feed",
    "/superadmin/settings",
    "/superadmin/reports",
    "/admin/platform-settings",
    "/admin/content",
    "/admin/notifications"
  ]
};

for (const [role, routes] of Object.entries(authenticatedRoutes)) {
  test(`dark-mode ${role} screens keep visible text readable`, async ({ page, request }) => {
    const session = await authenticatedSession(request, role);
    await storeSession(page, session);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(page.locator("#app")).not.toBeEmpty();
      expect(await contrastAudit(page, "#app"), `Low contrast on ${route}`).toEqual([]);
    }
  });
}
