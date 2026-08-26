import { expect, test } from "@playwright/test";

const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const uniqueEmail = (prefix) => `${prefix}-${stamp()}@example.com`;

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required for SmartTable E2E role-account tests.`);
  return value;
}

const TEST_ACCOUNTS = {
  partner: {
    email: requiredEnv("SMARTTABLE_TEST_PARTNER_EMAIL"),
    password: requiredEnv("SMARTTABLE_TEST_PARTNER_PASSWORD")
  },
  admin: {
    email: requiredEnv("SMARTTABLE_TEST_ADMIN_EMAIL"),
    password: requiredEnv("SMARTTABLE_TEST_ADMIN_PASSWORD")
  },
  superadmin: {
    email: requiredEnv("SMARTTABLE_TEST_SUPERADMIN_EMAIL"),
    password: requiredEnv("SMARTTABLE_TEST_SUPERADMIN_PASSWORD")
  }
};

function signupPayload(overrides = {}) {
  const email = overrides.email || uniqueEmail("e2e-guest");
  return {
    first_name: "E2E",
    last_name: "Guest",
    full_name: "E2E Guest",
    email,
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    phone: "+1 212 555 0123",
    city: "New York",
    region: "NY",
    postal_code: "10014",
    preferred_neighborhoods: ["West Village"],
    travel_distance_miles: "5",
    transportation_method: "Walking",
    transportation_methods: ["Walking"],
    cuisines: ["American"],
    food_categories: ["Pasta"],
    dietary_needs: ["No restrictions"],
    allergy_notes: "",
    drink_preferences: ["Coffee"],
    dining_experiences: ["Casual dining"],
    companions: ["Partner"],
    party_size: "2",
    preferred_days: ["Friday"],
    preferred_time_windows: ["Dinner"],
    booking_lead_time: "1-2 days",
    dining_duration: "60-90 minutes",
    discovery_preference: "Familiar favorites",
    selection_priorities: ["Discount", "Cuisine"],
    new_restaurant_recommendations: "yes",
    new_menu_item_recommendations: "yes",
    excluded_categories: ["Buffet"],
    spending_range: "$$",
    discount_levels: ["20%"],
    consider_no_discount_match: "sometimes",
    notification_preferences: ["Reservation status updates"],
    notification_channels: ["Email"],
    notification_frequency: "Immediately",
    event_recommendations_interest: "no",
    future_calendar_interest: "no",
    transactional_email_consent: true,
    terms_consent: true,
    privacy_consent: true,
    allergy_acknowledgement: true,
    preferred_language: "en",
    ...overrides
  };
}

async function json(response) {
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function login(request, email, password) {
  const result = await json(await request.post("/api/auth/login", {
    data: { email, password }
  }));
  expect(result.response.status(), JSON.stringify(result.payload)).toBe(200);
  expect(result.payload.access_token).toBeTruthy();
  return result.payload;
}

function authHeaders(session) {
  return { authorization: `Bearer ${session.access_token}` };
}

async function storeSession(page, session) {
  await page.goto("/");
  await page.evaluate((storedSession) => {
    localStorage.setItem("smarttable.session", JSON.stringify({
      ...storedSession,
      expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
    }));
    sessionStorage.removeItem("smarttable.session");
  }, session);
  await page.goto("/");
}

async function replaceStoredSession(page, session, path = "/") {
  await page.goto("/");
  await page.evaluate((storedSession) => {
    localStorage.removeItem("smarttable.session");
    sessionStorage.removeItem("smarttable.session");
    localStorage.setItem("smarttable.session", JSON.stringify({
      ...storedSession,
      expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
    }));
  }, session);
  await page.goto(path);
}

async function signInThroughVisibleForm(page, path, email, password) {
  await page.goto(path);
  const loginForm = page.locator('form:has(input[name="email"]):has(input[name="password"])');
  await expect(loginForm).toHaveCount(1);
  await loginForm.locator('input[name="email"]').fill(email);
  await loginForm.locator('input[name="password"]').fill(password);
  await loginForm.locator('button[type="submit"]').click();
}

async function expectAuthenticatedRoute(page, expectedPath) {
  await expect(page).toHaveURL(new RegExp(`${expectedPath.replace("/", "\\/")}(?:$|[?#])`));
  if (expectedPath === "/account") {
    await expect(page.locator(".account-dashboard")).toBeVisible();
  } else {
    await expect(page.locator(".dashboard-head")).toBeVisible();
  }
  await expect(page.getByText("Please use the correct dashboard login for this account.")).toHaveCount(0);
}

async function signOutFromVisibleSession(page) {
  await page.locator("#sessionButton").click();
  const guestMenuSignOut = page.locator("[data-account-menu-signout]");
  if (await guestMenuSignOut.isVisible().catch(() => false)) {
    await guestMenuSignOut.click();
  }
  await expect(page).toHaveURL(/\/$/);
}

async function expectRouteHealthy(page, path) {
  await page.goto(path);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("SmartTable could not load this screen");
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);
}

async function expectPublicContactPlacement(page, path) {
  await page.goto(path);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("SmartTable could not load this screen");
  const header = page.locator("header.topbar");
  await expect(header).toBeVisible();
  await expect(header.getByRole("button", { name: /^Contact$/i })).toHaveCount(0);
  await expect(header.getByRole("link", { name: /^Contact$/i })).toHaveCount(0);
  const footerNav = page.getByRole("navigation", { name: /Footer navigation/i });
  await expect(footerNav).toBeVisible();
  await expect(footerNav.getByRole("link", { name: /^Contact$/i })).toHaveAttribute("href", /\/contact$/);
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);
}

async function dismissReservationAlerts(page) {
  for (let index = 0; index < 20; index += 1) {
    const alertDialog = page.getByRole("alertdialog").first();
    if (!(await alertDialog.isVisible().catch(() => false))) return;
    const acknowledge = alertDialog.getByRole("button", { name: /^Acknowledge$/i });
    if (!(await acknowledge.isVisible().catch(() => false))) return;
    await acknowledge.click({ force: true });
    await page.waitForTimeout(150);
  }
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

async function acknowledgePartnerReservationAlerts(request, partnerSession) {
  const response = await json(await request.get("/api/partner/reservation-alerts", {
    headers: authHeaders(partnerSession)
  }));
  expect(response.response.status(), JSON.stringify(response.payload)).toBe(200);
  for (const alert of response.payload.alerts || []) {
    if (alert.acknowledged_at || String(alert.status || "").toLowerCase() === "acknowledged") continue;
    const acknowledged = await json(await request.patch("/api/partner/reservation-alerts", {
      headers: authHeaders(partnerSession),
      data: { action: "acknowledge", alert_id: alert.id }
    }));
    expect(acknowledged.response.status(), JSON.stringify(acknowledged.payload)).toBe(200);
  }
}

async function createFutureOffer(request, partnerSession, overrides = {}) {
  const result = await json(await request.post("/api/partner/offers", {
    headers: authHeaders(partnerSession),
    data: {
      title_en: `E2E table ${stamp()}`,
      description_en: "Production E2E reservation-flow offer.",
      offer_date: "2026-12-15",
      start_time: "18:30",
      end_time: "20:00",
      discount_type: "percent",
      discount_value: 20,
      available_tables: 3,
      max_party_size: 4,
      status: "active",
      ...overrides
    }
  }));
  expect(result.response.status(), JSON.stringify(result.payload)).toBe(201);
  expect(result.payload.offer?.id).toBeTruthy();
  return result.payload.offer;
}

test.describe.serial("SmartTable BASIC production E2E", () => {
  test("homepage hero conversion section is accessible, responsive, and localized", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("smarttable.lang", "en"));
    await page.goto("/");
    await expect(page.locator("#guestHeroSearchForm")).toHaveCount(0);

    const headerSearchButton = page.locator("#headerSearchButton");
    const headerSearchPanel = page.locator("#headerSearchPanel");
    const searchForm = headerSearchPanel.locator("#headerOfferSearchForm");
    await expect(headerSearchButton).toHaveAttribute("aria-expanded", "false");
    await expect(headerSearchPanel).toBeHidden();

    await expect(page.locator("h1:visible")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1, name: "Book great restaurants for less" })).toBeVisible();
    const primaryCta = page.getByRole("button", { name: /^Find a Table$/i });
    const secondaryCta = page.getByRole("button", { name: /^Browse Restaurants$/i });
    await expect(primaryCta).toBeVisible();
    await expect(secondaryCta).toBeVisible();

    await expect(page.locator("[data-language-selector]")).toHaveCount(1);
    await expect(page.locator("header.topbar").getByRole("button", { name: /^Contact$/i })).toHaveCount(0);
    await expect(page.locator("header.topbar").getByRole("link", { name: /^Contact$/i })).toHaveCount(0);

    await headerSearchButton.click();
    await expect(headerSearchButton).toHaveAttribute("aria-expanded", "true");
    await expect(headerSearchPanel).toBeVisible();
    await expect(searchForm.getByLabel("Restaurant name")).toBeVisible();
    await expect(searchForm.getByLabel("Date")).toBeVisible();
    await expect(searchForm.getByLabel("Time")).toBeVisible();
    await expect(searchForm.getByLabel("Party size")).toBeVisible();
    await expect(searchForm.getByLabel("Neighborhood")).toBeVisible();
    await expect(searchForm.getByLabel("Cuisine")).toBeVisible();
    await expect(searchForm.getByLabel("Minimum discount")).toBeVisible();

    await searchForm.getByRole("button", { name: /^Close search$/i }).click();
    await expect(headerSearchPanel).toBeHidden();
    await expect(headerSearchButton).toBeFocused();

    await primaryCta.click();
    await expect(headerSearchPanel).toBeVisible();
    await expect(searchForm.getByLabel("Restaurant name")).toBeFocused();
    await expect(page).toHaveURL(/\/$/);

    await searchForm.getByLabel("Restaurant name").fill("Hudson");
    await expect(searchForm.getByLabel("Restaurant name")).toHaveValue("Hudson");
    await searchForm.getByRole("button", { name: /^Search Offers$/i }).click();
    await expect(page).toHaveURL(/\/offers$/);
    await expect(headerSearchPanel).toBeHidden();
    await expect(page.locator("#guest-offers")).toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: /^Browse Restaurants$/i }).click();
    await expect(page).toHaveURL(/\/restaurants$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("#guestHeroSearchForm")).toHaveCount(0);

    const languageButton = page.locator("#languageSelectorButton");
    await languageButton.press("Enter");
    await page.locator("[data-language-option='es']").click();
    await expect(page.getByRole("heading", { level: 1, name: "Reserva excelentes restaurantes por menos" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Buscar una mesa$/i })).toBeVisible();
    await expect(page.evaluate(() => localStorage.getItem("smarttable.lang"))).resolves.toBe("es");

    await languageButton.press("Enter");
    await page.locator("[data-language-option='hu']").click();
    await expect(page.getByRole("heading", { level: 1, name: "Foglalj nagyszerű éttermekbe kedvezőbb áron" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Asztalt keresek$/i })).toBeVisible();
    await expect(page.evaluate(() => localStorage.getItem("smarttable.lang"))).resolves.toBe("hu");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#guestHeroSearchForm")).toHaveCount(0);
    await expect(headerSearchPanel).toBeHidden();
    await page.locator("#headerSearchButton").click();
    await expect(headerSearchPanel).toBeVisible();
    await expect(searchForm).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);
    await expect(page.locator("[data-language-selector]")).toHaveCount(1);
    await expect(page.locator("header.topbar").getByRole("button", { name: /^Contact$/i })).toHaveCount(0);
  });

  test("public guest pages render without BASIC-incompatible controls", async ({ page, request, isMobile }) => {
    const contactResponse = await request.get("/contact");
    expect(contactResponse.status()).toBe(200);

    for (const path of ["/", "/offers", "/restaurants", "/contact", "/signup", "/login"]) {
      await expectPublicContactPlacement(page, path);
    }

    await page.goto("/");
    await expect(page.getByRole("link", { name: /SmartTable home/i })).toBeVisible();
    const brandTagline = page.locator(".brand small");
    await expect(brandTagline).toHaveText(/discounted restaurant reservations/i);
    if (isMobile) {
      await expect(brandTagline).toBeHidden();
    } else {
      await expect(brandTagline).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Super Admin/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Contact$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^AI Concierge$/i })).toHaveCount(0);
    const footerNav = page.getByRole("navigation", { name: /Footer navigation/i });
    await expect(footerNav.getByRole("link", { name: /^About$/i })).toBeVisible();
    await expect(footerNav.getByRole("link", { name: /^Contact$/i })).toHaveAttribute("href", /\/contact$/);
    await expect(footerNav.getByRole("link", { name: /^Help Center$/i })).toHaveAttribute("href", /\/help$/);
    await expect(footerNav.getByRole("link", { name: /^Privacy Policy$/i })).toHaveAttribute("href", /\/privacy$/);
    await expect(footerNav.getByRole("link", { name: /^Terms of Service$/i })).toHaveAttribute("href", /\/terms$/);
    await expect(footerNav.getByRole("link", { name: /^Cookie Policy$/i })).toHaveAttribute("href", /\/cookies$/);
    await expect(footerNav.getByRole("link", { name: /^For Restaurants$/i })).toHaveAttribute("href", /\/partner$/);
    await expect(page.locator("[data-language-selector]")).toHaveCount(1);
    await expect(page.locator("#languageSelectorMenu")).toBeHidden();

    const languageButton = page.locator("#languageSelectorButton");
    await expect(languageButton).toHaveAttribute("aria-haspopup", "listbox");
    await expect(languageButton).toHaveAttribute("aria-expanded", "false");
    await expect(languageButton).toContainText(/Language/);
    await expect(languageButton).toContainText(/English/);
    await languageButton.press("Enter");
    await expect(languageButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("listbox", { name: /Choose language/i })).toBeVisible();
    await expect(page.locator("[data-language-option='en']")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-language-option='en']")).toContainText("English");
    await expect(page.locator("[data-language-option='es']")).toContainText("Español");
    await expect(page.locator("[data-language-option='hu']")).toContainText("Magyar");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(languageButton).toHaveAttribute("aria-expanded", "false");
    await expect(languageButton).toContainText(/Español/);
    await expect(page.evaluate(() => localStorage.getItem("smarttable.lang"))).resolves.toBe("es");
    await languageButton.press("Enter");
    await page.keyboard.press("Escape");
    await expect(languageButton).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(() => localStorage.setItem("smarttable.lang", "en"));

    await page.goto("/restaurants");
    await expect(page.getByText(/Restaurants|Explore/i).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("could not load this screen");

    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
  });

  test("visitor analytics is disabled outside the production public domain and on private routes", async ({ page }) => {
    const analyticsScript = page.locator('script[data-smarttable-analytics="vercel-web-analytics"]');

    for (const path of ["/", "/restaurants", "/login", "/partner", "/admin", "/superadmin", "/api/health", "/auth/callback?code=test"]) {
      await page.goto(path);
      await expect(analyticsScript).toHaveCount(0);
      await expect(page.evaluate(() => Boolean(window.va))).resolves.toBe(false);
    }
  });

  test("public restaurants render compact tiles and detail pages with active offers", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("smarttable.lang", "en"));
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/restaurants");

    const cards = page.locator(".compact-restaurant-card");
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    const names = (await cards.locator("h3").allTextContents()).map((name) => name.trim()).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
    await expect(cards.first().locator(".restaurant-discount-range")).toContainText(/%|No active offers/i);
    await expect(cards.first().locator(".offer-stack")).toHaveCount(0);
    await expect(cards.first().getByRole("button", { name: /^Reserve$/i })).toHaveCount(0);
    await expect(cards.first().getByRole("button", { name: /View details/i })).toHaveCount(0);

    const desktopBoxes = await cards.evaluateAll((items) => items.slice(0, 3).map((item) => item.getBoundingClientRect().toJSON()));
    if (desktopBoxes.length > 1) {
      expect(Math.abs(desktopBoxes[0].top - desktopBoxes[1].top)).toBeLessThanOrEqual(2);
    }

    const firstCardBox = await cards.first().boundingBox();
    expect(firstCardBox?.height || 0).toBeLessThanOrEqual(330);
    const firstName = names[0];

    const favorite = cards.first().locator("[data-follow-restaurant]");
    const beforeFavoriteUrl = page.url();
    await favorite.click();
    await expect(page).toHaveURL(beforeFavoriteUrl);
    await expect(page.locator(".modal-card")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal-card")).toHaveCount(0);

    await cards.first().press("Enter");
    await expect(page).toHaveURL(/\/restaurants\/[^/]+$/);
    await expect(page.locator(".restaurant-detail-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: firstName })).toBeVisible();
    await expect(page.locator(".detail-offer-card").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Reserve$/i }).first()).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".restaurant-detail-page")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/restaurants");
    await expect(cards.first()).toBeVisible();
    const mobileBox = await cards.first().boundingBox();
    expect(mobileBox?.height || 0).toBeLessThanOrEqual(320);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);

    await page.locator("section.filters input[name='restaurantName']").fill(firstName);
    await expect(page.locator(".compact-restaurant-card").filter({ hasText: firstName }).first()).toBeVisible();
  });

  test("public Food Feed renders full-screen dish videos and images with booking navigation", async ({ page }) => {
    let locationRequests = 0;
    let feedRequests = 0;
    await page.addInitScript(() => localStorage.setItem("smarttable.lang", "en"));
    await page.exposeFunction("recordFoodFeedLocationRequest", () => {
      locationRequests += 1;
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition(success) {
            window.recordFoodFeedLocationRequest();
            success({ coords: { latitude: 40.7336, longitude: -74.0027 } });
          }
        }
      });
    });
    await page.route("**/api/public/food-feed**", async (route) => {
      feedRequests += 1;
      const videos = [{
        id: "food-feed-e2e",
        title: "Wood-fired truffle pasta",
        caption: "Three seconds of dinner inspiration.",
        video_url: "/food-feed-e2e.mp4",
        mime_type: "video/mp4",
        duration_ms: 3000,
        distance_km: 1.6,
        restaurant: {
          id: "restaurant-e2e",
          name: "Hudson Hearth",
          slug: "hudson-hearth",
          cuisine: "Modern American",
          neighborhood: "West Village",
          city: "New York"
        },
        offer: { discount_percentage: 20 }
      }, {
        id: "food-feed-image-e2e",
        title: "Seasonal plated dish",
        caption: "A quick dinner idea.",
        media_type: "image",
        media_url: "/restaurant-placeholder.svg",
        mime_type: "image/webp",
        restaurant: {
          id: "restaurant-e2e",
          name: "Hudson Hearth",
          slug: "hudson-hearth",
          cuisine: "Modern American",
          neighborhood: "West Village",
          city: "New York"
        },
        offer: null
      }];
      if (new URL(route.request().url()).searchParams.has("fresh")) videos.reverse();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          videos
        })
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/food-feed");
    const card = page.locator("[data-food-feed-video-id='food-feed-e2e']").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Wood-fired truffle pasta");
    await expect(card).toContainText("Hudson Hearth");
    await expect(card).toContainText("20% OFF");
    const restaurantNameButton = card.getByRole("button", { name: "Hudson Hearth", exact: true });
    const bookTableButton = card.getByRole("button", { name: /Book a table/i });
    await expect(restaurantNameButton).toBeVisible();
    await expect(bookTableButton).toBeVisible();
    await expect(card.getByRole("button", { name: /View restaurant/i })).toHaveCount(0);
    await expect(card.locator("video")).toHaveAttribute("muted", "");
    await expect(card.locator("video")).toHaveAttribute("loop", "");
    await expect(card.locator("video")).toHaveAttribute("playsinline", "");
    const imageCard = page.locator("[data-food-feed-video-id='food-feed-image-e2e']").first();
    await expect(imageCard.locator("img")).toHaveAttribute("loading", "eager");
    const cardBox = await card.boundingBox();
    expect(cardBox?.height || 0).toBeGreaterThanOrEqual(840);
    expect(cardBox?.width || 0).toBeGreaterThanOrEqual(389);
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator(".public-footer")).toHaveCount(0);
    await expect(page.locator("[data-food-feed-close]")).toBeVisible();
    await expect(page.locator(".food-feed-position")).toHaveCount(0);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);
    expect(locationRequests).toBe(0);

    const foodFavoriteButton = card.locator("[data-food-feed-favorite]");
    await expect(foodFavoriteButton).toBeVisible();
    await expect(foodFavoriteButton.locator(".food-feed-favorite-icon")).toHaveText("\u2606");
    await expect(foodFavoriteButton.locator(".food-feed-favorite-label")).toHaveCount(0);
    const favoriteButtonBox = await foodFavoriteButton.boundingBox();
    expect(favoriteButtonBox?.height || 0).toBeGreaterThanOrEqual(44);
    expect(favoriteButtonBox?.width || 0).toBeGreaterThanOrEqual(44);
    await foodFavoriteButton.click();
    const favoriteDialog = page.getByRole("dialog", { name: "Save this dish" });
    await expect(favoriteDialog).toBeVisible();
    await expect(favoriteDialog.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(favoriteDialog.getByRole("button", { name: "Create account" })).toBeVisible();
    await favoriteDialog.getByRole("button", { name: "Close" }).click();
    await expect(favoriteDialog).toHaveCount(0);

    await page.getByRole("button", { name: /Use my location/i }).click();
    await expect.poll(() => locationRequests).toBe(1);
    await expect(page.locator("[data-food-feed-radius]")).toBeEnabled();

    const lastInitialCard = page.locator("[data-food-feed-card]").nth(1);
    await lastInitialCard.scrollIntoViewIfNeeded();
    await expect(lastInitialCard).toBeInViewport();
    await expect.poll(() => page.locator("[data-food-feed-card]").count()).toBeGreaterThanOrEqual(4);
    const infiniteIds = await page.locator("[data-food-feed-card]").evaluateAll((cards) => cards.slice(0, 4).map((item) => item.getAttribute("data-food-feed-video-id")));
    expect(infiniteIds[1]).not.toBe(infiniteIds[2]);
    await page.locator("[data-food-feed-refresh]").click();
    await expect.poll(() => feedRequests).toBeGreaterThanOrEqual(3);
    await expect(page.locator("[data-food-feed-card]").first()).toHaveAttribute("data-food-feed-video-id", "food-feed-image-e2e");

    await restaurantNameButton.click();
    await expect(page).toHaveURL(/\/restaurants\/hudson-hearth$/);

    await page.goto("/food-feed");
    await page.locator("[data-food-feed-video-id='food-feed-e2e']").first().getByRole("button", { name: /Book a table/i }).click();
    await expect(page).toHaveURL(/\/restaurants\/hudson-hearth$/);
  });

  test("admin dashboard return navigation is role-aware on public routes", async ({ page, request }) => {
    const admin = await login(request, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await replaceStoredSession(page, admin, "/offers");
    const adminButton = page.locator("#adminDashboardNav");
    await expect(adminButton).toBeVisible();
    await expect(adminButton).toHaveAttribute("data-dashboard-route", "/admin");
    await expect(adminButton).toHaveAccessibleName("Back to Admin Dashboard");
    await adminButton.click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.locator(".dashboard-head")).toBeVisible();

    await page.getByRole("tab", { name: /^Restaurants$/i }).click();
    await expect(page).toHaveURL(/\/admin\/restaurants$/);
    await page.goto("/offers");
    await expect(adminButton).toHaveAttribute("data-dashboard-route", "/admin/restaurants");
    await adminButton.click();
    await expect(page).toHaveURL(/\/admin\/restaurants$/);

    await page.goto("/restaurants");
    await expect(adminButton).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(adminButton).toBeVisible();
    await expect(adminButton).toHaveAttribute("data-dashboard-route", "/admin/restaurants");
    await page.goto("/offers");
    await page.goto("/restaurants");
    await page.goBack();
    await expect(page).toHaveURL(/\/offers$/);
    await expect(adminButton).toBeVisible();
    await page.goto("/login");
    await expect(adminButton).toBeVisible();

    const superAdmin = await login(request, TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);
    await replaceStoredSession(page, superAdmin, "/offers");
    await expect(adminButton).toBeVisible();
    await expect(adminButton).toHaveAttribute("data-dashboard-route", "/superadmin");
    await expect(adminButton).toHaveAccessibleName("Back to Super Admin Dashboard");
    await adminButton.click();
    await expect(page).toHaveURL(/\/superadmin$/);
    await expect(page.locator(".dashboard-head")).toBeVisible();

    const guestPayload = signupPayload({ email: uniqueEmail("header-guest") });
    const guestSignup = await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    expect(guestSignup.response.status(), JSON.stringify(guestSignup.payload)).toBe(201);
    const guest = await login(request, guestPayload.email, guestPayload.password);
    await replaceStoredSession(page, guest, "/offers");
    await expect(adminButton).toBeHidden();

    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    await replaceStoredSession(page, partner, "/offers");
    await expect(adminButton).toBeHidden();
  });

  test("dashboard tab navigation works for admin, superadmin, and partner", async ({ page, request }) => {
    const admin = await login(request, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await replaceStoredSession(page, admin, "/admin");
    await expect(page.getByRole("tablist", { name: /Admin dashboard sections/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^Overview$/i })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /^Restaurants$/i }).click();
    await expect(page).toHaveURL(/\/admin\/restaurants$/);
    await expect(page.getByRole("tab", { name: /^Restaurants$/i })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#admin-restaurants")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: /^Restaurants$/i })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: /^Payments$/i }).click();
    await expect(page).toHaveURL(/\/admin\/payments$/);
    await expect(page.locator("#admin-billing")).toBeVisible();
    await page.getByRole("tab", { name: /^Reports$/i }).click();
    await expect(page).toHaveURL(/\/admin\/reports$/);
    await expect(page.locator("#admin-analytics")).toBeVisible();
    await page.getByRole("tab", { name: /^Audit Log$/i }).click();
    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(page.locator("#admin-audit-log")).toBeVisible();

    const superAdmin = await login(request, TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);
    await replaceStoredSession(page, superAdmin, "/superadmin");
    await expect(page.getByRole("tablist", { name: /Admin dashboard sections/i })).toBeVisible();
    await page.getByRole("tab", { name: /^Restaurants$/i }).click();
    await expect(page).toHaveURL(/\/superadmin\/restaurants$/);
    await expect(page.locator("#admin-restaurants")).toBeVisible();
    await page.getByRole("tab", { name: /^Settings$/i }).click();
    await expect(page).toHaveURL(/\/superadmin\/settings$/);
    await expect(page.locator("#admin-platform-settings")).toBeVisible();
    await page.getByRole("tab", { name: /^Payments$/i }).click();
    await expect(page).toHaveURL(/\/superadmin\/payments$/);
    await expect(page.locator("#admin-billing")).toBeVisible();

    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    await replaceStoredSession(page, partner, "/partner");
    await expect(page.getByRole("tablist", { name: /Partner dashboard sections/i })).toBeVisible();
    await dismissReservationAlerts(page);
    await page.getByRole("tab", { name: /^Offers$/i }).click();
    await expect(page).toHaveURL(/\/partner\/offers$/);
    await expect(page.locator("#partner-deals")).toBeVisible();
    const offerForm = page.locator("#offerForm");
    await expect(offerForm.getByLabel(/^Offer title$/i)).toBeVisible();
    await expect(offerForm.getByLabel(/^Offer description$/i)).toBeVisible();
    await expect(page.getByText(/^Title English$/i)).toHaveCount(0);
    await expect(page.getByText(/^Title Spanish$/i)).toHaveCount(0);
    await expect(page.getByText(/^Title Hungarian$/i)).toHaveCount(0);
    await expect(page.getByText(/^Description English$/i)).toHaveCount(0);
    await expect(page.getByText(/^Description Spanish$/i)).toHaveCount(0);
    await expect(page.getByText(/^Description Hungarian$/i)).toHaveCount(0);
    await page.getByRole("tab", { name: /^Reservations$/i }).click();
    await expect(page).toHaveURL(/\/partner\/reservations$/);
    await expect(page.locator("#partner-reservations")).toBeVisible();
    await page.getByRole("tab", { name: /^Restaurant Profile$/i }).click();
    await expect(page).toHaveURL(/\/partner\/profile$/);
    await expect(page.locator("#partner-profile")).toBeVisible();
    await page.getByRole("tab", { name: /^Tables & Capacity$/i }).click();
    await expect(page).toHaveURL(/\/partner\/capacity$/);
    await expect(page.locator("#partner-capacity")).toBeVisible();
    await page.getByRole("tab", { name: /^Availability$/i }).click();
    await expect(page).toHaveURL(/\/partner\/availability$/);
    await expect(page.locator("#partner-availability")).toBeVisible();
    await page.getByRole("tab", { name: /^Notifications$/i }).click();
    await expect(page).toHaveURL(/\/partner\/notifications$/);
    await expect(page.locator("#partner-notification-settings")).toBeVisible();
    await page.getByRole("tab", { name: /^Billing$/i }).click();
    await expect(page).toHaveURL(/\/partner\/billing$/);
    await expect(page.locator("#partner-billing")).toBeVisible();
    await expect(page.locator("[data-partner-billing-action]").first()).toBeVisible();
    await page.getByRole("tab", { name: /^Analytics & Reporting$/i }).click();
    await expect(page).toHaveURL(/\/partner\/analytics$/);
    await expect(page.locator("#partner-analytics")).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: /^Analytics & Reporting$/i })).toHaveAttribute("aria-selected", "true");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/partner/analytics");
    await expect(page.getByRole("tablist", { name: /Partner dashboard sections/i })).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);

    const guestPayload = signupPayload({ email: uniqueEmail("tab-guest") });
    await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    const guest = await login(request, guestPayload.email, guestPayload.password);
    await replaceStoredSession(page, guest, "/offers");
    await expect(page.getByRole("tablist", { name: /dashboard sections/i })).toHaveCount(0);
  });

  test("partner and admin dashboard KPI cards have visible labels and descriptions", async ({ page, request }) => {
    async function expectKpiCards(cards, expectedCount) {
      await expect(cards).toHaveCount(expectedCount);
      for (let index = 0; index < expectedCount; index += 1) {
        const card = cards.nth(index);
        await expect(card.locator(".stat-card__label")).toBeVisible();
        await expect(card.locator(".stat-card__label")).not.toHaveText(/^\s*$/);
        await expect(card.locator(".stat-card__value")).toBeVisible();
        await expect(card.locator(".stat-card__value")).not.toHaveText(/^\s*$/);
        await expect(card.locator(".stat-card__description")).toBeVisible();
        await expect(card.locator(".stat-card__description")).not.toHaveText(/^\s*$/);
      }
    }

    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    await replaceStoredSession(page, partner, "/partner");
    const existingPartnerAlert = page.getByRole("alertdialog");
    if (await existingPartnerAlert.isVisible().catch(() => false)) {
      await existingPartnerAlert.getByRole("button", { name: /^Acknowledge$/i }).click();
      await expect(existingPartnerAlert).toBeHidden();
    }
    await expectKpiCards(page.locator("#partner-overview > .wide-panel [data-kpi-card]"), 6);
    await expect(page.getByRole("heading", { name: /^Urgent actions$/i })).toBeVisible();
    const leadsPanel = page.getByRole("heading", { name: /^Reservation requests$/i }).locator("xpath=ancestor::article[1]").first();
    await expectKpiCards(leadsPanel.locator(".owner-value-grid > [data-kpi-card]"), 2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/partner");
    await expectKpiCards(page.locator("#partner-overview > .wide-panel [data-kpi-card]"), 6);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);

    const admin = await login(request, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await page.setViewportSize({ width: 1280, height: 900 });
    await replaceStoredSession(page, admin, "/admin");
    await expectKpiCards(page.locator("#admin-stats [data-kpi-card]"), 9);
  });

  test("partner dashboard overview and analytics are compact and Hungarian-ready", async ({ page, request }) => {
    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    await page.goto("/");
    await page.evaluate((storedSession) => {
      localStorage.setItem("smarttable.lang", "hu");
      localStorage.setItem("smarttable.session", JSON.stringify({
        ...storedSession,
        expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
      }));
      sessionStorage.removeItem("smarttable.session");
    }, partner);
    await page.goto("/partner");
    const existingPartnerAlert = page.getByRole("alertdialog");
    if (await existingPartnerAlert.isVisible().catch(() => false)) {
      await existingPartnerAlert.getByRole("button", { name: /Acknowledge|Tudomásul/i }).click();
      await expect(existingPartnerAlert).toBeHidden();
    }

    for (const tab of ["Áttekintés", "Foglalások", "Ajánlatok", "Étteremprofil", "Asztalok és kapacitás", "Elérhetőség", "Értesítések", "Analitika és riportok"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
    const overviewKpis = page.locator("#partner-overview > .wide-panel [data-kpi-card]");
    for (const label of ["Mai foglalások", "Függőben lévő kérelmek", "Mai vendégek", "Aktív ajánlatok", "Elfogadott foglalások", "Elutasított vagy lemondott"]) {
      await expect(overviewKpis.filter({ hasText: label })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Sürgős teendők" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Étterem-egészségpontszám" })).toBeVisible();
    await expect(page.locator("#partner-overview")).not.toContainText("Reservation leads");
    await expect(page.locator("#partner-overview .analytics-chart-card")).toHaveCount(0);

    await page.getByRole("link", { name: "Foglalások kezelése" }).first().click();
    await expect(page).toHaveURL(/\/partner\/reservations$/);
    await page.goto("/partner");

    await page.getByRole("tab", { name: "Analitika és riportok" }).click();
    await expect(page).toHaveURL(/\/partner\/analytics$/);
    for (const text of ["Időtartam", "Kezdő dátum", "Záró dátum", "Ajánlat", "Foglalási állapot", "Nap", "Napszak"]) {
      await expect(page.locator("#partnerAnalyticsFilters")).toContainText(text);
    }
    for (const label of ["Összes foglalás", "Foglalási konverzió", "Új vendégek", "Visszatérő vendégek", "Lemondási arány", "No-show arány", "Átlagos vendégszám", "Átlagos foglalási előidő"]) {
      await expect(page.locator("#partner-analytics [data-kpi-card]").filter({ hasText: label })).toBeVisible();
    }
    await expect(page.getByText("Részletes elemzések")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ajánlatok teljesítménye" })).toBeVisible();
    await expect(page.locator("[data-offer-analytics-sort='views']").first()).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: "Analitika és riportok" })).toHaveAttribute("aria-selected", "true");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/partner");
    await expect(page.getByRole("tablist", { name: /Partner dashboard sections|Partner felület/i })).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);
  });

  test("signup, login, logout, and forgot-password work", async ({ page, request }) => {
    const payload = signupPayload();
    const signup = await json(await request.post("/api/auth/signup-guest", { data: payload }));
    expect(signup.response.status(), JSON.stringify(signup.payload)).toBe(201);
    expect(signup.payload.profile?.email || signup.payload.user?.email).toBe(payload.email);

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(payload.email);
    await page.locator("input[name='password']").fill(payload.password);
    await page.getByRole("button", { name: /^Sign In$/i }).click();
    await expect(page).toHaveURL(/\/account/);
    await expect(page.locator("body")).toContainText(/Overview|My Account|Reservations/i);

    await page.getByRole("button", { name: /My Account/i }).click();
    await page.getByRole("menuitem", { name: /Sign Out/i }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/forgot-password");
    await page.getByLabel(/email/i).fill(payload.email);
    await page.getByRole("button", { name: /Send reset email/i }).click();
    await expect(page.locator("body")).toContainText(/Request received|reset message/i);
  });

  test("visible login forms route authenticated users to their role dashboards", async ({ page, request }) => {
    const guestPayload = signupPayload({ email: uniqueEmail("role-routing-guest") });
    const guestSignup = await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    expect(guestSignup.response.status(), JSON.stringify(guestSignup.payload)).toBe(201);

    for (const loginPath of ["/login", "/partner", "/admin", "/superadmin"]) {
      await page.goto(loginPath);
      await expect(page.locator("[data-login-diagnostics]")).toHaveCount(0);
      await expect(page.getByText(/Login diagnostics/i)).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/Supabase project ref|Auth request status|Selected redirect route|Resolved role/i);
      await expect(page.evaluate(() => ({
        status: window.__smartTableLastAuthStatus,
        error: window.__smartTableLastAuthErrorCode,
        route: window.__smartTableLastSelectedRedirectRoute
      }))).resolves.toEqual({});
    }

    const routes = [
      { path: "/login", email: guestPayload.email, password: guestPayload.password, expected: "/account" },
      { path: "/login", email: TEST_ACCOUNTS.partner.email, password: TEST_ACCOUNTS.partner.password, expected: "/partner" },
      { path: "/partner", email: TEST_ACCOUNTS.partner.email, password: TEST_ACCOUNTS.partner.password, expected: "/partner" },
      { path: "/login", email: TEST_ACCOUNTS.admin.email, password: TEST_ACCOUNTS.admin.password, expected: "/admin" },
      { path: "/admin", email: TEST_ACCOUNTS.admin.email, password: TEST_ACCOUNTS.admin.password, expected: "/admin" },
      { path: "/login", email: TEST_ACCOUNTS.superadmin.email, password: TEST_ACCOUNTS.superadmin.password, expected: "/superadmin" },
      { path: "/superadmin", email: TEST_ACCOUNTS.superadmin.email, password: TEST_ACCOUNTS.superadmin.password, expected: "/superadmin" }
    ];

    for (const route of routes) {
      await signInThroughVisibleForm(page, route.path, route.email, route.password);
      await expectAuthenticatedRoute(page, route.expected);
      await page.reload();
      await expectAuthenticatedRoute(page, route.expected);
      await signOutFromVisibleSession(page);
    }

    await signInThroughVisibleForm(page, "/login", TEST_ACCOUNTS.partner.email, "not-the-right-password");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
  });

  test("simplified guest signup keeps preferences optional", async ({ page, request }) => {
    const duplicatePayload = signupPayload({ email: uniqueEmail("duplicate-ui") });
    const duplicateSignup = await json(await request.post("/api/auth/signup-guest", { data: duplicatePayload }));
    expect(duplicateSignup.response.status(), JSON.stringify(duplicateSignup.payload)).toBe(201);

    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /Create your SmartTable account/i })).toBeVisible();
    await expect(page.locator("input[name='full_name']")).toBeVisible();
    await expect(page.locator("input[name='email']")).toBeVisible();
    await expect(page.locator("input[name='password']")).toBeVisible();
    await expect(page.locator("input[name='confirm_password']")).toBeVisible();
    await expect(page.locator("input[name='phone']")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/Preferred cuisines|Maximum preferred travel distance|Typical dining companions/i);

    await page.getByRole("button", { name: /^Create account$/i }).click();
    await expect(page.locator("body")).toContainText(/required|obligatorio/i);

    await page.locator("input[name='full_name']").fill("E2E Quick Guest");
    await page.locator("input[name='email']").fill(duplicatePayload.email);
    await page.locator("input[name='password']").fill("Strong!12345");
    await page.locator("input[name='confirm_password']").fill("Different!12345");
    await page.locator("input[type='checkbox'][name='legal_consent']").check();
    await page.getByRole("button", { name: /^Create account$/i }).click();
    await expect(page.locator("body")).toContainText(/Passwords must match/i);

    await page.locator("input[name='confirm_password']").fill("Strong!12345");
    await page.getByRole("button", { name: /^Create account$/i }).click();
    await expect(page.locator("body")).toContainText(/An account already exists with this email address/i);

    await page.locator("input[name='email']").fill(uniqueEmail("quick-ui"));
    const legalCheckbox = page.locator("input[type='checkbox'][name='legal_consent']");
    await legalCheckbox.scrollIntoViewIfNeeded();
    const beforePolicyScroll = await page.evaluate(() => window.scrollY);
    await legalCheckbox.evaluate((node) => node.click());
    await legalCheckbox.evaluate((node) => node.click());
    const afterPolicyScroll = await page.evaluate(() => window.scrollY);
    expect(afterPolicyScroll).toBeGreaterThan(0);
    expect(Math.abs(afterPolicyScroll - beforePolicyScroll)).toBeLessThanOrEqual(8);
    await page.getByRole("button", { name: /^Create account$/i }).click();
    await expect(page).toHaveURL(/\/(account|signup\/check-email)/);

    if (/\/signup\/check-email/.test(page.url())) {
      await expect(page.getByRole("heading", { name: /Check your email/i })).toBeVisible();
      await expect(page.locator("body")).toContainText(/confirmation link/i);
    } else {
      await expect(page.locator("body")).toContainText(/Welcome to SmartTable|Profile completion/i);
      await page.getByRole("button", { name: /Personalize my profile/i }).click();
      await expect(page).toHaveURL(/\/account\/preferences/);
      await expect(page.locator("body")).toContainText(/Location/i);
      await expect(page.locator("body")).toContainText(/Food and dining preferences/i);
      await expect(page.locator("body")).toContainText(/Notifications/i);
      await expect(page.getByLabel(/No neighborhood preference/i)).toBeVisible();
      await expect(page.locator("body")).toContainText(/Solo/i);
    }
  });

  test("email confirmation routes show explicit success and error screens", async ({ page }) => {
    await page.goto("/auth/callback");
    await expect(page.getByRole("heading", { name: /Confirmation link problem/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/missing required information|confirmation link/i);
    await expect(page.getByRole("button", { name: /Return to signup/i })).toBeVisible();

    await page.goto("/signup/welcome");
    await expect(page.getByRole("heading", { name: /Email confirmed/i })).toBeVisible();
    await expect(page.locator("body")).toContainText(/SmartTable account is ready/i);
    await expect(page.getByRole("button", { name: /Browse offers/i })).toBeVisible();
    await page.getByRole("button", { name: /Personalize my profile/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("restaurant creation, offer lifecycle, reservation flow, and favorites work", async ({ page, request }) => {
    const admin = await login(request, TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);
    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    const restaurantStamp = stamp();
    const phoneSuffix = restaurantStamp.replace(/\D/g, "").slice(-4).padStart(4, "0");

    const restaurant = await json(await request.post("/api/admin/restaurants", {
      headers: authHeaders(admin),
      data: {
        name: `E2E Restaurant ${restaurantStamp}`,
        email: uniqueEmail("restaurant"),
        phone: `+1 212 555 ${phoneSuffix}`,
        address: `${phoneSuffix} Test Street, New York, NY`,
        district: "West Village",
        cuisine_type: "American",
        description: "Controlled Playwright test restaurant.",
        status: "active"
      }
    }));
    expect(restaurant.response.status(), JSON.stringify(restaurant.payload)).toBe(201);
    expect(restaurant.payload.restaurant?.id).toBeTruthy();

    const offer = await createFutureOffer(request, partner);
    const edited = await json(await request.patch("/api/partner/offers", {
      headers: authHeaders(partner),
      data: { id: offer.id, discount_value: 25, title_en: `${offer.title_en} edited` }
    }));
    expect(edited.response.status(), JSON.stringify(edited.payload)).toBe(200);
    expect(Number(edited.payload.offer.discount_value || edited.payload.offer.discount_percent)).toBe(25);

    const guestPayload = signupPayload({ email: uniqueEmail("reservation-guest") });
    const guestSignup = await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    expect(guestSignup.response.status(), JSON.stringify(guestSignup.payload)).toBe(201);
    const guest = await login(request, guestPayload.email, guestPayload.password);

    const favorite = await json(await request.post("/api/public/follow", {
      data: {
        restaurant_id: offer.restaurant_id,
        guest_email: guestPayload.email,
        guest_name: guestPayload.full_name,
        notification_enabled: true
      }
    }));
    expect([200, 201], JSON.stringify(favorite.payload)).toContain(favorite.response.status());
    expect(JSON.stringify(favorite.payload)).not.toContain(guestPayload.email);

    const favorites = await json(await request.get("/api/guest/favorites", { headers: authHeaders(guest) }));
    expect(favorites.response.status(), JSON.stringify(favorites.payload)).toBe(200);

    const reservation = await json(await request.post("/api/reservations", {
      headers: authHeaders(guest),
      data: {
        offer_id: offer.id,
        reservation_date: offer.offer_date,
        reservation_time: offer.start_time,
        party_size: 2,
        guest_name: guestPayload.full_name,
        guest_email: guestPayload.email,
        guest_phone: guestPayload.phone,
        guest_language: "en",
        notes: "Playwright E2E request"
      }
    }));
    expect(reservation.response.status(), JSON.stringify(reservation.payload)).toBe(201);
    expect(reservation.payload.reservation.status).toBe("pending");

    const accepted = await json(await request.patch("/api/partner/reservations", {
      headers: authHeaders(partner),
      data: { id: reservation.payload.reservation.reservation_id, status: "accepted" }
    }));
    expect(accepted.response.status(), JSON.stringify(accepted.payload)).toBe(200);
    expect(accepted.payload.reservation.status).toBe("accepted");

    const guestReservations = await json(await request.get("/api/guest/reservations", {
      headers: authHeaders(guest)
    }));
    expect(guestReservations.response.status(), JSON.stringify(guestReservations.payload)).toBe(200);
    expect(guestReservations.payload.reservations.some((row) => row.reservation_id === reservation.payload.reservation.reservation_id && row.status === "accepted")).toBe(true);

    const deleted = await json(await request.delete("/api/partner/offers", {
      headers: authHeaders(partner),
      data: { id: offer.id }
    }));
    expect(deleted.response.status(), JSON.stringify(deleted.payload)).toBe(200);

    await page.goto("/restaurants");
    await expect(page.locator("body")).not.toContainText("could not load this screen");
  });

  test("admin restaurant create is visible immediately after duplicate override", async ({ page, request }) => {
    const admin = await login(request, TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);
    const existing = await json(await request.get("/api/admin/restaurants", { headers: authHeaders(admin) }));
    expect(existing.response.status(), JSON.stringify(existing.payload)).toBe(200);
    const duplicateSource = (existing.payload.restaurants || []).find((restaurant) => restaurant.address) || {};
    const restaurantStamp = stamp();
    const restaurantName = `E2E Visible Create ${restaurantStamp}`;
    const slug = `e2e-visible-create-${restaurantStamp.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 80);
    const overrideReason = `E2E duplicate override ${restaurantStamp}`;

    await replaceStoredSession(page, admin, "/admin/restaurants");
    await page.locator("#restaurantForm").waitFor();
    const countBeforeText = await page.locator(".restaurant-list-summary").innerText();
    const countBefore = Number(countBeforeText.match(/\d+/)?.[0] || 0);
    await page.locator('#adminRestaurantFilters [name="status"]').selectOption("active");
    await page.locator('#adminRestaurantFilters [name="testData"]').selectOption("production");
    await expect(page.locator('#adminRestaurantFilters [name="status"]')).toHaveValue("active");

    const form = page.locator("#restaurantForm");
    await form.locator('[name="name"]').fill(restaurantName);
    await form.locator('[name="slug"]').fill(slug);
    await form.locator('[name="email"]').fill(uniqueEmail("e2e-visible-restaurant"));
    await form.locator('[name="reservation_email"]').fill(uniqueEmail("e2e-visible-reservation"));
    await form.locator('[name="address"]').fill(duplicateSource.address || `${restaurantStamp} Visible Test Street`);
    await form.locator('[name="city"]').fill(duplicateSource.city || "New York");
    await form.locator('[name="country"]').fill(duplicateSource.country || "US");
    await form.locator('[name="district"]').fill(duplicateSource.district || "West Village");
    await form.locator('[name="cuisine_type"]').fill("American");
    await form.locator('[name="short_description"]').fill("E2E visible restaurant create test.");
    await form.locator('[name="full_description"]').fill("E2E visible restaurant create test.");
    await form.locator('[name="status"]').selectOption("draft");
    await form.locator('[name="is_test_data"]').check();

    const postResponses = [];
    page.on("response", (response) => {
      const requestInfo = response.request();
      if (requestInfo.method() === "POST" && response.url().includes("/api/admin/restaurants") && (requestInfo.postData() || "").includes(restaurantName)) {
        postResponses.push(response);
      }
    });
    page.once("dialog", async (dialog) => {
      await dialog.accept(overrideReason);
    });
    const finalCreate = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && response.status() === 201
      && response.url().includes("/api/admin/restaurants")
      && (response.request().postData() || "").includes(restaurantName)
    );
    await form.locator('button[type="submit"]').click();
    const response = await finalCreate;
    const payload = await response.json();
    const restaurantId = payload.restaurant?.id;
    expect(restaurantId).toBeTruthy();
    expect(payload.persisted).toBe(true);
    await expect(page.locator(`[data-restaurant-row="${restaurantId}"]`)).toBeVisible();
    await expect(page.locator(`[data-restaurant-row="${restaurantId}"]`)).toHaveClass(/admin-created-restaurant-highlight/);
    await expect(page.locator('#adminRestaurantFilters [name="status"]')).toHaveValue("all");
    await expect(page.locator('#adminRestaurantFilters [name="testData"]')).toHaveValue("all");
    await expect(page.locator(".restaurant-list-summary")).toContainText(`${countBefore + 1} restaurants`);

    const responseSummaries = await Promise.all(postResponses.map(async (item) => ({
      status: item.status(),
      postData: item.request().postData() || "",
      body: await item.json().catch(() => ({}))
    })));
    expect(responseSummaries.filter((item) => item.status === 409 && item.body.code === "DUPLICATE_RESTAURANT_POSSIBLE")).toHaveLength(1);
    expect(responseSummaries.filter((item) => item.postData.includes('"duplicate_override":true') && item.postData.includes(overrideReason))).toHaveLength(1);
  });

  test("admin login and role permissions are enforced", async ({ request }) => {
    const guestPayload = signupPayload({ email: uniqueEmail("permission-guest") });
    await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    const guest = await login(request, guestPayload.email, guestPayload.password);
    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    const admin = await login(request, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const superAdmin = await login(request, TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);

    const guestAdmin = await request.get("/api/admin/stats", { headers: authHeaders(guest) });
    expect(guestAdmin.status()).toBe(403);

    const partnerAdmin = await request.get("/api/admin/stats", { headers: authHeaders(partner) });
    expect(partnerAdmin.status()).toBe(403);

    const adminStats = await request.get("/api/admin/stats", { headers: authHeaders(admin) });
    expect(adminStats.status()).toBe(200);

    const regularFeatureFlagUpdate = await request.patch("/api/admin/feature-flags", {
      headers: authHeaders(admin),
      data: { key: "ai_concierge", status: "demo_only", enabled: false }
    });
    expect(regularFeatureFlagUpdate.status()).toBe(403);

    const superFeatureFlags = await request.get("/api/admin/feature-flags", { headers: authHeaders(superAdmin) });
    expect(superFeatureFlags.status()).toBe(200);
  });

  test("guest, partner, admin, and super-admin browser routes render", async ({ page, request }) => {
    const guestPayload = signupPayload({ email: uniqueEmail("route-guest") });
    await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    const guest = await login(request, guestPayload.email, guestPayload.password);
    await storeSession(page, guest);
    for (const path of ["/account", "/account/profile", "/account/reservations", "/account/favorites", "/account/notifications"]) {
      await expectRouteHealthy(page, path);
    }

    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    await storeSession(page, partner);
    for (const path of ["/partner", "/partner/profile", "/partner/offers", "/partner/food-feed", "/partner/reservations", "/partner/capacity", "/partner/availability", "/partner/notifications", "/partner/analytics"]) {
      await expectRouteHealthy(page, path);
      await expect(page.locator("body")).not.toContainText("Super Admin");
    }

    const admin = await login(request, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await storeSession(page, admin);
    for (const path of ["/admin", "/admin/restaurants", "/admin/offers", "/admin/food-feed", "/admin/users", "/admin/notifications", "/admin/content", "/admin/reports", "/admin/audit"]) {
      await expectRouteHealthy(page, path);
    }
    await page.goto("/admin/food-feed");
    await expect(page.locator("#adminFoodFeedForm")).toHaveCount(0);
    await page.goto("/superadmin");
    await expect(page.locator("body")).toContainText("You do not have access to this area");

    const superAdmin = await login(request, TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);
    await storeSession(page, superAdmin);
    for (const path of ["/superadmin", "/superadmin/settings", "/superadmin/restaurants", "/superadmin/food-feed", "/superadmin/reports", "/admin/platform-settings", "/admin/content", "/admin/notifications"]) {
      await expectRouteHealthy(page, path);
    }
    await page.goto("/superadmin/food-feed");
    await expect(page.locator("#adminFoodFeedForm")).toBeVisible();
    await expect(page.locator('#adminFoodFeedForm input[type="file"]')).toHaveAttribute("accept", /image\/jpeg/);
  });

  test("partner reservation alert UI shows new requests without accepting them", async ({ page, request }) => {
    await page.addInitScript(() => {
      window.__reservationAlertVibrationCalls = [];
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        value(pattern) {
          window.__reservationAlertVibrationCalls.push(pattern);
          return true;
        }
      });
    });
    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    await storeSession(page, partner);
    await page.goto("/partner/notifications");
    await expect(page.getByRole("heading", { name: /Immediate reservation alerts/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Send Test Alert/i })).toBeVisible();
    await expect(page.getByText(/Voice call escalation/i)).toBeVisible();

    const admin = await login(request, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    await storeSession(page, admin);
    await page.goto("/admin/notifications");
    await expect(page.getByRole("heading", { name: /Partner alert delivery/i })).toBeVisible();
    await expect(page.getByText(/Voice call escalation/i)).toBeVisible();
    await expect(page.getByText(/Restaurants with voice escalation/i)).toBeVisible();

    const alertSettings = await json(await request.patch("/api/partner/notification-settings", {
      headers: authHeaders(partner),
      data: {
        dashboard_popup_enabled: true,
        sound_enabled: true,
        push_enabled: true
      }
    }));
    expect(alertSettings.response.status(), JSON.stringify(alertSettings.payload)).toBe(200);
    expect(alertSettings.payload.preferences?.push_enabled).toBe(true);

    await storeSession(page, partner);
    await page.goto("/partner/notifications");
    await expect(page.getByLabel(/Web push notification/i)).toBeChecked();

    const offer = await createFutureOffer(request, partner, {
      title_en: `Alert E2E table ${stamp()}`,
      offer_date: "2026-12-16",
      start_time: "19:00",
      end_time: "20:30",
      available_tables: 2,
      max_party_size: 4
    });
    const guestPayload = signupPayload({ email: uniqueEmail("alert-guest") });
    const guestSignup = await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    expect(guestSignup.response.status(), JSON.stringify(guestSignup.payload)).toBe(201);
    const guest = await login(request, guestPayload.email, guestPayload.password);

    const reservation = await json(await request.post("/api/reservations", {
      headers: authHeaders(guest),
      data: {
        offer_id: offer.id,
        reservation_date: offer.offer_date,
        reservation_time: offer.start_time,
        party_size: 2,
        guest_name: guestPayload.full_name,
        guest_email: guestPayload.email,
        guest_phone: guestPayload.phone,
        guest_language: "en",
        notes: "Playwright reservation alert request"
      }
    }));
    expect(reservation.response.status(), JSON.stringify(reservation.payload)).toBe(201);
    expect(reservation.payload.reservation_alert?.status).toBe("sent");

    await expect.poll(async () => page.evaluate(() => window.__reservationAlertVibrationCalls.length), {
      timeout: 10_000
    }).toBeGreaterThan(0);
    await expect.poll(async () => page.evaluate(() => window.__reservationAlertVibrationCalls.at(-1)), {
      timeout: 10_000
    }).toEqual([250, 100, 250, 100, 500]);

    await page.goto("/partner");
    const alertDialog = page.getByRole("alertdialog", { name: /New reservation request/i });
    await expect(alertDialog).toBeVisible();
    await expect(alertDialog).toContainText(reservation.payload.reservation.reference);
    await expect(alertDialog).toContainText("Guest contact details are hidden in this preview");
    await expect(alertDialog.getByRole("button", { name: /^Accept$/i })).toBeVisible();
    await expect(alertDialog.getByRole("button", { name: /^Decline$/i })).toBeVisible();
    const currentReference = reservation.payload.reservation.reference;
    await alertDialog.getByRole("button", { name: /^Acknowledge$/i }).click();
    await expect(page.locator(".reservation-alert-card").filter({ hasText: currentReference })).toHaveCount(0);

    const partnerReservations = await json(await request.get("/api/partner/reservations", {
      headers: authHeaders(partner)
    }));
    expect(partnerReservations.response.status(), JSON.stringify(partnerReservations.payload)).toBe(200);
    const saved = partnerReservations.payload.reservations.find((row) => row.reservation_id === reservation.payload.reservation.reservation_id);
    expect(saved?.status).toBe("pending");
  });

  test("verified post-visit workflow reaches guest review submission", async ({ page, request }) => {
    const partner = await login(request, TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
    const offer = await createFutureOffer(request, partner, {
      title_en: `Verified review E2E ${stamp()}`,
      offer_date: "2026-12-18",
      start_time: "18:15",
      end_time: "19:45",
      available_tables: 2,
      max_party_size: 4
    });
    const guestPayload = signupPayload({ email: uniqueEmail("post-visit-guest") });
    const guestSignup = await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    expect(guestSignup.response.status(), JSON.stringify(guestSignup.payload)).toBe(201);
    const guest = await login(request, guestPayload.email, guestPayload.password);

    const reservation = await json(await request.post("/api/reservations", {
      headers: authHeaders(guest),
      data: {
        offer_id: offer.id,
        reservation_date: offer.offer_date,
        reservation_time: offer.start_time,
        party_size: 2,
        guest_name: guestPayload.full_name,
        guest_email: guestPayload.email,
        guest_phone: guestPayload.phone,
        guest_language: "en",
        notes: "Playwright verified post-visit request"
      }
    }));
    expect(reservation.response.status(), JSON.stringify(reservation.payload)).toBe(201);
    const reservationId = reservation.payload.reservation.reservation_id;
    const reference = reservation.payload.reservation.reference;

    await storeSession(page, partner);
    await page.goto("/partner/reservations");
    let row = page.locator("tr").filter({ hasText: reference });
    await expect(row).toBeVisible();

    const accepted = await json(await request.patch("/api/partner/reservations", {
      headers: authHeaders(partner),
      data: { id: reservationId, status: "accepted" }
    }));
    expect(accepted.response.status(), JSON.stringify(accepted.payload)).toBe(200);
    await page.reload();
    row = page.locator("tr").filter({ hasText: reference });
    await expect(row).toContainText(/Accepted/i);

    const arrived = await json(await request.patch("/api/partner/reservations", {
      headers: authHeaders(partner),
      data: { id: reservationId, action: "mark_arrived" }
    }));
    expect(arrived.response.status(), JSON.stringify(arrived.payload)).toBe(200);
    await page.reload();
    row = page.locator("tr").filter({ hasText: reference });
    await expect(row).toContainText(/Arrival confirmed/i);
    await expect(row).toContainText(/Checked in/i);

    const completed = await json(await request.patch("/api/partner/reservations", {
      headers: authHeaders(partner),
      data: { id: reservationId, action: "mark_visit_completed" }
    }));
    expect(completed.response.status(), JSON.stringify(completed.payload)).toBe(200);
    await page.reload();
    row = page.locator("tr").filter({ hasText: reference });
    await expect(row).toContainText(/Visit completed/i);
    await expect(row).toContainText(/Verified SmartTable visit/i);

    const partnerRows = await json(await request.get("/api/partner/reservations", {
      headers: authHeaders(partner)
    }));
    expect(partnerRows.response.status(), JSON.stringify(partnerRows.payload)).toBe(200);
    const saved = partnerRows.payload.reservations.find((item) => item.reservation_id === reservationId);
    expect(saved?.status).toBe("completed");
    expect(saved?.visit_status).toBe("completed");
    expect(saved?.verified_visit).toBeTruthy();

    await replaceStoredSession(page, guest, "/account/reservations");
    const guestCard = page.locator(".reservation-history-card").filter({ hasText: reference });
    await expect(guestCard).toBeVisible();
    await expect(guestCard).toContainText(/Verified SmartTable visit/i);
    await guestCard.getByRole("button", { name: /Rate visit/i }).click();
    await expect(page).toHaveURL(/\/review\/verified\?reservation_id=/);
    await expect(page.getByRole("heading", { name: /Rate your visit/i })).toBeVisible();
    await page.locator(".star-rating-field", { hasText: /Food/i }).getByLabel("5 / 5").check();
    await page.locator(".star-rating-field", { hasText: /Service/i }).getByLabel("4 / 5").check();
    await page.locator(".star-rating-field", { hasText: /Atmosphere/i }).getByLabel("5 / 5").check();
    const reviewText = `Verified post-visit E2E review ${stamp()}.`;
    const partnerResponseText = `Thank you for visiting us, E2E guest ${stamp()}.`;
    await page.getByLabel(/Written review/i).fill(reviewText);
    await page.getByLabel(/Visit duration/i).selectOption("105");
    await page.getByRole("button", { name: /Submit review/i }).click();
    await expect(page.locator(".success-banner").filter({ hasText: /Your verified review was submitted for moderation/i })).toBeVisible();

    const duplicate = await json(await request.post("/api/guest/reviews/verified", {
      headers: authHeaders(guest),
      data: {
        reservation_id: reservationId,
        food_rating: 5,
        service_rating: 5,
        atmosphere_rating: 5
      }
    }));
    expect(duplicate.response.status(), JSON.stringify(duplicate.payload)).toBe(409);

    await acknowledgePartnerReservationAlerts(request, partner);
    await replaceStoredSession(page, partner, "/partner/reviews");
    await dismissReservationAlerts(page);
    const partnerReviewRow = page.locator("tr").filter({ hasText: reviewText });
    await expect(partnerReviewRow).toBeVisible();
    await expect(partnerReviewRow.locator(".partner-review-response-form")).toBeVisible();
    await partnerReviewRow.getByLabel(/Your response/i).fill(partnerResponseText);
    await page.waitForTimeout(350);
    await dismissReservationAlerts(page);
    await partnerReviewRow.getByRole("button", { name: /Send for approval/i }).click();
    await expect(page.locator(".toast").filter({ hasText: /Restaurant response sent for approval/i })).toBeVisible();

    const partnerReviews = await json(await request.get("/api/partner/reviews", {
      headers: authHeaders(partner)
    }));
    expect(partnerReviews.response.status(), JSON.stringify(partnerReviews.payload)).toBe(200);
    const savedReview = partnerReviews.payload.reviews.find((item) => String(item.written_review || "").includes(reviewText));
    expect(savedReview?.restaurant_response?.text).toBe(partnerResponseText);
    expect(savedReview?.restaurant_response?.status).toBe("pending_moderation");

    const admin = await login(request, TEST_ACCOUNTS.admin.email, TEST_ACCOUNTS.admin.password);
    const approved = await json(await request.patch("/api/admin/reviews", {
      headers: authHeaders(admin),
      data: { id: savedReview.id, status: "approved" }
    }));
    expect(approved.response.status(), JSON.stringify(approved.payload)).toBe(200);

    const publishedResponse = await json(await request.patch("/api/admin/reviews", {
      headers: authHeaders(admin),
      data: { id: savedReview.id, response_status: "published" }
    }));
    expect(publishedResponse.response.status(), JSON.stringify(publishedResponse.payload)).toBe(200);
    expect(publishedResponse.payload.review.restaurant_response.status).toBe("published");
    expect(publishedResponse.payload.review.restaurant_response.text).toBe(partnerResponseText);

    const publicReviews = await json(await request.get(`/api/public/restaurants/reviews?restaurant_id=${encodeURIComponent(savedReview.restaurant_id)}`));
    expect(publicReviews.response.status(), JSON.stringify(publicReviews.payload)).toBe(200);
    const publicReview = publicReviews.payload.reviews.find((item) => item.id === savedReview.id);
    expect(publicReview?.restaurant_response?.text).toBe(partnerResponseText);
  });

  test("mobile public and account routes do not create horizontal overflow", async ({ page, request }) => {
    const guestPayload = signupPayload({ email: uniqueEmail("mobile-guest") });
    const signup = await json(await request.post("/api/auth/signup-guest", { data: guestPayload }));
    expect(signup.response.status()).toBe(201);
    const session = await login(request, guestPayload.email, guestPayload.password);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);

    await page.addInitScript((storedSession) => {
      localStorage.setItem("smarttable.session", JSON.stringify({
        ...storedSession,
        expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000
      }));
    }, session);
    await page.goto("/account");
    await expect(page.locator("body")).toContainText(/Overview|Reservations|Account & Privacy/i);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).resolves.toBe(true);
  });
});
