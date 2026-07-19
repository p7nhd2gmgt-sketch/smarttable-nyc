import {
  PLATFORM_FEATURE_REGISTRY as defaultFeatureRegistry,
  PLATFORM_MODES as platformModes,
  SUPPORTED_LANGUAGE_CONFIG as supportedLanguages,
  normalizeBooleanSetting,
  normalizeFeatureFlagSettings,
  normalizeLanguage,
  normalizePlatformMode
} from "./shared-contracts.js";
import { requestJson } from "./api-client.js";
import { adminDashboardLayout } from "./admin/layout.js";
import { guestHeroLayout } from "./guest/layout.js";
import { partnerDashboardLayout } from "./partner/layout.js";
import { appAreaShell, heroLayoutShell } from "./shared/layout-shells.js";
import { partnerAiMockData } from "./partner-ai-mock-data.js";

function initialLanguage() {
  const stored = localStorage.getItem("smarttable.lang");
  if (stored) return normalizeLanguage(stored);
  const browserLang = normalizeLanguage(navigator.language || navigator.languages?.[0] || "en");
  return browserLang === "hu" ? "hu" : browserLang === "es" ? "es" : "en";
}

function readStoredJson(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function clearStoredSession() {
  localStorage.removeItem("smarttable.session");
  sessionStorage.removeItem("smarttable.session");
}

function demoTokenExpiry(accessToken = "") {
  if (!String(accessToken).startsWith("demo.")) return null;
  try {
    const encoded = String(accessToken).slice(5).replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded));
    return Number(payload.exp) || null;
  } catch {
    return null;
  }
}

function sessionExpiryMs(session = {}) {
  const raw = session.expires_at || session.expiresAt;
  if (raw) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric > 100000000000 ? numeric : numeric * 1000;
    const parsed = new Date(raw).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return demoTokenExpiry(session.access_token);
}

function isSessionExpired(session) {
  const expiry = sessionExpiryMs(session);
  return Boolean(expiry && expiry <= Date.now());
}

function withSessionExpiry(session, remember = true) {
  if (!session) return null;
  const existingExpiry = sessionExpiryMs(session);
  const fallbackMs = remember ? 30 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const expiresAt = existingExpiry || (session.expires_in ? Date.now() + Number(session.expires_in) * 1000 : Date.now() + fallbackMs);
  return { ...session, expires_at: expiresAt };
}

function storedSession() {
  const candidates = [
    readStoredJson(localStorage, "smarttable.session"),
    readStoredJson(sessionStorage, "smarttable.session")
  ].filter(Boolean);
  const session = candidates.find((candidate) => !isSessionExpired(candidate));
  if (!session && candidates.length) clearStoredSession();
  return session || null;
}

const state = {
  mode: "guest",
  lang: initialLanguage(),
  translations: {},
  fallbackTranslations: {},
  apiMode: "loading",
  session: storedSession(),
  signup: null,
  signupSuccess: null,
  guestLogin: {
    showPassword: false,
    submitting: false,
    error: "",
    rememberMe: false
  },
  guestPasswordReset: {
    submitting: false,
    emailSent: false,
    demoToken: "",
    error: "",
    showPassword: false,
    showConfirmPassword: false,
    success: false
  },
  guestAccount: null,
  guestReservations: [],
  guestFavorites: [],
  guestNotifications: [],
  guestPrivacy: null,
  reservationSubmitting: false,
  guestAccountTab: "overview",
  guestReservationFilter: "all",
  partnerReservationFilters: {
    status: "all",
    date: "",
    search: ""
  },
  adminReservationFilters: {
    status: "all",
    date: "",
    search: ""
  },
  guestPreferenceErrors: {},
  guestSecurity: {
    showCurrentPassword: false,
    showNewPassword: false,
    showConfirmPassword: false,
    changeSubmitting: false,
    deletionSubmitting: false,
    exportSubmitting: false,
    message: ""
  },
  showAccountMenu: false,
  postLoginRedirect: "",
  originalAdminSession: null,
  content: {},
  contentRows: [],
  featureStatus: [],
  offers: [],
  config: {},
  platformMode: "basic",
  aiDemoVisibility: false,
  showAiModeBadge: true,
  featureFlags: normalizeFeatureFlagSettings(),
  featureRegistry: defaultFeatureRegistry,
  aiProfileKey: localStorage.getItem("smarttable.aiProfileKey") || (() => {
    const key = `guest-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    localStorage.setItem("smarttable.aiProfileKey", key);
    return key;
  })(),
  aiPreferences: null,
  aiRecommendations: [],
  aiWizardOpen: false,
  aiDemandForecast: null,
  aiRoutePlan: null,
  aiEventPlan: null,
  aiConsumptionResult: JSON.parse(localStorage.getItem("smarttable.aiConsumptionResult") || "null"),
  loyaltyStatus: JSON.parse(localStorage.getItem("smarttable.loyaltyStatus") || "null"),
  rewardBookingContext: null,
  adminPhotoSubmissions: [],
  partnerPhotoSubmissions: [],
  partnerFeedbackInsights: null,
  restaurantIntelligence: null,
  platformTrends: null,
  partnerPortfolioFilter: "all",
  partnerMarketingMessage: localStorage.getItem("smarttable.partnerMarketingMessage") || "Tonight only: enjoy 20% off your early dinner reservation at our restaurant. Limited tables available.",
  viewMode: "list",
  filters: {
    neighborhood: "",
    cuisine: "",
    discount: "",
    date: "",
    time: "",
    partySize: "",
    restaurantName: "",
    availableOnly: true,
    sort: "recommended"
  },
  reservationModal: null,
  restaurantDetail: null,
  modalScrollY: 0,
  modalReturnFocusSelector: "",
  followModal: null,
  reviewModal: null,
  reservationSuccess: null,
  newestRestaurants: [],
  restaurants: [],
  reservations: [],
  partners: [],
  adminOffers: [],
  adminReviews: [],
  notifications: [],
  unreadNotifications: 0,
  adminIntegrations: null,
  adminFeatureFlags: [],
  adminErrors: null,
  adminBilling: null,
  systemChecklists: null,
  privacyRequests: [],
  showNotifications: false,
  contentSearch: "",
  contentEditKey: null,
  partnerProfile: null,
  partnerStats: null,
  partnerAiRecommendation: null,
  partnerIntegrations: null,
  partnerImports: null,
  offersMine: [],
  stats: null,
  partnerAiActionHistory: JSON.parse(localStorage.getItem("smarttable.partnerAiActionHistory") || "[]"),
  activeOfferId: null,
  advisorOpen: false,
  advisorTyping: false,
  advisorMessages: [],
  partnerAiActionNotice: "",
  mapInstance: null,
  mapMarkers: []
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const sessionButton = document.querySelector("#sessionButton");
const signupNav = document.querySelector("#signupNav");

function hasGuestModalOpen() {
  return Boolean(state.reservationModal || state.restaurantDetail || state.followModal || state.reviewModal || state.reservationSuccess || state.aiWizardOpen);
}

function safeCssValue(value) {
  if (window.CSS?.escape) return CSS.escape(String(value || ""));
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function modalReturnSelector(trigger) {
  if (!trigger) return "";
  const restaurantId = trigger.dataset.openRestaurant || trigger.dataset.newestRestaurant || trigger.dataset.favoriteDetail || trigger.dataset.restaurant || "";
  if (trigger.dataset.openRestaurant) return `[data-open-restaurant="${safeCssValue(restaurantId)}"]`;
  if (trigger.dataset.newestRestaurant) return `[data-newest-restaurant="${safeCssValue(restaurantId)}"]`;
  if (trigger.dataset.favoriteDetail) return `[data-favorite-detail="${safeCssValue(restaurantId)}"]`;
  if (trigger.dataset.openReserve) return `[data-open-reserve="${safeCssValue(trigger.dataset.openReserve)}"][data-restaurant="${safeCssValue(restaurantId)}"]`;
  return "";
}

function prepareGuestModalOpen(trigger) {
  if (!document.body.classList.contains("modal-open")) state.modalScrollY = window.scrollY || window.pageYOffset || 0;
  const selector = modalReturnSelector(trigger);
  if (selector) state.modalReturnFocusSelector = selector;
}

function restoreGuestModalFocus() {
  const selector = state.modalReturnFocusSelector;
  state.modalReturnFocusSelector = "";
  if (!selector) return;
  requestAnimationFrame(() => {
    const target = document.querySelector(selector);
    if (target) target.focus({ preventScroll: true });
  });
}

function syncGuestModalState() {
  const modal = document.querySelector("#app .modal-backdrop .modal-card");
  if (modal) {
    if (!document.body.classList.contains("modal-open")) {
      document.body.style.top = `-${state.modalScrollY || 0}px`;
      document.body.classList.add("modal-open");
    }
    requestAnimationFrame(() => {
      if (!modal.contains(document.activeElement)) {
        const focusTarget = modal.querySelector(".restaurant-detail-body") || modal.querySelector("[data-close-modal]") || modal;
        focusTarget?.focus?.({ preventScroll: true });
      }
    });
    return;
  }

  if (document.body.classList.contains("modal-open")) {
    const restoreY = state.modalScrollY || Math.abs(parseInt(document.body.style.top || "0", 10)) || 0;
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, restoreY);
    state.modalScrollY = 0;
    restoreGuestModalFocus();
  }
}

function closeGuestModal() {
  state.reservationModal = null;
  state.restaurantDetail = null;
  state.followModal = null;
  state.reviewModal = null;
  state.reservationSuccess = null;
  state.aiWizardOpen = false;
  if (window.location.pathname.startsWith("/restaurants/")) history.pushState(null, "", "/restaurants");
  renderGuest();
}

function handleGuestModalKeydown(event) {
  const modal = document.querySelector("#app .modal-backdrop .modal-card");
  if (!modal || !hasGuestModalOpen()) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeGuestModal();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = Array.from(modal.querySelectorAll("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"))
    .filter((item) => item.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("keydown", handleGuestModalKeydown);

const dayLabels = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun"
};

const aiWizardOptions = {
  cuisines: ["Italian", "Japanese", "French", "American", "Mexican", "Greek", "Indian", "Mediterranean", "Thai", "Korean", "Spanish", "Vietnamese"],
  food_interests: ["Steak", "Seafood", "Sushi", "Pasta", "Pizza", "Vegan", "Vegetarian", "Healthy", "BBQ", "Burgers", "Fine Dining", "Casual Dining", "Small Plates", "Desserts"],
  drink_preferences: ["Wine", "Cocktails", "Beer", "Whiskey", "Coffee", "Mocktails"],
  atmospheres: ["Romantic", "Family", "Business", "Rooftop", "Outdoor", "Sports Bar", "Quiet", "Luxury", "Trendy"],
  dietary_restrictions: ["Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Nut allergy", "Halal", "Kosher"],
  preferred_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  preferred_time_windows: ["Before 5 PM", "5 PM - 7 PM", "7 PM - 9 PM", "After 9 PM"],
  occasions: ["Casual", "Date", "Business", "Birthday", "Anniversary", "Pre-theater", "After-event"],
  preferred_discount_range: ["10-15", "15-20", "20-30", "30-50"]
};

const signupSteps = [
  { key: "account", labelKey: "signup_step_account", fallback: "Account" },
  { key: "location", labelKey: "signup_step_location", fallback: "Location" },
  { key: "preferences", labelKey: "signup_step_preferences", fallback: "Food and drink preferences" },
  { key: "habits", labelKey: "signup_step_habits", fallback: "Dining habits" },
  { key: "budget", labelKey: "signup_step_budget", fallback: "Budget and discounts" },
  { key: "notifications", labelKey: "signup_step_notifications", fallback: "Notifications" },
  { key: "consent", labelKey: "signup_step_consent", fallback: "Review and consent" }
];

const signupAnalyticsEvents = new Set([
  "signup_started",
  "signup_step_completed",
  "signup_abandoned",
  "signup_completed",
  "preference_selected",
  "terms_accepted",
  "privacy_accepted",
  "marketing_consent_given",
  "restaurant_followed_during_signup"
]);

const guestAccountAnalyticsEvents = new Set([
  "login_success",
  "login_failed",
  "logout",
  "password_reset_requested",
  "password_reset_completed",
  "profile_updated",
  "preferences_updated",
  "favorite_added",
  "favorite_removed",
  "notification_opened",
  "marketing_consent_changed",
  "data_export_requested",
  "account_deletion_requested",
  "account_deleted"
]);

const signupAnalyticsFields = new Set([
  "cuisines",
  "food_categories",
  "dietary_needs",
  "drink_preferences",
  "dining_experiences",
  "companions",
  "party_size",
  "preferred_days",
  "preferred_time_windows",
  "booking_lead_time",
  "dining_duration",
  "discovery_preference",
  "selection_priorities",
  "new_restaurant_recommendations",
  "new_menu_item_recommendations",
  "excluded_categories",
  "spending_range",
  "discount_levels",
  "consider_no_discount_match",
  "notification_preferences",
  "notification_channels",
  "notification_frequency",
  "event_recommendations_interest",
  "future_calendar_interest"
]);

const signupOptionGroups = {
  cuisines: [
    "American", "Italian", "Spanish", "French", "Hungarian", "Mediterranean", "Greek", "Mexican", "Japanese", "Chinese",
    "Korean", "Thai", "Indian", "Middle Eastern", "Caribbean", "Latin American", "Steakhouse", "Seafood", "BBQ",
    "Vegan", "Vegetarian", "Bakery and desserts", "Other"
  ],
  food_categories: [
    "Steak", "Seafood", "Sushi", "Pasta", "Pizza", "Burgers", "Chicken", "Salads", "Soups", "Tapas", "Breakfast",
    "Brunch", "Desserts", "Healthy meals", "Plant-based meals", "Other"
  ],
  dietary_needs: [
    "No restrictions", "Vegetarian", "Vegan", "Gluten-free", "Dairy-free", "Halal", "Kosher", "Nut allergy",
    "Seafood allergy", "Low-carb", "Other"
  ],
  drink_preferences: [
    "Wine", "Cocktails", "Beer", "Whiskey", "Spirits", "Coffee", "Tea", "Mocktails", "Non-alcoholic drinks",
    "Fresh juices", "I do not drink alcohol", "No preference"
  ],
  dining_experiences: [
    "Casual dining", "Fine dining", "Romantic dinner", "Family dining", "Business meeting", "Birthday", "Anniversary",
    "Group dinner", "Brunch", "Quick meal", "Drinks after work", "Late-night dining", "Outdoor dining", "Rooftop",
    "Live music", "Sports bar", "Quiet atmosphere", "Trendy locations", "Hidden gems"
  ],
  companions: ["Alone", "Partner", "Family", "Friends", "Coworkers", "Groups", "Varies"],
  party_size: ["1", "2", "3-4", "5-6", "7 or more", "Varies"],
  transportation: ["Walking", "Driving", "Public transportation", "Taxi or rideshare", "No preference"],
  preferred_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  preferred_time_windows: ["Breakfast", "Brunch", "Lunch", "Afternoon", "Early dinner", "Dinner", "Late night"],
  booking_lead_time: ["Same day", "1-2 days", "3-7 days", "More than one week", "No preference"],
  dining_duration: ["Less than 45 minutes", "45-60 minutes", "60-90 minutes", "90-120 minutes", "More than 2 hours", "No preference"],
  discovery_preference: ["Mostly familiar restaurants", "Mostly new restaurants", "A balance of both"],
  selection_priorities: [
    "Food quality", "Price", "Discount", "Location", "Atmosphere", "Service", "Ratings", "Menu variety",
    "Healthy choices", "Drink selection", "Fast service", "Availability", "Outdoor seating", "Popularity", "Unique experience"
  ],
  yes_no: ["Yes", "No"],
  yes_no_sometimes: ["Yes", "No", "Sometimes"],
  excluded_categories: [
    "No exclusions", "American", "Italian", "Spanish", "French", "Hungarian", "Mediterranean", "Greek", "Mexican",
    "Japanese", "Chinese", "Korean", "Thai", "Indian", "Middle Eastern", "Caribbean", "Latin American",
    "Steakhouse", "Seafood", "BBQ", "Vegan", "Vegetarian", "Bakery and desserts", "Other"
  ],
  spending_ranges: ["Under $20", "$20-$35", "$35-$50", "$50-$75", "$75-$100", "Over $100", "Depends on the occasion"],
  discount_levels: ["10%", "15%", "20%", "25%", "30%", "40%", "50%", "Any available discount", "Discounts are not required"],
  notification_preferences: [
    "Reservation status updates", "Reservation reminders", "Offers from favorite restaurants", "New restaurants matching preferences",
    "New menu items", "Last-minute discounted tables", "Weekend recommendations", "Birthday or anniversary suggestions",
    "SmartTable news and marketing"
  ],
  notification_channels: ["Email"],
  notification_frequency: ["Immediately", "Daily summary", "Weekly summary", "Only important reservation messages"]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showToast(message) {
  toast.textContent = translateInlineText(message);
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function setButtonPending(button, pending, label = t("saving_button", "Saving...")) {
  if (!button) return;
  if (pending) {
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = label;
    return;
  }
  if (button.dataset.originalText) button.textContent = button.dataset.originalText;
  delete button.dataset.originalText;
  button.disabled = false;
  button.removeAttribute("aria-busy");
}

async function api(path, options = {}) {
  return requestJson(path, options, currentSession);
}

function queryStringFromFilters(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    const cleaned = String(value || "").trim();
    if (!cleaned || cleaned === "all") return;
    params.set(key, cleaned);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

function currentPlatformMode() {
  return normalizePlatformMode(state.config?.platform_mode || state.platformMode || "basic");
}

function isBasicMode() {
  return currentPlatformMode() === platformModes.basic;
}

function isAIConciergeMode() {
  return currentPlatformMode() === platformModes.ai_concierge;
}

function aiDemoVisibilityEnabled() {
  return normalizeBooleanSetting(state.config?.ai_demo_visibility ?? state.aiDemoVisibility, false);
}

function publicAiBadgeEnabled() {
  return normalizeBooleanSetting(state.config?.show_ai_mode_badge ?? state.showAiModeBadge, true);
}

function isAiDemoVisible() {
  return isAIConciergeMode() && aiDemoVisibilityEnabled();
}

function shouldShowAiModeBadge() {
  return isAIConciergeMode() && publicAiBadgeEnabled();
}

function registryEntry(featureKey) {
  return state.featureRegistry?.[featureKey] || defaultFeatureRegistry[featureKey] || null;
}

function isFeatureFlagEnabled(flagKey) {
  if (!flagKey) return true;
  const flags = normalizeFeatureFlagSettings(state.config?.feature_flags || state.featureFlags || {});
  return flags[flagKey] !== false;
}

function normalizeFeatureOptions(options = {}) {
  if (typeof options === "string") return { audience: options };
  return options || {};
}

function canShowFeature(featureKey, options = {}) {
  const opts = normalizeFeatureOptions(options);
  const feature = registryEntry(featureKey);
  if (!feature) return false;
  const mode = opts.mode || currentPlatformMode();
  if (!Array.isArray(feature.modes) || !feature.modes.includes(mode)) return false;
  if (!isFeatureFlagEnabled(feature.flag_key || feature.feature_flag)) return false;
  const status = String(feature.status || "disabled");
  if (status === "disabled" || status === "hidden") return false;
  if (opts.public === true && feature.public_visibility !== true) return false;
  if (opts.audience) {
    const audiences = feature.audiences || ["all"];
    if (!audiences.includes("all") && !audiences.includes(opts.audience)) return false;
  }
  if (opts.permission === "super_admin" && !isSuperAdmin()) return false;
  if (opts.requireWorking === true && status !== "working") return false;
  if (status === "demo") return isAiDemoVisible();
  return status === "working";
}

function featureVisibilityLabel(feature = {}) {
  if (!isFeatureFlagEnabled(feature.flag_key || feature.feature_flag)) return t("feature_flag_disabled_label", "Disabled by feature flag");
  const status = String(feature.status || "disabled");
  if (status === "demo") return isAiDemoVisible() ? t("feature_visible_preview", "Visible as Preview") : t("feature_hidden_demo_off", "Hidden until AI Demo Visibility is On");
  if (status === "working") return t("feature_visible_working", "Visible");
  if (status === "hidden") return t("feature_hidden_label", "Hidden");
  return t("feature_disabled_label", "Disabled");
}

function demoBadge(label = t("platformMode.demo", "Demo")) {
  return `<span class="demo-badge">${escapeHtml(label)}</span>`;
}

function aiModeBanner(audience = "guest") {
  if (!shouldShowAiModeBadge()) return "";
  const preview = isAiDemoVisible();
  return `
    <div class="ai-mode-banner ${preview ? "preview" : "live"}" data-ai-mode-banner="${escapeAttr(audience)}">
      <strong>${escapeHtml(preview ? t("ai_concierge_preview_badge", "AI Concierge Preview") : t("ai_concierge_public_badge", "SmartTable AI Concierge"))}</strong>
      <span>${escapeHtml(preview ? t("ai_preview_banner_body", "Demo AI features are clearly labeled as preview experiences.") : t("ai_public_banner_body", "AI Concierge tools are enabled for this experience."))}</span>
    </div>
  `;
}

function currentAiRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const hash = window.location.hash;
  const routes = {
    "/ai-concierge": { key: "guest-ai-concierge", mode: "guest", feature: "ai.concierge", audience: "guest", target: "#ai-concierge" },
    "#ai-concierge": { key: "guest-ai-concierge", mode: "guest", feature: "ai.concierge", audience: "guest", target: "#ai-concierge" },
    "/ai-preferences": { key: "guest-ai-preferences", mode: "guest", feature: "ai.preferenceSurvey", audience: "guest", target: "#ai-preferences" },
    "#ai-preferences": { key: "guest-ai-preferences", mode: "guest", feature: "ai.preferenceSurvey", audience: "guest", target: "#ai-preferences" },
    "/partner/ai-demand": { key: "partner-ai-demand", mode: "partner", feature: "ai.partnerDemand", audience: "partner", target: "#partner-ai-demand" },
    "#partner-ai-demand": { key: "partner-ai-demand", mode: "partner", feature: "ai.partnerDemand", audience: "partner", target: "#partner-ai-demand" },
    "/admin/ai-controls": { key: "admin-ai-controls", mode: "admin", feature: "ai.adminAIControls", audience: "admin", target: "#admin-ai-controls" },
    "#admin-ai-controls": { key: "admin-ai-controls", mode: "admin", feature: "ai.adminAIControls", audience: "admin", target: "#admin-ai-controls" }
  };
  return routes[path] || routes[hash] || null;
}

function aiRouteAccess(route = currentAiRoute()) {
  if (!route) return { route: null, allowed: true };
  const feature = registryEntry(route.feature) || {};
  if (!isAIConciergeMode()) {
    return { route, allowed: false, reason: t("ai_route_unavailable_basic", "This AI experience is hidden in Basic reservation marketplace mode.") };
  }
  if (String(feature.status || "") === "demo" && !isAiDemoVisible()) {
    return { route, allowed: false, reason: t("ai_route_unavailable_demo", "This AI route is a demo preview. Turn AI Demo Visibility On in Super Admin settings to open it.") };
  }
  if (!canShowFeature(route.feature, { audience: route.audience })) {
    return { route, allowed: false, reason: t("ai_route_unavailable_feature", "This AI feature is currently unavailable.") };
  }
  return { route, allowed: true };
}

function currentProtectedAreaRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const hash = window.location.hash;
  const partnerTargets = {
    "/partner": "",
    "/partner/offers": "#partner-deals",
    "/partner/reservations": "#partner-reservations",
    "/partner/profile": "#partner-profile",
    "/partner/analytics": "#partner-weekly-level",
    "/partner/settings": "#partner-settings"
  };
  const adminTargets = {
    "/admin": "#admin-stats",
    "/admin/restaurants": "#admin-restaurants",
    "/admin/offers": "#admin-offers",
    "/admin/users": "#admin-partners",
    "/admin/notifications": "#admin-notifications",
    "/admin/content": "#admin-content",
    "/admin/platform-settings": "#admin-platform-settings"
  };
  if (path === "/account" || path.startsWith("/account/") || hash === "#guest-account") {
    return { area: "guest", mode: "guest", loginRole: "guest" };
  }
  if (path === "/admin" || path.startsWith("/admin/") || /^#admin(?:-|$)/.test(hash)) {
    return { area: "admin", mode: "admin", loginRole: "admin", target: adminTargets[path] || hash || "#admin-stats" };
  }
  if (path === "/partner" || path.startsWith("/partner/") || path.startsWith("/restaurant/") || /^#partner(?:-|$)/.test(hash)) {
    return { area: "partner", mode: "partner", loginRole: "partner", target: partnerTargets[path] || hash || "" };
  }
  return null;
}

function hasProtectedAreaAccess(area) {
  const role = normalizeRole(currentSession()?.profile?.role);
  if (area === "guest") return role === "guest";
  if (area === "partner") return role === "partner";
  if (area === "admin") return isAdminRole(role);
  return false;
}

function protectedAreaLabel(area) {
  if (area === "admin") return t("protected_area_admin", "admin dashboard");
  if (area === "partner") return t("protected_area_partner", "partner dashboard");
  return t("protected_area_guest", "guest account");
}

function currentFullRoute() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function renderForbiddenRoute(route) {
  app.innerHTML = `
    ${layoutHero(`
      <section class="login-card unavailable-route-card" role="alert">
        <span class="section-kicker">${escapeHtml(t("route_forbidden_kicker", "Access protected"))}</span>
        <h2>${escapeHtml(t("route_forbidden_title", "You do not have access to this area"))}</h2>
        <p class="muted">${escapeHtml(t("route_forbidden_body", "This account cannot open the selected SmartTable area."))}</p>
        <p class="form-note">${escapeHtml(t("route_forbidden_area_note", "Requested area"))}: ${escapeHtml(protectedAreaLabel(route.area))}</p>
        <div class="button-row">
          <button class="primary-button" id="routeHomeFallback" type="button">${escapeHtml(t("route_go_home", "Go to marketplace"))}</button>
          <button class="ghost-button" id="routeCorrectLogin" type="button">${escapeHtml(t("route_sign_in_correct", "Sign in with another account"))}</button>
        </div>
      </section>
    `)}
  `;
  finalizeRenderedLanguage();
  document.querySelector("#routeHomeFallback")?.addEventListener("click", async () => {
    history.pushState(null, "", "/");
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelector("#routeCorrectLogin")?.addEventListener("click", async () => {
    state.postLoginRedirect = currentFullRoute();
    saveSession(null);
    clearGuestPrivateState();
    state.mode = route.mode;
    renderLogin(route.loginRole);
  });
}

function guardProtectedAreaRoute(route) {
  if (!route) return false;
  state.mode = route.mode;
  if (!currentSession()) {
    state.postLoginRedirect = currentFullRoute();
    renderLogin(route.loginRole);
    return true;
  }
  if (!hasProtectedAreaAccess(route.area)) {
    renderForbiddenRoute(route);
    return true;
  }
  return false;
}

function renderUnavailableRoute(access) {
  const route = access?.route || currentAiRoute();
  const title = route?.mode === "partner"
    ? t("ai_route_partner_unavailable_title", "Partner AI Demand is unavailable")
    : route?.mode === "admin"
      ? t("ai_route_admin_unavailable_title", "Admin AI Controls are unavailable")
      : t("ai_route_guest_unavailable_title", "AI Concierge is unavailable");
  app.innerHTML = `
    ${layoutHero(`
      <section class="login-card unavailable-route-card">
        <span class="section-kicker">${escapeHtml(t("ai_concierge_nav_label", "AI Concierge"))}</span>
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(access?.reason || t("ai_route_unavailable_feature", "This AI feature is currently unavailable."))}</p>
        <div class="button-row">
          <button class="primary-button" id="guestNavFallback" type="button">${escapeHtml(t("nav_offers", "Offers"))}</button>
          ${isSuperAdmin() ? `<button class="ghost-button" id="adminNavFallback" type="button">${escapeHtml(t("platformMode.title", "Platform Mode"))}</button>` : ""}
        </div>
      </section>
    `)}
  `;
  finalizeRenderedLanguage();
  document.querySelector("#guestNavFallback")?.addEventListener("click", async () => {
    history.pushState(null, "", "/");
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelector("#adminNavFallback")?.addEventListener("click", async () => {
    location.hash = "#admin-platform-settings";
    state.mode = "admin";
    await renderCurrentMode();
  });
}

function applyRouteIntent(route = currentAiRoute()) {
  if (!route) return;
  state.mode = route.mode;
  if (route.key === "guest-ai-preferences") state.aiWizardOpen = true;
}

function scrollToRouteTarget(route = currentAiRoute()) {
  if (!route?.target) return;
  window.setTimeout(() => {
    document.querySelector(route.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function platformModeLabel(mode = currentPlatformMode()) {
  return mode === "ai_concierge"
    ? t("platformMode.aiConcierge", "AI Concierge version")
    : t("platformMode.basic", "Basic reservation marketplace");
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return {};
  return response.json().catch(() => ({}));
}

async function loadTranslations() {
  const [fallback, current] = await Promise.all([
    state.fallbackTranslations && Object.keys(state.fallbackTranslations).length ? Promise.resolve(state.fallbackTranslations) : loadJson("/locales/en.json"),
    state.lang === "en" ? Promise.resolve({}) : loadJson(`/locales/${state.lang}.json`)
  ]);
  state.fallbackTranslations = fallback || {};
  state.translations = state.lang === "en" ? state.fallbackTranslations : { ...state.fallbackTranslations, ...(current || {}) };
}

function t(key, fallback = "") {
  for (const value of [state.content[key], state.translations[key], state.fallbackTranslations[key]]) {
    if (value === undefined || value === null) continue;
    if (state.lang !== "en" && fallback && value === fallback) continue;
    return value;
  }
  return translateLiteral(fallback);
}

function literalDictionary() {
  return state.translations?._literals || {};
}

function phraseDictionary() {
  return state.translations?._phrases || {};
}

function translateLiteral(value) {
  if (state.lang === "en") return value;
  const text = String(value ?? "");
  if (!text) return value;
  return literalDictionary()[text] || text;
}

function translateInlineText(value) {
  if (state.lang === "en") return value;
  const original = String(value ?? "");
  const trimmed = original.trim();
  if (!trimmed) return original;
  const exact = literalDictionary()[trimmed];
  if (exact) return original.replace(trimmed, exact);
  let translated = trimmed;
  const phrases = phraseDictionary();
  for (const [source, target] of Object.entries(phrases).sort((a, b) => b[0].length - a[0].length)) {
    translated = translated.replaceAll(source, target);
  }
  return original.replace(trimmed, translated);
}

function uiText(value) {
  return state.lang === "en" ? String(value ?? "") : translateInlineText(value);
}

function translateRenderedStaticText(root = app) {
  if (state.lang === "en" || !root) return;
  const skipTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || skipTags.has(parent.tagName) || parent.closest("[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    node.nodeValue = translateInlineText(node.nodeValue);
  });
  root.querySelectorAll("[placeholder], [aria-label], [title], [alt]").forEach((element) => {
    ["placeholder", "aria-label", "title", "alt"].forEach((attr) => {
      const value = element.getAttribute(attr);
      if (value) element.setAttribute(attr, translateInlineText(value));
    });
  });
}

function finalizeRenderedLanguage() {
  translateRenderedStaticText(app);
  updateChromeText();
}

function normalizeRole(role) {
  const value = String(role || "guest").trim().toLowerCase();
  return value === "restaurant" || value === "restaurant_partner" ? "partner" : value;
}

function isAdminRole(role) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "super_admin";
}

function currentSession() {
  if (state.session && isSessionExpired(state.session)) {
    state.session = null;
    clearStoredSession();
  }
  return state.session;
}

function isSuperAdmin() {
  return normalizeRole(currentSession()?.profile?.role) === "super_admin";
}

function isGuestSession() {
  const session = currentSession();
  return Boolean(session) && normalizeRole(session.profile?.role) === "guest";
}

function isAuthError(error) {
  return error?.status === 401 || /invalid|expired|authentication/i.test(error?.message || "");
}

function persistCurrentSession() {
  if (!state.session) return;
  const serialized = JSON.stringify(state.session);
  if (state.session.remember_me === false) {
    sessionStorage.setItem("smarttable.session", serialized);
    localStorage.removeItem("smarttable.session");
  } else {
    localStorage.setItem("smarttable.session", serialized);
    sessionStorage.removeItem("smarttable.session");
  }
}

function saveSession(session, options = {}) {
  const remember = options.remember === false ? false : session?.remember_me !== false;
  state.session = withSessionExpiry(session, remember);
  if (session) {
    state.session.remember_me = remember;
    persistCurrentSession();
  } else {
    clearStoredSession();
  }
  updateSessionButton();
}

async function applyProfileLanguagePreference(session) {
  const stored = localStorage.getItem("smarttable.lang");
  if (stored) {
    state.lang = normalizeLanguage(stored);
    await persistLanguagePreference();
    return;
  }
  const preferred = session?.profile?.preferred_language;
  if (preferred) {
    const profileLanguage = normalizeLanguage(preferred);
    if (profileLanguage !== state.lang) {
      state.lang = profileLanguage;
      localStorage.setItem("smarttable.lang", state.lang);
      await loadTranslations();
    }
    return;
  }
  if (session?.profile) await persistLanguagePreference();
}

async function persistLanguagePreference() {
  localStorage.setItem("smarttable.lang", state.lang);
  if (!state.session?.access_token) return;
  state.session.profile = { ...(state.session.profile || {}), preferred_language: state.lang };
  persistCurrentSession();
  try {
    await api("/auth/language", {
      method: "PATCH",
      body: JSON.stringify({ preferred_language: state.lang })
    });
  } catch {
    // Language preference should never block the current UI.
  }
}

async function setLanguage(lang, options = {}) {
  state.lang = normalizeLanguage(lang);
  localStorage.setItem("smarttable.lang", state.lang);
  if (options.persist !== false) await persistLanguagePreference();
  await renderCurrentMode();
}

function updateSessionButton() {
  if (!sessionButton) return;
  const session = currentSession();
  if (!session) {
    sessionButton.textContent = t("login_button", "Login");
    sessionButton.setAttribute("aria-expanded", "false");
    sessionButton.removeAttribute("aria-haspopup");
    renderAccountMenu(false);
    return;
  }
  sessionButton.textContent = isGuestSession()
    ? t("account_menu_button", "My Account")
    : t("logout_button", "Logout");
  sessionButton.setAttribute("aria-expanded", state.showAccountMenu ? "true" : "false");
  sessionButton.setAttribute("aria-haspopup", isGuestSession() ? "menu" : "false");
  renderAccountMenu(state.showAccountMenu && isGuestSession());
}

function clearGuestPrivateState() {
  state.guestAccount = null;
  state.guestReservations = [];
  state.guestFavorites = [];
  state.guestNotifications = [];
  state.guestPrivacy = null;
  state.guestSecurity.message = "";
  state.showAccountMenu = false;
}

function renderAccountMenu(open = state.showAccountMenu && isGuestSession()) {
  let menu = document.querySelector("#guestAccountMenu");
  if (!open) {
    menu?.remove();
    return;
  }
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "guestAccountMenu";
    menu.className = "account-menu";
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);
  }
  menu.setAttribute("aria-label", t("account_menu_label", "Guest account menu"));
  const rect = sessionButton.getBoundingClientRect();
  menu.style.top = `${Math.round(rect.bottom + window.scrollY + 8)}px`;
  menu.style.right = `${Math.max(16, Math.round(window.innerWidth - rect.right))}px`;
  menu.innerHTML = `
    <button type="button" role="menuitem" data-account-menu-target="overview">${escapeHtml(t("account_menu_my_account", "My Account"))}</button>
    <button type="button" role="menuitem" data-account-menu-target="reservations">${escapeHtml(t("account_menu_my_reservations", "My Reservations"))}</button>
    <button type="button" role="menuitem" data-account-menu-target="favorites">${escapeHtml(t("account_menu_favorites", "Favorites"))}</button>
    <button type="button" role="menuitem" data-account-menu-signout>${escapeHtml(t("account_menu_sign_out", "Sign Out"))}</button>
  `;
  menu.querySelectorAll("[data-account-menu-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.guestAccountTab = button.dataset.accountMenuTarget;
      state.showAccountMenu = false;
      history.pushState(null, "", routeForGuestAccountTab(state.guestAccountTab));
      state.mode = "guest";
      await renderCurrentMode();
    });
  });
  menu.querySelector("[data-account-menu-signout]")?.addEventListener("click", async () => {
    state.showAccountMenu = false;
    await signOut();
  });
}

async function signOut() {
  trackGuestAccountEvent("logout", { session_scope: "current" }, { keepalive: true });
  if (state.session?.access_token) {
    await api("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ scope: "current" })
    }).catch(() => null);
  }
  saveSession(null);
  clearGuestPrivateState();
  history.pushState(null, "", "/");
  state.mode = "guest";
  await renderCurrentMode();
  showToast(t("logged_out_toast", "Logged out."));
}

function updateChromeText() {
  document.documentElement.lang = state.lang;
  const skipLink = document.querySelector(".skip-link");
  if (skipLink) skipLink.textContent = t("skip_to_content", "Skip to main content");
  document.querySelector(".brand")?.setAttribute("aria-label", t("brand_home_label", "Smarttable.com home"));
  document.querySelector(".top-actions")?.setAttribute("aria-label", t("primary_navigation_label", "Primary navigation"));
  document.querySelector(".language-switcher")?.setAttribute("aria-label", t("language_switcher_label", "Language switcher"));
  Object.entries(supportedLanguages).forEach(([lang, config]) => {
    const button = document.querySelector(`[data-lang="${lang}"]`);
    if (!button) return;
    button.textContent = config.label;
    button.classList.toggle("active", state.lang === lang);
    button.setAttribute("aria-pressed", state.lang === lang ? "true" : "false");
  });
  document.querySelector(".brand strong").textContent = isBasicMode() ? t("basic_brand_title", "SmartTable") : t("brand_title", "SmartTable AI");
  document.querySelector(".brand small").textContent = isBasicMode() ? t("basic_brand_subtitle", "Discounted restaurant reservations") : t("brand_subtitle", "The AI Revenue Operating System for Restaurants");
  document.querySelector("#guestNav").textContent = t("nav_offers", "Offers");
  if (signupNav) {
    signupNav.textContent = t("signup_nav_button", "Sign Up");
    signupNav.hidden = Boolean(state.session);
  }
  const aiNav = document.querySelector("#aiConciergeNav");
  if (aiNav) {
    aiNav.hidden = !canShowFeature("ai.concierge", { allowDemo: true });
    aiNav.textContent = t("ai_concierge_nav_label", "AI Concierge");
  }
  document.querySelector("#adminNav").textContent = t("nav_admin", "Super Admin");
  document.querySelector("#restaurantNav").textContent = t("nav_partner", "Partner");
  updateSessionButton();
}

function publicRouteMeta() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const noindexPrefixes = ["/admin", "/partner", "/restaurant", "/account", "/login", "/forgot-password", "/reset-password", "/guest/rewards/photo-upload"];
  const noindex = noindexPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (path === "/restaurants") {
    return {
      title: t("restaurants_seo_title", "SmartTable Restaurants | Discounted New York restaurant reservations"),
      description: t("restaurants_seo_description", "Browse New York restaurants on SmartTable, compare active discounted table offers, and request a reservation."),
      canonicalPath: "/restaurants",
      noindex
    };
  }
  if (path === "/offers") {
    return {
      title: t("offers_seo_title", "SmartTable Offers | Active discounted restaurant tables in New York"),
      description: t("offers_seo_description", "Find active discounted restaurant offers by neighborhood, cuisine, date, time, party size, and discount."),
      canonicalPath: "/offers",
      noindex
    };
  }
  if (path.startsWith("/restaurants/")) {
    const restaurant = findPublicRestaurantBySlug(decodeURIComponent(path.slice("/restaurants/".length)));
    const name = restaurant?.name || restaurant?.restaurant_name || t("restaurant_label", "Restaurant");
    const description = restaurant?.restaurant_description || restaurant?.description || t("restaurant_detail_seo_description", "View restaurant details, active offers, location, cuisine, and guest rating information.");
    return {
      title: contentTemplate("restaurant_detail_seo_title", "{{restaurant}} on SmartTable | Restaurant details and active offers", { restaurant: name }),
      description,
      canonicalPath: `/restaurants/${restaurant ? restaurantRouteSlug(restaurant) : slugify(name)}`,
      noindex
    };
  }
  if (path === "/signup") {
    return {
      title: t("signup_seo_title", "Create a SmartTable guest account"),
      description: t("signup_seo_description", "Create your SmartTable guest profile and save restaurant, cuisine, budget, notification, and reservation preferences."),
      canonicalPath: "/signup",
      noindex: false
    };
  }
  if (path === "/terms" || path === "/privacy" || path === "/contact" || path === "/help") {
    const config = publicInfoRouteConfig[path] || {};
    return {
      title: t(config.titleKey || "basic_seo_title", config.fallbackTitle || "SmartTable"),
      description: t(config.bodyKey || "basic_seo_meta_description", config.fallbackBody || "SmartTable public information."),
      canonicalPath: path,
      noindex: false
    };
  }
  return {
    title: isBasicMode()
      ? t("basic_seo_title", "SmartTable | Discounted New York restaurant reservations")
      : t("seo_title", "SmartTable AI | The AI Revenue Operating System for Restaurants"),
    description: isBasicMode()
      ? t("basic_seo_meta_description", "Book discounted restaurant tables across New York and send reservation requests directly to restaurants.")
      : t("seo_meta_description", "SmartTable AI combines restaurant reservations, guest personalization, predictive demand intelligence, and revenue recovery tools for New York restaurants."),
    canonicalPath: "/",
    noindex
  };
}

function updateMeta() {
  const meta = publicRouteMeta();
  const title = meta.title;
  const description = meta.description;
  const canonical = `https://smarttable.com${meta.canonicalPath === "/" ? "/" : meta.canonicalPath}`;
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[name="robots"]')?.setAttribute("content", meta.noindex ? "noindex, nofollow" : "index, follow");
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonical);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonical);
}

function statusBadge(status, label = "") {
  const badgeText = label || uiText(String(status || "").replace("_", " "));
  return `<span class="status ${escapeAttr(status)}">${escapeHtml(badgeText)}</span>`;
}

function normalizeReservationStatusValue(status) {
  const value = String(status || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "requested") return "pending";
  if (value === "confirmed") return "accepted";
  if (value === "declined") return "rejected";
  if (value === "canceled") return "cancelled";
  return value;
}

function featureStatus(key, fallback = "beta") {
  return state.featureStatus.find((item) => item.key === key)?.status || fallback;
}

function featureStatusLabel(status) {
  const labels = {
    working: "Working",
    hidden: "Hidden",
    disabled: "Disabled",
    live: "Live",
    beta: "Beta",
    demo_only: "Demo only",
    coming_soon: "Coming soon",
    requires_integration: "Requires integration",
    requires_more_data: "Requires more data"
  };
  return uiText(labels[status] || String(status || "Beta").replaceAll("_", " "));
}

function featureBadge(key, fallback = "beta") {
  const status = featureStatus(key, fallback);
  return `<span class="feature-badge ${escapeAttr(status)}">${escapeHtml(featureStatusLabel(status))}</span>`;
}

function featureNote(key, fallback = "") {
  const row = state.featureStatus.find((item) => item.key === key);
  return row?.description || fallback;
}

function formatMoney(value) {
  const language = supportedLanguages[state.lang] || supportedLanguages.en;
  return new Intl.NumberFormat(language.locale, {
    style: "currency",
    currency: language.currency,
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatNumber(value, options = {}) {
  const language = supportedLanguages[state.lang] || supportedLanguages.en;
  return new Intl.NumberFormat(language.locale, options).format(Number(value || 0));
}

function contentTemplate(key, fallback, values = {}) {
  return t(key, fallback).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => values[name] ?? "");
}

function formatDate(date, startTime, endTime) {
  const language = supportedLanguages[state.lang] || supportedLanguages.en;
  const dateLabel = date
    ? new Intl.DateTimeFormat(language.locale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T00:00:00`))
    : t("flexible_date_label", "Flexible date");
  const atLabel = t("time_at_label", "at");
  return `${dateLabel} ${atLabel} ${startTime || t("time_tbd_label", "TBD")}${endTime ? `-${endTime}` : ""}`;
}

function discountLabel(offer) {
  if ((offer.discount_type || "percent") === "percent") return `-${offer.discount_value ?? offer.discount_percent}%`;
  return `${offer.discount_value} off`;
}

function statCard(label, value) {
  return `<article class="stat-card"><span>${escapeHtml(uiText(label))}</span><strong>${escapeHtml(uiText(value ?? 0))}</strong></article>`;
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function defaultSignupData() {
  return {
    full_name: "",
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirm_password: "",
    phone: "",
    city: "",
    region: "",
    postal_code: "",
    preferred_neighborhoods: [],
    travel_distance_miles: "",
    transportation_method: "",
    transportation_methods: [],
    cuisines: [],
    food_categories: [],
    dietary_needs: [],
    allergy_notes: "",
    drink_preferences: [],
    dining_experiences: [],
    companions: [],
    party_size: "",
    preferred_days: [],
    preferred_time_windows: [],
    booking_lead_time: "",
    dining_duration: "",
    discovery_preference: "",
    selection_priorities: [],
    new_restaurant_recommendations: "",
    new_menu_item_recommendations: "",
    excluded_categories: [],
    spending_range: "",
    discount_levels: [],
    consider_no_discount_match: "",
    notification_channels: [],
    notification_preferences: [],
    notification_frequency: "",
    event_recommendations_interest: "",
    future_calendar_interest: "",
    transactional_email_consent: false,
    sms_consent: false,
    marketing_consent: false,
    allergy_acknowledgement: false,
    privacy_consent: false,
    terms_consent: false
  };
}

function ensureSignupState() {
  if (!state.signup) {
    state.signup = {
      step: 0,
      data: defaultSignupData(),
      errors: {},
      submitError: "",
      showPassword: false,
      showConfirmPassword: false,
      locating: false,
      submitting: false,
      analyticsStarted: false,
      analyticsCompleted: false,
      analyticsAbandoned: false
    };
  }
  return state.signup;
}

function currentGuestAccountRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const hash = window.location.hash;
  if (path === "/signup" || hash === "#guest-signup") return "signup";
  if (path === "/login" || hash === "#guest-login") return "login";
  if (path === "/forgot-password" || hash === "#forgot-password") return "forgot-password";
  if (path === "/reset-password" || hash === "#reset-password") return "reset-password";
  if (path === "/verify-email" || hash === "#verify-email") return "verify-email";
  if (path === "/account" || path.startsWith("/account/") || hash === "#guest-account") return "account";
  return null;
}

const guestAccountRouteTabs = {
  "/account": "overview",
  "/account/reservations": "reservations",
  "/account/favorites": "favorites",
  "/account/profile": "profile",
  "/account/preferences": "preferences",
  "/account/notifications": "notifications",
  "/account/reviews": "reviews",
  "/account/security": "security",
  "/account/privacy": "security"
};

const guestAccountTabRoutes = {
  overview: "/account",
  reservations: "/account/reservations",
  favorites: "/account/favorites",
  profile: "/account/profile",
  preferences: "/account/preferences",
  notifications: "/account/notifications",
  reviews: "/account/reviews",
  security: "/account/security",
  privacy: "/account/security"
};

function applyGuestAccountRouteTab() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const tab = guestAccountRouteTabs[path];
  if (tab) state.guestAccountTab = tab;
}

function routeForGuestAccountTab(tab) {
  return guestAccountTabRoutes[tab] || "/account";
}

const publicInfoRouteConfig = {
  "/terms": {
    titleKey: "terms_page_title",
    fallbackTitle: "Terms and Conditions",
    bodyKey: "terms_page_body",
    fallbackBody: "Use SmartTable responsibly. Restaurant reservations are requests until the restaurant confirms them."
  },
  "/privacy": {
    titleKey: "privacy_page_title",
    fallbackTitle: "Privacy Policy",
    bodyKey: "privacy_page_body",
    fallbackBody: "SmartTable protects guest profile, preference, reservation, and consent data. Restaurants only receive operational booking details needed to serve a reservation."
  },
  "/contact": {
    titleKey: "contact_page_title",
    fallbackTitle: "Contact SmartTable",
    bodyKey: "contact_page_body",
    fallbackBody: "For help with a reservation, contact the restaurant directly when your visit is soon. For SmartTable support, use the contact details configured by the platform admin."
  },
  "/help": {
    titleKey: "help_page_title",
    fallbackTitle: "Help",
    bodyKey: "help_page_body",
    fallbackBody: "Browse restaurants, choose an active offer, and submit a reservation request. The restaurant confirms or declines the request."
  }
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function restaurantRouteSlug(restaurant = {}) {
  return restaurant.slug || slugify(restaurant.name || restaurant.restaurant_name || restaurant.id || restaurant.restaurant_id);
}

function currentPublicGuestRoute() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (currentAiRoute()) return { kind: "home" };
  if (path === "/" || path === "") return { kind: "home" };
  if (path === "/guest/rewards/photo-upload") return { kind: "rewards" };
  if (path === "/restaurants") return { kind: "restaurants", target: "#guest-restaurants" };
  if (path.startsWith("/restaurants/")) return { kind: "restaurant-detail", slug: decodeURIComponent(path.slice("/restaurants/".length)) };
  if (path === "/offers") return { kind: "offers", target: "#guest-offers" };
  if (publicInfoRouteConfig[path]) return { kind: "info", path, ...publicInfoRouteConfig[path] };
  return { kind: "not-found", path };
}

function findPublicRestaurantBySlug(slug) {
  const target = slugify(slug);
  const candidates = [
    ...groupRestaurants(),
    ...state.newestRestaurants.map(normalizeNewestRestaurant)
  ];
  return candidates.find((restaurant) => restaurantRouteSlug(restaurant) === target || slugify(restaurant.id) === target);
}

function publicRouteTarget(route) {
  if (!route?.target) return;
  window.setTimeout(() => {
    document.querySelector(route.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function renderPublicGuestInfoPage(route) {
  app.innerHTML = `
    ${layoutHero(`
      <section class="login-card public-info-page-card">
        <span class="section-kicker">${escapeHtml(t("smarttable_public_page_kicker", "SmartTable"))}</span>
        <h2>${escapeHtml(t(route.titleKey, route.fallbackTitle))}</h2>
        <p class="muted">${escapeHtml(t(route.bodyKey, route.fallbackBody))}</p>
        <div class="button-row">
          <button class="primary-button" id="publicInfoRestaurants" type="button">${escapeHtml(t("explore_restaurants_button", "Explore Restaurants"))}</button>
          <button class="ghost-button" id="publicInfoOffers" type="button">${escapeHtml(t("nav_offers", "Offers"))}</button>
        </div>
      </section>
    `)}
    <footer class="site-footer">${escapeHtml(t("footer_text", "Smarttable.com serves New York restaurants and guests."))}</footer>
  `;
  finalizeRenderedLanguage();
  document.querySelector("#publicInfoRestaurants")?.addEventListener("click", async () => {
    history.pushState(null, "", "/restaurants");
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelector("#publicInfoOffers")?.addEventListener("click", async () => {
    history.pushState(null, "", "/offers");
    state.mode = "guest";
    await renderCurrentMode();
  });
}

function renderNotFoundRoute(route = currentPublicGuestRoute()) {
  app.innerHTML = `
    ${layoutHero(`
      <section class="login-card unavailable-route-card" role="alert">
        <span class="section-kicker">${escapeHtml(t("not_found_kicker", "Page not found"))}</span>
        <h2>${escapeHtml(t("not_found_title", "We could not find that SmartTable page"))}</h2>
        <p class="muted">${escapeHtml(t("not_found_body", "The page may have moved, or the link may be incomplete."))}</p>
        <p class="form-note">${escapeHtml(route?.path || "")}</p>
        <button class="primary-button" id="notFoundHome" type="button">${escapeHtml(t("route_go_home", "Go to marketplace"))}</button>
      </section>
    `)}
  `;
  finalizeRenderedLanguage();
  document.querySelector("#notFoundHome")?.addEventListener("click", async () => {
    history.pushState(null, "", "/");
    state.mode = "guest";
    await renderCurrentMode();
  });
}

function optionLabel(value) {
  return t(`option_${String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`, value);
}

const noFavoriteRestaurantOption = "I do not have a favorite SmartTable restaurant yet";

function signupStepTitle(index = ensureSignupState().step) {
  const step = signupSteps[index] || signupSteps[0];
  return t(step.labelKey, step.fallback);
}

function passwordStrength(password = "") {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  const score = checks.filter(Boolean).length;
  const key = score >= 5 ? "strong" : score >= 4 ? "good" : score >= 3 ? "fair" : "weak";
  return { score, key, percent: Math.max(8, score * 20) };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 20;
}

function signupValidationMessage(key) {
  const messages = {
    required: t("signup_error_required", "This field is required."),
    email: t("signup_error_email", "Enter a valid email address."),
    phone: t("signup_error_phone", "Enter a valid phone number."),
    password: t("signup_error_password", "Use at least 8 characters with uppercase, lowercase, number, and symbol."),
    password_match: t("signup_error_password_match", "Passwords must match."),
    select_one: t("signup_error_select_one", "Select at least one option."),
    consent: t("signup_error_consent", "This consent is required to create your account."),
    max_five: t("signup_error_max_five", "Select up to five options."),
    sms_consent: t("signup_error_sms_consent", "SMS requires separate consent.")
  };
  return messages[key] || messages.required;
}

function signupFavoriteRestaurantOptions() {
  const names = (state.restaurants || [])
    .map((restaurant) => restaurant?.name || restaurant?.restaurant_name)
    .filter(Boolean);
  return [...new Set([...names, noFavoriteRestaurantOption])];
}

function selectedOptionSummary(value, limit = 4) {
  const values = asArray(value);
  if (!values.length) return t("signup_review_not_set", "Not selected");
  const visible = values.slice(0, limit).map(optionLabel).join(", ");
  return values.length > limit ? `${visible} +${values.length - limit}` : visible;
}

function signupNeighborhoodOptions() {
  const fromRestaurants = filterOptionValues("district");
  const fallback = ["West Village", "SoHo", "Nolita", "Chelsea", "Tribeca", "Upper West Side", "Upper East Side", "Williamsburg", "DUMBO", "Long Island City"];
  return [...new Set([...fromRestaurants, ...fallback])];
}

function signupReviewCard(stepIndex, titleKey, fallback, strong, small = "") {
  return `
    <article>
      <span>${escapeHtml(t(titleKey, fallback))}</span>
      <strong>${escapeHtml(strong || t("signup_review_not_set", "Not selected"))}</strong>
      ${small ? `<small>${escapeHtml(small)}</small>` : ""}
      <button class="link-button" data-edit-signup-step="${stepIndex}" type="button">${escapeHtml(t("signup_edit_section", "Edit"))}</button>
    </article>
  `;
}

function signupConsentCheckbox(name, labelHtml, checked = false) {
  return `
    <input name="${escapeAttr(name)}" type="hidden" value="false">
    <label class="check">
      <input name="${escapeAttr(name)}" type="checkbox" value="true" ${boolValue(checked) ? "checked" : ""}>
      ${labelHtml}
    </label>
  `;
}

function collectSignupForm(form) {
  const data = formObject(form);
  const current = ensureSignupState().data;
  const checkboxFields = [
    "cuisines",
    "food_categories",
    "dietary_needs",
    "drink_preferences",
    "dining_experiences",
    "companions",
    "preferred_days",
    "preferred_time_windows",
    "selection_priorities",
    "preferred_neighborhoods",
    "transportation_methods",
    "excluded_categories",
    "discount_levels",
    "notification_preferences",
    "notification_channels"
  ];
  const boolFields = ["transactional_email_consent", "sms_consent", "marketing_consent", "allergy_acknowledgement", "privacy_consent", "terms_consent"];
  for (const [key, value] of Object.entries(data)) {
    if (checkboxFields.includes(key)) current[key] = asArray(value);
    else if (boolFields.includes(key)) current[key] = Array.isArray(value) ? value.at(-1) === "true" : value === "true";
    else current[key] = String(value || "").trim();
  }
  for (const field of checkboxFields) {
    if (data[field] === undefined && fieldsForSignupStep(ensureSignupState().step).includes(field)) current[field] = [];
  }
  if (fieldsForSignupStep(ensureSignupState().step).includes("transportation_methods")) {
    current.transportation_method = asArray(current.transportation_methods)[0] || "";
  }
  if (fieldsForSignupStep(ensureSignupState().step).includes("full_name") && current.full_name) {
    const parts = String(current.full_name).trim().split(/\s+/);
    current.first_name = parts[0] || "";
    current.last_name = parts.slice(1).join(" ") || "";
  }
  ensureSignupState().submitError = "";
  return current;
}

function signupStepErrors(stepIndex, data = ensureSignupState().data) {
  const errors = {};
  const requireText = (field) => {
    if (!String(data[field] || "").trim()) errors[field] = signupValidationMessage("required");
  };
  const requireArray = (field) => {
    if (!asArray(data[field]).length) errors[field] = signupValidationMessage("select_one");
  };
  const stepKey = signupSteps[stepIndex]?.key;

  if (stepKey === "account") {
    ["full_name", "email", "password", "confirm_password", "phone"].forEach(requireText);
    if (String(data.full_name || "").trim().split(/\s+/).length < 2) errors.full_name = t("signup_error_full_name", "Enter your full name.");
    if (data.email && !isValidEmail(data.email)) errors.email = signupValidationMessage("email");
    if (data.phone && !isValidPhone(data.phone)) errors.phone = signupValidationMessage("phone");
    if (data.password && passwordStrength(data.password).score < 5) errors.password = signupValidationMessage("password");
    if (data.password && data.confirm_password && data.password !== data.confirm_password) errors.confirm_password = signupValidationMessage("password_match");
  } else if (stepKey === "location") {
    ["city", "region", "postal_code", "travel_distance_miles"].forEach(requireText);
    ["preferred_neighborhoods", "transportation_methods"].forEach(requireArray);
  } else if (stepKey === "preferences") {
    ["cuisines", "food_categories", "dietary_needs", "drink_preferences"].forEach(requireArray);
  } else if (stepKey === "habits") {
    ["dining_experiences", "companions", "preferred_days", "preferred_time_windows", "selection_priorities", "excluded_categories"].forEach(requireArray);
    ["party_size", "booking_lead_time", "dining_duration", "discovery_preference", "new_restaurant_recommendations", "new_menu_item_recommendations"].forEach(requireText);
  } else if (stepKey === "budget") {
    requireText("spending_range");
    requireArray("discount_levels");
    requireText("consider_no_discount_match");
  } else if (stepKey === "notifications") {
    requireArray("notification_preferences");
    requireArray("notification_channels");
    requireText("notification_frequency");
    requireText("event_recommendations_interest");
    requireText("future_calendar_interest");
    if (asArray(data.notification_channels).includes("SMS") && !data.sms_consent) errors.sms_consent = signupValidationMessage("sms_consent");
    if (!data.transactional_email_consent) errors.transactional_email_consent = signupValidationMessage("consent");
  } else if (stepKey === "consent") {
    if (!data.privacy_consent) errors.privacy_consent = signupValidationMessage("consent");
    if (!data.terms_consent) errors.terms_consent = signupValidationMessage("consent");
    if (asArray(data.dietary_needs).some((item) => /allergy|gluten|dairy|halal|kosher|vegan|vegetarian|low-carb|other/i.test(item)) && !data.allergy_acknowledgement) {
      errors.allergy_acknowledgement = signupValidationMessage("consent");
    }
  }

  return errors;
}

function validateSignupStep(stepIndex = ensureSignupState().step) {
  const signup = ensureSignupState();
  const errors = signupStepErrors(stepIndex, signup.data);
  signup.errors = errors;
  return Object.keys(errors).length === 0;
}

function fieldsForSignupStep(stepIndex) {
  const key = signupSteps[stepIndex]?.key;
  if (key === "account") return ["full_name", "email", "password", "confirm_password", "phone"];
  if (key === "location") return ["city", "region", "postal_code", "preferred_neighborhoods", "travel_distance_miles", "transportation_methods"];
  if (key === "preferences") return ["cuisines", "food_categories", "dietary_needs", "drink_preferences"];
  if (key === "habits") {
    return [
      "dining_experiences", "companions", "party_size", "preferred_days", "preferred_time_windows", "booking_lead_time",
      "dining_duration", "discovery_preference", "selection_priorities", "new_restaurant_recommendations",
      "new_menu_item_recommendations", "excluded_categories"
    ];
  }
  if (key === "budget") return ["spending_range", "discount_levels", "consider_no_discount_match"];
  if (key === "notifications") {
    return [
      "notification_preferences", "notification_channels", "notification_frequency", "event_recommendations_interest",
      "future_calendar_interest", "transactional_email_consent", "sms_consent", "marketing_consent"
    ];
  }
  if (key === "consent") return ["allergy_acknowledgement", "privacy_consent", "terms_consent"];
  return [];
}

function validateAllSignupSteps() {
  for (let index = 0; index < signupSteps.length; index += 1) {
    if (!validateSignupStep(index)) {
      ensureSignupState().step = index;
      return false;
    }
  }
  return true;
}

function signupValidationSummary() {
  const signup = ensureSignupState();
  return signupSteps
    .map((step, index) => ({
      index,
      label: t(step.labelKey, step.fallback),
      errors: signupStepErrors(index, signup.data)
    }))
    .filter((item) => Object.keys(item.errors).length);
}

function isSignupReadyToCreate() {
  const signup = ensureSignupState();
  return !signup.submitting && signupValidationSummary().length === 0;
}

function signupValidationSummaryHtml() {
  const summary = signupValidationSummary();
  if (!summary.length) return "";
  return `
    <section class="signup-validation-summary" role="alert" aria-live="polite">
      <strong>${escapeHtml(t("signup_validation_summary_title", "Complete these sections before creating your account"))}</strong>
      <ul>
        ${summary.map((item) => `
          <li>
            <button class="link-button" data-edit-signup-step="${item.index}" type="button">${escapeHtml(item.label)}</button>
            <span>${escapeHtml(Object.values(item.errors).slice(0, 2).join(" "))}</span>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function splitCommaList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function aiSelections(field) {
  return asArray(state.aiPreferences?.[field]);
}

function aiCheckboxGroup(name, options, selected = []) {
  const selectedSet = new Set(selected.map((item) => String(item).toLowerCase()));
  return `
    <div class="ai-chip-grid">
      ${options.map((option) => `
        <label class="ai-chip">
          <input type="checkbox" name="${escapeAttr(name)}" value="${escapeAttr(option)}" ${selectedSet.has(option.toLowerCase()) ? "checked" : ""}>
          <span>${escapeHtml(option)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function boolValue(value) {
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

function checkboxInput(name, label, checked = false) {
  return `<input name="${escapeAttr(name)}" type="hidden" value="false"><label class="check"><input name="${escapeAttr(name)}" type="checkbox" value="true" ${boolValue(checked) ? "checked" : ""}> ${escapeHtml(uiText(label))}</label>`;
}

function restaurantHeroImage(restaurant = {}) {
  return restaurant.hero_image_url || restaurant.cover_image || restaurant.image || restaurant.card_image || "/assets/restaurant-hero.png";
}

function restaurantHasProvidedImage(restaurant = {}) {
  return Boolean(restaurant.hero_image_url || restaurant.cover_image || restaurant.card_image || restaurant.logo_url || restaurant.icon_image || asArray(restaurant.gallery_images).length);
}

function restaurantLogoImage(restaurant = {}) {
  return restaurant.logo_url || restaurant.icon_image || restaurant.card_image || restaurantHeroImage(restaurant);
}

function restaurantGallery(restaurant = {}) {
  const values = [
    ...asArray(restaurant.gallery_images),
    restaurant.hero_image_url,
    restaurant.cover_image,
    restaurant.card_image,
    restaurant.image
  ].filter(Boolean);
  return [...new Set(values)].slice(0, 8);
}

function paymentMethods(value) {
  return asArray(value).length ? asArray(value) : splitCommaList(value);
}

function amenityList(restaurant = {}) {
  return [
    ["outdoor_seating", t("amenity_outdoor", "Outdoor seating")],
    ["parking_available", t("amenity_parking", "Parking available")],
    ["kids_friendly", t("amenity_kids", "Kids friendly")],
    ["pet_friendly", t("amenity_pets", "Pet friendly")],
    ["wheelchair_accessible", t("amenity_accessible", "Wheelchair accessible")],
    ["private_room_available", t("amenity_private_room", "Private room")]
  ].filter(([key]) => boolValue(restaurant[key])).map(([, label]) => label);
}

function socialLinks(restaurant = {}) {
  return [
    [uiText("Website"), restaurant.website],
    ["Instagram", restaurant.instagram],
    ["Facebook", restaurant.facebook],
    ["TikTok", restaurant.tiktok],
    ["Google Maps", restaurant.google_maps_url],
    [uiText("Menu"), restaurant.menu_pdf_url]
  ].filter(([, href]) => href);
}

function aiMatchForRestaurant(restaurant = {}) {
  const id = restaurant.id || restaurant.restaurant_id;
  const rec = state.aiRecommendations.find((item) => (item.restaurant_id || item.id) === id);
  return rec?.ai_match_score || restaurant.ai_match_score || Math.round(Math.min(96, 68 + Number(restaurant.overall_rating_avg || restaurant.rating || 4.5) * 4));
}

function firstOfferForRestaurant(restaurant = {}) {
  return (restaurant.filteredOffers || restaurant.offers || []).filter(offerIsPublicVisible)[0] || null;
}

function dashboardShell(items, inner) {
  const options = {
    kicker: uiText("Smart Table SaaS"),
    title: uiText(state.mode === "admin" ? "Super Admin" : "Restaurant Partner"),
    navLabel: uiText("Dashboard sections"),
    items,
    inner,
    activeHash: location.hash,
    escapeHtml,
    escapeAttr
  };
  return state.mode === "admin" ? adminDashboardLayout(options) : partnerDashboardLayout(options);
}

function loadingSkeleton() {
  return `
    <section class="skeleton-layout" aria-label="${escapeAttr(t("loading_label", "Loading"))}" aria-busy="true">
      <div class="skeleton-line wide"></div>
      <div class="skeleton-grid">
        ${Array.from({ length: 6 }).map(() => '<div class="skeleton-card"></div>').join("")}
      </div>
      <div class="skeleton-panel"></div>
    </section>
  `;
}

function renderFatalAppError() {
  app.innerHTML = `
    <section class="empty-state app-error-state" role="alert">
      <h1>${escapeHtml(t("app_error_title", "SmartTable could not load this screen."))}</h1>
      <p>${escapeHtml(t("app_error_body", "Please retry. If the problem continues, contact SmartTable support."))}</p>
      <button class="primary-button" data-retry-app type="button">${escapeHtml(t("retry_button", "Retry"))}</button>
    </section>
  `;
  document.querySelector("[data-retry-app]")?.addEventListener("click", () => window.location.reload());
  finalizeRenderedLanguage();
}

function textInput(name, label, value = "", type = "text", attrs = "") {
  return `<label>${escapeHtml(uiText(label))}<input name="${escapeAttr(name)}" type="${escapeAttr(type)}" value="${escapeAttr(value)}" ${attrs}></label>`;
}

function textArea(name, label, value = "", attrs = "") {
  return `<label>${escapeHtml(uiText(label))}<textarea name="${escapeAttr(name)}" ${attrs}>${escapeHtml(value)}</textarea></label>`;
}

function mediaUploadControl(kind, targetName, label) {
  return `
    <label>${escapeHtml(uiText(label))}
      <div class="upload-row">
        <input type="file" accept="image/png,image/jpeg,image/webp" data-upload-kind="${escapeAttr(kind)}" data-upload-target="${escapeAttr(targetName)}">
        <button class="ghost-button" data-upload-button="${escapeAttr(kind)}" data-upload-target="${escapeAttr(targetName)}" type="button">${escapeHtml(uiText("Upload"))}</button>
      </div>
      <span class="form-note">${escapeHtml(uiText("Supabase Storage is used in production. URLs can also be pasted manually."))}</span>
    </label>
  `;
}

async function uploadMedia(kind, targetName) {
  const input = document.querySelector(`[data-upload-kind="${CSS.escape(kind)}"][data-upload-target="${CSS.escape(targetName)}"]`);
  const target = document.querySelector(`[name="${CSS.escape(targetName)}"]`);
  const file = input?.files?.[0];
  if (!file || !target) {
    showToast(t("image_choose_first_toast", "Choose an image first."));
    return;
  }
  try {
    const signed = await api("/partner/storage/sign-upload", {
      method: "POST",
      body: JSON.stringify({
        kind,
        filename: file.name,
        content_type: file.type
      })
    });

    if (signed.upload_url) {
      const uploadResponse = await fetch(signed.upload_url, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file
      });
      if (!uploadResponse.ok) throw new Error(t("image_upload_failed_error", "Image upload failed."));
    }

    if (target.tagName === "TEXTAREA") {
      target.value = [target.value.trim(), signed.public_url].filter(Boolean).join("\n");
    } else {
      target.value = signed.public_url;
    }
    showToast(signed.mode === "demo" ? t("image_upload_demo_prepared_toast", "Demo upload prepared. Configure Supabase Storage for real uploads.") : t("image_uploaded_toast", "Image uploaded."));
  } catch (error) {
    showToast(error.message);
  }
}

function formObject(form) {
  const formData = new FormData(form);
  const data = {};
  for (const [key, value] of formData.entries()) {
    if (data[key] === undefined) data[key] = value;
    else if (Array.isArray(data[key])) data[key].push(value);
    else data[key] = [data[key], value];
  }
  return data;
}

async function loadPublicContent() {
  const payload = await api(`/public/content?lang=${encodeURIComponent(state.lang)}`);
  state.apiMode = payload.mode || state.apiMode;
  state.content = payload.content || {};
  updateMeta();
  updateChromeText();
}

async function loadFeatureStatus() {
  const payload = await api("/system/feature-status").catch(() => ({ features: [] }));
  state.featureStatus = payload.features || [];
}

async function loadPublicOffers() {
  const payload = await api(`/public/offers?lang=${encodeURIComponent(state.lang)}`);
  state.apiMode = payload.mode || state.apiMode;
  state.offers = payload.offers || [];
  updateMeta();
}

async function loadNewestRestaurants() {
  const payload = await api(`/public/restaurants/newest?lang=${encodeURIComponent(state.lang)}`);
  state.apiMode = payload.mode || state.apiMode;
  state.newestRestaurants = payload.restaurants || [];
}

async function loadPublicConfig() {
  const payload = await api("/public/config");
  state.config = payload || {};
  state.platformMode = normalizePlatformMode(payload?.platform_mode);
  state.aiDemoVisibility = normalizeBooleanSetting(payload?.ai_demo_visibility, false);
  state.showAiModeBadge = normalizeBooleanSetting(payload?.show_ai_mode_badge, true);
  state.featureFlags = normalizeFeatureFlagSettings(payload?.feature_flags || {});
  state.featureRegistry = { ...defaultFeatureRegistry, ...(payload?.feature_registry || {}) };
}

function rewardsBookingIdFromUrl() {
  const url = new URL(window.location.href);
  if (!url.pathname.includes("/guest/rewards/photo-upload") && !url.searchParams.has("bookingId")) return "";
  return url.searchParams.get("bookingId") || url.searchParams.get("booking_id") || "";
}

async function loadRewardBookingContext() {
  const bookingId = rewardsBookingIdFromUrl();
  if (!bookingId) {
    state.rewardBookingContext = null;
    return;
  }
  try {
    const payload = await api(`/public/rewards/context?bookingId=${encodeURIComponent(bookingId)}`);
    state.rewardBookingContext = payload.context || null;
  } catch (error) {
    state.rewardBookingContext = { error: error.message, bookingId };
  }
}

async function loadAiPreferences() {
  if (!canShowFeature("ai.preferenceSurvey", { allowDemo: true })) {
    state.aiPreferences = null;
    return;
  }
  const payload = await api(`/ai/preferences?profile_key=${encodeURIComponent(state.aiProfileKey)}`);
  state.aiPreferences = payload.preferences ? { ...payload.preferences, guest_email: payload.profile?.guest_email || "" } : null;
}

async function loadAiRecommendations() {
  if (!canShowFeature("ai.concierge", { allowDemo: true })) {
    state.aiRecommendations = [];
    return;
  }
  const payload = await api(`/ai/recommendations?profile_key=${encodeURIComponent(state.aiProfileKey)}&lang=${encodeURIComponent(state.lang)}`);
  state.aiRecommendations = payload.recommendations || [];
}

async function trackAiEvent(eventType, metadata = {}) {
  if (!isAIConciergeMode()) return;
  try {
    await api("/ai/events", {
      method: "POST",
      body: JSON.stringify({
        profile_key: state.aiProfileKey,
        event_type: eventType,
        restaurant_id: metadata.restaurant_id || metadata.restaurantId || null,
        offer_id: metadata.offer_id || metadata.offerId || null,
        reservation_id: metadata.reservation_id || null,
        metadata
      })
    });
  } catch {
    // Learning signals are useful, but should never block the guest flow.
  }
}

function safeSignupAnalyticsMetadata(metadata = {}) {
  const allowed = [
    "step_index",
    "step_key",
    "field_key",
    "selected_count",
    "selected",
    "language",
    "platform_mode",
    "ai_concierge_visible",
    "completion_state",
    "source",
    "reason",
    "restaurant_count",
    "completed_steps_count",
    "preference_question_count",
    "terms_version",
    "privacy_policy_version",
    "marketing_consent",
    "has_error",
    "error_category",
    "action",
    "status",
    "target",
    "tab",
    "feature_key",
    "remember_me",
    "auth_provider",
    "request_type",
    "restaurant_id",
    "reservation_status",
    "notification_type",
    "settings_count",
    "channel_count",
    "session_scope"
  ];
  return Object.fromEntries(allowed
    .filter((key) => metadata[key] !== undefined)
    .map((key) => [key, metadata[key]]));
}

function signupStepAnalyticsMeta(stepIndex = ensureSignupState().step, extra = {}) {
  const step = signupSteps[stepIndex] || signupSteps[0];
  return safeSignupAnalyticsMetadata({
    step_index: stepIndex,
    step_key: step.key,
    language: state.lang,
    platform_mode: currentPlatformMode(),
    ai_concierge_visible: canShowFeature("ai.concierge", { audience: "guest", allowDemo: true }),
    source: "guest_signup",
    ...extra
  });
}

function trackSignupEvent(eventType, metadata = {}, options = {}) {
  if (!signupAnalyticsEvents.has(eventType)) return;
  trackSafeAnalyticsEvent(eventType, metadata, options);
}

function trackGuestAccountEvent(eventType, metadata = {}, options = {}) {
  if (!guestAccountAnalyticsEvents.has(eventType)) return;
  trackSafeAnalyticsEvent(eventType, {
    language: state.lang,
    platform_mode: currentPlatformMode(),
    ai_concierge_visible: canShowFeature("ai.concierge", { audience: "guest", allowDemo: true }),
    source: "guest_account",
    ...metadata
  }, options);
}

function trackSafeAnalyticsEvent(eventType, metadata = {}, options = {}) {
  const body = JSON.stringify({
    profile_key: state.aiProfileKey,
    event_type: eventType,
    metadata: safeSignupAnalyticsMetadata(metadata)
  });
  try {
    if (options.keepalive && navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: Boolean(options.keepalive)
    }).catch(() => {});
  } catch {
    // Analytics must never block account creation or navigation.
  }
}

function maybeTrackSignupAbandoned(reason = "navigation", keepalive = false) {
  const signup = state.signup;
  if (!signup || signup.analyticsCompleted || signup.analyticsAbandoned) return;
  const hasProgress = signup.step > 0 || Object.values(signup.data || {}).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "boolean") return value;
    return String(value || "").trim().length > 0;
  });
  if (!hasProgress) return;
  signup.analyticsAbandoned = true;
  trackSignupEvent("signup_abandoned", signupStepAnalyticsMeta(signup.step, {
    reason,
    completion_state: "incomplete",
    completed_steps_count: signup.step
  }), { keepalive });
}

function layoutHero(inner) {
  const image = t("banner_image", "/assets/restaurant-hero.png");
  const heroCopy = isBasicMode()
    ? {
      kicker: t("basic_hero_kicker", "SmartTable"),
      title: t("basic_hero_title", "Discounted restaurant reservations in New York"),
      subtitle: t("basic_hero_subtitle", "Browse restaurants, choose a discounted table offer, and send a reservation request directly to the restaurant.")
    }
    : {
      kicker: t("hero_kicker", "SmartTable AI"),
      title: t("hero_title", "The AI Revenue Operating System for Restaurants"),
      subtitle: t("hero_subtitle", "Personalized dining for guests, predictive demand intelligence for restaurants, and smarter revenue recovery across New York.")
    };
  const area = state.mode === "admin" ? "admin" : state.mode === "partner" ? "partner" : "guest";
  const heroOptions = {
    image,
    copy: heroCopy,
    inner,
    escapeHtml,
    escapeAttr
  };
  if (area === "guest") return guestHeroLayout(heroOptions);
  return appAreaShell(area, heroLayoutShell(heroOptions), {
    className: "hero-app-layout",
    escapeAttr
  });
}

function normalizedStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isDisallowedStatus(value) {
  const status = normalizedStatus(value);
  return Boolean(status && ["inactive", "disabled", "deleted", "archived", "paused", "hidden", "draft", "unpublished", "rejected"].includes(status));
}

function isPastOffer(offer = {}) {
  const calculatedStatus = String(offer.offer_status_calculated || offer.calculated_status || "").trim().toLowerCase();
  const errorCode = String(offer.offer_error_code || offer.code || "").trim().toUpperCase();
  return calculatedStatus === "expired" || errorCode === "OFFER_EXPIRED";
}

function offerIsPublicVisible(offer = {}) {
  if (isDisallowedStatus(offer.status || offer.offer_status || offer.deal_status)) return false;
  if (isDisallowedStatus(offer.restaurant_status || offer.restaurant_visibility || offer.partner_status)) return false;
  if (offer.is_published === false || offer.published === false || offer.public === false) return false;
  if (isPastOffer(offer)) return false;
  if (Number(offer.available_tables ?? offer.available_seats ?? 0) < 1) return false;
  return true;
}

function groupRestaurants() {
  const grouped = new Map();
  for (const offer of state.offers.filter(offerIsPublicVisible)) {
    const restaurantId = offer.restaurant_id;
    if (!restaurantId) continue;
    if (!grouped.has(restaurantId)) {
      grouped.set(restaurantId, {
        id: restaurantId,
        name: offer.restaurant_name,
        email: offer.restaurant_email,
        district: offer.district,
        address: offer.address,
        cuisine: offer.cuisine_type || offer.cuisine,
        rating: offer.rating || "4.8",
        description: offer.restaurant_description || offer.description || "",
        website: offer.website,
        instagram: offer.instagram,
        facebook: offer.facebook,
        tiktok: offer.tiktok,
        google_maps_url: offer.google_maps_url,
        google_place_id: offer.google_place_id,
        logo_url: offer.logo_url,
        hero_image_url: offer.hero_image_url,
        cover_image: offer.cover_image,
        card_image: offer.card_image,
        icon_image: offer.icon_image,
        menu_pdf_url: offer.menu_pdf_url,
        price_range: offer.price_range,
        dress_code: offer.dress_code,
        outdoor_seating: offer.outdoor_seating,
        parking_available: offer.parking_available,
        kids_friendly: offer.kids_friendly,
        pet_friendly: offer.pet_friendly,
        wheelchair_accessible: offer.wheelchair_accessible,
        payment_methods: offer.payment_methods,
        chef_name: offer.chef_name,
        year_opened: offer.year_opened,
        capacity: offer.capacity,
        private_room_available: offer.private_room_available,
        opening_hours: offer.opening_hours,
        gallery_images: offer.gallery_images,
        restaurant_type: offer.restaurant_type,
        latitude: offer.latitude,
        longitude: offer.longitude,
        sort_order: offer.sort_order,
        created_at: offer.restaurant_created_at || offer.created_at,
        ai_discount_enabled: offer.ai_discount_enabled !== false,
        min_discount_percent: offer.min_discount_percent ?? 10,
        max_discount_percent: offer.max_discount_percent ?? 30,
        target_margin_percent: offer.target_margin_percent ?? 65,
        average_service_minutes: offer.average_service_minutes ?? 75,
        food_rating_avg: offer.food_rating_avg,
        service_rating_avg: offer.service_rating_avg,
        ambience_rating_avg: offer.ambience_rating_avg,
        overall_rating_avg: offer.overall_rating_avg,
        review_count: offer.review_count || 0,
        favorites_count: offer.favorites_count || 0,
        image: offer.card_image || offer.hero_image_url || offer.icon_image || offer.offer_image || "/assets/restaurant-hero.png",
        offers: []
      });
    }
    grouped.get(restaurantId).offers.push(offer);
  }
  return [...grouped.values()].map((restaurant) => ({
    ...restaurant,
    offers: restaurant.offers.sort((a, b) => `${a.offer_date || ""}${a.start_time || ""}`.localeCompare(`${b.offer_date || ""}${b.start_time || ""}`))
  }));
}

function highestDiscount(restaurant) {
  return Math.max(...restaurant.offers.map((offer) => Number(offer.discount_value || offer.discount_percent || 0)), 0);
}

function soonestOfferKey(restaurant) {
  return restaurant.offers.map((offer) => `${offer.offer_date || "9999-12-31"}${offer.start_time || offer.offer_time || "23:59"}`).sort()[0] || "9999-12-31";
}

function filteredRestaurants() {
  const filters = state.filters;
  const queryName = filters.restaurantName.toLowerCase().trim();
  const neighborhood = filters.neighborhood.toLowerCase().trim();
  const cuisine = filters.cuisine.toLowerCase().trim();
  const minDiscount = Number(filters.discount || 0);
  const partySize = Number(filters.partySize || 0);
  const restaurants = groupRestaurants().filter((restaurant) => {
    if (queryName && !restaurant.name.toLowerCase().includes(queryName)) return false;
    if (neighborhood && !String(restaurant.district || restaurant.address || "").toLowerCase().includes(neighborhood)) return false;
    if (cuisine && !String(restaurant.cuisine || "").toLowerCase().includes(cuisine)) return false;
    const matchingOffers = restaurant.offers.filter((offer) => {
      if (minDiscount && Number(offer.discount_value || offer.discount_percent || 0) < minDiscount) return false;
      if (filters.date && offer.offer_date !== filters.date) return false;
      if (filters.time) {
        const start = offer.start_time || offer.offer_time || "";
        const end = offer.end_time || start;
        if (start && filters.time < start) return false;
        if (end && filters.time > end) return false;
      }
      if (partySize && partySize > Number(offer.max_party_size || 0)) return false;
      if (filters.availableOnly && Number(offer.available_tables || 0) < 1) return false;
      return true;
    });
    restaurant.filteredOffers = matchingOffers;
    return matchingOffers.length > 0;
  });

  return restaurants.sort((a, b) => {
    if (filters.sort === "newest") return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    if (filters.sort === "highest_discount") return highestDiscount(b) - highestDiscount(a);
    if (filters.sort === "soonest") return soonestOfferKey(a).localeCompare(soonestOfferKey(b));
    if (filters.sort === "name") return a.name.localeCompare(b.name);
    const order = Number(a.sort_order ?? 999999) - Number(b.sort_order ?? 999999);
    return order || a.name.localeCompare(b.name);
  });
}

function filterOptionValues(field) {
  const restaurants = groupRestaurants();
  const values = restaurants.map((restaurant) => String(restaurant[field] || "").trim()).filter(Boolean);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function optionSelect(name, label, value, options, placeholder) {
  return `
    <label class="guest-select">
      ${escapeHtml(label)}
      <select name="${escapeAttr(name)}">
        <option value="">${escapeHtml(placeholder)}</option>
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${value === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
    </label>
  `;
}

function guestHeroSearchPanel() {
  const filters = state.filters;
  const neighborhoods = filterOptionValues("district");
  const cuisines = filterOptionValues("cuisine");
  return `
    <form class="guest-form-card guest-hero-search offers-filters" id="guestHeroSearchForm">
      <div>
        <span class="section-kicker">${escapeHtml(t("guest_search_kicker", "Find a table"))}</span>
        <h2>${escapeHtml(t("guest_search_title", "Search discounted restaurant offers"))}</h2>
      </div>
      <div class="guest-field-grid">
        <label class="guest-field">${escapeHtml(t("filter_restaurant_name_label", "Restaurant name"))}<input name="restaurantName" value="${escapeAttr(filters.restaurantName)}" placeholder="${escapeAttr(t("restaurant_search_placeholder", "Restaurant name"))}"></label>
        <label class="guest-field">${escapeHtml(t("filter_date_label", "Date"))}<input name="date" type="date" value="${escapeAttr(filters.date)}"></label>
        <label class="guest-field">${escapeHtml(t("filter_time_label", "Time"))}<input name="time" type="time" value="${escapeAttr(filters.time)}"></label>
        <label class="guest-field">${escapeHtml(t("filter_party_size_label", "Guests"))}<input name="partySize" type="number" min="1" value="${escapeAttr(filters.partySize)}" placeholder="2"></label>
        ${optionSelect("neighborhood", t("filter_neighborhood_label", "Neighborhood"), filters.neighborhood, neighborhoods, t("all_neighborhoods_label", "All neighborhoods"))}
        ${optionSelect("cuisine", t("filter_cuisine_label", "Cuisine"), filters.cuisine, cuisines, t("all_cuisines_label", "All cuisines"))}
        <label class="guest-select">
          ${escapeHtml(t("filter_discount_label", "Minimum discount"))}
          <select name="discount">
            <option value="">${escapeHtml(t("any_discount_label", "Any discount"))}</option>
            ${["10", "15", "20", "25", "30", "40", "50"].map((discount) => `<option value="${discount}" ${String(filters.discount) === discount ? "selected" : ""}>${discount}%+</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="guest-button-row guest-hero-actions">
        <button class="guest-primary-action" type="submit">${escapeHtml(t("search_offers_button", "Search offers"))}</button>
        <button class="guest-secondary-action" data-clear-guest-filters type="button">${escapeHtml(t("clear_filters_button", "Clear filters"))}</button>
      </div>
    </form>
  `;
}

function filterBar() {
  const filters = state.filters;
  return `
    <section class="filters offers-filters">
      <label>${escapeHtml(t("filter_restaurant_name_label", "Restaurant name"))}<input name="restaurantName" value="${escapeAttr(filters.restaurantName)}" placeholder="${escapeAttr(t("filter_restaurant_placeholder", "Hudson Hearth"))}"></label>
      <label>${escapeHtml(t("filter_neighborhood_label", "Neighborhood"))}<input name="neighborhood" value="${escapeAttr(filters.neighborhood)}" placeholder="${escapeAttr(t("filter_neighborhood_placeholder", "West Village"))}"></label>
      <label>${escapeHtml(t("filter_cuisine_label", "Cuisine"))}<input name="cuisine" value="${escapeAttr(filters.cuisine)}" placeholder="${escapeAttr(t("filter_cuisine_placeholder", "Italian"))}"></label>
      <label>${escapeHtml(t("filter_discount_label", "Minimum discount"))}<input name="discount" type="number" min="0" max="90" value="${escapeAttr(filters.discount)}" placeholder="${escapeAttr(t("filter_discount_placeholder", "20"))}"></label>
      <label>${escapeHtml(t("filter_date_label", "Date"))}<input name="date" type="date" value="${escapeAttr(filters.date)}"></label>
      <label>${escapeHtml(t("filter_time_label", "Time"))}<input name="time" type="time" value="${escapeAttr(filters.time)}"></label>
      <label>${escapeHtml(t("filter_party_size_label", "Party size"))}<input name="partySize" type="number" min="1" value="${escapeAttr(filters.partySize)}" placeholder="2"></label>
      <label>${escapeHtml(t("sort_label", "Sort"))}
        <select name="sort">
          <option value="recommended" ${filters.sort === "recommended" ? "selected" : ""}>${escapeHtml(t("sort_recommended_label", "Recommended"))}</option>
          <option value="newest" ${filters.sort === "newest" ? "selected" : ""}>${escapeHtml(t("sort_newest_label", "Newest"))}</option>
          <option value="highest_discount" ${filters.sort === "highest_discount" ? "selected" : ""}>${escapeHtml(t("sort_highest_discount_label", "Highest discount"))}</option>
          <option value="soonest" ${filters.sort === "soonest" ? "selected" : ""}>${escapeHtml(t("sort_soonest_label", "Soonest available"))}</option>
          <option value="name" ${filters.sort === "name" ? "selected" : ""}>${escapeHtml(t("sort_name_label", "Restaurant name A-Z"))}</option>
          <option value="admin_order" ${filters.sort === "admin_order" ? "selected" : ""}>${escapeHtml(t("sort_admin_order_label", "Admin custom order"))}</option>
        </select>
      </label>
      <label class="check filter-check"><input name="availableOnly" type="checkbox" ${filters.availableOnly ? "checked" : ""}> ${escapeHtml(t("filter_available_only_label", "Only available offers"))}</label>
    </section>
  `;
}

function offerRows(restaurant) {
  const offers = restaurant.filteredOffers || restaurant.offers;
  return offers.map((offer) => `
    <article class="nested-offer premium-offer-card">
      <div>
        <div class="offer-line">
          <strong>${escapeHtml(offer.title || offer.offer_title || "Discounted table")}</strong>
          <span class="discount-pill">${escapeHtml(discountLabel(offer))}</span>
        </div>
        <p class="muted">${escapeHtml(offer.offer_description || "")}</p>
        <p class="muted">${escapeHtml(formatDate(offer.offer_date || offer.reservation_date, offer.start_time || offer.offer_time, offer.end_time))} - ${escapeHtml(offer.available_tables ?? 0)} tables - up to ${escapeHtml(offer.max_party_size ?? 4)} guests</p>
      </div>
      <button class="primary-button" data-open-reserve="${escapeAttr(offer.offer_id)}" data-restaurant="${escapeAttr(restaurant.id)}" type="button">${escapeHtml(t("reserve_button", "Reserve"))}</button>
    </article>
  `).join("");
}

function restaurantDetailOffers(restaurant) {
  const offers = (restaurant.filteredOffers || restaurant.offers || []).filter(offerIsPublicVisible);
  return offers.map((offer) => `
    <article class="detail-offer-card guest-card">
      <div class="offer-line">
        <h3>${escapeHtml(offer.title || offer.offer_title || t("offer_default_title", "SmartTable offer"))}</h3>
        <span class="discount-pill">${escapeHtml(discountLabel(offer))}</span>
      </div>
      <p class="muted">${escapeHtml(offer.offer_description || offer.description || "")}</p>
      <div class="detail-offer-meta">
        <span>${escapeHtml(formatDate(offer.offer_date || offer.reservation_date, offer.start_time || offer.offer_time, offer.end_time))}</span>
        <span>${escapeHtml(offer.available_tables ?? 0)} ${escapeHtml(t("tables_left_label", "tables left"))}</span>
        <span>${escapeHtml(t("max_party_label", "Max party"))}: ${escapeHtml(offer.max_party_size ?? 4)}</span>
      </div>
      ${offerTermsList(offer)}
      <button class="primary-button" data-open-reserve="${escapeAttr(offer.offer_id)}" data-restaurant="${escapeAttr(restaurant.id)}" type="button">${escapeHtml(t("reserve_button", "Reserve"))}</button>
    </article>
  `).join("") || `<div class="guest-empty-state">${escapeHtml(t("restaurant_no_active_offers", "This restaurant does not have an active SmartTable offer right now."))}</div>`;
}

function readableCustomTerms(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== "")
      .map(([key, item]) => `${key.replace(/_/g, " ")}: ${item}`)
      .join(", ");
  }
  return String(value);
}

function offerTermsList(offer = {}) {
  const conditions = offer.structured_conditions || {};
  const customTerms = readableCustomTerms(offer.custom_terms || conditions.custom_terms);
  const terms = [
    offer.minimum_spend || conditions.minimum_spend ? `${t("minimum_spend_label", "Minimum spend")}: ${offer.minimum_spend || conditions.minimum_spend}` : "",
    (offer.min_party_size || conditions.min_party_size) ? `${t("min_party_label", "Min party")}: ${offer.min_party_size || conditions.min_party_size}` : "",
    (offer.max_party_size || conditions.max_party_size) ? `${t("max_party_label", "Max party")}: ${offer.max_party_size || conditions.max_party_size}` : "",
    (offer.applies_to_drinks !== undefined || conditions.applies_to_drinks !== undefined) ? `${t("applies_to_drinks_label", "Applies to drinks")}: ${boolValue(offer.applies_to_drinks ?? conditions.applies_to_drinks) ? t("yes_label", "Yes") : t("no_label", "No")}` : "",
    (offer.time_limit_minutes || conditions.time_limit_minutes) ? `${t("time_limit_label", "Time limit")}: ${offer.time_limit_minutes || conditions.time_limit_minutes} min` : "",
    (offer.combinable !== undefined || conditions.combinable !== undefined) ? `${t("combinable_label", "Combinable")}: ${boolValue(offer.combinable ?? conditions.combinable) ? t("yes_label", "Yes") : t("no_label", "No")}` : "",
    customTerms
  ].filter(Boolean);
  if (!terms.length) return "";
  return `<div class="guest-chip-grid offer-terms">${terms.map((term) => `<span class="guest-filter-chip">${escapeHtml(term)}</span>`).join("")}</div>`;
}

function ratingValue(value) {
  return value === null || value === undefined || value === "" ? "N/A" : Number(value).toFixed(1);
}

function restaurantRatings(restaurant) {
  if (!Number(restaurant.review_count || 0)) {
    return `<div class="guest-empty-state compact">${escapeHtml(t("restaurant_no_reviews", "No guest ratings yet."))}</div>`;
  }
  return `
    <div class="rating-summary">
      <div><span>${escapeHtml(t("review_food_label", "Food"))}</span><strong>${escapeHtml(ratingValue(restaurant.food_rating_avg))}</strong></div>
      <div><span>${escapeHtml(t("review_service_label", "Service"))}</span><strong>${escapeHtml(ratingValue(restaurant.service_rating_avg))}</strong></div>
      <div><span>${escapeHtml(t("review_ambience_label", "Ambience"))}</span><strong>${escapeHtml(ratingValue(restaurant.ambience_rating_avg))}</strong></div>
      <div><span>${escapeHtml(t("review_overall_label", "Overall"))}</span><strong>${escapeHtml(ratingValue(restaurant.overall_rating_avg))}</strong></div>
      <small>${escapeHtml(restaurant.review_count || 0)} ${escapeHtml(t("review_count_label", "reviews"))}</small>
    </div>
  `;
}

function restaurantCard(restaurant) {
  const firstOffer = firstOfferForRestaurant(restaurant);
  const rating = restaurant.overall_rating_avg || restaurant.rating;
  return `
    <article class="restaurant-card grouped-card guest-card guest-restaurant-card">
      <div class="restaurant-photo" style="background-image: linear-gradient(180deg, rgba(20, 30, 25, 0), rgba(20, 30, 25, 0.54)), url('${escapeAttr(restaurant.image)}')" aria-hidden="true"></div>
      <div class="restaurant-body">
        <div class="restaurant-footer">
          <div>
            <div class="status-title-row"><h3>${escapeHtml(restaurant.name)}</h3></div>
            <div class="restaurant-meta">
              <span>${escapeHtml(restaurant.cuisine || "Restaurant")}</span><span class="dot"></span><span>${escapeHtml(restaurant.district || "New York")}</span><span class="dot"></span><span>${escapeHtml(restaurant.price_range || "$$")}</span>
              ${rating ? `<span class="dot"></span><span>${escapeHtml(ratingValue(rating))}/5</span>` : ""}
            </div>
          </div>
          <strong class="discount-pill">${escapeHtml(`-${highestDiscount(restaurant)}%`)}</strong>
        </div>
        <p class="muted">${escapeHtml(restaurant.description)}</p>
        ${firstOffer ? `<div class="guest-chip-grid"><span class="guest-badge success">${escapeHtml(t("available_time_label", "Available"))}: ${escapeHtml(formatDate(firstOffer.offer_date || firstOffer.reservation_date, firstOffer.start_time || firstOffer.offer_time, firstOffer.end_time))}</span></div>` : ""}
        <div class="card-actions outside-actions">
          ${firstOffer ? `<button class="primary-button" data-open-reserve="${escapeAttr(firstOffer.offer_id)}" data-restaurant="${escapeAttr(restaurant.id)}" type="button">${escapeHtml(t("reserve_button", "Reserve"))}</button>` : ""}
          <button class="ghost-button" data-open-restaurant="${escapeAttr(restaurant.id)}" data-restaurant-slug="${escapeAttr(restaurantRouteSlug(restaurant))}" type="button">${escapeHtml(t("restaurant_details_button", "View details"))}</button>
          <button class="guest-icon-action" data-follow-restaurant="${escapeAttr(restaurant.id)}" type="button" aria-label="${escapeAttr(t("favorite_button", "Add to favorites"))}">♡</button>
        </div>
        <div class="offer-stack">
          ${offerRows(restaurant)}
        </div>
      </div>
    </article>
  `;
}

function restaurantDetailModal() {
  const restaurantId = state.restaurantDetail;
  if (!restaurantId) return "";
  const restaurant = findPublicRestaurant(restaurantId);
  if (!restaurant) return "";
  const id = restaurant.id || restaurant.restaurant_id;
  const name = restaurant.name || restaurant.restaurant_name;
  const firstOffer = firstOfferForRestaurant(restaurant);
  const amenities = amenityList(restaurant);
  const gallery = restaurantGallery(restaurant);
  const hasProvidedImage = restaurantHasProvidedImage(restaurant);
  const socials = socialLinks(restaurant);
  const payments = paymentMethods(restaurant.payment_methods);
  const aiMatchPanel = canShowFeature("ai.concierge", { allowDemo: true }) ? `
    <div class="ai-planning-note">
      <strong>${escapeHtml(t("ai_match_label", "AI match"))}: ${escapeHtml(aiMatchForRestaurant(restaurant))}%</strong>
      <p>${escapeHtml(t("restaurant_ai_match_copy", "SmartTable compares your preferences, location, quality signals, and available offers for this match."))}</p>
    </div>
  ` : "";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card restaurant-detail-modal restaurant-modal" role="dialog" aria-modal="true" aria-labelledby="restaurantDetailTitle" tabindex="-1">
        <button class="icon-button detail-close" data-close-modal type="button" aria-label="${escapeAttr(t("modal_cancel_label", "Cancel"))}">X</button>
        <div class="restaurant-detail-hero" style="background-image: linear-gradient(180deg, rgba(13,20,17,0.08), rgba(13,20,17,0.66)), url('${escapeAttr(restaurantHeroImage(restaurant))}')">
          <img class="restaurant-detail-logo" src="${escapeAttr(restaurantLogoImage(restaurant))}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">
          <div>
            <span class="section-kicker">${escapeHtml(t("restaurant_detail_kicker", "Restaurant profile"))}</span>
            <h2 id="restaurantDetailTitle">${escapeHtml(name)}</h2>
            <div class="restaurant-meta detail-meta">
              <span>${escapeHtml(restaurant.cuisine || restaurant.cuisine_type || "Restaurant")}</span><span class="dot"></span>
              <span>${escapeHtml(restaurant.district || "New York")}</span><span class="dot"></span>
              <span>${escapeHtml(restaurant.price_range || "$$")}</span>
            </div>
          </div>
        </div>
        <div class="restaurant-detail-body restaurant-modal__body" tabindex="0">
          <section class="detail-top-grid">
            <div>
              ${restaurantRatings(restaurant)}
              ${aiMatchPanel}
            </div>
            <div class="detail-cta-stack">
              ${firstOffer ? `<button class="primary-button wide" data-open-reserve="${escapeAttr(firstOffer.offer_id)}" data-restaurant="${escapeAttr(id)}" type="button">${escapeHtml(t("reserve_button", "Reserve"))}</button>` : ""}
              <button class="ghost-button wide" data-follow-restaurant="${escapeAttr(id)}" type="button">${escapeHtml(t("follow_button", "Follow restaurant"))}</button>
              <button class="ghost-button wide" data-follow-restaurant="${escapeAttr(id)}" data-ai-action="favorite" type="button">${escapeHtml(t("favorite_button", "Add to favorites"))}</button>
            </div>
          </section>
          <section>
            <div class="section-title-row compact"><div><span class="section-kicker">${escapeHtml(t("active_offers_label", "Active offers"))}</span><h2>${escapeHtml(t("restaurant_offers_title", "Available tables"))}</h2></div></div>
            <div class="detail-offer-grid">${restaurantDetailOffers(restaurant)}</div>
          </section>
          <section class="detail-grid two">
            <article>
              <span class="section-kicker">${escapeHtml(t("about_title", "About"))}</span>
              <p>${escapeHtml(restaurant.description || restaurant.restaurant_description || "")}</p>
              <div class="detail-info-list">
                ${restaurant.opening_hours ? `<span>${escapeHtml(t("business_hours_label", "Business hours"))}: ${escapeHtml(restaurant.opening_hours)}</span>` : ""}
                ${restaurant.chef_name ? `<span>${escapeHtml(t("chef_name_label", "Chef"))}: ${escapeHtml(restaurant.chef_name)}</span>` : ""}
                ${restaurant.year_opened ? `<span>${escapeHtml(t("year_opened_label", "Year opened"))}: ${escapeHtml(restaurant.year_opened)}</span>` : ""}
                ${restaurant.capacity ? `<span>${escapeHtml(t("capacity_label", "Capacity"))}: ${escapeHtml(restaurant.capacity)}</span>` : ""}
                ${restaurant.dress_code ? `<span>${escapeHtml(t("dress_code_label", "Dress code"))}: ${escapeHtml(restaurant.dress_code)}</span>` : ""}
              </div>
            </article>
            <article>
              <span class="section-kicker">${escapeHtml(t("amenities_title", "Amenities"))}</span>
              <div class="amenity-grid">${amenities.map((item) => `<span class="amenity-chip">${escapeHtml(item)}</span>`).join("") || `<span class="muted">${escapeHtml(t("amenities_empty", "Amenities will appear here soon."))}</span>`}</div>
              <div class="tag-row">${payments.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>
            </article>
          </section>
          <section class="detail-link-row">
            ${restaurant.menu_pdf_url ? `<a class="ghost-button" href="${escapeAttr(restaurant.menu_pdf_url)}" target="_blank" rel="noreferrer">${escapeHtml(t("menu_link_label", "View menu"))}</a>` : ""}
            ${restaurant.google_maps_url ? `<a class="ghost-button" href="${escapeAttr(restaurant.google_maps_url)}" target="_blank" rel="noreferrer">${escapeHtml(t("directions_link_label", "Map / directions"))}</a>` : ""}
            ${socials.filter(([label]) => !["Menu", "Google Maps"].includes(label)).map(([label, href]) => `<a class="ghost-button" href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`).join("")}
          </section>
          <section>
            <div class="section-title-row compact"><div><span class="section-kicker">${escapeHtml(t("gallery_title", "Gallery"))}</span><h2>${escapeHtml(t("restaurant_gallery_title", "Dining room and dishes"))}</h2></div></div>
            ${hasProvidedImage ? `<div class="detail-gallery guest-gallery">${gallery.map((image) => `<span style="background-image: url('${escapeAttr(image)}')" aria-hidden="true"></span>`).join("")}</div>` : `<div class="guest-empty-state">${escapeHtml(t("restaurant_no_images", "Restaurant images will appear here after the partner uploads them."))}</div>`}
          </section>
          <section>
            <div class="section-title-row compact">
              <div><span class="section-kicker">${escapeHtml(t("reviews_title", "Reviews"))}</span><h2>${escapeHtml(t("rating_summary_title", "Rating summary"))}</h2></div>
              <button class="ghost-button" data-review-restaurant="${escapeAttr(id)}" type="button">${escapeHtml(t("review_button", "Write review"))}</button>
            </div>
            ${restaurantRatings(restaurant)}
          </section>
        </div>
      </section>
    </div>
  `;
}

function listView(restaurants) {
  const cards = restaurants.map(restaurantCard).join("");
  return `<section class="restaurant-grid grouped-grid" id="guest-restaurants">${cards || `<div class="empty-state">${escapeHtml(t("offers_empty", "No active offers yet."))}</div>`}</section>`;
}

function mapView(restaurants) {
  const fallbackCards = restaurants.map((restaurant) => `
    <button class="map-pin-card" data-open-reserve="${escapeAttr((restaurant.filteredOffers || restaurant.offers)[0]?.offer_id || "")}" data-restaurant="${escapeAttr(restaurant.id)}" type="button">
      <strong>${escapeHtml(restaurant.name)}</strong>
      <span>${escapeHtml(restaurant.district || "New York")} - ${escapeHtml((restaurant.filteredOffers || restaurant.offers).length)} ${escapeHtml(t("offers_count_label", "active offers"))}</span>
    </button>
  `).join("");
  return `
    <section class="map-layout" id="guest-restaurants">
      <div class="map-canvas" id="mapCanvas">${state.config.google_maps_enabled ? "" : `<div class="empty-state">${escapeHtml(t("map_key_missing", "Google Maps is ready, but the API key is not configured yet."))}</div>`}</div>
      <div class="map-list">${fallbackCards}</div>
    </section>
  `;
}

function normalizeNewestRestaurant(row) {
  return {
    id: row.restaurant_id || row.id,
    name: row.restaurant_name || row.name,
    district: row.district,
    address: row.address,
    cuisine: row.cuisine_type || row.cuisine,
    description: row.restaurant_description || row.description || "",
    image: row.card_image || row.hero_image_url || row.icon_image || "/assets/restaurant-hero.png",
    logo_url: row.logo_url,
    hero_image_url: row.hero_image_url,
    cover_image: row.cover_image,
    card_image: row.card_image,
    icon_image: row.icon_image,
    menu_pdf_url: row.menu_pdf_url,
    website: row.website,
    instagram: row.instagram,
    facebook: row.facebook,
    tiktok: row.tiktok,
    google_maps_url: row.google_maps_url,
    price_range: row.price_range,
    dress_code: row.dress_code,
    outdoor_seating: row.outdoor_seating,
    parking_available: row.parking_available,
    kids_friendly: row.kids_friendly,
    pet_friendly: row.pet_friendly,
    wheelchair_accessible: row.wheelchair_accessible,
    payment_methods: row.payment_methods,
    chef_name: row.chef_name,
    year_opened: row.year_opened,
    capacity: row.capacity,
    private_room_available: row.private_room_available,
    opening_hours: row.opening_hours,
    gallery_images: row.gallery_images,
    first_offer_id: row.first_offer_id,
    offer_count: row.offer_count || 0,
    highest_discount: row.highest_discount || 0,
    food_rating_avg: row.food_rating_avg,
    service_rating_avg: row.service_rating_avg,
    ambience_rating_avg: row.ambience_rating_avg,
    overall_rating_avg: row.overall_rating_avg,
    review_count: row.review_count || 0
  };
}

function newestRestaurantsSection() {
  const rows = state.newestRestaurants.map(normalizeNewestRestaurant);
  const cards = rows.map((restaurant) => `
    <button class="newest-card" data-newest-restaurant="${escapeAttr(restaurant.id)}" data-restaurant-slug="${escapeAttr(restaurantRouteSlug(restaurant))}" data-newest-offer="${escapeAttr(restaurant.first_offer_id || "")}" type="button">
      <span class="newest-image" style="background-image: url('${escapeAttr(restaurant.image)}')" aria-hidden="true"></span>
      <span class="newest-copy">
        <strong>${escapeHtml(restaurant.name)}</strong>
        <small>${escapeHtml(restaurant.district || "New York")} - ${escapeHtml(restaurant.cuisine || "Restaurant")}</small>
        <small>${escapeHtml(restaurant.offer_count)} ${escapeHtml(t("offers_count_label", "active offers"))}</small>
      </span>
    </button>
  `).join("");
  return `
    <section class="newest-section">
      <div class="section-title-row">
        <div>
          <span class="section-kicker">${escapeHtml(t("newest_restaurants_kicker", "New this week"))}</span>
          <h2>${escapeHtml(t("newest_restaurants_title", "Newest Restaurants This Week"))}</h2>
        </div>
      </div>
      <div class="newest-grid">${cards || `<div class="empty-state">${escapeHtml(t("newest_restaurants_empty", "No new restaurants were added this week. Check back soon."))}</div>`}</div>
    </section>
  `;
}

function normalizeAiRecommendation(row) {
  return {
    id: row.restaurant_id || row.id,
    name: row.restaurant_name || row.name,
    district: row.district,
    address: row.address,
    cuisine: row.cuisine_type || row.cuisine,
    description: row.restaurant_description || row.description || "",
    image: row.card_image || row.hero_image_url || row.icon_image || "/assets/restaurant-hero.png",
    logo_url: row.logo_url,
    hero_image_url: row.hero_image_url,
    cover_image: row.cover_image,
    card_image: row.card_image,
    icon_image: row.icon_image,
    menu_pdf_url: row.menu_pdf_url,
    website: row.website,
    instagram: row.instagram,
    facebook: row.facebook,
    tiktok: row.tiktok,
    google_maps_url: row.google_maps_url,
    price_range: row.price_range,
    dress_code: row.dress_code,
    outdoor_seating: row.outdoor_seating,
    parking_available: row.parking_available,
    kids_friendly: row.kids_friendly,
    pet_friendly: row.pet_friendly,
    wheelchair_accessible: row.wheelchair_accessible,
    payment_methods: row.payment_methods,
    chef_name: row.chef_name,
    year_opened: row.year_opened,
    capacity: row.capacity,
    private_room_available: row.private_room_available,
    opening_hours: row.opening_hours,
    gallery_images: row.gallery_images,
    first_offer_id: row.first_offer_id,
    offer_count: row.offer_count || 0,
    highest_discount: row.highest_discount || 0,
    ai_match_score: row.ai_match_score || 0,
    recommended_discount_percent: row.recommended_discount_percent || 0,
    ai_reasons: asArray(row.ai_reasons),
    why_recommended: row.why_recommended || asArray(row.ai_reasons).join(", "),
    travel_estimate: row.travel_estimate || "12-18 min estimated travel",
    best_time_to_reserve: row.best_time_to_reserve || "Early dinner window",
    estimated_dining_duration: row.estimated_dining_duration || `${row.average_service_minutes || 75} min`,
    available_offer_label: row.available_offer_label || (row.first_offer_id ? `${row.highest_discount || row.recommended_discount_percent || 0}% SmartTable offer available` : "No active discount needed"),
    matching_preferences: asArray(row.matching_preferences || row.ai_reasons),
    smart_discount_explanation: row.smart_discount_explanation || ""
  };
}

function aiRecommendationCard(row) {
  const restaurant = normalizeAiRecommendation(row);
  const reserveButton = restaurant.first_offer_id
    ? `<button class="primary-button" data-open-reserve="${escapeAttr(restaurant.first_offer_id)}" data-restaurant="${escapeAttr(restaurant.id)}" data-ai-action="reserve" type="button">${escapeHtml(t("reserve_button", "Reserve"))}</button>`
    : `<button class="primary-button" data-follow-restaurant="${escapeAttr(restaurant.id)}" data-ai-action="follow_no_offer" type="button">${escapeHtml(t("follow_button", "Follow restaurant"))}</button>`;
  return `
    <article class="ai-card">
      <div class="ai-card-image" style="background-image: url('${escapeAttr(restaurant.image)}')" aria-hidden="true"></div>
      <div class="ai-card-body">
        <div class="restaurant-footer">
          <div>
            <h3>${escapeHtml(restaurant.name)}</h3>
            <div class="restaurant-meta">
              <span>${escapeHtml(restaurant.district || "New York")}</span><span class="dot"></span><span>${escapeHtml(restaurant.cuisine || "Restaurant")}</span>
            </div>
          </div>
          <strong class="ai-score">${escapeHtml(restaurant.ai_match_score)}%</strong>
        </div>
        <p class="muted">${escapeHtml(restaurant.description)}</p>
        <div class="ai-metrics">
          <span><strong>${escapeHtml(t("ai_match_label", "AI match"))}</strong>${escapeHtml(restaurant.ai_match_score)}%</span>
          <span><strong>${escapeHtml(t("ai_smart_discount_label", "Smart discount"))}</strong>${restaurant.recommended_discount_percent ? `-${escapeHtml(restaurant.recommended_discount_percent)}%` : "Fit first"}</span>
          <span><strong>${escapeHtml(t("ai_travel_estimate_label", "Travel estimate"))}</strong>${escapeHtml(restaurant.travel_estimate)}</span>
          <span><strong>${escapeHtml(t("ai_best_time_label", "Best time"))}</strong>${escapeHtml(restaurant.best_time_to_reserve)}</span>
          <span><strong>${escapeHtml(t("ai_dining_duration_label", "Dining duration"))}</strong>${escapeHtml(restaurant.estimated_dining_duration)}</span>
          <span><strong>${escapeHtml(t("available_offer_label", "Available offer"))}</strong>${escapeHtml(restaurant.available_offer_label)}</span>
        </div>
        <div class="why-recommended-box">
          <strong>${escapeHtml(t("ai_why_recommended_label", "Why recommended"))}</strong>
          <p>${escapeHtml(restaurant.why_recommended || "Recommended because this restaurant matches your cuisine, timing, location, and travel preferences.")}</p>
        </div>
        <div class="tag-row">
          ${restaurant.matching_preferences.slice(0, 5).map((reason) => `<span class="tag">${escapeHtml(reason)}</span>`).join("")}
        </div>
        <p class="form-note">${escapeHtml(restaurant.smart_discount_explanation)}</p>
        <div class="card-actions">
          ${reserveButton}
          <button class="ghost-button" data-open-restaurant="${escapeAttr(restaurant.id)}" type="button">${escapeHtml(t("restaurant_details_button", "View details"))}</button>
          <button class="ghost-button" data-follow-restaurant="${escapeAttr(restaurant.id)}" data-ai-action="follow" type="button">${escapeHtml(t("favorite_button", "Add to favorites"))}</button>
          <button class="ghost-button" data-follow-restaurant="${escapeAttr(restaurant.id)}" data-ai-action="follow" type="button">${escapeHtml(t("follow_button", "Follow restaurant"))}</button>
        </div>
      </div>
    </article>
  `;
}

function publicRestaurantOptions() {
  const byId = new Map();
  for (const restaurant of groupRestaurants()) byId.set(restaurant.id, restaurant);
  for (const row of state.aiRecommendations) {
    const item = normalizeAiRecommendation(row);
    if (item.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  for (const row of state.newestRestaurants.map(normalizeNewestRestaurant)) {
    if (row.id && !byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function aiRoutePlannerPanel() {
  const restaurants = publicRestaurantOptions();
  const plan = state.aiRoutePlan;
  return `
    <article class="ai-tool-panel">
      <div>
        <span class="section-kicker">${escapeHtml(t("ai_service_time_title", "Service time estimate"))}</span>
        <h3>${escapeHtml(t("ai_route_planner_title", "Route planner"))}</h3>
        <p class="muted">${escapeHtml(t("ai_route_planner_body", "Plan home, restaurant, event, and return-home timing with traffic, walking, transit, parking, and weather hooks ready for live providers."))}</p>
        ${privacyConsentNotice("compact")}
      </div>
      <form class="mini-form ai-tool-form" id="routePlanForm">
        <div class="form-grid two">
          <label>${escapeHtml(t("route_restaurant_label", "Restaurant"))}
            <select name="restaurant_id" required>
              ${restaurants.map((restaurant) => `<option value="${escapeAttr(restaurant.id)}">${escapeHtml(restaurant.name)}</option>`).join("")}
            </select>
          </label>
          <label>${escapeHtml(t("route_transport_label", "Transport"))}
            <select name="transport_mode">
              <option value="driving">${escapeHtml(t("route_transport_driving", "Driving"))}</option>
              <option value="rideshare">${escapeHtml(t("route_transport_rideshare", "Rideshare"))}</option>
              <option value="transit">${escapeHtml(t("route_transport_transit", "Public transportation"))}</option>
              <option value="walking">${escapeHtml(t("route_transport_walking", "Walking"))}</option>
            </select>
          </label>
          <label>${escapeHtml(t("route_reservation_time_label", "Reservation time"))}<input name="reservation_time" type="time" value="19:00"></label>
          <label>${escapeHtml(t("party_size_label", "Party size"))}<input name="party_size" type="number" min="1" value="2"></label>
          <label>${escapeHtml(t("route_home_restaurant_miles", "Home to restaurant miles"))}<input name="home_to_restaurant_miles" type="number" min="0" step="0.1" value="2"></label>
          <label>${escapeHtml(t("route_restaurant_event_miles", "Restaurant to event miles"))}<input name="restaurant_to_event_miles" type="number" min="0" step="0.1" value="1"></label>
          <label>${escapeHtml(t("route_event_home_miles", "Event to home miles"))}<input name="event_to_home_miles" type="number" min="0" step="0.1" value="3"></label>
          <label>${escapeHtml(t("route_weather_buffer_label", "Weather buffer minutes"))}<input name="weather_buffer_minutes" type="number" min="0" value="5"></label>
          <label>${escapeHtml(t("route_traffic_buffer_label", "Traffic buffer minutes"))}<input name="traffic_buffer_minutes" type="number" min="0" value="8"></label>
        </div>
        <div class="form-grid two">
          <input name="start_location" placeholder="${escapeAttr(t("route_home_placeholder", "Home"))}">
          <input name="event_location" placeholder="${escapeAttr(t("route_event_placeholder", "Event"))}">
          <input name="return_location" placeholder="${escapeAttr(t("route_return_home_placeholder", "Return home"))}">
        </div>
        <button class="ghost-button wide" type="submit">${escapeHtml(t("ai_route_planner_title", "Route planner"))}</button>
      </form>
      ${plan ? `
        <div class="route-sequence">${escapeHtml(t("route_sequence_label", "Home -> Restaurant -> Event -> Home"))}</div>
        <div class="ai-result-grid">
          ${statCard(t("route_home_to_restaurant", "Home to restaurant"), `${plan.estimated_travel_to_restaurant_minutes || 0} min`)}
          ${statCard(t("route_restaurant_to_event", "Restaurant to event"), `${plan.estimated_travel_to_event_minutes || 0} min`)}
          ${statCard(t("route_event_to_home", "Event to home"), `${plan.estimated_return_home_minutes || 0} min`)}
          ${statCard(t("route_total_travel", "Total travel"), `${plan.total_travel_minutes || ((plan.estimated_travel_to_restaurant_minutes || 0) + (plan.estimated_travel_to_event_minutes || 0) + (plan.estimated_return_home_minutes || 0))} min`)}
          ${statCard(t("route_recommended_departure", "Recommended departure"), plan.recommended_departure_time || "TBD")}
          ${statCard(t("route_transport_mode", "Transportation mode"), plan.transport_mode || "driving")}
          ${statCard(t("route_weather_buffer_label", "Weather buffer minutes"), `${plan.weather_buffer_minutes || 0} min`)}
          ${statCard(t("route_traffic_buffer_label", "Traffic buffer minutes"), `${plan.traffic_buffer_minutes || plan.metadata?.traffic_buffer_minutes || 0} min`)}
          ${statCard(t("route_full_plan", "Full plan"), `${plan.estimated_total_minutes || 0} min`)}
        </div>
        <p class="form-note">${escapeHtml(t("event_integrations_ready", "Future integrations"))}: ${escapeHtml((plan.integrations_ready || plan.providers?.integrations_ready || ["google_maps", "google_calendar"]).join(", "))}</p>
      ` : ""}
    </article>
  `;
}

const photoRewardTags = ["food", "drink", "dessert", "cocktail", "ambience", "service", "value", "date night", "family", "business", "quick bite"];

function rewardBookingContextCard(context) {
  if (!context) return "";
  if (context.error) {
    return `<div class="empty-state">${escapeHtml(context.error)}</div>`;
  }
  return `
    <section class="reward-context-card">
      <div>
        <span class="section-kicker">${escapeHtml(t("booking_completed_event", "Booking completed"))}</span>
        <h3>${escapeHtml(context.restaurantName || "Restaurant visit")}</h3>
        <p>${escapeHtml(context.guestName || "Guest")} - ${escapeHtml(context.visitDate || "Visit date")} ${escapeHtml(context.reservationTime || "")}</p>
      </div>
      <div class="reward-context-meta">
        <span>${escapeHtml(t("booking_id_label", "Booking ID"))}: ${escapeHtml(context.bookingId || context.reservation_id || "")}</span>
        <span>${escapeHtml(t("reservation_reference_label", "Reference"))}: ${escapeHtml(context.reference || "")}</span>
      </div>
    </section>
  `;
}

function postVisitRewardsPage() {
  return `
    <section class="post-visit-rewards-page">
      <div class="section-title-row">
        <div>
          <span class="section-kicker">${escapeHtml(t("ai_consumption_kicker", "SmartTable loyalty"))}</span>
          <h2>${escapeHtml(t("ai_consumption_title", "Dining photo rewards"))}</h2>
          <p class="muted">${escapeHtml(t("photo_rewards_points_cap", "You can earn up to 160 points for this visit."))}</p>
        </div>
      </div>
      ${aiConsumptionPanel()}
    </section>
  `;
}

function aiConsumptionPanel() {
  const restaurants = publicRestaurantOptions();
  const result = state.aiConsumptionResult;
  const upload = result?.upload || null;
  const loyalty = result?.loyalty || state.loyaltyStatus;
  const context = state.rewardBookingContext;
  const selectedRestaurantId = context?.restaurant_id || context?.restaurantId || restaurants[0]?.id || "";
  const hasContext = Boolean(context && !context.error);
  return `
    <article class="ai-tool-panel dining-rewards-panel">
      <div>
        <span class="section-kicker">${escapeHtml(t("ai_consumption_kicker", "SmartTable loyalty"))}</span>
        <h3>${escapeHtml(t("ai_consumption_title", "Dining photo rewards"))}</h3>
        <p class="muted">${escapeHtml(t("ai_consumption_body", "Upload food or drink photos, add a short review, and earn loyalty points while helping SmartTable learn dining trends."))}</p>
        <p class="reward-points-cap">${escapeHtml(t("photo_rewards_points_cap", "You can earn up to 160 points for this visit."))}</p>
      </div>
      ${rewardBookingContextCard(context)}
      <form class="mini-form ai-tool-form" id="consumptionForm">
        ${hasContext ? `
          <input type="hidden" name="restaurant_id" value="${escapeAttr(selectedRestaurantId)}">
          <input type="hidden" name="reservation_id" value="${escapeAttr(context.bookingId || context.reservation_id || "")}">
          <input type="hidden" name="booking_id" value="${escapeAttr(context.bookingId || context.reservation_id || "")}">
          <input type="hidden" name="guest_id" value="${escapeAttr(context.guestId || "")}">
          <input type="hidden" name="guest_name" value="${escapeAttr(context.guestName || "")}">
          <input type="hidden" name="guest_email" value="${escapeAttr(context.guestEmail || "")}">
        ` : ""}
        <div class="form-grid two">
          ${hasContext ? `
            <label>${escapeHtml(t("route_restaurant_label", "Restaurant"))}<input value="${escapeAttr(context.restaurantName || "")}" readonly></label>
            <label>${escapeHtml(t("booking_id_label", "Booking ID"))}<input value="${escapeAttr(context.bookingId || context.reservation_id || "")}" readonly></label>
          ` : `
            <label>${escapeHtml(t("route_restaurant_label", "Restaurant"))}
              <select name="restaurant_id" required>
                ${restaurants.map((restaurant) => `<option value="${escapeAttr(restaurant.id)}" ${restaurant.id === selectedRestaurantId ? "selected" : ""}>${escapeHtml(restaurant.name)}</option>`).join("")}
              </select>
            </label>
          `}
          <label>${escapeHtml(t("photo_type_label", "Food or drink type"))}
            <select name="media_type">
              <option value="food">${escapeHtml(t("photo_type_food", "Food"))}</option>
              <option value="drink">${escapeHtml(t("photo_type_drink", "Drink"))}</option>
              <option value="dessert">${escapeHtml(t("photo_type_dessert", "Dessert"))}</option>
              <option value="menu">${escapeHtml(t("photo_type_menu", "Menu item"))}</option>
            </select>
          </label>
          <label>${escapeHtml(t("photo_upload_label", "Photo upload"))}<input name="photo" type="file" accept="image/png,image/jpeg,image/webp"></label>
          <label>${escapeHtml(t("photo_url_label", "Optional image URL"))}<input name="image_url" placeholder="${escapeAttr(t("photo_url_placeholder", "Optional image URL"))}"></label>
          <label>${escapeHtml(t("review_overall_label", "Overall rating"))}<input name="overall_rating" type="number" min="1" max="5" step="0.5" value="5" required></label>
          <label>${escapeHtml(t("review_food_label", "Food"))}<input name="food_rating" type="number" min="1" max="5" step="1" value="5" required></label>
          <label>${escapeHtml(t("review_service_label", "Service"))}<input name="service_rating" type="number" min="1" max="5" step="1" value="5" required></label>
          <label>${escapeHtml(t("review_ambience_label", "Ambience"))}<input name="ambience_rating" type="number" min="1" max="5" step="1" value="5" required></label>
          <label>${escapeHtml(t("photo_description_label", "Description"))}<input name="description" placeholder="${escapeAttr(t("photo_description_placeholder", "Steak, sushi, cocktail, pasta..."))}"></label>
          <label>${escapeHtml(t("ordered_items_label", "What did you order?"))}<input name="ordered_items" placeholder="${escapeAttr(t("ordered_items_placeholder", "Pasta, steak, wine, dessert..."))}"></label>
          <label>${escapeHtml(t("would_recommend_label", "Would you recommend this restaurant?"))}
            <select name="would_recommend" required>
              <option value="">${escapeHtml(t("select_one_label", "Select one"))}</option>
              <option value="yes">${escapeHtml(t("yes_label", "Yes"))}</option>
              <option value="not_sure">${escapeHtml(t("not_sure_label", "Not sure"))}</option>
              <option value="no">${escapeHtml(t("no_label", "No"))}</option>
            </select>
          </label>
          <label>${escapeHtml(t("would_return_label", "Would you return?"))}
            <select name="would_return" required>
              <option value="">${escapeHtml(t("select_one_label", "Select one"))}</option>
              <option value="yes">${escapeHtml(t("yes_label", "Yes"))}</option>
              <option value="maybe">${escapeHtml(t("maybe_label", "Maybe"))}</option>
              <option value="no">${escapeHtml(t("no_label", "No"))}</option>
            </select>
          </label>
        </div>
        <label>${escapeHtml(t("photo_short_review_label", "Short review"))}<textarea name="short_review" placeholder="${escapeAttr(t("photo_short_review_placeholder", "A quick note about the dish or drink"))}"></textarea></label>
        <label>${escapeHtml(t("photo_liked_label", "What did you like?"))}<textarea name="liked_highlight" placeholder="${escapeAttr(t("photo_liked_placeholder", "Texture, flavor, service moment, presentation..."))}"></textarea></label>
        <fieldset class="tag-fieldset">
          <legend>${escapeHtml(t("photo_tags_label", "Tags"))}</legend>
          <div class="checkbox-row reward-tags">
            ${photoRewardTags.map((tag) => `<label class="check"><input type="checkbox" name="tags" value="${escapeAttr(tag)}"> ${escapeHtml(tag)}</label>`).join("")}
          </div>
        </fieldset>
        ${privacyConsentNotice("compact")}
        <p class="form-note consent-submit-copy">${escapeHtml(t("photo_rewards_consent", "By submitting, you allow SmartTable to use your review, uploaded photos, and dining information to improve restaurant recommendations and platform analytics. Public display requires approval."))}</p>
        <button class="primary-button wide" type="submit">${escapeHtml(t("photo_rewards_earn_cta", "Earn points for your visit"))}</button>
      </form>
      ${result ? `
        <div class="reward-confirmation-state">
          <strong>${escapeHtml(t("photo_rewards_confirmation_title", "Thank you for your feedback!"))}</strong>
          <p>${escapeHtml(contentTemplate("photo_rewards_confirmation_body", "You earned {{pointsEarned}} SmartTable points.", { pointsEarned: upload?.loyalty_points_awarded || 0 }))}</p>
          <p>${escapeHtml(isBasicMode()
            ? t("photo_rewards_confirmation_note_basic", "Your photos and review help other guests discover great restaurants after admin approval.")
            : t("photo_rewards_confirmation_note", "Your photos and review help other guests and improve SmartTable AI recommendations."))}</p>
          <div class="button-row">
            <a class="ghost-button" href="#loyalty-progress">${escapeHtml(t("photo_rewards_view_rewards", "View my rewards"))}</a>
            <a class="primary-button" href="/">${escapeHtml(t("photo_rewards_find_table", "Find another table"))}</a>
          </div>
        </div>
        ${imageRecognitionResult(upload)}
      ` : ""}
      ${loyaltyProgressPanel(loyalty)}
    </article>
  `;
}

function privacyConsentNotice(variant = "") {
  return `
    <div class="privacy-consent-note ${escapeAttr(variant)}">
      <span>${escapeHtml(t("consent_uses_permission", "SmartTable only uses this data with your permission."))}</span>
      <span>${escapeHtml(t("consent_restaurants_aggregated", "Restaurants only see aggregated and anonymized analytics."))}</span>
      <span>${escapeHtml(t("consent_personal_never_shared", "Personal behavior is never shared with restaurants."))}</span>
    </div>
  `;
}

function loyaltyBadgeText(key, fallback) {
  const map = {
    food_explorer: "loyalty_badge_food_explorer",
    steak_master: "loyalty_badge_steak_master",
    sushi_hunter: "loyalty_badge_sushi_hunter",
    wine_lover: "loyalty_badge_wine_lover",
    cocktail_expert: "loyalty_badge_cocktail_expert",
    nyc_food_hunter: "loyalty_badge_nyc_food_hunter",
    trend_spotter: "loyalty_badge_trend_spotter"
  };
  return t(map[key] || key, fallback || key);
}

function loyaltyProgressPanel(loyalty) {
  if (!loyalty) return "";
  const badges = loyalty.badges || [];
  return `
    <section class="loyalty-panel" id="loyalty-progress">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("loyalty_kicker", "Loyalty gamification"))}</span><h3>${escapeHtml(t("loyalty_title", "Points and badge progress"))}</h3></div>
      </div>
      <div class="loyalty-summary-grid">
        ${statCard(t("loyalty_points_balance", "Points"), loyalty.points_balance || 0)}
        ${statCard(t("loyalty_lifetime_points", "Lifetime points"), loyalty.lifetime_points || 0)}
        ${statCard(t("loyalty_unlocked_badges", "Unlocked badges"), (loyalty.unlocked_badges || []).length)}
      </div>
      <div class="loyalty-badge-grid">
        ${badges.map((badge) => `
          <article class="loyalty-badge-card ${badge.unlocked ? "unlocked" : ""}">
            <div>
              <strong>${escapeHtml(loyaltyBadgeText(badge.key, badge.label))}</strong>
              <span>${escapeHtml(badge.current || 0)} / ${escapeHtml(badge.target || 1)}</span>
            </div>
            <div class="progress-track"><span style="width:${Math.max(0, Math.min(100, Number(badge.progress_percent || 0)))}%"></span></div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function imageRecognitionResult(upload) {
  if (isBasicMode()) return "";
  if (!upload) return "";
  const rows = [
    [t("recognition_detected_dish", "Detected dish"), upload.detected_dish || upload.food_type || "Queued"],
    [t("recognition_detected_drink", "Detected drink"), upload.detected_drink || upload.drink_type || "Queued"],
    [t("recognition_cuisine_category", "Cuisine category"), upload.cuisine_category || upload.cuisine || "Queued"],
    [t("recognition_ingredients", "Ingredients"), (upload.ingredients || []).join(", ") || "Queued"],
    [t("recognition_flavor_profile", "Flavor profile"), (upload.flavor_profile || []).join(", ") || "Queued"],
    [t("recognition_presentation_score", "Presentation score"), upload.presentation_score ? `${upload.presentation_score}/100` : "Queued"],
    [t("recognition_popularity_signal", "Popularity signal"), upload.popularity_signal ? `${upload.popularity_signal}/100` : "Queued"]
  ];
  return `
    <section class="recognition-panel">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("recognition_kicker", "AI image recognition"))}</span><h3>${escapeHtml(t("recognition_title", "Future-ready recognition placeholder"))}</h3></div>
      </div>
      <div class="recognition-grid">
        ${rows.map(([label, value]) => `
          <span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>
        `).join("")}
      </div>
      <p class="form-note">${escapeHtml(t("recognition_note", "Placeholder values are stored now and can later be replaced by live AI image recognition."))}</p>
    </section>
  `;
}

function aiConciergeSection() {
  if (!canShowFeature("ai.concierge", { allowDemo: true })) return "";
  const cards = state.aiRecommendations.slice(0, 6).map(aiRecommendationCard).join("");
  return `
    <section class="ai-concierge-section" id="ai-concierge">
      <div class="ai-concierge-copy">
        <div class="status-title-row"><span class="section-kicker">SmartTable AI</span>${demoBadge(t("platformMode.preview", "Preview"))}</div>
        <h2>${escapeHtml(t("ai_concierge_title", "AI Dining Concierge"))}</h2>
        <p>${escapeHtml(t("ai_concierge_body", "Tell SmartTable what you like, then get restaurant recommendations that learn from your preferences, favorites, ratings, and reservation behavior."))}</p>
        ${privacyConsentNotice("compact")}
        <div class="button-row">
          <button class="primary-button" id="openAiWizard" data-open-ai-wizard type="button">${escapeHtml(t("ai_preferences_button", "Set dining preferences"))}</button>
          <span class="muted">${escapeHtml(state.aiPreferences ? t("ai_wizard_saved", "Your AI dining profile was saved.") : t("ai_recommendations_empty", "Set your preferences to unlock personalized recommendations."))}</span>
        </div>
      </div>
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("ai_reason_label", "Why this works"))}</span><h2>${escapeHtml(t("ai_recommendations_title", "Recommended for you"))}</h2></div>
      </div>
      <div class="ai-grid">${cards || `<div class="empty-state">${escapeHtml(t("ai_recommendations_empty", "Set your preferences to unlock personalized recommendations."))}</div>`}</div>
      ${eventPlanningPanel()}
      <div class="ai-tool-grid">
        ${aiRoutePlannerPanel()}
        ${aiConsumptionPanel()}
      </div>
      <p class="form-note">${escapeHtml(t("ai_privacy_note", "Only aggregated, anonymized analytics are shared with restaurants. Personal behavior is never exposed."))}</p>
    </section>
  `;
}

function guestAiConciergeHomepageEntry() {
  if (!canShowFeature("ai.concierge", { audience: "guest" })) return "";
  return `
    <section class="guest-ai-home-entry" id="ai-concierge-home-entry">
      <div>
        <div class="status-title-row"><span class="section-kicker">${escapeHtml(t("ai_concierge_nav_label", "AI Concierge"))}</span>${demoBadge(t("platformMode.preview", "Preview"))}</div>
        <h2>${escapeHtml(t("guest_ai_home_heading", "Your AI Dining Concierge"))}</h2>
        <p>${escapeHtml(t("guest_ai_home_description", "Tell us what you feel like eating, your preferred location, budget, time and discount, and SmartTable will help you find the best available restaurant."))}</p>
      </div>
      <div class="button-row">
        <button class="primary-button" data-ai-concierge-entry type="button">${escapeHtml(t("start_ai_concierge_button", "Start AI Concierge"))}</button>
        <button class="ghost-button" data-open-ai-preferences type="button">${escapeHtml(t("set_my_preferences_button", "Set My Preferences"))}</button>
      </div>
    </section>
  `;
}

function eventPlanningPanel() {
  const restaurants = publicRestaurantOptions();
  const plan = state.aiEventPlan;
  return `
    <article class="ai-tool-panel event-planner-panel">
      <div>
        <span class="section-kicker">${escapeHtml(t("event_planner_kicker", "Program + dining planner"))}</span>
        <h3>${escapeHtml(t("event_planner_title", "Plan around an event"))}</h3>
        <p class="muted">${escapeHtml(t("event_planner_body", "Tell SmartTable about a show, meeting, game, or family event and get a dining window with travel and buffer time."))}</p>
        ${privacyConsentNotice("compact")}
      </div>
      <form class="mini-form ai-tool-form" id="eventPlanForm">
        <div class="form-grid two">
          <label>${escapeHtml(t("event_name_label", "Event name"))}<input name="event_name" placeholder="${escapeAttr(t("event_name_placeholder", "Broadway show"))}"></label>
          <label>${escapeHtml(t("event_location_label", "Event location"))}<input name="event_location" placeholder="${escapeAttr(t("event_location_placeholder", "Times Square"))}"></label>
          <label>${escapeHtml(t("event_start_label", "Event start time"))}<input name="event_start_time" type="time" value="20:00"></label>
          <label>${escapeHtml(t("event_end_label", "Event end time"))}<input name="event_end_time" type="time" value="22:15"></label>
          <label>${escapeHtml(t("event_dinner_timing_label", "Dinner timing"))}
            <select name="dinner_timing">
              <option value="before">${escapeHtml(t("event_before_label", "Before event"))}</option>
              <option value="after">${escapeHtml(t("event_after_label", "After event"))}</option>
            </select>
          </label>
          <label>${escapeHtml(t("event_transport_label", "Transportation preference"))}
            <select name="transportation_preference">
              <option value="walk">${escapeHtml(t("event_transport_walk", "Walk"))}</option>
              <option value="subway">${escapeHtml(t("event_transport_subway", "Subway"))}</option>
              <option value="car">${escapeHtml(t("event_transport_car", "Car"))}</option>
            </select>
          </label>
          <label>${escapeHtml(t("event_max_travel_label", "Maximum travel time"))}<input name="maximum_travel_time" type="number" min="5" value="20"></label>
          <label>${escapeHtml(t("party_size_label", "Party size"))}<input name="party_size" type="number" min="1" value="2"></label>
          <label>${escapeHtml(t("event_restaurant_label", "Preferred restaurant"))}
            <select name="restaurant_id">
              ${restaurants.map((restaurant) => `<option value="${escapeAttr(restaurant.id)}">${escapeHtml(restaurant.name)}</option>`).join("")}
            </select>
          </label>
        </div>
        <button class="primary-button wide" type="submit">${escapeHtml(t("event_plan_button", "Create event dining plan"))}</button>
      </form>
      ${plan ? `
        <div class="event-plan-result">
          ${statCard(t("event_recommended_window", "Recommended dining window"), plan.recommended_dining_window)}
          ${statCard(t("event_suggested_reservation_time", "Suggested reservation time"), plan.suggested_reservation_time)}
          ${statCard(t("event_estimated_dining_duration", "Estimated dining duration"), plan.estimated_dining_duration)}
          ${statCard(t("event_suggested_restaurant", "Suggested restaurant"), plan.suggested_restaurant)}
          ${statCard(t("event_travel_to_restaurant", "Travel to restaurant"), plan.travel_time_to_restaurant)}
          ${statCard(t("event_travel_to_event", "Travel to event"), plan.travel_time_to_event)}
          ${statCard(t("event_buffer_time", "Buffer time"), plan.buffer_time)}
          ${statCard(t("event_delay_risk", "Delay risk"), plan.delay_risk)}
          <button class="primary-button" data-open-reserve="${escapeAttr(plan.offer_id || "")}" data-restaurant="${escapeAttr(plan.restaurant_id || "")}" type="button">${escapeHtml(t("reserve_button", "Reserve"))}</button>
        </div>
        <div class="route-note-grid">
          <span>${escapeHtml(t("event_weather_note", "Weather note"))}: ${escapeHtml(plan.weather_note)}</span>
          <span>${escapeHtml(t("event_traffic_note", "Traffic note"))}: ${escapeHtml(plan.traffic_note)}</span>
          <span>${escapeHtml(t("event_integrations_ready", "Future integrations"))}: ${escapeHtml((plan.integrations_ready || []).join(", "))}</span>
        </div>
      ` : ""}
      <p class="form-note">${escapeHtml(t("event_future_integrations", "Prepared for Google Calendar and Google Maps integration."))}</p>
    </article>
  `;
}

function googleMapsLoader() {
  if (!state.config.google_maps_api_key) return Promise.resolve(false);
  if (window.google?.maps) return Promise.resolve(true);
  if (window.smarttableMapsLoading) return window.smarttableMapsLoading;
  window.smarttableMapsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.config.google_maps_api_key)}`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error(t("google_maps_load_failed_error", "Google Maps failed to load.")));
    document.head.appendChild(script);
  });
  return window.smarttableMapsLoading;
}

async function initializeMap(restaurants) {
  if (state.viewMode !== "map" || !state.config.google_maps_enabled) return;
  const canvas = document.querySelector("#mapCanvas");
  if (!canvas) return;
  try {
    await googleMapsLoader();
    const mapped = restaurants.filter((restaurant) => Number.isFinite(Number(restaurant.latitude)) && Number.isFinite(Number(restaurant.longitude)));
    const center = mapped[0] ? { lat: Number(mapped[0].latitude), lng: Number(mapped[0].longitude) } : { lat: 40.7306, lng: -73.9352 };
    const map = new window.google.maps.Map(canvas, { center, zoom: mapped.length ? 12 : 11 });
    const infoWindow = new window.google.maps.InfoWindow();
    window.smarttableReserveFromMap = (restaurantId, offerId) => {
      state.reservationModal = { restaurantId, offerId };
      renderGuest();
    };
    mapped.forEach((restaurant) => {
      const offer = (restaurant.filteredOffers || restaurant.offers)[0];
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: Number(restaurant.latitude), lng: Number(restaurant.longitude) },
        title: restaurant.name
      });
      marker.addListener("click", () => {
        infoWindow.setContent(`
          <div class="map-info">
            <strong>${escapeHtml(restaurant.name)}</strong>
            <p>${escapeHtml(restaurant.description || "")}</p>
            <p>${escapeHtml((restaurant.filteredOffers || restaurant.offers).length)} ${escapeHtml(t("offers_count_label", "active offers"))}</p>
            <button onclick="window.smarttableReserveFromMap('${escapeAttr(restaurant.id)}','${escapeAttr(offer?.offer_id || "")}')">${escapeHtml(t("reserve_button", "Reserve"))}</button>
          </div>
        `);
        infoWindow.open({ anchor: marker, map });
      });
    });
  } catch (error) {
    canvas.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function reservationModal() {
  const modal = state.reservationModal;
  if (!modal) return "";
  const restaurant = groupRestaurants().find((item) => item.id === modal.restaurantId);
  if (!restaurant) return "";
  const offer = restaurant.offers.find((item) => item.offer_id === modal.offerId) || restaurant.offers[0];
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="reservationTitle">
        <div class="dialog-head">
          <div>
            <span class="section-kicker">${escapeHtml(t("reserve_modal_title", "Reservation request"))}</span>
            <h2 id="reservationTitle">${escapeHtml(restaurant.name)}</h2>
          </div>
          <button class="icon-button" data-close-modal type="button" aria-label="${escapeAttr(t("modal_cancel_label", "Cancel"))}">X</button>
        </div>
        <button class="ghost-button subtle-wide" data-follow-restaurant="${escapeAttr(restaurant.id)}" type="button">${escapeHtml(t("favorite_button", "Add to favorites"))}</button>
        <div class="ai-planning-note">
          <strong>${escapeHtml(t("ai_service_time_title", "Service time estimate"))}</strong>
          <p>${escapeHtml(contentTemplate("service_time_estimate_body", "{{minutes}} min baseline for {{restaurant_type}}. Party size and timing are refined after submit.", {
            minutes: restaurant.average_service_minutes || 75,
            restaurant_type: restaurant.restaurant_type || restaurant.cuisine || t("restaurant_type_fallback", "this restaurant")
          }))}</p>
        </div>
        <form class="mini-form reservation-form" data-reserve="${escapeAttr(offer.offer_id)}">
          <label>${escapeHtml(t("modal_offer_label", "Selected offer"))}
            <select name="offer_id" data-modal-offer>
              ${restaurant.offers.map((item) => `<option value="${escapeAttr(item.offer_id)}" ${item.offer_id === offer.offer_id ? "selected" : ""}>${escapeHtml(item.title || item.offer_title || "Discounted table")} (${escapeHtml(discountLabel(item))})</option>`).join("")}
            </select>
          </label>
          <div class="form-grid two">
            <label>${escapeHtml(t("filter_date_label", "Date"))}<input name="reservation_date" type="date" value="${escapeAttr(offer.reservation_date || offer.offer_date || "")}" required></label>
            <label>${escapeHtml(t("filter_time_label", "Time"))}<input name="reservation_time" type="time" value="${escapeAttr(offer.start_time || offer.offer_time || "")}" required></label>
            <label>${escapeHtml(t("party_size_label", "Party size"))}<input name="party_size" type="number" min="1" max="${escapeAttr(offer.max_party_size || offer.available_seats || 8)}" value="2" required></label>
            <label>${escapeHtml(t("guest_name_label", "Name"))}<input name="guest_name" required></label>
            <label>${escapeHtml(t("guest_email_label", "Email"))}<input name="guest_email" type="email" required></label>
            <label>${escapeHtml(t("guest_phone_label", "Phone"))}<input name="guest_phone" required></label>
          </div>
          <label>${escapeHtml(t("notes_label", "Notes"))}<textarea name="notes"></textarea></label>
          <div class="button-row">
            <button class="primary-button" type="submit" ${state.reservationSubmitting ? "disabled" : ""}>${escapeHtml(state.reservationSubmitting ? t("reservation_sending_label", "Sending request...") : t("modal_submit_label", "Send reservation request"))}</button>
            <button class="ghost-button" data-close-modal type="button">${escapeHtml(t("modal_cancel_label", "Cancel"))}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function findPublicRestaurant(restaurantId) {
  return groupRestaurants().find((item) => item.id === restaurantId)
    || state.newestRestaurants.find((item) => item.restaurant_id === restaurantId || item.id === restaurantId)
    || state.aiRecommendations.find((item) => item.restaurant_id === restaurantId || item.id === restaurantId)
    || null;
}

function followModal() {
  const restaurantId = state.followModal;
  if (!restaurantId) return "";
  const restaurant = findPublicRestaurant(restaurantId);
  if (!restaurant) return "";
  const name = restaurant.name || restaurant.restaurant_name;
  const id = restaurant.id || restaurant.restaurant_id;
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card small-modal" role="dialog" aria-modal="true">
        <div class="dialog-head">
          <div>
            <span class="section-kicker">${escapeHtml(t("follow_title", "Follow this restaurant"))}</span>
            <h2>${escapeHtml(name)}</h2>
          </div>
          <button class="icon-button" data-close-modal type="button" aria-label="${escapeAttr(t("modal_cancel_label", "Cancel"))}">X</button>
        </div>
        <p class="muted">${escapeHtml(t("follow_copy", "Get notified when this restaurant publishes new Smart Table offers."))}</p>
        <form class="mini-form" data-follow-form="${escapeAttr(id)}">
          <input name="guest_name" placeholder="${escapeAttr(t("guest_name_label", "Name"))}">
          <input name="guest_email" type="email" placeholder="${escapeAttr(t("guest_email_label", "Email"))}" required>
          <button class="primary-button wide" type="submit">${escapeHtml(t("follow_button", "Follow restaurant"))}</button>
        </form>
      </section>
    </div>
  `;
}

function ratingSelect(name, label) {
  return `
    <label>${escapeHtml(label)}
      <select name="${escapeAttr(name)}" required>
        <option value="">${escapeHtml(t("rating_choose_label", "Choose"))}</option>
        <option value="5">5</option>
        <option value="4">4</option>
        <option value="3">3</option>
        <option value="2">2</option>
        <option value="1">1</option>
      </select>
    </label>
  `;
}

function reviewModal() {
  const restaurantId = state.reviewModal;
  if (!restaurantId) return "";
  const restaurant = findPublicRestaurant(restaurantId);
  if (!restaurant) return "";
  const name = restaurant.name || restaurant.restaurant_name;
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card small-modal" role="dialog" aria-modal="true">
        <div class="dialog-head">
          <div>
            <span class="section-kicker">${escapeHtml(t("review_title", "Review this restaurant"))}</span>
            <h2>${escapeHtml(name)}</h2>
          </div>
          <button class="icon-button" data-close-modal type="button" aria-label="${escapeAttr(t("modal_cancel_label", "Cancel"))}">X</button>
        </div>
        <form class="mini-form" data-review-form="${escapeAttr(restaurantId)}">
          <input name="guest_name" placeholder="${escapeAttr(t("guest_name_label", "Name"))}">
          <input name="guest_email" type="email" placeholder="${escapeAttr(t("guest_email_label", "Email"))}">
          <div class="form-grid">
            ${ratingSelect("food_rating", t("review_food_label", "Food"))}
            ${ratingSelect("service_rating", t("review_service_label", "Service"))}
            ${ratingSelect("ambience_rating", t("review_ambience_label", "Ambience"))}
          </div>
          <label>${escapeHtml(t("review_comment_label", "Comment"))}<textarea name="comment"></textarea></label>
          <button class="primary-button wide" type="submit">${escapeHtml(t("review_submit_label", "Submit review"))}</button>
        </form>
      </section>
    </div>
  `;
}

function successModal() {
  if (!state.reservationSuccess) return "";
  const success = state.reservationSuccess || {};
  const emails = Array.isArray(success.emails) ? success.emails : [];
  const guestEmailAccepted = emails.some((item) => item?.event_type === "guest_request_received" && item?.accepted === true);
  const reservation = success.reservation || success;
  const bodyKey = guestEmailAccepted ? "reservation_success_body" : "reservation_success_body_email_unconfirmed";
  const bodyFallback = guestEmailAccepted
    ? "Your reservation request was saved. A confirmation email has been queued. This is not a confirmed reservation yet; the restaurant still needs to accept it."
    : "Your reservation request was saved, but the confirmation email could not be sent. You can still view it in My Reservations.";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card small-modal confirmation-card" role="dialog" aria-modal="true">
        <span class="success-mark">OK</span>
        <h2>${escapeHtml(t("reservation_success_title", "Reservation request sent"))}</h2>
        <p>${escapeHtml(t(bodyKey, bodyFallback))}</p>
        ${reservation.reference ? `<p class="form-note">${escapeHtml(t("reservation_reference_label", "Reference"))}: <strong>${escapeHtml(reservation.reference)}</strong></p>` : ""}
        <button class="primary-button wide" data-close-success type="button">${escapeHtml(t("confirmation_done_label", "Done"))}</button>
      </section>
    </div>
  `;
}

function aiPreferenceWizard() {
  if (!state.aiWizardOpen) return "";
  const prefs = state.aiPreferences || {};
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card ai-wizard-modal" role="dialog" aria-modal="true">
        <div class="dialog-head">
          <div>
            <span class="section-kicker">SmartTable AI</span>
            <h2>${escapeHtml(t("ai_wizard_title", "Build your dining profile"))}</h2>
          </div>
          <button class="icon-button" data-close-ai-wizard type="button" aria-label="${escapeAttr(t("modal_cancel_label", "Cancel"))}">X</button>
        </div>
        <form class="mini-form ai-wizard-form" id="aiPreferenceForm">
          <label>${escapeHtml(t("guest_email_label", "Email"))}<input name="guest_email" type="email" value="${escapeAttr(prefs.guest_email || "")}" placeholder="you@example.com"></label>
          <fieldset>
            <legend>${escapeHtml(t("ai_cuisine_preferences_label", "Cuisine preferences"))}</legend>
            ${aiCheckboxGroup("cuisines", aiWizardOptions.cuisines, aiSelections("cuisines"))}
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(t("ai_food_interests_label", "Food interests"))}</legend>
            ${aiCheckboxGroup("food_interests", aiWizardOptions.food_interests, aiSelections("food_interests"))}
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(t("ai_drink_preferences_label", "Drink preferences"))}</legend>
            ${aiCheckboxGroup("drink_preferences", aiWizardOptions.drink_preferences, aiSelections("drink_preferences"))}
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(t("ai_atmosphere_label", "Atmosphere"))}</legend>
            ${aiCheckboxGroup("atmospheres", aiWizardOptions.atmospheres, aiSelections("atmospheres"))}
          </fieldset>
          <div class="form-grid two">
            <label>${escapeHtml(t("ai_budget_label", "Preferred spend per person"))}<input name="budget_per_person" type="number" min="0" step="1" value="${escapeAttr(prefs.budget_per_person || "")}" placeholder="75"></label>
            <label>${escapeHtml(t("ai_distance_label", "Preferred travel distance"))}<input name="travel_distance_miles" type="number" min="0" step="0.5" value="${escapeAttr(prefs.travel_distance_miles || "")}" placeholder="3"></label>
            <label>${escapeHtml(t("ai_walking_tolerance_label", "Walking distance tolerance"))}<input name="walking_distance_tolerance" type="number" min="0" step="0.1" value="${escapeAttr(prefs.walking_distance_tolerance || "")}" placeholder="0.8 miles"></label>
            <label>${escapeHtml(t("party_size_label", "Party size"))}<input name="preferred_party_size" type="number" min="1" value="${escapeAttr(prefs.preferred_party_size || 2)}"></label>
            <label>${escapeHtml(t("ai_discount_range_label", "Preferred discount range"))}
              <select name="preferred_discount_range">
                ${aiWizardOptions.preferred_discount_range.map((range) => `<option value="${escapeAttr(range)}" ${prefs.preferred_discount_range === range ? "selected" : ""}>${escapeHtml(range)}%</option>`).join("")}
              </select>
            </label>
          </div>
          <label>${escapeHtml(t("ai_neighborhoods_label", "Preferred neighborhoods"))}<input name="preferred_neighborhoods" value="${escapeAttr(aiSelections("preferred_neighborhoods").join(", "))}" placeholder="West Village, Soho, Williamsburg"></label>
          <label>${escapeHtml(t("ai_preferred_times_label", "Preferred reservation times"))}<input name="preferred_times" value="${escapeAttr(aiSelections("preferred_times").join(", "))}" placeholder="18:00, 19:30, after work"></label>
          <fieldset>
            <legend>${escapeHtml(t("ai_time_windows_label", "Preferred time windows"))}</legend>
            ${aiCheckboxGroup("preferred_time_windows", aiWizardOptions.preferred_time_windows, aiSelections("preferred_time_windows"))}
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(t("ai_preferred_days_label", "Preferred days"))}</legend>
            ${aiCheckboxGroup("preferred_days", aiWizardOptions.preferred_days, aiSelections("preferred_days"))}
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(t("ai_occasion_label", "Occasion"))}</legend>
            ${aiCheckboxGroup("occasions", aiWizardOptions.occasions, aiSelections("occasions"))}
          </fieldset>
          <fieldset>
            <legend>${escapeHtml(t("ai_dietary_label", "Dietary restrictions"))}</legend>
            ${aiCheckboxGroup("dietary_restrictions", aiWizardOptions.dietary_restrictions, aiSelections("dietary_restrictions"))}
          </fieldset>
          <label>${escapeHtml(t("ai_dietary_label", "Dietary restrictions"))}<input name="dietary_restrictions" value="${escapeAttr(aiSelections("dietary_restrictions").join(", "))}" placeholder="Vegetarian, gluten-free"></label>
          <label>${escapeHtml(t("ai_favorite_restaurants_label", "Favorite restaurants"))}<input name="favorite_restaurants" value="${escapeAttr(aiSelections("favorite_restaurants").join(", "))}" placeholder="Restaurant names"></label>
          <div class="checkbox-row">
            ${checkboxInput("parking_required", t("ai_parking_required_label", "Parking required"), prefs.parking_required)}
            ${checkboxInput("subway_preferred", t("ai_subway_preferred_label", "Subway preferred"), prefs.subway_preferred)}
            ${checkboxInput("kids_friendly", t("ai_kids_friendly_label", "Kids friendly"), prefs.kids_friendly)}
            ${checkboxInput("outdoor_seating", t("ai_outdoor_seating_label", "Outdoor seating"), prefs.outdoor_seating)}
            ${checkboxInput("calendar_opt_in", t("ai_calendar_opt_in_label", "Calendar opt-in placeholder"), prefs.calendar_opt_in)}
          </div>
          <label>${escapeHtml(t("ai_notes_label", "Extra preferences"))}<textarea name="notes">${escapeHtml(prefs.notes || "")}</textarea></label>
          ${privacyConsentNotice("compact")}
          <div class="button-row">
            <button class="primary-button" type="submit">${escapeHtml(t("ai_wizard_save", "Save preferences"))}</button>
            <button class="ghost-button" data-close-ai-wizard type="button">${escapeHtml(t("modal_cancel_label", "Cancel"))}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function guestModals() {
  return `${restaurantDetailModal()}${reservationModal()}${followModal()}${reviewModal()}${successModal()}${canShowFeature("ai.preferenceSurvey", { allowDemo: true }) ? aiPreferenceWizard() : ""}`;
}

function fieldError(name) {
  const message = ensureSignupState().errors[name];
  return message ? `<span class="field-error">${escapeHtml(message)}</span>` : "";
}

function signupInput(name, labelKey, fallback, type = "text", attrs = "") {
  const data = ensureSignupState().data;
  return `
    <label class="${fieldError(name) ? "has-error" : ""}">
      ${escapeHtml(t(labelKey, fallback))}
      <input name="${escapeAttr(name)}" type="${escapeAttr(type)}" value="${escapeAttr(data[name] || "")}" ${attrs}>
      ${fieldError(name)}
    </label>
  `;
}

function signupPasswordInput(name, labelKey, fallback, visibleKey) {
  const signup = ensureSignupState();
  const visible = signup[visibleKey];
  return `
    <label class="${fieldError(name) ? "has-error" : ""}">
      ${escapeHtml(t(labelKey, fallback))}
      <span class="password-input-row">
        <input name="${escapeAttr(name)}" type="${visible ? "text" : "password"}" value="${escapeAttr(signup.data[name] || "")}" autocomplete="new-password">
        <button class="ghost-button mini" data-toggle-password="${escapeAttr(visibleKey)}" type="button">${escapeHtml(visible ? t("signup_hide_password", "Hide") : t("signup_show_password", "Show"))}</button>
      </span>
      ${fieldError(name)}
    </label>
  `;
}

function passwordStrengthMeter() {
  const strength = passwordStrength(ensureSignupState().data.password);
  return `
    <div class="password-strength ${escapeAttr(strength.key)}" id="signupPasswordStrength">
      <span style="width:${strength.percent}%"></span>
    </div>
    <p class="form-note" id="signupPasswordStrengthLabel">${escapeHtml(t(`signup_password_strength_${strength.key}`, `Password strength: ${strength.key}`))}</p>
  `;
}

function updatePasswordStrengthMeter() {
  const strength = passwordStrength(ensureSignupState().data.password);
  const meter = document.querySelector("#signupPasswordStrength");
  const label = document.querySelector("#signupPasswordStrengthLabel");
  if (meter) {
    meter.className = `password-strength ${strength.key}`;
    const bar = meter.querySelector("span");
    if (bar) bar.style.width = `${strength.percent}%`;
  }
  if (label) label.textContent = t(`signup_password_strength_${strength.key}`, `Password strength: ${strength.key}`);
}

function signupCheckboxGroup(name, options) {
  const selected = new Set(asArray(ensureSignupState().data[name]).map((item) => String(item).toLowerCase()));
  return `
    <div class="signup-chip-grid ${fieldError(name) ? "has-error" : ""}">
      ${options.map((option) => `
        <label class="ai-chip signup-chip">
          <input type="checkbox" name="${escapeAttr(name)}" value="${escapeAttr(option)}" ${selected.has(option.toLowerCase()) ? "checked" : ""}>
          <span>${escapeHtml(optionLabel(option))}</span>
        </label>
      `).join("")}
    </div>
    ${fieldError(name)}
  `;
}

function signupRadioGroup(name, options) {
  const selected = String(ensureSignupState().data[name] || "");
  return `
    <div class="signup-chip-grid compact ${fieldError(name) ? "has-error" : ""}">
      ${options.map((option) => `
        <label class="ai-chip signup-chip">
          <input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(option)}" ${selected === option ? "checked" : ""}>
          <span>${escapeHtml(optionLabel(option))}</span>
        </label>
      `).join("")}
    </div>
    ${fieldError(name)}
  `;
}

function signupProgress() {
  const current = ensureSignupState().step;
  return `
    <ol class="signup-progress" aria-label="${escapeAttr(t("signup_progress_label", "Signup progress"))}">
      ${signupSteps.map((step, index) => `
        <li class="${index < current ? "done" : index === current ? "active" : ""}">
          <button data-signup-step="${index}" type="button" ${index > current ? "disabled" : ""}>
            <span>${index + 1}</span>
            <b>${escapeHtml(t(step.labelKey, step.fallback))}</b>
          </button>
        </li>
      `).join("")}
    </ol>
  `;
}

function signupStepBody() {
  const signup = ensureSignupState();
  const data = signup.data;
  const stepKey = signupSteps[signup.step]?.key;
  if (stepKey === "account") {
    return `
      <div class="form-grid two">
        ${signupInput("full_name", "signup_full_name", "Full name", "text", "autocomplete=\"name\" required")}
        <input type="hidden" name="first_name" value="${escapeAttr(data.first_name || "")}">
        <input type="hidden" name="last_name" value="${escapeAttr(data.last_name || "")}">
        ${signupInput("email", "signup_email", "Email", "email", "autocomplete=\"email\" required")}
        ${signupInput("phone", "signup_phone", "Phone number", "tel", "autocomplete=\"tel\" required")}
        ${signupPasswordInput("password", "signup_password", "Password", "showPassword")}
        ${signupPasswordInput("confirm_password", "signup_confirm_password", "Confirm password", "showConfirmPassword")}
      </div>
      ${passwordStrengthMeter()}
      <p class="form-note">${escapeHtml(t("signup_password_storage_notice", "SmartTable never stores your password in long-term browser storage."))}</p>
      <p class="form-note">${escapeHtml(t("signup_already_account", "Already have an account?"))} <button class="link-button" data-guest-login type="button">${escapeHtml(t("signup_sign_in", "Sign in"))}</button></p>
    `;
  }
  if (stepKey === "location") {
    return `
      <div class="form-grid two">
        ${signupInput("city", "signup_city", "City", "text", "autocomplete=\"address-level2\" required")}
        ${signupInput("region", "signup_region", "State or region", "text", "autocomplete=\"address-level1\" required")}
        ${signupInput("postal_code", "signup_postal_code", "ZIP or postal code", "text", "autocomplete=\"postal-code\" required")}
        ${signupInput("travel_distance_miles", "signup_travel_distance", "Maximum preferred travel distance", "number", "min=\"1\" step=\"0.5\" required")}
      </div>
      <fieldset>
        <legend>${escapeHtml(t("signup_neighborhoods", "Preferred neighborhoods or dining areas"))}</legend>
        ${signupCheckboxGroup("preferred_neighborhoods", signupNeighborhoodOptions())}
      </fieldset>
      <fieldset>
        <legend>${escapeHtml(t("signup_transportation", "Preferred transportation methods"))}</legend>
        ${signupCheckboxGroup("transportation_methods", signupOptionGroups.transportation)}
      </fieldset>
      <button class="ghost-button" id="useDeviceLocation" type="button">${escapeHtml(t("signup_use_device_location", "Use device location"))}</button>
      <p class="form-note">${escapeHtml(t("signup_location_note", "Exact home address is not required. If location access is declined, city and region are still required."))}</p>
    `;
  }
  if (stepKey === "preferences") {
    return `
      <fieldset><legend>${escapeHtml(t("signup_cuisines", "Preferred cuisines"))}</legend>${signupCheckboxGroup("cuisines", signupOptionGroups.cuisines)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_food_categories", "Preferred food categories"))}</legend>${signupCheckboxGroup("food_categories", signupOptionGroups.food_categories)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_dietary_needs", "Dietary needs"))}</legend>${signupCheckboxGroup("dietary_needs", signupOptionGroups.dietary_needs)}</fieldset>
      ${signupInput("allergy_notes", "signup_allergy_notes", "Optional allergy notes", "text")}
      <p class="form-note warning">${escapeHtml(t("signup_allergy_warning", "SmartTable preferences do not replace direct allergy confirmation with the restaurant."))}</p>
      <fieldset><legend>${escapeHtml(t("signup_drink_preferences", "Drink preferences"))}</legend>${signupCheckboxGroup("drink_preferences", signupOptionGroups.drink_preferences)}</fieldset>
    `;
  }
  if (stepKey === "habits") {
    return `
      <fieldset><legend>${escapeHtml(t("signup_dining_experiences", "Dining experience preferences"))}</legend>${signupCheckboxGroup("dining_experiences", signupOptionGroups.dining_experiences)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_companions", "Typical dining companions"))}</legend>${signupCheckboxGroup("companions", signupOptionGroups.companions)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_party_size", "Typical party size"))}</legend>${signupRadioGroup("party_size", signupOptionGroups.party_size)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_preferred_days", "Preferred dining days"))}</legend>${signupCheckboxGroup("preferred_days", signupOptionGroups.preferred_days)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_preferred_times", "Preferred dining times"))}</legend>${signupCheckboxGroup("preferred_time_windows", signupOptionGroups.preferred_time_windows)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_booking_lead_time", "Preferred booking lead time"))}</legend>${signupRadioGroup("booking_lead_time", signupOptionGroups.booking_lead_time)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_dining_duration", "Preferred dining duration"))}</legend>${signupRadioGroup("dining_duration", signupOptionGroups.dining_duration)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_discovery_preference", "Discovery preference"))}</legend>${signupRadioGroup("discovery_preference", signupOptionGroups.discovery_preference)}</fieldset>
      <fieldset>
        <legend>${escapeHtml(t("signup_selection_priorities", "Restaurant-selection priorities"))}</legend>
        <p class="form-note">${escapeHtml(t("signup_selection_priorities_note_unlimited", "Choose every priority that matters to you."))}</p>
        ${signupCheckboxGroup("selection_priorities", signupOptionGroups.selection_priorities)}
      </fieldset>
      <fieldset><legend>${escapeHtml(t("signup_new_restaurants_question", "Would you like recommendations for newly opened restaurants?"))}</legend>${signupRadioGroup("new_restaurant_recommendations", signupOptionGroups.yes_no)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_new_menu_items_question", "Would you like recommendations when a restaurant adds a new menu item?"))}</legend>${signupRadioGroup("new_menu_item_recommendations", signupOptionGroups.yes_no)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_excluded_categories", "Excluded cuisines or restaurant categories"))}</legend>${signupCheckboxGroup("excluded_categories", signupOptionGroups.excluded_categories)}</fieldset>
    `;
  }
  if (stepKey === "budget") {
    return `
      <fieldset><legend>${escapeHtml(t("signup_spending_range", "Preferred spending per person"))}</legend>${signupRadioGroup("spending_range", signupOptionGroups.spending_ranges)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_discount_levels", "Preferred discount levels"))}</legend>${signupCheckboxGroup("discount_levels", signupOptionGroups.discount_levels)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_no_discount_question", "Would you consider a restaurant without a discount if it strongly matches your preferences?"))}</legend>${signupRadioGroup("consider_no_discount_match", signupOptionGroups.yes_no_sometimes)}</fieldset>
      <p class="form-note">${escapeHtml(t("signup_budget_note", "SmartTable uses this to prioritize offers that fit your comfort level."))}</p>
      <p class="form-note warning">${escapeHtml(t("signup_discount_note", "Selected discount levels help SmartTable understand your interest, but no specific discount is guaranteed."))}</p>
    `;
  }
  if (stepKey === "notifications") {
    return `
      <fieldset><legend>${escapeHtml(t("signup_notification_preferences", "Notification preferences"))}</legend>${signupCheckboxGroup("notification_preferences", signupOptionGroups.notification_preferences)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_notification_channels", "Notification channels"))}</legend>${signupCheckboxGroup("notification_channels", signupOptionGroups.notification_channels)}</fieldset>
      <p class="form-note">${escapeHtml(t("signup_push_unavailable", "Push notifications are not enabled yet, so they are not offered during signup."))}</p>
      <fieldset><legend>${escapeHtml(t("signup_notification_frequency", "Notification frequency"))}</legend>${signupRadioGroup("notification_frequency", signupOptionGroups.notification_frequency)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_events_interest", "Would you like SmartTable to recommend restaurants around concerts, theater, movies, or other events?"))}</legend>${signupRadioGroup("event_recommendations_interest", signupOptionGroups.yes_no)}</fieldset>
      <fieldset><legend>${escapeHtml(t("signup_calendar_future_interest", "Would you consider connecting your calendar in the future?"))}</legend>${signupRadioGroup("future_calendar_interest", signupOptionGroups.yes_no)}</fieldset>
      <p class="form-note">${escapeHtml(t("signup_calendar_future_note", "This only records future interest. SmartTable will not request calendar access during signup."))}</p>
      <p class="form-note warning">${escapeHtml(t("signup_operational_messages_note", "Operational reservation messages are separate from optional marketing consent."))}</p>
      <div class="signup-consent-list">
        ${checkboxInput("transactional_email_consent", t("signup_transactional_email_consent", "I agree to receive reservation confirmations and important account emails."), data.transactional_email_consent)}
        ${fieldError("transactional_email_consent")}
        ${checkboxInput("sms_consent", t("signup_sms_consent", "I separately agree to receive SMS messages if I selected SMS."), data.sms_consent)}
        ${fieldError("sms_consent")}
        ${checkboxInput("marketing_consent", t("signup_marketing_consent", "I want to receive relevant restaurant offers and SmartTable updates."), data.marketing_consent)}
      </div>
    `;
  }
  return `
    <div class="signup-review-grid">
      ${signupReviewCard(0, "signup_review_personal", "Personal information", data.full_name || `${data.first_name} ${data.last_name}`.trim(), `${data.email} | ${data.phone}`)}
      ${signupReviewCard(1, "signup_review_location", "Location", `${data.city}, ${data.region}`, `${data.postal_code} | ${selectedOptionSummary(data.preferred_neighborhoods)}`)}
      ${signupReviewCard(2, "signup_review_food", "Food", selectedOptionSummary(data.cuisines), selectedOptionSummary(data.food_categories))}
      ${signupReviewCard(2, "signup_review_dietary", "Dietary needs", selectedOptionSummary(data.dietary_needs), data.allergy_notes || t("signup_review_no_allergy_notes", "No allergy notes"))}
      ${signupReviewCard(2, "signup_review_drinks", "Drinks", selectedOptionSummary(data.drink_preferences))}
      ${signupReviewCard(3, "signup_review_habits", "Dining habits", selectedOptionSummary(data.dining_experiences), `${selectedOptionSummary(data.preferred_days, 3)} | ${selectedOptionSummary(data.preferred_time_windows, 3)}`)}
      ${signupReviewCard(3, "signup_review_priorities", "Selection priorities", selectedOptionSummary(data.selection_priorities, 6))}
      ${signupReviewCard(4, "signup_review_budget", "Budget", optionLabel(data.spending_range), selectedOptionSummary(data.discount_levels))}
      ${signupReviewCard(4, "signup_review_discounts", "Discount preferences", selectedOptionSummary(data.discount_levels), `${t("signup_no_discount_question_short", "No-discount match")}: ${optionLabel(data.consider_no_discount_match)}`)}
      ${signupReviewCard(5, "signup_review_notifications", "Notifications", selectedOptionSummary(data.notification_preferences), `${selectedOptionSummary(data.notification_channels)} | ${optionLabel(data.notification_frequency)}`)}
      ${signupReviewCard(6, "signup_review_legal", "Legal consent", data.terms_consent && data.privacy_consent ? t("signup_review_legal_ready", "Ready to accept") : t("signup_review_legal_pending", "Consent required"))}
      ${signupReviewCard(5, "signup_review_marketing", "Marketing consent", data.marketing_consent ? t("yes_label", "Yes") : t("no_label", "No"))}
    </div>
    <div class="signup-consent-list">
      ${checkboxInput("allergy_acknowledgement", t("signup_allergy_acknowledgement", "I understand that SmartTable preferences do not replace direct allergy confirmation with the restaurant."), data.allergy_acknowledgement)}
      ${fieldError("allergy_acknowledgement")}
      ${signupConsentCheckbox("terms_consent", `${escapeHtml(t("signup_terms_consent_prefix", "I have read and agree to the SmartTable"))} <a href="/terms" target="_blank" rel="noreferrer">${escapeHtml(t("signup_terms_link", "Terms and Conditions"))}</a>.`, data.terms_consent)}
      ${fieldError("terms_consent")}
      ${signupConsentCheckbox("privacy_consent", `${escapeHtml(t("signup_privacy_consent_prefix", "I have read and agree to the SmartTable"))} <a href="/privacy" target="_blank" rel="noreferrer">${escapeHtml(t("signup_privacy_link", "Privacy Policy"))}</a>.`, data.privacy_consent)}
      ${fieldError("privacy_consent")}
      <p class="form-note">${escapeHtml(t("signup_consent_storage_note", "Terms and Privacy Policy acceptance are stored with version, timestamp, user ID and acceptance language. Marketing consent is stored separately and can be changed later."))}</p>
    </div>
  `;
}

function signupSuccessPanel() {
  const showAi = canShowFeature("ai.concierge", { audience: "guest", allowDemo: true });
  return `
    <section class="panel signup-success-panel" role="status" aria-live="polite">
      <div>
        <span class="section-kicker">${escapeHtml(t("signup_success_kicker", "Account ready"))}</span>
        <h2>${escapeHtml(t("signup_profile_ready_title", "Your SmartTable profile is ready."))}</h2>
        <p class="muted">${escapeHtml(t("signup_profile_ready_message", "We will use your preferences to show more relevant restaurants and offers."))}</p>
      </div>
      <div class="button-row">
        <button class="primary-button" data-dismiss-signup-success type="button">${escapeHtml(t("signup_explore_restaurants", "Explore Restaurants"))}</button>
        <button class="ghost-button" data-view-preferences type="button">${escapeHtml(t("signup_view_preferences", "View My Preferences"))}</button>
        ${showAi ? `<button class="ghost-button" data-start-ai-concierge type="button">${escapeHtml(t("start_ai_concierge_button", "Start AI Concierge"))}</button>` : ""}
      </div>
    </section>
  `;
}

function renderGuestSignup() {
  const signup = ensureSignupState();
  if (!signup.analyticsStarted) {
    signup.analyticsStarted = true;
    trackSignupEvent("signup_started", signupStepAnalyticsMeta(0));
  }
  const finalStep = signup.step === signupSteps.length - 1;
  const createDisabled = finalStep && !isSignupReadyToCreate();
  app.innerHTML = `
    ${layoutHero(`
      <section class="signup-page">
        <div class="signup-header">
          <span class="section-kicker">${escapeHtml(t("signup_kicker", "Guest account"))}</span>
          <h1>${escapeHtml(t("signup_title", "Create your SmartTable account"))}</h1>
          <p class="muted">${escapeHtml(t("signup_subtitle", "Complete every step so SmartTable can match you with better restaurants and reservation offers."))}</p>
        </div>
        ${signupProgress()}
        <form class="signup-card" id="guestSignupForm" novalidate>
          <div class="section-title-row compact">
            <div>
              <span class="section-kicker">${escapeHtml(t("signup_step_label", "Step"))} ${signup.step + 1} / ${signupSteps.length}</span>
              <h2>${escapeHtml(signupStepTitle())}</h2>
            </div>
          </div>
          ${signupStepBody()}
          ${finalStep ? signupValidationSummaryHtml() : ""}
          ${signup.submitError ? `<p class="form-error">${escapeHtml(signup.submitError)}</p>` : ""}
          <div class="button-row signup-actions">
            ${signup.step > 0 ? `<button class="ghost-button" data-signup-back type="button">${escapeHtml(t("signup_back", "Back"))}</button>` : ""}
            <button class="primary-button" type="submit" ${createDisabled ? "disabled" : ""}>${escapeHtml(finalStep ? t("signup_create_my_account", "Create My SmartTable Account") : t("signup_continue", "Continue"))}</button>
          </div>
        </form>
      </section>
    `)}
  `;
  bindSignupEvents();
  finalizeRenderedLanguage();
}

function bindSignupEvents() {
  const form = document.querySelector("#guestSignupForm");
  const signup = ensureSignupState();
  form?.addEventListener("input", (event) => {
    collectSignupForm(form);
    if (["password", "confirm_password"].includes(event.target?.name)) updatePasswordStrengthMeter();
    if (signup.step === signupSteps.length - 1) renderGuestSignup();
  });
  form?.addEventListener("change", (event) => {
    collectSignupForm(form);
    const targetName = event.target?.name || "";
    if (signupAnalyticsFields.has(targetName) && ["checkbox", "radio"].includes(event.target?.type)) {
      trackSignupEvent("preference_selected", signupStepAnalyticsMeta(signup.step, {
        field_key: targetName,
        selected_count: asArray(signup.data[targetName]).length || (signup.data[targetName] ? 1 : 0),
        selected: Boolean(event.target.checked)
      }));
    }
    if (targetName === "terms_consent" && event.target.checked) {
      trackSignupEvent("terms_accepted", signupStepAnalyticsMeta(signup.step, {
        terms_version: "2026-07-17"
      }));
    }
    if (targetName === "privacy_consent" && event.target.checked) {
      trackSignupEvent("privacy_accepted", signupStepAnalyticsMeta(signup.step, {
        privacy_policy_version: "2026-07-17"
      }));
    }
    if (targetName === "marketing_consent" && event.target.checked) {
      trackSignupEvent("marketing_consent_given", signupStepAnalyticsMeta(signup.step, {
        marketing_consent: true
      }));
    }
    if (signup.step === signupSteps.length - 1) renderGuestSignup();
  });
  form?.addEventListener("submit", submitSignupStep);
  document.querySelector("[data-signup-back]")?.addEventListener("click", () => {
    collectSignupForm(form);
    signup.step = Math.max(0, signup.step - 1);
    signup.errors = {};
    renderGuestSignup();
  });
  document.querySelectorAll("[data-signup-step]").forEach((button) => {
    button.addEventListener("click", () => {
      collectSignupForm(form);
      signup.step = Math.min(Number(button.dataset.signupStep || 0), signup.step);
      signup.errors = {};
      renderGuestSignup();
    });
  });
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      collectSignupForm(form);
      signup[button.dataset.togglePassword] = !signup[button.dataset.togglePassword];
      renderGuestSignup();
    });
  });
  document.querySelectorAll("[data-edit-signup-step]").forEach((button) => {
    button.addEventListener("click", () => {
      collectSignupForm(form);
      signup.step = Number(button.dataset.editSignupStep || 0);
      signup.errors = {};
      renderGuestSignup();
    });
  });
  document.querySelector("[data-guest-login]")?.addEventListener("click", () => {
    maybeTrackSignupAbandoned("guest_login_link");
    history.pushState(null, "", "/login");
    state.mode = "guest";
    renderCurrentMode();
  });
  document.querySelector("#useDeviceLocation")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast(t("signup_location_unavailable", "Device location is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => showToast(t("signup_location_received", "Location permission received. Please still confirm your city and region.")),
      () => showToast(t("signup_location_declined", "Location access was declined. Please enter your city and region manually."))
    );
  });
}

async function submitSignupStep(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const signup = ensureSignupState();
  collectSignupForm(form);
  if (!validateSignupStep(signup.step)) {
    renderGuestSignup();
    return;
  }
  trackSignupEvent("signup_step_completed", signupStepAnalyticsMeta(signup.step, {
    completion_state: signup.step === signupSteps.length - 1 ? "ready_to_create" : "step_complete"
  }));
  if (signup.step < signupSteps.length - 1) {
    signup.step += 1;
    signup.errors = {};
    renderGuestSignup();
    return;
  }
  if (!validateAllSignupSteps()) {
    renderGuestSignup();
    return;
  }
  try {
    signup.submitting = true;
    renderGuestSignup();
    const payload = await api("/auth/signup-guest", {
      method: "POST",
      body: JSON.stringify({
        ...signup.data,
        profile_key: state.aiProfileKey,
        preferred_language: state.lang
      })
    });
    if (payload.access_token && payload.profile) {
      payload.profile.role = normalizeRole(payload.profile.role);
      saveSession(payload);
      await applyProfileLanguagePreference(payload);
    }
    state.aiPreferences = payload.preferences || null;
    signup.analyticsCompleted = true;
    trackSignupEvent("signup_completed", signupStepAnalyticsMeta(signupSteps.length - 1, {
      completion_state: "completed",
      completed_steps_count: signupSteps.length,
      preference_question_count: 28,
      marketing_consent: Boolean(signup.data.marketing_consent)
    }));
    state.signupSuccess = {
      profile: payload.profile || null,
      preferences: payload.preferences || null,
      emailVerificationRequired: !payload.access_token && Boolean(payload.message)
    };
    state.signup = null;
    history.pushState(null, "", "/");
    state.mode = "guest";
    await renderCurrentMode();
    showToast(t("signup_success", "Your SmartTable account was created."));
  } catch (error) {
    signup.submitting = false;
    signup.submitError = /exists|registered|duplicate/i.test(error.message)
      ? t("signup_duplicate_email_error", "An account with this email already exists. Please sign in.")
      : error.message;
    renderGuestSignup();
  }
}

function bindGuestEvents(restaurants) {
  document.querySelectorAll("[data-ai-concierge-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = "#ai-concierge";
      document.querySelector("#ai-concierge")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-open-ai-preferences]").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = "#ai-preferences";
      state.aiWizardOpen = true;
      state.reservationModal = null;
      state.followModal = null;
      state.reviewModal = null;
      trackAiEvent("preference_wizard_opened");
      renderGuest();
    });
  });
  document.querySelectorAll("[data-open-ai-wizard], #openAiWizard").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = "#ai-preferences";
      state.aiWizardOpen = true;
      state.reservationModal = null;
      state.followModal = null;
      state.reviewModal = null;
      trackAiEvent("preference_wizard_opened");
      renderGuest();
    });
  });
  document.querySelectorAll("[data-close-ai-wizard]").forEach((button) => {
    button.addEventListener("click", () => {
      state.aiWizardOpen = false;
      renderGuest();
    });
  });
  document.querySelector("#aiPreferenceForm")?.addEventListener("submit", submitAiPreferences);
  document.querySelector("#eventPlanForm")?.addEventListener("submit", submitEventPlan);
  document.querySelector("#routePlanForm")?.addEventListener("submit", submitRoutePlan);
  document.querySelector("#consumptionForm")?.addEventListener("submit", submitConsumptionUpload);
  document.querySelectorAll(".offers-filters input, .offers-filters select").forEach((control) => {
    control.addEventListener("input", () => {
      if (control.type === "checkbox") state.filters[control.name] = control.checked;
      else state.filters[control.name] = control.value;
      renderGuest();
    });
    control.addEventListener("change", () => {
      if (control.type === "checkbox") state.filters[control.name] = control.checked;
      else state.filters[control.name] = control.value;
      renderGuest();
    });
  });
  document.querySelectorAll("form.offers-filters").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      document.querySelector("#guest-offers")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-clear-guest-filters]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filters = {
        neighborhood: "",
        cuisine: "",
        discount: "",
        date: "",
        time: "",
        partySize: "",
        restaurantName: "",
        availableOnly: true,
        sort: "recommended"
      };
      renderGuest();
    });
  });
  document.querySelectorAll("[data-view-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.viewMode = button.dataset.viewMode;
      renderGuest();
    });
  });
  document.querySelectorAll("[data-open-reserve]").forEach((button) => {
    button.addEventListener("click", () => {
      prepareGuestModalOpen(button);
      trackAiEvent(button.dataset.aiAction === "reserve" ? "ai_recommendation_reserve_clicked" : "reserve_clicked", {
        restaurant_id: button.dataset.restaurant,
        offer_id: button.dataset.openReserve
      });
      state.reservationModal = { restaurantId: button.dataset.restaurant, offerId: button.dataset.openReserve };
      state.restaurantDetail = null;
      state.followModal = null;
      state.reviewModal = null;
      state.reservationSuccess = null;
      state.aiWizardOpen = false;
      renderGuest();
    });
  });
  document.querySelectorAll("[data-open-restaurant]").forEach((button) => {
    button.addEventListener("click", () => {
      prepareGuestModalOpen(button);
      state.restaurantDetail = button.dataset.openRestaurant;
      state.reservationModal = null;
      state.followModal = null;
      state.reviewModal = null;
      state.reservationSuccess = null;
      state.aiWizardOpen = false;
      trackAiEvent("restaurant_detail_opened", { restaurant_id: button.dataset.openRestaurant });
      if (button.dataset.restaurantSlug) history.pushState(null, "", `/restaurants/${button.dataset.restaurantSlug}`);
      renderGuest();
    });
  });
  document.querySelectorAll("[data-newest-restaurant]").forEach((button) => {
    button.addEventListener("click", () => {
      prepareGuestModalOpen(button);
      const restaurantId = button.dataset.newestRestaurant;
      trackAiEvent("newest_restaurant_clicked", { restaurant_id: restaurantId, offer_id: button.dataset.newestOffer });
      state.restaurantDetail = restaurantId;
      state.reservationModal = null;
      state.followModal = null;
      state.reviewModal = null;
      state.reservationSuccess = null;
      if (button.dataset.restaurantSlug) history.pushState(null, "", `/restaurants/${button.dataset.restaurantSlug}`);
      renderGuest();
    });
  });
  document.querySelectorAll("[data-follow-restaurant]").forEach((button) => {
    button.addEventListener("click", () => {
      prepareGuestModalOpen(button);
      trackAiEvent(button.dataset.aiAction === "follow" ? "ai_recommendation_follow_clicked" : "follow_clicked", {
        restaurant_id: button.dataset.followRestaurant
      });
      state.followModal = button.dataset.followRestaurant;
      state.restaurantDetail = null;
      state.reviewModal = null;
      state.reservationSuccess = null;
      state.aiWizardOpen = false;
      renderGuest();
    });
  });
  document.querySelectorAll("[data-review-restaurant]").forEach((button) => {
    button.addEventListener("click", () => {
      prepareGuestModalOpen(button);
      trackAiEvent("review_clicked", { restaurant_id: button.dataset.reviewRestaurant });
      state.reviewModal = button.dataset.reviewRestaurant;
      state.restaurantDetail = null;
      state.followModal = null;
      state.reservationSuccess = null;
      state.aiWizardOpen = false;
      renderGuest();
    });
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", closeGuestModal);
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeGuestModal();
    });
  });
  document.querySelectorAll("[data-close-success]").forEach((button) => {
    button.addEventListener("click", () => {
      state.reservationSuccess = null;
      renderGuest();
    });
  });
  document.querySelector("[data-dismiss-signup-success]")?.addEventListener("click", () => {
    state.signupSuccess = null;
    renderGuest();
    document.querySelector(".offers-title-row")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("[data-view-preferences]")?.addEventListener("click", async () => {
    state.signupSuccess = null;
    if (isGuestSession()) {
      state.guestAccountTab = "preferences";
      history.pushState(null, "", "/account");
      await renderCurrentMode();
      return;
    }
    state.aiWizardOpen = true;
    renderGuest();
  });
  document.querySelector("[data-start-ai-concierge]")?.addEventListener("click", async () => {
    state.signupSuccess = null;
    location.hash = "#ai-concierge";
    await renderCurrentMode();
  });
  document.querySelectorAll("[data-modal-offer]").forEach((select) => {
    select.addEventListener("change", () => {
      if (state.reservationModal) state.reservationModal.offerId = select.value;
      renderGuest();
    });
  });
  document.querySelectorAll("[data-reserve]").forEach((form) => {
    form.addEventListener("submit", submitReservation);
  });
  document.querySelectorAll("[data-follow-form]").forEach((form) => {
    form.addEventListener("submit", submitFollow);
  });
  document.querySelectorAll("[data-review-form]").forEach((form) => {
    form.addEventListener("submit", submitReview);
  });
  initializeMap(restaurants);
}

function renderGuest(publicRoute = currentPublicGuestRoute()) {
  updateMeta();
  const restaurants = filteredRestaurants();
  const offerCount = restaurants.reduce((sum, restaurant) => sum + (restaurant.filteredOffers || restaurant.offers).length, 0);
  if (rewardsBookingIdFromUrl()) {
    app.innerHTML = `
      ${layoutHero(`
        <section class="login-card">
          <span class="section-kicker">${escapeHtml(t("booking_completed_event", "Booking completed"))}</span>
          <h2>${escapeHtml(t("ai_consumption_title", "Dining photo rewards"))}</h2>
          <p class="muted">${escapeHtml(t("photo_rewards_points_cap", "You can earn up to 160 points for this visit."))}</p>
        </section>
      `)}
      ${aiModeBanner("guest")}
      ${postVisitRewardsPage()}
      <footer class="site-footer">${escapeHtml(t("footer_text", "Smarttable.com serves New York restaurants and guests."))}</footer>
      ${guestModals()}
    `;
    bindGuestEvents(restaurants);
    syncGuestModalState();
    finalizeRenderedLanguage();
    return;
  }
  app.innerHTML = `
    ${layoutHero(guestHeroSearchPanel())}
    ${aiModeBanner("guest")}
    ${state.signupSuccess ? signupSuccessPanel() : ""}
    ${guestAiConciergeHomepageEntry()}
    ${aiConciergeSection()}
    ${newestRestaurantsSection()}
    <section class="section-title-row offers-title-row" id="guest-offers">
      <div>
        <span class="section-kicker">${escapeHtml(t("offers_kicker", "Guest booking"))}</span>
        <h2>${escapeHtml(t("offers_title", "Available discounted tables"))}</h2>
      </div>
      <div class="view-controls" aria-label="${escapeAttr(t("view_mode_label", "View mode"))}">
        <span class="muted">${offerCount} ${escapeHtml(t("offers_count_label", "active offers"))}</span>
        <button class="ghost-button ${state.viewMode === "list" ? "active" : ""}" data-view-mode="list" type="button">${escapeHtml(t("view_list_label", "List"))}</button>
        <button class="ghost-button ${state.viewMode === "map" ? "active" : ""}" data-view-mode="map" type="button">${escapeHtml(t("view_map_label", "Map"))}</button>
      </div>
    </section>
    ${filterBar()}
    ${state.viewMode === "map" ? mapView(restaurants) : listView(restaurants)}
    <section class="public-info-grid" id="guest-info">
      <article>
        <span class="section-kicker">${escapeHtml(t("about_title", "About Smart Table"))}</span>
        <p>${escapeHtml(t("about_body", "Smart Table helps restaurants fill open tables."))}</p>
      </article>
      <article>
        <span class="section-kicker">${escapeHtml(t("how_it_works_title", "How it works"))}</span>
        <p>${escapeHtml(t("how_it_works_body", "Restaurants publish offers and confirm reservations by email."))}</p>
      </article>
      <article>
        <span class="section-kicker">${escapeHtml(t("restaurants_title", "For restaurants"))}</span>
        <p>${escapeHtml(t("restaurants_body", "Control discounts, tables, reservations, and stats."))}</p>
      </article>
      <article>
        <span class="section-kicker">${escapeHtml(t("guests_title", "For guests"))}</span>
        <p>${escapeHtml(t("guests_body", "Find deals and receive email updates."))}</p>
      </article>
    </section>
    <footer class="site-footer">${escapeHtml(t("footer_text", "Smarttable.com serves New York restaurants and guests."))}</footer>
    ${guestModals()}
  `;
  bindGuestEvents(restaurants);
  syncGuestModalState();
  finalizeRenderedLanguage();
  publicRouteTarget(publicRoute);
}

async function submitReservation(event) {
  event.preventDefault();
  if (state.reservationSubmitting) return;
  const form = event.currentTarget;
  const data = formObject(form);
  data.offer_id = data.offer_id || form.dataset.reserve;
  data.party_size = Number(data.party_size);
  data.profile_key = state.aiProfileKey;
  data.lang = state.lang;
  data.guest_language = state.lang;
  state.reservationSubmitting = true;
  form.querySelectorAll("button").forEach((button) => {
    if (button.type === "submit") button.disabled = true;
  });

  try {
    const payload = await api("/reservations", {
      method: "POST",
      body: JSON.stringify(data)
    });
    trackAiEvent("reservation_form_submitted", {
      offer_id: data.offer_id,
      reservation_id: payload.reservation?.reservation_id,
      party_size: data.party_size,
      reservation_date: data.reservation_date,
      reservation_time: data.reservation_time
    });
    state.reservationSuccess = {
      reservation: payload.reservation,
      emails: payload.emails || [],
      email_delivery: payload.email_delivery || null
    };
    state.reservationModal = null;
    state.reservationSubmitting = false;
    await loadPublicOffers();
    if (canShowFeature("ai.concierge", { allowDemo: true })) await loadAiRecommendations();
    renderGuest();
  } catch (error) {
    state.reservationSubmitting = false;
    form.querySelectorAll("button").forEach((button) => {
      if (button.type === "submit") button.disabled = false;
    });
    showToast(reservationErrorMessage(error));
  }
}

function reservationErrorMessage(error) {
  const code = String(error?.payload?.code || "").trim().toUpperCase();
  const keys = {
    OFFER_EXPIRED: "reservation_error_offer_expired",
    OFFER_NOT_STARTED: "reservation_error_offer_not_started",
    BOOKING_CUTOFF_PASSED: "reservation_error_booking_cutoff_passed",
    OFFER_SOLD_OUT: "reservation_error_offer_sold_out",
    OFFER_INACTIVE: "reservation_error_offer_inactive",
    OFFER_NOT_FOUND: "reservation_error_offer_not_found",
    INVALID_OFFER_TIME: "reservation_error_invalid_offer_time",
    OFFER_DATE_MISMATCH: "reservation_error_offer_date_mismatch",
    OFFER_UNAVAILABLE: "reservation_error_offer_unavailable"
  };
  if (keys[code]) return t(keys[code], error?.message || "This offer is not available.");
  return error?.message || t("reservation_error_generic", "Reservation could not be submitted. Please try again.");
}

async function submitFollow(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  try {
    await api("/public/follow", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: form.dataset.followForm,
        guest_email: data.guest_email,
        guest_name: data.guest_name,
        profile_key: state.aiProfileKey,
        notification_enabled: true
      })
    });
    state.followModal = null;
    if (canShowFeature("ai.concierge", { allowDemo: true })) await loadAiRecommendations();
    renderGuest();
    showToast(t("follow_success", "You are following this restaurant."));
  } catch (error) {
    showToast(error.message);
  }
}

async function submitReview(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  try {
    await api("/public/reviews", {
      method: "POST",
      body: JSON.stringify({
        restaurant_id: form.dataset.reviewForm,
        guest_name: data.guest_name,
        guest_email: data.guest_email,
        food_rating: Number(data.food_rating),
        service_rating: Number(data.service_rating),
        ambience_rating: Number(data.ambience_rating),
        profile_key: state.aiProfileKey,
        comment: data.comment
      })
    });
    state.reviewModal = null;
    if (canShowFeature("ai.concierge", { allowDemo: true })) await loadAiRecommendations();
    renderGuest();
    showToast(t("review_success", "Thanks. Your review is waiting for admin approval."));
  } catch (error) {
    showToast(error.message);
  }
}

async function submitAiPreferences(event) {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  const body = {
    profile_key: state.aiProfileKey,
    guest_email: data.guest_email,
    cuisines: asArray(data.cuisines),
    food_interests: asArray(data.food_interests),
    drink_preferences: asArray(data.drink_preferences),
    atmospheres: asArray(data.atmospheres),
    preferred_days: asArray(data.preferred_days),
    preferred_time_windows: asArray(data.preferred_time_windows),
    occasions: asArray(data.occasions),
    preferred_neighborhoods: splitCommaList(data.preferred_neighborhoods),
    preferred_times: splitCommaList(data.preferred_times),
    dietary_restrictions: splitCommaList(data.dietary_restrictions),
    favorite_restaurants: splitCommaList(data.favorite_restaurants),
    budget_per_person: Number(data.budget_per_person || 0),
    travel_distance_miles: Number(data.travel_distance_miles || 0),
    walking_distance_tolerance: Number(data.walking_distance_tolerance || 0),
    preferred_party_size: Number(data.preferred_party_size || 2),
    preferred_discount_range: data.preferred_discount_range || "10-15",
    parking_required: boolValue(Array.isArray(data.parking_required) ? data.parking_required.at(-1) : data.parking_required),
    subway_preferred: boolValue(Array.isArray(data.subway_preferred) ? data.subway_preferred.at(-1) : data.subway_preferred),
    kids_friendly: boolValue(Array.isArray(data.kids_friendly) ? data.kids_friendly.at(-1) : data.kids_friendly),
    outdoor_seating: boolValue(Array.isArray(data.outdoor_seating) ? data.outdoor_seating.at(-1) : data.outdoor_seating),
    calendar_opt_in: boolValue(Array.isArray(data.calendar_opt_in) ? data.calendar_opt_in.at(-1) : data.calendar_opt_in),
    notes: data.notes || ""
  };
  try {
    const payload = await api("/ai/preferences", {
      method: "POST",
      body: JSON.stringify(body)
    });
    state.aiPreferences = { ...(payload.preferences || body), guest_email: body.guest_email || "" };
    state.aiWizardOpen = false;
    if (canShowFeature("ai.concierge", { allowDemo: true })) await loadAiRecommendations();
    renderGuest();
    showToast(t("ai_wizard_saved", "Your AI dining profile was saved."));
  } catch (error) {
    showToast(error.message);
  }
}

function minutesFromTime(value, fallback = 19 * 60) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hour)) return fallback;
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
}

function timeFromMinutes(value) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, value));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function submitEventPlan(event) {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  const restaurants = publicRestaurantOptions();
  const restaurant = restaurants.find((item) => item.id === data.restaurant_id) || restaurants[0] || {};
  const offer = firstOfferForRestaurant(restaurant);
  const maxTravel = Math.max(5, Number(data.maximum_travel_time || 20));
  const travel = Math.max(8, Math.min(maxTravel, data.transportation_preference === "walk" ? 14 : data.transportation_preference === "subway" ? 18 : 16));
  const partySize = Math.max(1, Number(data.party_size || 2));
  const service = Number(restaurant.average_service_minutes || 75) + Math.max(0, partySize - 2) * 8;
  const buffer = Math.max(12, Math.round(travel * 0.8));
  const start = minutesFromTime(data.event_start_time, 20 * 60);
  const end = minutesFromTime(data.event_end_time, 22 * 60);
  const dinnerStart = data.dinner_timing === "after" ? end + buffer : start - service - travel - buffer;
  const dinnerEnd = data.dinner_timing === "after" ? dinnerStart + service : start - travel - buffer;
  const riskScore = travel + buffer + (data.transportation_preference === "car" ? 10 : 4);
  state.aiEventPlan = {
    event_name: data.event_name || t("event_name_fallback", "Event"),
    event_location: data.event_location || "",
    restaurant_id: restaurant.id,
    offer_id: offer?.offer_id || restaurant.first_offer_id || "",
    suggested_restaurant: restaurant.name || t("event_suggested_restaurant_fallback", "Best matching restaurant"),
    recommended_dining_window: `${timeFromMinutes(dinnerStart)}-${timeFromMinutes(dinnerEnd)}`,
    suggested_reservation_time: timeFromMinutes(dinnerStart),
    estimated_dining_duration: `${service} min`,
    travel_time_to_restaurant: `${travel} min`,
    travel_time_to_event: `${Math.max(6, Math.round(travel * 0.75))} min`,
    estimated_travel_time: `${travel} min`,
    buffer_time: `${buffer} min`,
    delay_risk: riskScore > 32 ? t("risk_high_label", "High") : riskScore > 22 ? t("risk_medium_label", "Medium") : t("risk_low_label", "Low"),
    weather_note: t("event_weather_manual_note", "Manual estimate now. Live weather hook is prepared."),
    traffic_note: data.transportation_preference === "walk" ? t("event_traffic_walk_note", "Low traffic risk for walking route.") : t("event_traffic_buffer_note", "Traffic buffer included in the dining window."),
    transportation_preference: data.transportation_preference,
    integrations_ready: ["google_calendar", "google_maps"]
  };
  renderGuest();
  showToast(t("event_plan_created", "Event dining plan created."));
}

async function submitRoutePlan(event) {
  event.preventDefault();
  const data = formObject(event.currentTarget);
  try {
    const payload = await api("/ai/route-plan", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        profile_key: state.aiProfileKey,
        party_size: Number(data.party_size || 2),
        home_to_restaurant_miles: Number(data.home_to_restaurant_miles || 0),
        restaurant_to_event_miles: Number(data.restaurant_to_event_miles || 0),
        event_to_home_miles: Number(data.event_to_home_miles || 0),
        weather_buffer_minutes: Number(data.weather_buffer_minutes || 0),
        traffic_buffer_minutes: Number(data.traffic_buffer_minutes || 0)
      })
    });
    state.aiRoutePlan = payload.plan;
    renderGuest();
    showToast(t("route_plan_created", "Route plan created."));
  } catch (error) {
    showToast(error.message);
  }
}

async function resolveConsumptionImage(form, data) {
  const file = form.elements.photo?.files?.[0];
  if (!file) return data.image_url;
  const signed = await api("/ai/consumption/sign-upload", {
    method: "POST",
    body: JSON.stringify({
      profile_key: state.aiProfileKey,
      filename: file.name,
      content_type: file.type
    })
  });
  if (signed.upload_url) {
    const response = await fetch(signed.upload_url, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file
    });
    if (!response.ok) throw new Error(t("photo_upload_failed_error", "Photo upload failed."));
  }
  return signed.public_url;
}

async function submitConsumptionUpload(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  try {
    const imageUrl = await resolveConsumptionImage(form, data);
    const file = form.elements.photo?.files?.[0];
    const payload = await api("/ai/consumption-uploads", {
      method: "POST",
      body: JSON.stringify({
        profile_key: state.aiProfileKey,
        restaurant_id: data.restaurant_id,
        reservation_id: data.reservation_id || data.booking_id || "",
        booking_id: data.booking_id || data.reservation_id || "",
        guest_id: data.guest_id,
        guest_name: data.guest_name,
        guest_email: data.guest_email,
        image_url: imageUrl,
        uploaded_file_name: file?.name || "",
        media_type: data.media_type,
        description: data.description,
        rating: Number(data.overall_rating || data.rating || 0),
        overall_rating: Number(data.overall_rating || data.rating || 0),
        food_rating: Number(data.food_rating || 0),
        service_rating: Number(data.service_rating || 0),
        ambience_rating: Number(data.ambience_rating || 0),
        short_review: data.short_review,
        liked_highlight: data.liked_highlight,
        ordered_items: data.ordered_items,
        would_recommend: data.would_recommend,
        would_return: data.would_return,
        tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : []
      })
    });
    state.aiConsumptionResult = payload;
    state.loyaltyStatus = payload.loyalty || state.loyaltyStatus;
    localStorage.setItem("smarttable.aiConsumptionResult", JSON.stringify(payload));
    localStorage.setItem("smarttable.loyaltyStatus", JSON.stringify(state.loyaltyStatus));
    if (canShowFeature("ai.concierge", { allowDemo: true })) await loadAiRecommendations();
    renderGuest();
    showToast(isBasicMode()
      ? t("photo_rewards_success_basic", "Thanks. Loyalty points were added and your submission is queued for moderation.")
      : t("ai_consumption_success", "Thanks. Loyalty points were added and the photo is queued for AI analysis."));
  } catch (error) {
    showToast(error.message);
  }
}

function guestAuthShell(inner) {
  return layoutHero(`<section class="account-auth-page">${inner}</section>`);
}

function renderPasswordField(name, label, value = "", stateKey = "showPassword", autocomplete = "current-password") {
  const visible = Boolean(state.guestPasswordReset[stateKey] || state.guestLogin[stateKey]);
  return `
    <label class="password-field">
      ${escapeHtml(label)}
      <span>
        <input name="${escapeAttr(name)}" type="${visible ? "text" : "password"}" value="${escapeAttr(value)}" autocomplete="${escapeAttr(autocomplete)}" required>
        <button class="ghost-button" data-toggle-auth-password="${escapeAttr(stateKey)}" type="button">${escapeHtml(visible ? t("hide_password_button", "Hide") : t("show_password_button", "Show"))}</button>
      </span>
    </label>
  `;
}

function resetPasswordStrengthMeter(password = "") {
  const strength = passwordStrength(password);
  return `
    <div class="password-strength" aria-live="polite">
      <span style="width:${strength.percent}%"></span>
    </div>
    <p class="form-note">${escapeHtml(t(`signup_password_strength_${strength.key}`, `Password strength: ${strength.key}`))}</p>
  `;
}

function renderGuestLogin() {
  if (isGuestSession()) {
    history.replaceState(null, "", "/account");
    renderCurrentMode();
    return;
  }
  const login = state.guestLogin;
  app.innerHTML = guestAuthShell(`
    <form class="login-card account-card" id="guestLoginForm" novalidate>
      <span class="section-kicker">${escapeHtml(t("guest_login_title", "Guest sign in"))}</span>
      <h1>${escapeHtml(t("guest_login_heading", "Sign in to your guest account"))}</h1>
      <p class="muted">${escapeHtml(t("guest_login_intro", "Access reservations, favorites, preferences, notifications, and privacy settings."))}</p>
      <label>${escapeHtml(t("signup_email", "Email"))}<input name="email" type="email" autocomplete="email" required></label>
      ${renderPasswordField("password", t("signup_password", "Password"), "", "showPassword", "current-password")}
      <label class="check-row"><input name="remember_me" type="checkbox" ${login.rememberMe ? "checked" : ""}> ${escapeHtml(t("login_remember_me", "Remember me"))}</label>
      ${login.error ? `<p class="form-error" role="alert">${escapeHtml(login.error)}</p>` : ""}
      <button class="primary-button wide" type="submit" ${login.submitting ? "disabled" : ""}>${escapeHtml(login.submitting ? t("login_signing_in", "Signing in...") : t("guest_sign_in_button", "Sign In"))}</button>
      <div class="auth-link-row">
        <button class="link-button" data-forgot-password type="button">${escapeHtml(t("forgot_password_link", "Forgot password?"))}</button>
        <button class="link-button" data-guest-signup type="button">${escapeHtml(t("signup_create_account", "Create account"))}</button>
      </div>
      ${state.apiMode === "demo" ? `<p class="form-note">${escapeHtml(t("guest_demo_credentials_note", "Demo guest: guest@smarttable.com / guest123"))}</p>` : ""}
    </form>
  `);
  finalizeRenderedLanguage();
  bindGuestLoginEvents();
}

function bindGuestLoginEvents() {
  const form = document.querySelector("#guestLoginForm");
  document.querySelector("[data-guest-signup]")?.addEventListener("click", () => {
    history.pushState(null, "", "/signup");
    state.mode = "guest";
    renderCurrentMode();
  });
  document.querySelector("[data-forgot-password]")?.addEventListener("click", () => {
    history.pushState(null, "", "/forgot-password");
    state.mode = "guest";
    renderCurrentMode();
  });
  document.querySelector("[data-toggle-auth-password]")?.addEventListener("click", () => {
    state.guestLogin.showPassword = !state.guestLogin.showPassword;
    renderGuestLogin();
  });
  form?.addEventListener("change", () => {
    state.guestLogin.rememberMe = Boolean(form.elements.remember_me?.checked);
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.guestLogin.submitting) return;
    const data = formObject(form);
    state.guestLogin.error = "";
    if (!isValidEmail(data.email)) {
      state.guestLogin.error = t("signup_error_email", "Enter a valid email address.");
      renderGuestLogin();
      return;
    }
    try {
      state.guestLogin.submitting = true;
      renderGuestLogin();
      const payload = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          remember_me: Boolean(data.remember_me)
        })
      });
      payload.profile.role = normalizeRole(payload.profile.role);
      if (payload.profile.role !== "guest") throw new Error(t("guest_login_role_error", "Please use the correct dashboard login for this account."));
      saveSession(payload, { remember: Boolean(data.remember_me) });
      trackGuestAccountEvent("login_success", { remember_me: Boolean(data.remember_me), auth_provider: payload.mode || state.apiMode });
      await applyProfileLanguagePreference(payload);
      state.guestLogin = { showPassword: false, submitting: false, error: "", rememberMe: Boolean(data.remember_me) };
      state.mode = "guest";
      history.pushState(null, "", state.postLoginRedirect || "/account");
      state.postLoginRedirect = "";
      await renderCurrentMode();
      showToast(t("logged_in_toast", "Logged in."));
    } catch (error) {
      trackGuestAccountEvent("login_failed", { error_category: /too many/i.test(error.message) ? "rate_limited" : "invalid_credentials" });
      state.guestLogin.submitting = false;
      state.guestLogin.error = /too many/i.test(error.message)
        ? t("login_rate_limited_error", "Too many login attempts. Please wait before trying again.")
        : t("login_generic_error", "Invalid email or password.");
      renderGuestLogin();
    }
  });
}

function renderForgotPassword() {
  const reset = state.guestPasswordReset;
  app.innerHTML = guestAuthShell(`
    <form class="login-card account-card" id="forgotPasswordForm" novalidate>
      <span class="section-kicker">${escapeHtml(t("forgot_password_kicker", "Password help"))}</span>
      <h1>${escapeHtml(t("forgot_password_title", "Reset your password"))}</h1>
      <p class="muted">${escapeHtml(t("forgot_password_body", "Enter your email and we will send reset instructions if a SmartTable account exists."))}</p>
      <label>${escapeHtml(t("signup_email", "Email"))}<input name="email" type="email" autocomplete="email" required></label>
      ${reset.error ? `<p class="form-error" role="alert">${escapeHtml(reset.error)}</p>` : ""}
      ${reset.emailSent ? `<div class="success-state"><strong>${escapeHtml(t("forgot_password_sent_title", "Request received"))}</strong><p>${escapeHtml(t("forgot_password_sent_body", "If a SmartTable account exists for this email, a password reset message will be sent when email delivery is configured."))}</p>${reset.demoToken ? `<p class="form-note">${escapeHtml(t("forgot_password_demo_token", "Demo reset token"))}: <code>${escapeHtml(reset.demoToken)}</code></p>` : ""}</div>` : ""}
      <button class="primary-button wide" type="submit" ${reset.submitting ? "disabled" : ""}>${escapeHtml(reset.submitting ? t("sending_button", "Sending...") : t("forgot_password_send_button", "Send reset email"))}</button>
      <button class="link-button" data-back-login type="button">${escapeHtml(t("back_to_login_button", "Back to login"))}</button>
    </form>
  `);
  finalizeRenderedLanguage();
  document.querySelector("[data-back-login]")?.addEventListener("click", () => {
    history.pushState(null, "", "/login");
    renderCurrentMode();
  });
  document.querySelector("#forgotPasswordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formObject(event.currentTarget);
    state.guestPasswordReset.error = "";
    if (!isValidEmail(data.email)) {
      state.guestPasswordReset.error = t("signup_error_email", "Enter a valid email address.");
      renderForgotPassword();
      return;
    }
    try {
      state.guestPasswordReset.submitting = true;
      renderForgotPassword();
      const payload = await api("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: data.email })
      });
      state.guestPasswordReset.submitting = false;
      state.guestPasswordReset.emailSent = true;
      state.guestPasswordReset.demoToken = payload.demo_reset_token || "";
      trackGuestAccountEvent("password_reset_requested", { status: "requested" });
      renderForgotPassword();
    } catch (error) {
      state.guestPasswordReset.submitting = false;
      state.guestPasswordReset.error = error.message;
      renderForgotPassword();
    }
  });
}

function resetTokenFromUrl() {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return url.searchParams.get("token") || url.searchParams.get("access_token") || hashParams.get("access_token") || "";
}

function renderResetPassword() {
  const reset = state.guestPasswordReset;
  const token = resetTokenFromUrl();
  app.innerHTML = guestAuthShell(`
    <form class="login-card account-card" id="resetPasswordForm" novalidate>
      <span class="section-kicker">${escapeHtml(t("reset_password_kicker", "New password"))}</span>
      <h1>${escapeHtml(t("reset_password_title", "Create a new password"))}</h1>
      <p class="muted">${escapeHtml(t("reset_password_body", "Use a strong password that you do not use on other sites."))}</p>
      ${token ? `<input type="hidden" name="token" value="${escapeAttr(token)}">` : `<label>${escapeHtml(t("reset_password_token_label", "Reset token"))}<input name="token" required></label>`}
      ${renderPasswordField("password", t("reset_password_new_label", "New password"), "", "showPassword", "new-password")}
      ${renderPasswordField("confirm_password", t("signup_confirm_password", "Confirm password"), "", "showConfirmPassword", "new-password")}
      <div id="resetPasswordStrength">${resetPasswordStrengthMeter("")}</div>
      ${reset.error ? `<p class="form-error" role="alert">${escapeHtml(reset.error)}</p>` : ""}
      ${reset.success ? `<div class="success-state"><strong>${escapeHtml(t("reset_password_success_title", "Password updated"))}</strong><p>${escapeHtml(t("reset_password_success_body", "You can now sign in with your new password."))}</p></div>` : ""}
      <button class="primary-button wide" type="submit" ${reset.submitting ? "disabled" : ""}>${escapeHtml(reset.submitting ? t("saving_button", "Saving...") : t("reset_password_save_button", "Update password"))}</button>
      <button class="link-button" data-back-login type="button">${escapeHtml(t("back_to_login_button", "Back to login"))}</button>
    </form>
  `);
  finalizeRenderedLanguage();
  const form = document.querySelector("#resetPasswordForm");
  form?.addEventListener("input", () => {
    const meter = document.querySelector("#resetPasswordStrength");
    if (meter) meter.innerHTML = resetPasswordStrengthMeter(form.elements.password?.value || "");
  });
  document.querySelectorAll("[data-toggle-auth-password]").forEach((button) => {
    button.addEventListener("click", () => {
      state.guestPasswordReset[button.dataset.toggleAuthPassword] = !state.guestPasswordReset[button.dataset.toggleAuthPassword];
      renderResetPassword();
    });
  });
  document.querySelector("[data-back-login]")?.addEventListener("click", () => {
    history.pushState(null, "", "/login");
    renderCurrentMode();
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.guestPasswordReset.submitting) return;
    const data = formObject(form);
    state.guestPasswordReset.error = "";
    if (passwordStrength(data.password).score < 5) {
      state.guestPasswordReset.error = t("signup_error_password", "Use at least 8 characters with uppercase, lowercase, number, and symbol.");
      renderResetPassword();
      return;
    }
    if (data.password !== data.confirm_password) {
      state.guestPasswordReset.error = t("signup_error_password_match", "Passwords must match.");
      renderResetPassword();
      return;
    }
    try {
      state.guestPasswordReset.submitting = true;
      renderResetPassword();
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(data)
      });
      state.guestPasswordReset = { submitting: false, emailSent: false, demoToken: "", error: "", showPassword: false, showConfirmPassword: false, success: true };
      trackGuestAccountEvent("password_reset_completed", { status: "completed" });
      renderResetPassword();
      window.setTimeout(() => {
        history.pushState(null, "", "/login");
        renderCurrentMode();
      }, 1100);
    } catch (error) {
      state.guestPasswordReset.submitting = false;
      state.guestPasswordReset.error = error.message;
      renderResetPassword();
    }
  });
}

async function renderVerifyEmail() {
  if (!isGuestSession()) {
    state.postLoginRedirect = "/verify-email";
    renderGuestLogin();
    return;
  }
  let verification = null;
  try {
    verification = await api("/auth/verification");
  } catch (error) {
    verification = { error: error.message };
  }
  app.innerHTML = guestAuthShell(`
    <section class="login-card account-card">
      <span class="section-kicker">${escapeHtml(t("verify_email_kicker", "Email verification"))}</span>
      <h1>${escapeHtml(t("verify_email_title", "Verify your email"))}</h1>
      <p class="muted">${escapeHtml(verification?.verified ? t("verify_email_verified_body", "Your email is verified.") : t("verify_email_pending_body", "If verification is required, please use the link sent to your email."))}</p>
      ${verification?.error ? `<p class="form-error">${escapeHtml(verification.error)}</p>` : ""}
      <div class="button-row">
        <button class="primary-button" data-resend-verification type="button">${escapeHtml(t("verify_email_resend_button", "Resend verification email"))}</button>
        <button class="ghost-button" data-open-account type="button">${escapeHtml(t("account_menu_my_account", "My Account"))}</button>
      </div>
    </section>
  `);
  finalizeRenderedLanguage();
  document.querySelector("[data-resend-verification]")?.addEventListener("click", async () => {
    try {
      await api("/auth/verification", { method: "POST", body: JSON.stringify({}) });
      showToast(t("verify_email_resend_success", "Verification email requested."));
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("[data-open-account]")?.addEventListener("click", () => {
    history.pushState(null, "", "/account");
    renderCurrentMode();
  });
}

async function loadGuestAccountData() {
  const [account, reservations, favorites, notifications, privacy, offers] = await Promise.all([
    api("/guest/account"),
    api("/guest/reservations").catch(() => ({ reservations: [] })),
    api("/guest/favorites").catch(() => ({ favorites: [] })),
    api("/guest/notifications").catch(() => ({ notifications: [] })),
    api("/guest/privacy").catch(() => null),
    api(`/public/offers?lang=${encodeURIComponent(state.lang)}`).catch(() => ({ offers: [] }))
  ]);
  state.guestAccount = account;
  state.guestReservations = reservations.reservations || [];
  state.guestFavorites = favorites.favorites || [];
  state.guestNotifications = notifications.notifications || [];
  state.guestPrivacy = privacy;
  if (offers.offers) {
    state.offers = offers.offers;
    state.restaurants = offers.offers.map((offer) => offer.restaurant).filter(Boolean);
  }
  return account;
}

function currentGuest() {
  return state.guestAccount?.guest || {};
}

function currentGuestPreferenceProfile() {
  return state.guestAccount?.profile || {};
}

function currentGuestPreferences() {
  return currentGuestPreferenceProfile().preferences || {};
}

function guestAccountTabs() {
  return [
    ["overview", "account_tab_overview", "Overview"],
    ["reservations", "account_tab_reservations", "My Reservations"],
    ["favorites", "account_tab_favorites", "Favorites"],
    ["profile", "account_tab_profile", "Profile"],
    ["preferences", "account_tab_preferences", "My Preferences"],
    ["notifications", "account_tab_notifications", "Notifications"],
    ["reviews", "account_tab_reviews", "Reviews"],
    ["security", "account_tab_security", "Security"]
  ];
}

function accountNav() {
  const unread = state.guestNotifications.filter((item) => !item.read_at).length;
  return `
    <nav class="account-tabs" aria-label="${escapeAttr(t("account_nav_label", "Account navigation"))}">
      ${guestAccountTabs().map(([id, key, fallback]) => `
        <button class="ghost-button ${state.guestAccountTab === id ? "active" : ""}" data-account-tab="${escapeAttr(id)}" type="button">${escapeHtml(t(key, fallback))}${id === "notifications" && unread ? ` <span class="nav-count">${escapeHtml(formatNumber(unread))}</span>` : ""}</button>
      `).join("")}
    </nav>
  `;
}

function renderGuestAccount() {
  if (!isGuestSession()) {
    state.postLoginRedirect = "/account";
    renderGuestLogin();
    return;
  }
  const guest = currentGuest();
  const profile = currentGuestPreferenceProfile();
  const overview = state.guestAccount?.overview || {};
  const name = guest.full_name || state.session?.profile?.full_name || state.session?.profile?.email;
  const panels = {
    overview: accountOverviewPanel(guest, profile, overview),
    reservations: accountReservationsPanel(),
    favorites: accountFavoritesPanel(),
    profile: accountProfilePanel(),
    preferences: accountPreferencesPanel(),
    notifications: accountNotificationsPanel(),
    reviews: accountReviewsPanel(),
    security: accountSecurityPanel()
  };
  app.innerHTML = `
    <section class="account-dashboard">
      <div class="section-title-row">
        <div>
          <span class="section-kicker">${escapeHtml(t("account_dashboard_kicker", "Guest account"))}</span>
          <h1>${escapeHtml(t("account_dashboard_title", "My SmartTable Account"))}</h1>
          <p class="muted">${escapeHtml(contentTemplate("account_dashboard_greeting", "Welcome back, {{name}}.", { name }))}</p>
        </div>
        <button class="primary-button" data-explore-restaurants type="button">${escapeHtml(t("signup_explore_restaurants", "Explore Restaurants"))}</button>
      </div>
      ${accountNav()}
      ${panels[state.guestAccountTab] || panels.overview}
    </section>
  `;
  finalizeRenderedLanguage();
  bindGuestAccountEvents();
}

function accountOverviewPanel(guest, profile, overview) {
  const aiAction = canShowFeature("ai.concierge", { audience: "guest", allowDemo: true })
    ? `<button class="ghost-button" data-start-ai-concierge type="button">${escapeHtml(t("start_ai_concierge_button", "Start AI Concierge"))}</button>`
    : "";
  const upcoming = upcomingGuestReservations();
  const pending = state.guestReservations.filter((row) => normalizeReservationStatusValue(row.status) === "pending");
  const accepted = state.guestReservations.filter((row) => ["accepted", "confirmed"].includes(normalizeReservationStatusValue(row.status)));
  const freshOffers = canShowFeature("basic.discountOffers", { audience: "guest" })
    ? (state.offers || []).filter(offerIsPublicVisible).slice(0, 3)
    : [];
  return `
    <section class="account-grid">
      <article class="panel account-main-card">
        <span class="section-kicker">${escapeHtml(t("account_tab_overview", "Overview"))}</span>
        <h2>${escapeHtml(guest.full_name || state.session?.profile?.email || "")}</h2>
        <div class="status-row">
          ${statusBadge(overview.email_verified ? t("email_verified_label", "Email verified") : t("email_not_verified_label", "Email not verified"))}
          ${statusBadge(supportedLanguages[guest.selected_language || state.lang]?.label || supportedLanguages[state.lang].label)}
        </div>
        <p class="muted">${escapeHtml([guest.city, guest.region].filter(Boolean).join(", ") || t("account_city_missing", "City not set"))}</p>
        <div class="progress-label"><span>${escapeHtml(t("profile_completion_label", "Profile completion"))}</span><strong>${escapeHtml(formatNumber(overview.profile_completion || 0))}%</strong></div>
        <div class="progress-bar"><span style="width:${Math.max(0, Math.min(100, Number(overview.profile_completion || 0)))}%"></span></div>
        <div class="button-row">
          <button class="ghost-button" data-account-tab-jump="reservations" type="button">${escapeHtml(t("account_quick_view_reservations", "View Reservations"))}</button>
          <button class="ghost-button" data-account-tab-jump="preferences" type="button">${escapeHtml(t("account_quick_edit_preferences", "Edit Preferences"))}</button>
          <button class="ghost-button" data-account-tab-jump="favorites" type="button">${escapeHtml(t("account_quick_manage_favorites", "Manage Favorites"))}</button>
          ${aiAction}
        </div>
      </article>
      ${statCard(t("account_active_reservations", "Active reservations"), overview.active_reservations || 0)}
      ${statCard(t("account_pending_requests", "Pending requests"), pending.length)}
      ${statCard(t("account_accepted_reservations", "Accepted reservations"), accepted.length)}
      ${statCard(t("account_favorite_count", "Favorite restaurants"), overview.favorite_restaurants || 0)}
      ${statCard(t("account_unread_notifications", "Unread notifications"), overview.unread_notifications || 0)}
      ${statCard(t("account_selected_language", "Selected language"), supportedLanguages[guest.selected_language || state.lang]?.label || supportedLanguages[state.lang].label)}
      <article class="panel">
        <h3>${escapeHtml(t("account_upcoming_reservations", "Upcoming reservations"))}</h3>
        ${reservationMiniList(upcoming)}
      </article>
      <article class="panel">
        <h3>${escapeHtml(t("account_favorite_restaurants_with_images", "Favorite restaurants"))}</h3>
        ${favoritePreviewList()}
      </article>
      <article class="panel">
        <h3>${escapeHtml(t("account_recent_activity", "Recent reservation activity"))}</h3>
        ${reservationMiniList(overview.recent_reservations || [])}
      </article>
      <article class="panel">
        <h3>${escapeHtml(t("account_important_notifications", "Important notifications"))}</h3>
        ${notificationMiniList(overview.important_notifications || [])}
      </article>
      ${freshOffers.length ? `<article class="panel"><h3>${escapeHtml(t("account_fresh_offers", "Fresh offers"))}</h3>${freshOfferMiniList(freshOffers)}</article>` : ""}
    </section>
  `;
}

function upcomingGuestReservations() {
  return state.guestReservations
    .filter((row) => ["pending", "accepted", "confirmed"].includes(normalizeReservationStatusValue(row.status)))
    .filter((row) => {
      const date = row.reservation_date || row.offer_date;
      if (!date) return true;
      const time = row.reservation_time || row.offer_time || "23:59";
      return new Date(`${date}T${time}`).getTime() >= Date.now();
    })
    .slice(0, 5);
}

function favoritePreviewList() {
  if (!state.guestFavorites.length) return `<div class="empty-state">${escapeHtml(t("account_no_favorites", "No favorite restaurants yet."))}</div>`;
  return `<div class="favorite-preview-list">${state.guestFavorites.slice(0, 4).map((favorite) => {
    const restaurant = restaurantFromFavorite(favorite);
    const name = restaurant?.name || favoriteRestaurantName(favorite);
    return `
      <button class="favorite-preview-item" data-favorite-detail="${escapeAttr(favorite.restaurant_id)}" type="button">
        <img src="${escapeAttr(restaurant?.card_image || restaurant?.cover_image || restaurant?.logo_url || "/assets/restaurant-hero.png")}" alt="${escapeAttr(name)}" loading="lazy" decoding="async">
        <span>${escapeHtml(name)}</span>
      </button>
    `;
  }).join("")}</div>`;
}

function freshOfferMiniList(offers = []) {
  return `<div class="compact-list">${offers.map((offer) => `
    <div>
      <strong>${escapeHtml(offer.restaurant_name || offer.restaurant?.name || t("restaurant_label", "Restaurant"))}</strong>
      <span>${escapeHtml(discountLabel(offer))} - ${escapeHtml(formatDate(offer.offer_date || offer.reservation_date, offer.start_time || offer.offer_time, offer.end_time))}</span>
    </div>
  `).join("")}</div>`;
}

function reservationStatusLabel(status) {
  const normalized = normalizeReservationStatusValue(status || "pending");
  const labels = {
    pending: ["reservations_pending_label", "Pending"],
    accepted: ["reservation_status_accepted", "Accepted"],
    rejected: ["reservation_status_declined", "Declined"],
    cancelled: ["reservation_status_cancelled", "Cancelled"],
    completed: ["reservation_status_completed", "Completed"],
    expired: ["reservation_status_expired", "Expired"],
    no_show: ["reservation_status_no_show", "No-show"],
    waiting_external_confirmation: ["reservation_status_waiting_external_confirmation", "Waiting for partner confirmation"]
  };
  const [key, fallback] = labels[normalized] || [];
  return key ? t(key, fallback) : String(status || "pending").replaceAll("_", " ");
}

function offerStatusLabel(status) {
  const normalized = String(status || "active").toLowerCase().replace(/[\s-]+/g, "_");
  const labels = {
    active: ["offer_status_active", "Active"],
    paused: ["offer_status_paused", "Paused"],
    sold_out: ["offer_status_sold_out", "Sold out"],
    expired: ["offer_status_expired", "Expired"],
    draft: ["offer_status_draft", "Draft"],
    inactive: ["offer_status_inactive", "Inactive"]
  };
  const [key, fallback] = labels[normalized] || [];
  return key ? t(key, fallback) : String(status || "active").replaceAll("_", " ");
}

function statusBadgeText(status) {
  return reservationStatusLabel(status);
}

function reservationMiniList(rows = state.guestReservations) {
  if (!rows.length) return `<div class="empty-state">${escapeHtml(t("account_no_reservations", "No reservations yet."))}</div>`;
  return `<div class="compact-list">${rows.slice(0, 6).map((row) => `
    <div>
      <strong>${escapeHtml(row.restaurant_name || row.restaurant?.name || t("restaurant_label", "Restaurant"))}</strong>
      <span>${escapeHtml(formatDate(row.reservation_date || row.offer_date, row.reservation_time || row.offer_time))} - ${escapeHtml(statusBadgeText(row.status))}</span>
    </div>
  `).join("")}</div>`;
}

function notificationMiniList(rows = state.guestNotifications) {
  if (!rows.length) return `<div class="empty-state">${escapeHtml(t("account_no_notifications", "No notifications yet."))}</div>`;
  return `<div class="compact-list">${rows.slice(0, 6).map((row) => `
    <div>
      <strong>${escapeHtml(row.title || t("notification_label", "Notification"))}</strong>
      <span>${escapeHtml(row.message || "")}</span>
    </div>
  `).join("")}</div>`;
}

function accountReservationsPanel() {
  const statuses = [
    ["all", "reservation_filter_all", "All"],
    ["pending", "reservations_pending_label", "Pending"],
    ["accepted", "reservation_status_accepted", "Accepted"],
    ["rejected", "reservation_status_declined", "Declined"],
    ["cancelled", "reservation_status_cancelled", "Cancelled"],
    ["completed", "reservation_status_completed", "Completed"]
  ];
  const filtered = state.guestReservationFilter === "all"
    ? state.guestReservations
    : state.guestReservations.filter((row) => normalizeReservationStatusValue(row.status) === state.guestReservationFilter);
  return `
    <section class="panel">
      <div class="section-title-row compact"><div><span class="section-kicker">${escapeHtml(t("account_tab_reservations", "My Reservations"))}</span><h2>${escapeHtml(t("account_reservations_title", "Reservation requests"))}</h2></div></div>
      <div class="account-filter-row">
        ${statuses.map(([status, key, fallback]) => `<button class="ghost-button ${state.guestReservationFilter === status ? "active" : ""}" data-reservation-filter="${escapeAttr(status)}" type="button">${escapeHtml(t(key, fallback))}</button>`).join("")}
      </div>
      ${filtered.length ? `<div class="reservation-history-list">${filtered.map(reservationHistoryCard).join("")}</div>` : `<div class="empty-state">${escapeHtml(t("account_no_reservations", "No reservations yet."))}</div>`}
    </section>
  `;
}

function canGuestCancelInUi(row) {
  const status = normalizeReservationStatusValue(row.status);
  if (!["pending", "accepted"].includes(status)) return false;
  const date = row.reservation_date || row.offer_date;
  const time = row.reservation_time || row.offer_time || "23:59";
  if (!date) return true;
  return new Date(`${date}T${time}`).getTime() > Date.now();
}

function isFeedbackEligible(row) {
  return !isBasicMode() && canShowFeature("ai.concierge", { audience: "guest" }) && normalizeReservationStatusValue(row.status) === "completed" && !row.feedback_submitted;
}

function reservationHistoryCard(row) {
  const status = normalizeReservationStatusValue(row.status);
  return `
    <article class="reservation-history-card">
      <div class="reservation-history-main">
        <div>
          <span class="section-kicker">${escapeHtml(statusBadgeText(status))}</span>
          <h3>${escapeHtml(row.restaurant_name || t("restaurant_label", "Restaurant"))}</h3>
          <p class="muted">${escapeHtml(row.offer_title || t("offer_label", "Offer"))}</p>
        </div>
        ${statusBadge(status, statusBadgeText(status))}
      </div>
      <div class="reservation-detail-grid">
        ${statCard(t("date_label", "Date"), row.reservation_date || row.offer_date || "-")}
        ${statCard(t("time_label", "Time"), row.reservation_time || row.offer_time || "-")}
        ${statCard(t("party_size_label", "Party size"), row.party_size || "-")}
        ${statCard(t("discount_label", "Discount"), row.discount_percent ? `${row.discount_percent}%` : "-")}
        ${statCard(t("reservation_requested_label", "Request date"), row.created_at ? formatDate(row.created_at.slice(0, 10), "") : "-")}
        ${statCard(t("reservation_reference_label", "Reference"), row.reference || "-")}
      </div>
      <div class="reservation-contact-block">
        <p><strong>${escapeHtml(t("address_label", "Address"))}:</strong> ${escapeHtml(row.restaurant_address || t("not_available_label", "Not available"))}</p>
        <p><strong>${escapeHtml(t("phone_label", "Phone"))}:</strong> ${escapeHtml(row.restaurant_phone || t("not_available_label", "Not available"))}</p>
        ${row.confirmation_details ? `<p><strong>${escapeHtml(t("confirmation_details_label", "Confirmation details"))}:</strong> ${escapeHtml(row.confirmation_details)}</p>` : ""}
      </div>
      <div class="button-row">
        ${canGuestCancelInUi(row) ? `<button class="ghost-button danger" data-cancel-reservation="${escapeAttr(row.reservation_id)}" type="button">${escapeHtml(t("cancel_reservation_button", "Cancel reservation"))}</button>` : ""}
        ${isFeedbackEligible(row) ? `<button class="ghost-button" data-feedback-reservation="${escapeAttr(row.reservation_id)}" type="button">${escapeHtml(t("rate_visit_button", "Rate visit"))}</button>` : ""}
      </div>
    </article>
  `;
}

function favoriteRestaurantName(row) {
  return row.restaurant?.name || row.restaurants?.name || row.restaurant_name || row.restaurant_id;
}

function restaurantFromFavorite(row) {
  return row.restaurant || row.restaurants || state.restaurants.find((restaurant) => restaurant.id === row.restaurant_id) || null;
}

function activeOffersForRestaurant(restaurantId) {
  return (state.offers || [])
    .filter(offerIsPublicVisible)
    .filter((offer) => offer.restaurant_id === restaurantId || offer.restaurant?.id === restaurantId);
}

function firstActiveOfferForRestaurant(restaurantId) {
  return activeOffersForRestaurant(restaurantId)[0] || null;
}

function favoriteRestaurantIds() {
  return new Set(state.guestFavorites.map((favorite) => favorite.restaurant_id));
}

function accountFavoritesPanel() {
  const favoriteIds = favoriteRestaurantIds();
  const availableRestaurants = [...new Map((state.restaurants || []).map((restaurant) => [restaurant.id, restaurant])).values()]
    .filter((restaurant) => restaurant?.id && !favoriteIds.has(restaurant.id));
  const addable = availableRestaurants.length ? `
    <article class="panel">
      <h3>${escapeHtml(t("add_favorites_title", "Add restaurants to favorites"))}</h3>
      <div class="favorite-add-grid">
        ${availableRestaurants.slice(0, 6).map((restaurant) => `
          <button class="ghost-button favorite-add-button" data-add-favorite="${escapeAttr(restaurant.id)}" type="button">
            <span>${escapeHtml(restaurant.name)}</span>
            <small>${escapeHtml(restaurant.cuisine_type || restaurant.cuisine || "")}</small>
          </button>
        `).join("")}
      </div>
    </article>
  ` : "";
  if (!state.guestFavorites.length) {
    return `<section class="panel"><h2>${escapeHtml(t("account_tab_favorites", "Favorites"))}</h2><div class="empty-state">${escapeHtml(t("account_no_favorites", "No favorite restaurants yet."))}</div></section>${addable}`;
  }
  return `
    <section class="panel">
      <h2>${escapeHtml(t("account_favorites_title", "Favorite restaurants"))}</h2>
      <div class="favorites-grid">
        ${state.guestFavorites.map((favorite) => {
          const restaurant = restaurantFromFavorite(favorite);
          const offer = firstActiveOfferForRestaurant(favorite.restaurant_id);
          const unavailable = !restaurant || restaurant.status === "suspended";
          return `
            <article class="favorite-card ${unavailable ? "unavailable" : ""}">
              <img src="${escapeAttr(restaurant?.card_image || restaurant?.cover_image || restaurant?.logo_url || "/assets/restaurant-hero.png")}" alt="${escapeAttr(restaurant?.name || favoriteRestaurantName(favorite))}" loading="lazy" decoding="async">
              <div>
                <strong>${escapeHtml(restaurant?.name || favoriteRestaurantName(favorite))}</strong>
                <p class="muted">${escapeHtml(unavailable ? t("favorite_unavailable_state", "This restaurant is currently unavailable.") : `${restaurant?.cuisine_type || restaurant?.cuisine || ""} - ${restaurant?.district || restaurant?.neighborhood || ""}`)}</p>
                <p>${offer ? `<span class="deal-pill">${escapeHtml(discountLabel(offer))}</span> ${escapeHtml(offer.title || offer.title_en || t("current_offer_label", "Current active offer"))}` : escapeHtml(t("no_active_offer_label", "No active offer right now"))}</p>
                <p class="muted">${escapeHtml(favorite.notification_enabled === false ? t("favorite_notifications_off", "Offer notifications off") : t("favorite_notifications_on", "Offer notifications on"))}</p>
              </div>
              <div class="button-row">
                ${!unavailable && offer ? `<button class="primary-button" data-favorite-reserve="${escapeAttr(restaurant.id)}" data-offer="${escapeAttr(offer.offer_id || offer.id)}" type="button">${escapeHtml(t("reserve_button", "Reserve"))}</button>` : ""}
                ${!unavailable ? `<button class="ghost-button" data-favorite-detail="${escapeAttr(restaurant.id)}" type="button">${escapeHtml(t("restaurant_detail_link", "Details"))}</button>` : ""}
                <button class="ghost-button" data-toggle-favorite-notify="${escapeAttr(favorite.restaurant_id)}" data-enabled="${favorite.notification_enabled === false ? "true" : "false"}" type="button">${escapeHtml(favorite.notification_enabled === false ? t("turn_notifications_on", "Turn on") : t("turn_notifications_off", "Turn off"))}</button>
                <button class="ghost-button danger" data-remove-favorite="${escapeAttr(favorite.restaurant_id)}" type="button">${escapeHtml(t("remove_favorite_button", "Remove"))}</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    </section>
    ${addable}
  `;
}

function csvValue(value) {
  return asArray(value).join(", ");
}

function accountChoiceGrid(name, options = [], selected = [], type = "checkbox") {
  const values = type === "checkbox" ? asArray(selected) : [String(selected || "")];
  return `<div class="signup-chip-grid ${state.guestPreferenceErrors[name] ? "has-error" : ""}">
    ${options.map((option) => `
      <label class="signup-chip">
        <input type="${type}" name="${escapeAttr(name)}" value="${escapeAttr(option)}" ${values.includes(option) ? "checked" : ""}>
        <span>${escapeHtml(optionLabel(option))}</span>
      </label>
    `).join("")}
  </div>
  ${state.guestPreferenceErrors[name] ? `<small class="field-error">${escapeHtml(state.guestPreferenceErrors[name])}</small>` : ""}`;
}

function accountCheckboxGroup(name, labelKey, fallback, options, selected) {
  return `<fieldset><legend>${escapeHtml(t(labelKey, fallback))}</legend>${accountChoiceGrid(name, options, selected, "checkbox")}</fieldset>`;
}

function accountRadioGroup(name, labelKey, fallback, options, selected) {
  return `<fieldset><legend>${escapeHtml(t(labelKey, fallback))}</legend>${accountChoiceGrid(name, options, selected, "radio")}</fieldset>`;
}

function validateAccountPreferenceData(data) {
  const errors = {};
  const showAiPreferenceFields = canShowFeature("ai.concierge", { audience: "guest" });
  const requiredArrays = [
    ["cuisines", "signup_cuisines", "Preferred cuisines"],
    ["food_categories", "signup_food_categories", "Preferred food categories"],
    ["drink_preferences", "signup_drink_preferences", "Drink preferences"],
    ["dietary_needs", "signup_dietary_needs", "Dietary needs"],
    ["dining_experiences", "signup_dining_experiences", "Dining experience preferences"],
    ["companions", "signup_companions", "Typical dining companions"],
    ["preferred_days", "signup_preferred_days", "Preferred dining days"],
    ["preferred_time_windows", "signup_preferred_times", "Preferred dining times"],
    ["discount_levels", "signup_discount_levels", "Preferred discount levels"],
    ["selection_priorities", "signup_selection_priorities", "Restaurant-selection priorities"],
    ["excluded_categories", "signup_excluded_categories", "Excluded cuisines or restaurant categories"]
  ];
  const requiredText = [
    ["party_size", "signup_party_size", "Typical party size"],
    ["booking_lead_time", "signup_booking_lead_time", "Preferred booking lead time"],
    ["dining_duration", "signup_dining_duration", "Preferred dining duration"],
    ["spending_range", "signup_spending_range", "Preferred spending per person"],
    ["consider_no_discount_match", "signup_no_discount_question_short", "No-discount match"],
    ["discovery_preference", "signup_discovery_preference", "Discovery preference"],
    ["new_restaurant_recommendations", "signup_new_restaurants_question", "New restaurant recommendations"],
    ["new_menu_item_recommendations", "signup_new_menu_items_question", "New menu item recommendations"],
    ...(showAiPreferenceFields ? [
      ["event_recommendations_interest", "signup_events_interest", "Event-related recommendations"],
      ["future_calendar_interest", "signup_calendar_future_interest", "Future calendar interest"]
    ] : [])
  ];
  for (const [field, key, fallback] of requiredArrays) {
    if (!asArray(data[field]).length) errors[field] = `${t(key, fallback)}: ${signupValidationMessage("select_one")}`;
  }
  for (const [field, key, fallback] of requiredText) {
    if (!String(data[field] || "").trim()) errors[field] = `${t(key, fallback)}: ${signupValidationMessage("required")}`;
  }
  return errors;
}

function minimumInterestingDiscountLabel(levels = []) {
  const values = asArray(levels).map((level) => Number(String(level).match(/\d+/)?.[0])).filter(Number.isFinite);
  return values.length ? `${Math.min(...values)}%` : t("not_available_label", "Not available");
}

function accountPreferencesPanel() {
  const prefs = currentGuestPreferences();
  const minDiscount = minimumInterestingDiscountLabel(prefs.discount_levels);
  const showAiPreferenceFields = canShowFeature("ai.concierge", { audience: "guest" });
  return `
    <form class="panel account-form" id="guestPreferencesForm">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("account_tab_preferences", "My Preferences"))}</span><h2>${escapeHtml(t("account_preferences_title", "Dining preferences"))}</h2></div>
        <button class="primary-button" type="submit">${escapeHtml(t("save_preferences_button", "Save preferences"))}</button>
      </div>
      <p class="form-note">${escapeHtml(t("account_preferences_update_anytime", "You can update your preferences at any time."))}</p>
      ${accountCheckboxGroup("cuisines", "signup_cuisines", "Preferred cuisines", signupOptionGroups.cuisines, prefs.cuisines)}
      ${accountCheckboxGroup("food_categories", "signup_food_categories", "Preferred food categories", signupOptionGroups.food_categories, prefs.food_categories)}
      ${accountCheckboxGroup("drink_preferences", "signup_drink_preferences", "Drink preferences", signupOptionGroups.drink_preferences, prefs.drink_preferences)}
      ${accountCheckboxGroup("dietary_needs", "signup_dietary_needs", "Dietary needs", signupOptionGroups.dietary_needs, prefs.dietary_needs)}
      ${textArea("allergy_notes", t("signup_allergy_notes", "Optional allergy notes"), prefs.allergy_notes || "")}
      ${accountCheckboxGroup("dining_experiences", "signup_dining_experiences", "Dining experience preferences", signupOptionGroups.dining_experiences, prefs.dining_experiences)}
      ${accountCheckboxGroup("companions", "signup_companions", "Typical dining companions", signupOptionGroups.companions, prefs.companions)}
      ${accountRadioGroup("party_size", "signup_party_size", "Typical party size", signupOptionGroups.party_size, prefs.party_size)}
      ${accountCheckboxGroup("preferred_days", "signup_preferred_days", "Preferred dining days", signupOptionGroups.preferred_days, prefs.preferred_days)}
      ${accountCheckboxGroup("preferred_time_windows", "signup_preferred_times", "Preferred dining times", signupOptionGroups.preferred_time_windows, prefs.preferred_time_windows)}
      ${accountRadioGroup("booking_lead_time", "signup_booking_lead_time", "Preferred booking lead time", signupOptionGroups.booking_lead_time, prefs.booking_lead_time)}
      ${accountRadioGroup("dining_duration", "signup_dining_duration", "Preferred dining duration", signupOptionGroups.dining_duration, prefs.dining_duration)}
      ${accountRadioGroup("spending_range", "signup_spending_range", "Preferred spending per person", signupOptionGroups.spending_ranges, prefs.spending_range)}
      ${accountCheckboxGroup("discount_levels", "signup_discount_levels", "Preferred discount levels", signupOptionGroups.discount_levels, prefs.discount_levels)}
      <p class="form-note"><strong>${escapeHtml(t("minimum_interesting_discount_label", "Minimum interesting discount"))}:</strong> <span id="minimumInterestingDiscountPreview">${escapeHtml(minDiscount)}</span></p>
      ${accountRadioGroup("consider_no_discount_match", "signup_no_discount_question", "Would you consider a restaurant without a discount if it strongly matches your preferences?", signupOptionGroups.yes_no_sometimes, prefs.consider_no_discount_match)}
      ${accountRadioGroup("discovery_preference", "signup_discovery_preference", "Discovery preference", signupOptionGroups.discovery_preference, prefs.discovery_preference)}
      <fieldset>
        <legend>${escapeHtml(t("signup_selection_priorities", "Restaurant-selection priorities"))}</legend>
        <p class="form-note">${escapeHtml(t("signup_selection_priorities_note_unlimited", "Choose every priority that matters to you."))}</p>
        ${accountChoiceGrid("selection_priorities", signupOptionGroups.selection_priorities, prefs.selection_priorities, "checkbox")}
      </fieldset>
      ${accountCheckboxGroup("excluded_categories", "signup_excluded_categories", "Excluded cuisines or restaurant categories", signupOptionGroups.excluded_categories, prefs.excluded_categories)}
      ${accountRadioGroup("new_restaurant_recommendations", "signup_new_restaurants_question", "Would you like recommendations for newly opened restaurants?", signupOptionGroups.yes_no, prefs.new_restaurant_recommendations)}
      ${accountRadioGroup("new_menu_item_recommendations", "signup_new_menu_items_question", "Would you like recommendations when a restaurant adds a new menu item?", signupOptionGroups.yes_no, prefs.new_menu_item_recommendations)}
      ${showAiPreferenceFields ? `
        ${accountRadioGroup("event_recommendations_interest", "signup_events_interest", "Would you like SmartTable to recommend restaurants around concerts, theater, movies, or other events?", signupOptionGroups.yes_no, prefs.event_recommendations_interest)}
        ${accountRadioGroup("future_calendar_interest", "signup_calendar_future_interest", "Would you consider connecting your calendar in the future?", signupOptionGroups.yes_no, prefs.future_calendar_interest)}
      ` : `
        <input type="hidden" name="event_recommendations_interest" value="${escapeAttr(prefs.event_recommendations_interest || "No")}">
        <input type="hidden" name="future_calendar_interest" value="${escapeAttr(prefs.future_calendar_interest || "No")}">
      `}
      <p class="form-note warning">${escapeHtml(t("account_preferences_privacy_note", "Dietary and allergy preferences are private and are not shared with restaurant partners as individual guest profiles."))}</p>
    </form>
  `;
}

function accountNotificationSettingsForm() {
  const prefs = currentGuestPreferences();
  const selected = new Set(asArray(prefs.notification_preferences));
  selected.add("Reservation status updates");
  const marketingEnabled = Boolean(prefs.consents?.marketing);
  const optionalPreferences = signupOptionGroups.notification_preferences.filter((option) => option !== "Reservation status updates");
  return `
    <form class="account-settings-card" id="guestNotificationSettingsForm">
      <div class="section-title-row compact">
        <div>
          <span class="section-kicker">${escapeHtml(t("notification_settings_kicker", "Notification settings"))}</span>
          <h3>${escapeHtml(t("notification_settings_title", "Choose how SmartTable contacts you"))}</h3>
        </div>
        <button class="primary-button" type="submit">${escapeHtml(t("save_notification_settings_button", "Save notification settings"))}</button>
      </div>
      <div class="locked-setting">
        <span>${escapeHtml(t("reservation_status_emails_label", "Reservation status emails"))}</span>
        ${statusBadge(t("always_on_label", "Always on"))}
        <small>${escapeHtml(t("operational_messages_separate_note", "Operational reservation messages are separate from optional marketing preferences."))}</small>
      </div>
      <fieldset>
        <legend>${escapeHtml(t("optional_notification_types_label", "Optional notification types"))}</legend>
        <div class="signup-chip-grid">
          ${optionalPreferences.map((option) => `
            <label class="signup-chip">
              <input type="checkbox" name="notification_preferences" value="${escapeAttr(option)}" ${selected.has(option) ? "checked" : ""}>
              <span>${escapeHtml(optionLabel(option))}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
      <fieldset>
        <legend>${escapeHtml(t("notification_channels_label", "Channels"))}</legend>
        <div class="channel-grid">
          <label class="check-row"><input name="notification_channels" type="checkbox" value="Email" checked> ${escapeHtml(t("email_channel_label", "Email"))}</label>
          <span class="disabled-channel">${escapeHtml(t("push_not_available_label", "Push notifications are not implemented yet."))}</span>
          <span class="disabled-channel">${escapeHtml(t("sms_not_available_label", "SMS is not implemented and requires separate consent."))}</span>
        </div>
      </fieldset>
      ${accountRadioGroup("notification_frequency", "signup_notification_frequency", "Notification frequency", signupOptionGroups.notification_frequency, prefs.notification_frequency || "Only important reservation messages")}
      <label class="check-row"><input name="marketing_consent" type="checkbox" value="true" ${marketingEnabled ? "checked" : ""}> ${escapeHtml(t("notification_marketing_consent_label", "I would like to receive SmartTable offers, restaurant recommendations, and marketing messages."))}</label>
      <p class="form-note">${escapeHtml(t("marketing_not_default_note", "Marketing and SMS are not enabled by default. You can withdraw marketing consent at any time."))}</p>
    </form>
  `;
}

function accountNotificationsPanel() {
  return `
    <section class="panel">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("account_tab_notifications", "Notifications"))}</span><h2>${escapeHtml(t("account_notifications_title", "Notifications"))}</h2></div>
        <button class="ghost-button" data-mark-notifications-read type="button">${escapeHtml(t("mark_all_read_button", "Mark all as read"))}</button>
      </div>
      ${accountNotificationSettingsForm()}
      ${state.guestNotifications.length ? `<div class="notification-center-list">
        ${state.guestNotifications.map((notification) => `
          <article class="notification-card ${notification.read_at ? "read" : "unread"}">
            <div>
              <span class="section-kicker">${escapeHtml(notification.type || t("notification_label", "Notification"))}</span>
              <h3>${escapeHtml(notification.title || t("notification_label", "Notification"))}</h3>
              <p class="muted">${escapeHtml(notification.message || "")}</p>
            </div>
            <div class="button-row">
              ${!notification.read_at ? `<button class="ghost-button" data-mark-notification="${escapeAttr(notification.id)}" type="button">${escapeHtml(t("mark_read_button", "Mark as read"))}</button>` : ""}
              ${notification.url ? `<button class="ghost-button" data-open-notification-url="${escapeAttr(notification.url)}" type="button">${escapeHtml(t("open_notification_button", "Open"))}</button>` : ""}
            </div>
          </article>
        `).join("")}
      </div>` : `<div class="empty-state">${escapeHtml(t("account_no_notifications", "No notifications yet."))}</div>`}
    </section>
  `;
}

function accountProfilePanel() {
  const guest = currentGuest();
  return `
    <form class="panel account-form" id="guestProfileForm">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("account_tab_profile", "Profile"))}</span><h2>${escapeHtml(t("account_profile_title", "Profile details"))}</h2></div>
        <button class="primary-button" type="submit">${escapeHtml(t("save_profile_button", "Save profile"))}</button>
      </div>
      <p class="form-note">${escapeHtml(t("email_change_security_note", "Email changes require a secure re-verification flow and are not edited here."))}</p>
      <div class="form-grid two">
        ${textInput("first_name", t("signup_first_name", "First name"), guest.first_name || "", "text", "required")}
        ${textInput("last_name", t("signup_last_name", "Last name"), guest.last_name || "", "text", "required")}
        ${textInput("email", t("signup_email", "Email"), guest.email || state.session?.profile?.email || "", "email", "readonly")}
        ${textInput("phone", t("signup_phone", "Phone number"), guest.phone || "", "tel", "required")}
        ${textInput("city", t("signup_city", "City"), guest.city || "", "text", "required")}
        ${textInput("region", t("signup_region", "State or region"), guest.region || "", "text", "required")}
        ${textInput("postal_code", t("signup_postal_code", "ZIP or postal code"), guest.postal_code || "", "text", "required")}
        ${textInput("max_travel_distance_miles", t("signup_travel_distance", "Maximum preferred travel distance"), guest.max_travel_distance_miles || "", "number", "min=\"1\" step=\"0.5\" required")}
        ${textInput("preferred_dining_areas", t("signup_neighborhoods", "Preferred neighborhoods or dining areas"), csvValue(guest.preferred_dining_areas), "text", "required")}
        <label>${escapeHtml(t("signup_transportation", "Preferred transportation method"))}
          <select name="transportation_method" required>
            ${signupOptionGroups.transportation.map((option) => `<option value="${escapeAttr(option)}" ${guest.transportation_method === option ? "selected" : ""}>${escapeHtml(optionLabel(option))}</option>`).join("")}
          </select>
        </label>
        <label>${escapeHtml(t("account_language_label", "Preferred language"))}
          <select name="selected_language" required>
            ${Object.entries(supportedLanguages).map(([lang, config]) => `<option value="${escapeAttr(lang)}" ${normalizeLanguage(guest.selected_language || state.lang) === lang ? "selected" : ""}>${escapeHtml(config.label)}</option>`).join("")}
          </select>
        </label>
      </div>
    </form>
  `;
}

function formatDateTime(value) {
  if (!value) return t("not_available_label", "Not available");
  const language = supportedLanguages[state.lang] || supportedLanguages.en;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("not_available_label", "Not available");
  return new Intl.DateTimeFormat(language.locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function consentStatusCard(label, accepted, version, acceptedAt) {
  return `
    <article class="consent-status-card">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <p class="muted">${escapeHtml(accepted ? t("consent_status_accepted", "Accepted") : t("consent_status_missing", "Not accepted"))}</p>
      </div>
      ${statusBadge(accepted ? t("accepted_label", "Accepted") : t("missing_label", "Missing"))}
      <dl>
        <div><dt>${escapeHtml(t("version_label", "Version"))}</dt><dd>${escapeHtml(version || "-")}</dd></div>
        <div><dt>${escapeHtml(t("accepted_at_label", "Accepted at"))}</dt><dd>${escapeHtml(formatDateTime(acceptedAt))}</dd></div>
      </dl>
    </article>
  `;
}

function accountPasswordInput(name, label, stateKey, autocomplete = "current-password") {
  const visible = Boolean(state.guestSecurity[stateKey]);
  return `
    <label class="password-field">
      ${escapeHtml(label)}
      <span>
        <input name="${escapeAttr(name)}" type="${visible ? "text" : "password"}" autocomplete="${escapeAttr(autocomplete)}" required>
        <button class="ghost-button" data-toggle-account-password="${escapeAttr(stateKey)}" type="button">${escapeHtml(visible ? t("hide_password_button", "Hide") : t("show_password_button", "Show"))}</button>
      </span>
    </label>
  `;
}

function privacyRequestList(requests = []) {
  if (!requests.length) return `<div class="empty-state">${escapeHtml(t("no_privacy_requests_label", "No privacy requests yet."))}</div>`;
  return `<div class="compact-list privacy-request-list">${requests.slice(0, 5).map((request) => `
    <div>
      <strong>${escapeHtml(uiText(request.request_type || "request"))}</strong>
      <span>${escapeHtml(uiText(request.status || "received"))} - ${escapeHtml(formatDateTime(request.created_at))}</span>
    </div>
  `).join("")}</div>`;
}

function accountReviewsPanel() {
  const completed = state.guestReservations.filter((row) => normalizeReservationStatusValue(row.status) === "completed");
  const eligible = completed.filter((row) => isFeedbackEligible(row));
  return `
    <section class="panel">
      <div class="section-title-row compact">
        <div>
          <span class="section-kicker">${escapeHtml(t("account_tab_reviews", "Reviews"))}</span>
          <h2>${escapeHtml(t("account_reviews_title", "Your restaurant reviews"))}</h2>
        </div>
      </div>
      <p class="form-note">${escapeHtml(t("account_reviews_privacy_note", "Only your own completed reservation feedback appears here. Restaurants never see private guest preference profiles."))}</p>
      ${completed.length ? `<div class="reservation-history-list">${completed.map((row) => `
        <article class="reservation-history-card">
          <div class="reservation-history-main">
            <div>
              <span class="section-kicker">${escapeHtml(formatDate(row.reservation_date || row.offer_date, row.reservation_time || row.offer_time))}</span>
              <h3>${escapeHtml(row.restaurant_name || t("restaurant_label", "Restaurant"))}</h3>
              <p class="muted">${escapeHtml(row.feedback_submitted ? t("review_submitted_label", "Review submitted") : t("review_not_submitted_label", "Review not submitted yet"))}</p>
            </div>
            ${row.feedback_submitted ? statusBadge(t("submitted_label", "Submitted")) : statusBadge(t("eligible_label", "Eligible"))}
          </div>
          ${isFeedbackEligible(row) ? `<button class="primary-button" data-feedback-reservation="${escapeAttr(row.reservation_id)}" type="button">${escapeHtml(t("rate_visit_button", "Rate visit"))}</button>` : ""}
        </article>
      `).join("")}</div>` : `<div class="empty-state">${escapeHtml(t("account_no_completed_reviews", "Completed reservation reviews will appear here after your visit."))}</div>`}
      ${eligible.length ? "" : `<p class="form-note">${escapeHtml(isBasicMode() ? t("reviews_basic_mode_note", "Review actions are shown only when the completed feedback flow is available.") : t("reviews_no_eligible_note", "No completed reservation is currently eligible for new feedback."))}</p>`}
    </section>
  `;
}

function accountSecurityPanel() {
  const prefs = currentGuestPreferences();
  const privacy = state.guestPrivacy || {};
  const consent = privacy.consent || {};
  const marketing = Boolean(consent.marketing_consent ?? prefs.consents?.marketing);
  return `
    <section class="panel privacy-security-panel">
      <div class="section-title-row compact">
        <div>
          <span class="section-kicker">${escapeHtml(t("account_tab_security", "Security"))}</span>
          <h2>${escapeHtml(t("account_security_title", "Security, privacy and consent"))}</h2>
        </div>
      </div>
      <div class="consent-status-grid">
        ${consentStatusCard(t("terms_status_title", "Terms and Conditions"), consent.terms_accepted, consent.terms_version, consent.terms_accepted_at)}
        ${consentStatusCard(t("privacy_status_title", "Privacy Policy"), consent.privacy_accepted, consent.privacy_policy_version, consent.privacy_accepted_at)}
        <article class="consent-status-card">
          <div>
            <strong>${escapeHtml(t("marketing_consent_title", "Marketing consent"))}</strong>
            <p class="muted">${escapeHtml(t("marketing_consent_body", "Optional restaurant offers and SmartTable updates. Reservation messages remain separate."))}</p>
          </div>
          ${statusBadge(marketing ? t("enabled_label", "Enabled") : t("disabled_label", "Disabled"))}
          <dl>
            <div><dt>${escapeHtml(t("accepted_at_label", "Accepted at"))}</dt><dd>${escapeHtml(formatDateTime(consent.marketing_consent_at))}</dd></div>
            <div><dt>${escapeHtml(t("revoked_at_label", "Revoked at"))}</dt><dd>${escapeHtml(formatDateTime(consent.marketing_revoked_at))}</dd></div>
          </dl>
          <button class="ghost-button" data-toggle-marketing-consent="${marketing ? "false" : "true"}" type="button">${escapeHtml(marketing ? t("withdraw_marketing_button", "Withdraw") : t("enable_marketing_button", "Enable"))}</button>
        </article>
      </div>
      <div class="button-row">
        <a class="ghost-button" href="/terms" target="_blank" rel="noreferrer">${escapeHtml(t("view_terms_button", "View Terms and Conditions"))}</a>
        <a class="ghost-button" href="/privacy" target="_blank" rel="noreferrer">${escapeHtml(t("view_privacy_button", "View Privacy Policy"))}</a>
      </div>
      <p class="form-note warning">${escapeHtml(t("legal_consent_closure_note", "Required legal consent cannot be unchecked while the account remains active. Account closure is handled through the deletion flow below."))}</p>
      <article class="account-settings-card">
        <div class="section-title-row compact">
          <div><h3>${escapeHtml(t("personal_data_export_title", "Personal data export"))}</h3><p class="muted">${escapeHtml(t("personal_data_export_body", "Request a copy of your SmartTable profile, preferences, favorites, reservations, reviews, notification settings, and consent records."))}</p></div>
          <button class="ghost-button" data-request-data-export type="button" ${state.guestSecurity.exportSubmitting ? "disabled" : ""}>${escapeHtml(t("request_data_export_button", "Request data export"))}</button>
        </div>
        <p class="form-note">${escapeHtml(t("data_export_not_download_note", "A request workflow is available. SmartTable will not claim the export is complete unless a real downloadable file is generated."))}</p>
        ${privacyRequestList((privacy.requests || []).filter((request) => request.request_type === "export"))}
      </article>
      <form class="account-settings-card" id="guestPasswordChangeForm">
        <div class="section-title-row compact">
          <div><h3>${escapeHtml(t("password_security_title", "Password and security"))}</h3><p class="muted">${escapeHtml(t("password_change_body", "Change your password using your current password and a strong new password."))}</p></div>
          <button class="primary-button" type="submit" ${state.guestSecurity.changeSubmitting ? "disabled" : ""}>${escapeHtml(t("change_password_button", "Change password"))}</button>
        </div>
        <div class="form-grid three">
          ${accountPasswordInput("current_password", t("current_password_label", "Current password"), "showCurrentPassword", "current-password")}
          ${accountPasswordInput("new_password", t("new_password_label", "New password"), "showNewPassword", "new-password")}
          ${accountPasswordInput("confirm_password", t("signup_confirm_password", "Confirm password"), "showConfirmPassword", "new-password")}
        </div>
        <p class="form-note">${escapeHtml(t("never_display_password_note", "SmartTable never displays existing passwords."))}</p>
      </form>
      <article class="account-settings-card">
        <div class="section-title-row compact">
          <div><h3>${escapeHtml(t("session_security_title", "Sessions"))}</h3><p class="muted">${escapeHtml(t("session_security_body", "Sign out of this browser or request sign out of all active sessions if supported by the authentication provider."))}</p></div>
          <div class="button-row">
            <button class="ghost-button" data-signout-current type="button">${escapeHtml(t("signout_current_session_button", "Sign out current session"))}</button>
            <button class="ghost-button" data-signout-all-sessions type="button">${escapeHtml(t("signout_all_sessions_button", "Sign out all sessions"))}</button>
          </div>
        </div>
        <p class="form-note">${escapeHtml(t("email_verification_status_label", "Email verification status"))}: ${escapeHtml(state.guestAccount?.overview?.email_verified ? t("email_verified_label", "Email verified") : t("email_not_verified_label", "Email not verified"))}</p>
      </article>
      <form class="account-settings-card danger-zone" id="guestDeletionForm">
        <div class="section-title-row compact">
          <div><h3>${escapeHtml(t("delete_request_title", "Delete account"))}</h3><p class="muted">${escapeHtml(t("delete_request_body", "This anonymizes your personal profile, removes favorites, preserves required reservation records without personal identity, and signs you out."))}</p></div>
          <button class="ghost-button danger" type="submit" ${state.guestSecurity.deletionSubmitting ? "disabled" : ""}>${escapeHtml(t("delete_account_button", "Delete account"))}</button>
        </div>
        <div class="warning-box">
          <strong>${escapeHtml(t("delete_warning_title", "This action is serious."))}</strong>
          <p>${escapeHtml(t("delete_warning_body", "Restaurant and partner data will not be deleted. Some records may be retained where legally required, but personal identity is anonymized where possible."))}</p>
        </div>
        <div class="form-grid two">
          ${accountPasswordInput("current_password", t("current_password_label", "Current password"), "showCurrentPassword", "current-password")}
          <label>${escapeHtml(t("delete_confirmation_phrase_label", "Type DELETE MY ACCOUNT"))}<input name="confirmation_phrase" type="text" autocomplete="off" required></label>
        </div>
      </form>
      ${privacyRequestList((privacy.requests || []).filter((request) => request.request_type === "deletion"))}
      <p class="form-note">${escapeHtml(t("account_privacy_note", "Restaurants only see aggregated or operational reservation information required to serve your booking. Private preference profiles are not exposed to partners."))}</p>
    </section>
  `;
}

function bindGuestAccountEvents() {
  document.querySelector("[data-explore-restaurants]")?.addEventListener("click", async () => {
    history.pushState(null, "", "/");
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelectorAll("[data-account-tab], [data-account-tab-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      state.guestAccountTab = button.dataset.accountTab || button.dataset.accountTabJump;
      history.pushState(null, "", routeForGuestAccountTab(state.guestAccountTab));
      renderGuestAccount();
    });
  });
  document.querySelectorAll("[data-reservation-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.guestReservationFilter = button.dataset.reservationFilter || "all";
      renderGuestAccount();
    });
  });
  document.querySelectorAll("[data-cancel-reservation]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(t("cancel_reservation_confirm", "Cancel this reservation request?"))) return;
      try {
        await api("/guest/reservations", {
          method: "PATCH",
          body: JSON.stringify({ id: button.dataset.cancelReservation, action: "cancel" })
        });
        await loadGuestAccountData();
        renderGuestAccount();
        showToast(t("reservation_cancelled_toast", "Reservation cancelled."));
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-feedback-reservation]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = `/guest/rewards/photo-upload?bookingId=${encodeURIComponent(button.dataset.feedbackReservation)}`;
    });
  });
  document.querySelector("[data-start-ai-concierge]")?.addEventListener("click", openGuestAiExperience);
  document.querySelector("#guestProfileForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/guest/account", {
        method: "PATCH",
        body: JSON.stringify(formObject(event.currentTarget))
      });
      await loadGuestAccountData();
      renderGuestAccount();
      trackGuestAccountEvent("profile_updated", { status: "saved" });
      showToast(t("profile_saved_toast", "Profile saved."));
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("#guestPreferencesForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formObject(event.currentTarget);
    const errors = validateAccountPreferenceData(data);
    if (Object.keys(errors).length) {
      state.guestPreferenceErrors = errors;
      renderGuestAccount();
      showToast(t("account_preferences_required_error", "Complete all required preferences before saving."));
      return;
    }
    try {
      state.guestPreferenceErrors = {};
      await api("/guest/preferences", {
        method: "PATCH",
        body: JSON.stringify(data)
      });
      await loadGuestAccountData();
      renderGuestAccount();
      trackGuestAccountEvent("preferences_updated", { status: "saved" });
      showToast(t("preferences_saved_toast", "Preferences saved."));
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("#guestPreferencesForm")?.addEventListener("change", (event) => {
    if (event.target?.name === "discount_levels") {
      const selected = [...document.querySelectorAll('#guestPreferencesForm input[name="discount_levels"]:checked')].map((input) => input.value);
      const preview = document.querySelector("#minimumInterestingDiscountPreview");
      if (preview) preview.textContent = minimumInterestingDiscountLabel(selected);
    }
  });
  document.querySelector("#guestNotificationSettingsForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formObject(event.currentTarget);
    const preferences = new Set(["Reservation status updates", ...asArray(data.notification_preferences)]);
    const wantsMarketingMessages = preferences.has("SmartTable news and marketing");
    const marketingConsent = Boolean(data.marketing_consent);
    if (wantsMarketingMessages && !marketingConsent) {
      showToast(t("marketing_consent_required_for_messages", "Enable marketing consent to receive marketing messages."));
      return;
    }
    try {
      const previousMarketingConsent = Boolean(currentGuestPreferences().consents?.marketing);
      await api("/guest/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          notification_preferences: [...preferences],
          notification_channels: ["Email"],
          notification_frequency: data.notification_frequency,
          marketing_consent: marketingConsent
        })
      });
      await loadGuestAccountData();
      renderGuestAccount();
      trackGuestAccountEvent("preferences_updated", {
        status: "saved",
        settings_count: preferences.size,
        channel_count: 1,
        marketing_consent: marketingConsent
      });
      if (marketingConsent !== previousMarketingConsent) {
        trackGuestAccountEvent("marketing_consent_changed", { marketing_consent: marketingConsent });
      }
      showToast(t("notification_settings_saved_toast", "Notification settings saved."));
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelectorAll("[data-remove-favorite]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/guest/favorites?restaurant_id=${encodeURIComponent(button.dataset.removeFavorite)}`, { method: "DELETE" });
        await loadGuestAccountData();
        renderGuestAccount();
        trackGuestAccountEvent("favorite_removed", { restaurant_id: button.dataset.removeFavorite });
        showToast(t("favorite_removed_toast", "Favorite removed."));
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-toggle-favorite-notify]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api("/guest/favorites", {
          method: "PATCH",
          body: JSON.stringify({
            restaurant_id: button.dataset.toggleFavoriteNotify,
            notification_enabled: button.dataset.enabled === "true"
          })
        });
        await loadGuestAccountData();
        renderGuestAccount();
        showToast(t("favorite_notifications_saved_toast", "Favorite notification setting saved."));
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-favorite-reserve]").forEach((button) => {
    button.addEventListener("click", async () => {
      prepareGuestModalOpen(button);
      state.reservationModal = { restaurantId: button.dataset.favoriteReserve, offerId: button.dataset.offer || "" };
      history.pushState(null, "", "/");
      state.mode = "guest";
      await renderCurrentMode();
    });
  });
  document.querySelectorAll("[data-favorite-detail]").forEach((button) => {
    button.addEventListener("click", async () => {
      prepareGuestModalOpen(button);
      state.restaurantDetail = button.dataset.favoriteDetail;
      history.pushState(null, "", "/");
      state.mode = "guest";
      await renderCurrentMode();
    });
  });
  document.querySelectorAll("[data-add-favorite]").forEach((button) => {
    button.addEventListener("click", async () => {
      const guest = currentGuest();
      const restaurant = state.restaurants.find((item) => item.id === button.dataset.addFavorite);
      try {
        await api("/public/follow", {
          method: "POST",
          body: JSON.stringify({
            restaurant_id: button.dataset.addFavorite,
            guest_email: guest.email || state.session?.profile?.email,
            guest_name: guest.full_name || state.session?.profile?.full_name,
            notification_enabled: true,
            profile_key: state.aiProfileKey
          })
        });
        if (restaurant) {
          const prefs = currentGuestPreferences();
          const favorites = [...new Set([...asArray(prefs.favorite_restaurants), restaurant.name])];
          await api("/guest/preferences", {
            method: "PATCH",
            body: JSON.stringify({ favorite_restaurants: favorites })
          }).catch(() => null);
        }
        await loadGuestAccountData();
        renderGuestAccount();
        trackGuestAccountEvent("favorite_added", { restaurant_id: button.dataset.addFavorite });
        showToast(t("favorite_added_toast", "Restaurant added to favorites."));
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelector("[data-mark-notifications-read]")?.addEventListener("click", async () => {
    try {
      await api("/guest/notifications", { method: "PATCH", body: JSON.stringify({ read_all: true }) });
      await loadGuestAccountData();
      renderGuestAccount();
      showToast(t("notifications_marked_read_toast", "Notifications marked as read."));
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelectorAll("[data-mark-notification]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api("/guest/notifications", {
          method: "PATCH",
          body: JSON.stringify({ id: button.dataset.markNotification })
        });
        await loadGuestAccountData();
        renderGuestAccount();
        trackGuestAccountEvent("notification_opened", { action: "mark_read" });
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-open-notification-url]").forEach((button) => {
    button.addEventListener("click", () => {
      trackGuestAccountEvent("notification_opened", { action: "open_related" }, { keepalive: true });
      window.location.href = button.dataset.openNotificationUrl;
    });
  });
  document.querySelectorAll("[data-toggle-account-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleAccountPassword;
      state.guestSecurity[key] = !state.guestSecurity[key];
      renderGuestAccount();
    });
  });
  document.querySelector("[data-toggle-marketing-consent]")?.addEventListener("click", async (event) => {
    try {
      await api("/guest/preferences", {
        method: "PATCH",
        body: JSON.stringify({ marketing_consent: event.currentTarget.dataset.toggleMarketingConsent === "true" })
      });
      await loadGuestAccountData();
      renderGuestAccount();
      trackGuestAccountEvent("marketing_consent_changed", { marketing_consent: event.currentTarget.dataset.toggleMarketingConsent === "true" });
      showToast(t("marketing_consent_saved_toast", "Marketing consent updated."));
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("[data-request-data-export]")?.addEventListener("click", async () => {
    try {
      state.guestSecurity.exportSubmitting = true;
      renderGuestAccount();
      await api("/guest/privacy", {
        method: "POST",
        body: JSON.stringify({ action: "export", message: t("data_export_default_message", "Guest requested a personal data export from account settings.") })
      });
      await loadGuestAccountData();
      state.guestSecurity.exportSubmitting = false;
      renderGuestAccount();
      trackGuestAccountEvent("data_export_requested", { request_type: "export", status: "received" });
      showToast(t("data_export_request_received_toast", "Data export request received."));
    } catch (error) {
      state.guestSecurity.exportSubmitting = false;
      renderGuestAccount();
      showToast(error.message);
    }
  });
  document.querySelector("#guestPasswordChangeForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formObject(event.currentTarget);
    if (passwordStrength(data.new_password).score < 5) {
      showToast(t("signup_error_password", "Use at least 8 characters with uppercase, lowercase, number, and symbol."));
      return;
    }
    if (data.new_password !== data.confirm_password) {
      showToast(t("signup_error_password_match", "Passwords must match."));
      return;
    }
    try {
      state.guestSecurity.changeSubmitting = true;
      renderGuestAccount();
      await api("/auth/security", {
        method: "POST",
        body: JSON.stringify({
          action: "change_password",
          current_password: data.current_password,
          new_password: data.new_password,
          confirm_password: data.confirm_password
        })
      });
      state.guestSecurity.changeSubmitting = false;
      renderGuestAccount();
      trackGuestAccountEvent("password_reset_completed", { action: "change_password", status: "completed" });
      showToast(t("password_changed_toast", "Password changed."));
    } catch (error) {
      state.guestSecurity.changeSubmitting = false;
      renderGuestAccount();
      showToast(error.message);
    }
  });
  document.querySelector("[data-signout-current]")?.addEventListener("click", signOut);
  document.querySelector("[data-signout-all-sessions]")?.addEventListener("click", async () => {
    try {
      await api("/auth/security", {
        method: "POST",
        body: JSON.stringify({ action: "sign_out_all" })
      });
      await signOut();
      showToast(t("signed_out_all_toast", "Signed out of active sessions."));
    } catch (error) {
      showToast(error.message);
    }
  });
  document.querySelector("#guestDeletionForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formObject(event.currentTarget);
    if (data.confirmation_phrase !== "DELETE MY ACCOUNT") {
      showToast(t("delete_phrase_required_toast", "Type DELETE MY ACCOUNT to confirm."));
      return;
    }
    if (!confirm(t("delete_account_confirm_dialog", "Delete and anonymize this account? This cannot be undone."))) return;
    try {
      state.guestSecurity.deletionSubmitting = true;
      renderGuestAccount();
      trackGuestAccountEvent("account_deletion_requested", { request_type: "deletion" });
      await api("/guest/privacy", {
        method: "POST",
        body: JSON.stringify({
          action: "delete_account",
          current_password: data.current_password,
          confirmation_phrase: data.confirmation_phrase,
          message: t("guest_requested_deletion_message", "Guest confirmed account deletion from account settings.")
        })
      });
      trackGuestAccountEvent("account_deleted", { status: "completed" }, { keepalive: true });
      await signOut();
      showToast(t("account_deleted_toast", "Account deleted and personal data anonymized where possible."));
    } catch (error) {
      state.guestSecurity.deletionSubmitting = false;
      renderGuestAccount();
      showToast(error.message);
    }
  });
}

function renderLogin(role) {
  if (role === "guest") {
    renderGuestLogin();
    return;
  }
  const isAdmin = role === "admin";
  const demoMode = state.apiMode === "demo";
  const demoEmail = demoMode ? (isAdmin ? "admin@smarttable.com" : "owner@hudsonhearth.com") : "";
  const demoPassword = demoMode ? (isAdmin ? "admin123" : "restaurant123") : "";
  const title = isAdmin
    ? t("admin_login_title", "Super Admin login")
    : t("partner_login_title", "Restaurant Partner login");
  app.innerHTML = `
    ${layoutHero(`
      <form class="login-card" id="loginForm">
        <span class="section-kicker">${escapeHtml(title)}</span>
        <h2>${escapeHtml(isAdmin ? t("admin_login_heading", "Manage Smart Table platform") : t("partner_login_heading", "Manage your restaurant"))}</h2>
        <label>${escapeHtml(t("signup_email", "Email"))}<input name="email" type="email" value="${escapeAttr(demoEmail)}" autocomplete="email" required></label>
        <label class="password-field">
          ${escapeHtml(t("signup_password", "Password"))}
          <span>
            <input name="password" type="password" value="${escapeAttr(demoPassword)}" autocomplete="current-password" required>
            <button class="ghost-button" data-toggle-dashboard-password type="button">${escapeHtml(t("show_password_button", "Show"))}</button>
          </span>
        </label>
        <button class="primary-button wide" type="submit">${escapeHtml(t("login_button", "Login"))}</button>
        <div class="auth-link-row">
          <button class="link-button" data-dashboard-forgot-password type="button">${escapeHtml(t("forgot_password_link", "Forgot password?"))}</button>
        </div>
        ${state.apiMode === "demo" ? `<p class="form-note">${escapeHtml(t("demo_credentials_prefilled", "Demo credentials are prefilled until Supabase is connected."))}</p>` : ""}
      </form>
    `)}
  `;
  finalizeRenderedLanguage();
  document.querySelector("[data-dashboard-forgot-password]")?.addEventListener("click", () => {
    history.pushState(null, "", "/forgot-password");
    state.mode = "guest";
    renderCurrentMode();
  });
  document.querySelector("[data-toggle-dashboard-password]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const input = button.closest(".password-field")?.querySelector("input");
    if (!input) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? t("show_password_button", "Show") : t("hide_password_button", "Hide");
  });
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    if (submitButton?.disabled) return;
    try {
      setButtonPending(submitButton, true, t("login_signing_in", "Signing in..."));
      const payload = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(formObject(event.currentTarget))
      });
      payload.profile.role = normalizeRole(payload.profile.role);
      if (role === "partner" && payload.profile.role !== "partner") throw new Error(t("partner_login_role_error", "Please use the correct login for this account."));
      if (role === "admin" && !isAdminRole(payload.profile.role)) throw new Error(t("admin_login_role_error", "Please use the correct login for this account."));
      saveSession(payload);
      await applyProfileLanguagePreference(payload);
      state.mode = isAdminRole(payload.profile.role) ? "admin" : payload.profile.role === "partner" ? "partner" : "guest";
      const defaultRedirect = state.mode === "admin" ? "/admin" : state.mode === "partner" ? "/partner" : "/account";
      history.pushState(null, "", state.postLoginRedirect || defaultRedirect);
      state.postLoginRedirect = "";
      await renderCurrentMode();
      showToast(t("logged_in_toast", "Logged in."));
    } catch (error) {
      setButtonPending(submitButton, false);
      showToast(error.message);
    }
  });
}

async function loadAdminData() {
  const adminAiEnabled = canShowFeature("ai.adminAIControls", { allowDemo: true });
  const [stats, restaurants, reservations, contentRows, partners, offers, reviews, photoSubmissions, notifications, trends, integrations, featureFlags, errors, billing, checklists, privacy] = await Promise.all([
    api("/admin/stats"),
    api("/admin/restaurants"),
    api(`/admin/reservations${queryStringFromFilters(state.adminReservationFilters)}`),
    api("/admin/content"),
    api("/admin/partners"),
    api("/admin/offers"),
    api("/admin/reviews"),
    api("/admin/photo-reward-submissions"),
    api("/admin/notifications"),
    adminAiEnabled ? api("/ai/trends").catch(() => ({ trends: null })) : Promise.resolve({ trends: null }),
    adminAiEnabled ? api("/admin/integrations").catch(() => ({ providers: [], connections: [], sync_runs: [], errors: [] })) : Promise.resolve({ providers: [], connections: [], sync_runs: [], errors: [] }),
    adminAiEnabled ? api("/admin/feature-flags").catch(() => ({ flags: [] })) : Promise.resolve({ flags: [] }),
    adminAiEnabled ? api("/admin/errors").catch(() => ({ app_errors: [], integration_errors: [], failed_emails: [], failed_ai_actions: [], admin_alerts: [] })) : Promise.resolve({ app_errors: [], integration_errors: [], failed_emails: [], failed_ai_actions: [], admin_alerts: [] }),
    adminAiEnabled ? api("/admin/billing").catch(() => ({ plans: [], subscriptions: [], invoices: [], payment_events: [] })) : Promise.resolve({ plans: [], subscriptions: [], invoices: [], payment_events: [] }),
    adminAiEnabled ? api("/system/checklists").catch(() => ({ checklists: null })) : Promise.resolve({ checklists: null }),
    api("/privacy/requests").catch(() => ({ requests: [] }))
  ]);
  state.stats = stats.stats;
  state.restaurants = restaurants.restaurants || [];
  state.reservations = reservations.reservations || [];
  state.contentRows = contentRows.content || [];
  state.partners = partners.partners || [];
  state.adminOffers = offers.offers || [];
  state.adminReviews = reviews.reviews || [];
  state.adminPhotoSubmissions = photoSubmissions.submissions || [];
  state.notifications = notifications.notifications || [];
  state.unreadNotifications = notifications.unread_count || 0;
  state.platformTrends = trends.trends || null;
  state.adminIntegrations = integrations || null;
  state.adminFeatureFlags = featureFlags.flags || [];
  state.adminErrors = errors || null;
  state.adminBilling = billing || null;
  state.systemChecklists = checklists.checklists || null;
  state.privacyRequests = privacy.requests || [];
}

function contentEditor() {
  return `
    <article class="panel wide-panel" id="admin-content">
      <div class="section-title-row compact">
        <div><span class="section-kicker">Site content</span><h2>Public content editor</h2></div>
        <button class="primary-button" id="saveContent" type="button">Save content</button>
      </div>
      <div class="table-wrap">
        <table class="content-table">
          <thead><tr><th>Key</th><th>English</th><th>Espa\u00f1ol</th><th>Magyar</th><th>Type</th></tr></thead>
          <tbody>
            ${state.contentRows.map((row) => `
              <tr class="content-row" data-key="${escapeAttr(row.key)}" data-type="${escapeAttr(row.content_type)}" data-group="${escapeAttr(row.group_name)}">
                <td><strong>${escapeHtml(row.key)}</strong><br><span class="muted">${escapeHtml(row.group_name)}</span></td>
                <td><textarea data-field="value_en">${escapeHtml(row.value_en || "")}</textarea></td>
                <td><textarea data-field="value_es">${escapeHtml(row.value_es || "")}</textarea></td>
                <td><textarea data-field="value_hu">${escapeHtml(row.value_hu || "")}</textarea></td>
                <td>${escapeHtml(row.content_type || "text")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function contentEditorV2() {
  const query = state.contentSearch.toLowerCase().trim();
  const rows = state.contentRows.filter((row) => {
    const haystack = `${row.key} ${row.group_name} ${row.value_en} ${row.value_es} ${row.value_hu}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  return `
    <article class="panel wide-panel" id="admin-content">
      <div class="section-title-row compact">
        <div><span class="section-kicker">Site content</span><h2>Public content editor</h2></div>
      </div>
      <input class="content-search" id="contentSearch" value="${escapeAttr(state.contentSearch)}" placeholder="Search content key, group, or page text">
      <div class="content-card-list">
        ${rows.map((row) => `
          <button class="content-card" data-edit-content="${escapeAttr(row.key)}" type="button">
            <span>
              <strong>${escapeHtml(row.key)}</strong>
              <small>${escapeHtml(row.group_name)} - ${escapeHtml(row.content_type || "text")}</small>
            </span>
            <span class="content-preview">${escapeHtml(row.value_en || row.value_es || row.value_hu || "")}</span>
          </button>
        `).join("") || '<div class="empty-state">No matching content keys.</div>'}
      </div>
    </article>
    ${contentEditModal()}
  `;
}

function contentEditModal() {
  const row = state.contentRows.find((item) => item.key === state.contentEditKey);
  if (!row) return "";
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card" role="dialog" aria-modal="true">
        <div class="dialog-head">
          <div>
            <span class="section-kicker">${escapeHtml(row.group_name)}</span>
            <h2>${escapeHtml(row.key)}</h2>
          </div>
          <button class="icon-button" data-close-content-modal type="button" aria-label="${escapeAttr(t("modal_cancel_label", "Cancel"))}">X</button>
        </div>
        <form class="mini-form" id="contentEditForm" data-key="${escapeAttr(row.key)}" data-group="${escapeAttr(row.group_name)}" data-type="${escapeAttr(row.content_type)}">
          <label>English<textarea name="value_en">${escapeHtml(row.value_en || "")}</textarea></label>
          <label>Spanish<textarea name="value_es">${escapeHtml(row.value_es || "")}</textarea></label>
          <label>Hungarian<textarea name="value_hu">${escapeHtml(row.value_hu || "")}</textarea></label>
          <div class="button-row">
            <button class="primary-button" type="submit">Save</button>
            <button class="ghost-button" data-close-content-modal type="button">${escapeHtml(t("modal_cancel_label", "Cancel"))}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function platformTrendPanel() {
  const trends = state.platformTrends || {};
  const items = trends.top_trends || trends.fastest_growing_dishes || [];
  return `
    <article class="panel wide-panel" id="admin-ai-trends">
      <div class="section-title-row compact">
        <div><span class="section-kicker">SmartTable AI</span><h2>Live food trend analytics</h2></div>
      </div>
      ${trends.error ? `<div class="empty-state">${escapeHtml(trends.error)}</div>` : `
        <section class="stats-grid compact-stats">
          ${statCard("Uploads", trends.uploads_total ?? 0)}
          ${statCard("Photos", trends.photos_total ?? 0)}
          ${statCard("Loyalty points", trends.loyalty_points_awarded ?? 0)}
          ${statCard("Avg duration", trends.average_dining_duration ? `${trends.average_dining_duration} min` : "N/A")}
          ${statCard("Satisfaction", trends.satisfaction_score ? `${trends.satisfaction_score}/5` : "N/A")}
        </section>
        <div class="tag-row intelligence-tags">
          ${items.map((item) => `<span class="tag">${escapeHtml(item.label)} ${escapeHtml(item.count)}</span>`).join("") || '<span class="tag">No trend data yet</span>'}
        </div>
        <p class="form-note">${escapeHtml(t("partner_guest_intel_privacy_note", "Only aggregated, anonymized analytics are shared with restaurants. Personal guest behavior is never exposed."))}</p>
      `}
    </article>
  `;
}

function marketplaceInsightsPanel() {
  const trends = state.platformTrends || {};
  const topTrend = (trends.top_trends || trends.fastest_growing_dishes || [])[0]?.label || "Sushi";
  const insights = [
    ["Fastest growing cuisine", "Japanese"],
    ["Most searched cuisine", "Italian"],
    ["Most favorited restaurant type", "Rooftop dining"],
    ["Most uploaded food category", topTrend],
    ["Most popular drinks", "Cocktails, wine, mocktails"],
    ["Most photographed dishes", "Pasta, sushi, steak"],
    ["Best converting discount range", "15-20%"],
    ["Average dining duration", trends.average_dining_duration ? `${trends.average_dining_duration} min` : "76 min"],
    ["Highest satisfaction category", "Ambience"]
  ];
  return `
    <article class="panel marketplace-insights-panel" id="admin-marketplace-insights">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("marketplace_insights_kicker", "Marketplace intelligence"))}</span>${featureBadge("marketplace_intelligence", "requires_more_data")}</div><h2>${escapeHtml(t("marketplace_insights_title", "AI marketplace insights"))}</h2></div>
      </div>
      <div class="marketplace-insight-grid">
        ${insights.map(([label, value]) => `
          <section class="marketplace-insight-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </section>
        `).join("")}
      </div>
      <p class="form-note">${escapeHtml(t("marketplace_insights_note", "Placeholder market insights are structured for future live analytics, search, upload, reservation, and satisfaction pipelines."))}</p>
    </article>
  `;
}

function consumerIntelligencePanel() {
  const trends = state.platformTrends || {};
  const trendList = (key, fallback) => {
    const values = (trends[key] || []).map((item) => item.label).filter(Boolean);
    return values.length ? values.join(", ") : fallback;
  };
  const groups = [
    [t("consumer_top_dishes", "Top dishes"), trendList("top_dishes", trendList("top_trends", "Pasta, sushi, steak"))],
    [t("consumer_fastest_growing_dishes", "Fastest growing dishes"), trendList("fastest_growing_dishes", "Ramen, crudo, smash burger")],
    [t("consumer_most_uploaded_drinks", "Most uploaded drinks"), trendList("most_uploaded_drinks", "Cocktails, wine, coffee")],
    [t("consumer_most_photographed_foods", "Most photographed foods"), trendList("most_photographed_foods", "Pizza, dessert, seafood")],
    [t("consumer_popular_ingredients", "Most popular ingredients"), trendList("popular_ingredients", "Truffle, chili crisp, burrata")],
    [t("consumer_flavor_profiles", "Most common flavor profiles"), trendList("flavor_profiles", "Savory, spicy, fresh")],
    [t("consumer_highest_rated_categories", "Highest-rated menu categories"), trendList("highest_rated_menu_categories", "Desserts, seafood, cocktails")],
    [t("consumer_value_perception_signals", "Value perception signals"), trends.value_perception_signals || "Not enough value-perception signal yet"],
    [t("consumer_seasonal_food_trends", "Seasonal food trends"), "Summer seafood, spritz cocktails, outdoor brunch"]
  ];
  return `
    <article class="panel consumer-intelligence-panel" id="admin-consumer-intelligence">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("consumer_intelligence_kicker", "Consumer intelligence"))}</span><h2>${escapeHtml(t("consumer_intelligence_title", "Anonymized dining behavior insights"))}</h2></div>
      </div>
      <div class="consumer-insight-grid">
        ${groups.map(([label, value]) => `
          <section class="consumer-insight-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </section>
        `).join("")}
      </div>
      <p class="privacy-note">${escapeHtml(t("consumer_intelligence_privacy", "Only aggregated and anonymized analytics are shown. Personal user behavior is never exposed."))}</p>
    </article>
  `;
}

function labelChips(labels = []) {
  const rows = asArray(labels);
  if (!rows.length) return "";
  return `<div class="tag-row">${rows.map((label) => `<span class="tag integration-label">${escapeHtml(label)}</span>`).join("")}</div>`;
}

function operationalStatusBadge(status) {
  const normalized = String(status || "beta").replace(/\s+/g, "_").toLowerCase();
  return `<span class="feature-badge ${escapeAttr(normalized)}">${escapeHtml(featureStatusLabel(normalized))}</span>`;
}

function integrationHubPanel() {
  const data = state.adminIntegrations || {};
  const providers = data.providers || [];
  const syncRuns = data.sync_runs || [];
  const errors = data.errors || [];
  return `
    <article class="panel wide-panel integration-hub-panel" id="admin-integrations">
      <div class="section-title-row compact">
        <div>
          <div class="status-title-row"><span class="section-kicker">Integration Hub</span>${featureBadge("integration_hub", "beta")}</div>
          <h2>Provider connections and data import status</h2>
        </div>
      </div>
      <p class="form-note">OpenTable, Resy, SevenRooms, Tock, and Google Reserve are prepared with mock adapters. They are not live until provider API access, restaurant authorization, and approved integration partnerships exist.</p>
      <div class="integration-provider-grid">
        ${providers.map((provider) => `
          <section class="integration-provider-card">
            <div class="section-title-row compact">
              <div>
                <strong>${escapeHtml(provider.display_name)}</strong>
                <small>${escapeHtml(provider.category)} - ${escapeHtml((provider.capabilities || []).join(", "))}</small>
              </div>
              ${operationalStatusBadge(provider.status)}
            </div>
            <dl class="mini-definition-grid">
              <div><dt>Connection</dt><dd>${escapeHtml(provider.connection_status || "not_connected")}</dd></div>
              <div><dt>Sync</dt><dd>${escapeHtml(provider.sync_status || "requires_provider_api_access")}</dd></div>
              <div><dt>Last sync</dt><dd>${escapeHtml(provider.last_sync_at || "Not synced")}</dd></div>
              <div><dt>Imported</dt><dd>${escapeHtml(provider.imported_summary?.reservations || 0)} reservations</dd></div>
            </dl>
            ${labelChips(provider.labels)}
            ${provider.latest_error ? `<p class="form-note warning-note">${escapeHtml(provider.latest_error)}</p>` : ""}
            <div class="button-row">
              <button class="ghost-button" data-admin-integration-action="connect" data-admin-integration-provider="${escapeAttr(provider.provider)}" type="button">Prepare connection</button>
              <button class="ghost-button" data-admin-integration-action="sync_reservations" data-admin-integration-provider="${escapeAttr(provider.provider)}" type="button">Check sync</button>
            </div>
          </section>
        `).join("") || '<div class="empty-state">No integration providers configured.</div>'}
      </div>
      <section class="dashboard-grid two-col compact-operational-grid">
        <div>
          <h3>Recent sync runs</h3>
          ${syncRuns.length ? syncRuns.slice(0, 6).map((run) => `
            <article class="log-row">
              <strong>${escapeHtml(run.provider)} - ${escapeHtml(run.sync_type || "sync")}</strong>
              <span>${escapeHtml(run.status)} - ${escapeHtml(run.imported_reservations || 0)} reservations - ${escapeHtml(notificationTime(run.started_at || run.created_at))}</span>
            </article>
          `).join("") : '<div class="empty-state">No sync runs yet.</div>'}
        </div>
        <div>
          <h3>Integration errors</h3>
          ${errors.length ? errors.slice(0, 6).map((error) => `
            <article class="log-row warning">
              <strong>${escapeHtml(error.provider)} - ${escapeHtml(error.error_code || error.severity || "warning")}</strong>
              <span>${escapeHtml(error.message || "")}</span>
            </article>
          `).join("") : '<div class="empty-state">No integration errors.</div>'}
        </div>
      </section>
    </article>
  `;
}

function featureFlagsPanel() {
  const flags = state.adminFeatureFlags || [];
  const statusOptions = ["live", "beta", "demo_only", "coming_soon", "requires_integration", "requires_more_data"];
  return `
    <article class="panel wide-panel" id="admin-feature-flags">
      <div class="section-title-row compact">
        <div><span class="section-kicker">Feature governance</span><h2>Module status and launch labels</h2></div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Module</th><th>Status</th><th>Audience</th><th>Description</th><th></th></tr></thead>
          <tbody>
            ${flags.map((flag) => `
              <tr class="feature-flag-row" data-feature-key="${escapeAttr(flag.key)}">
                <td><strong>${escapeHtml(flag.label || flag.key)}</strong><br><span class="muted">${escapeHtml(flag.owner || "admin")}</span></td>
                <td>
                  <select data-field="status">
                    ${statusOptions.map((status) => `<option value="${escapeAttr(status)}" ${flag.status === status ? "selected" : ""}>${escapeHtml(featureStatusLabel(status))}</option>`).join("")}
                  </select>
                  <label class="check"><input data-field="enabled" type="checkbox" ${flag.enabled !== false ? "checked" : ""}> Enabled</label>
                </td>
                <td><input data-field="audience" value="${escapeAttr(flag.audience || "all")}"></td>
                <td><textarea data-field="description">${escapeHtml(flag.description || "")}</textarea></td>
                <td><button class="ghost-button" data-save-feature-flag="${escapeAttr(flag.key)}" type="button">Save</button></td>
              </tr>
            `).join("") || '<tr><td colspan="5">No feature flags yet.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="form-note">Mock AI values and integration placeholders must stay labeled until real data, provider access, or enough volume is available.</p>
    </article>
  `;
}

function platformModeControl(formId, compact = false) {
  const canEdit = isSuperAdmin();
  const options = [
    {
      value: "basic",
      title: t("platformMode.basic", "Basic reservation marketplace"),
      body: t("platform_mode_basic_description", "Shows the complete discounted restaurant reservation marketplace without AI features.")
    },
    {
      value: "ai_concierge",
      title: t("platformMode.aiConcierge", "AI Concierge version"),
      body: t("platform_mode_ai_description", "Shows the AI Concierge experience, AI navigation, AI demonstration pages and enabled AI tools.")
    }
  ];
  return `
    <form class="platform-mode-form ${compact ? "compact" : ""}" id="${escapeAttr(formId)}">
      <input type="hidden" name="platform_mode" value="${escapeAttr(currentPlatformMode())}">
      <input type="hidden" name="ai_demo_visibility" value="${escapeAttr(aiDemoVisibilityEnabled() ? "true" : "false")}">
      <input type="hidden" name="show_ai_mode_badge" value="${escapeAttr(publicAiBadgeEnabled() ? "true" : "false")}">
      <div class="platform-mode-card-grid">
        ${options.map((option) => {
          const active = currentPlatformMode() === option.value;
          return `
            <button class="platform-mode-card ${active ? "active" : ""}" data-platform-mode-choice="${escapeAttr(option.value)}" type="button" ${canEdit ? "" : "disabled"}>
              <span class="mode-dot" aria-hidden="true"></span>
              <strong>${escapeHtml(option.title)}</strong>
              <small>${escapeHtml(option.body)}</small>
              ${active ? `<em>${escapeHtml(t("active_mode_label", "Active"))}</em>` : ""}
            </button>
          `;
        }).join("")}
      </div>
      <div class="platform-setting-toggle-grid">
        <button class="platform-setting-toggle ${aiDemoVisibilityEnabled() ? "active" : ""}" data-platform-setting-toggle="ai_demo_visibility" type="button" ${canEdit ? "" : "disabled"}>
          <strong>${escapeHtml(t("platformMode.aiDemoVisibility", "AI Demo Visibility"))}</strong>
          <span>${escapeHtml(aiDemoVisibilityEnabled() ? t("setting_on", "On") : t("setting_off", "Off"))}</span>
          <small>${escapeHtml(t("ai_demo_visibility_body", "Allows demo AI pages, preview cards, prototype flows, and mock analytics only when clearly labeled."))}</small>
        </button>
        <button class="platform-setting-toggle ${publicAiBadgeEnabled() ? "active" : ""}" data-platform-setting-toggle="show_ai_mode_badge" type="button" ${canEdit ? "" : "disabled"}>
          <strong>${escapeHtml(t("platformMode.showPublicBadge", "Show AI mode badge publicly"))}</strong>
          <span>${escapeHtml(publicAiBadgeEnabled() ? t("setting_on", "On") : t("setting_off", "Off"))}</span>
          <small>${escapeHtml(t("show_ai_mode_badge_body", "Shows a small SmartTable AI Concierge badge on guest and partner interfaces in AI mode."))}</small>
        </button>
      </div>
      ${canEdit ? `<button class="primary-button" type="submit">${escapeHtml(t("platform_mode_save_button", "Save platform mode"))}</button>` : `<p class="form-note warning-note">${escapeHtml(t("platform_mode_super_admin_only", "Only Super Admin can change the global platform mode."))}</p>`}
    </form>
  `;
}

function platformPreviewActions() {
  return `
    <div class="button-row platform-preview-actions">
      <button class="primary-button" data-preview-guest-ai type="button">${escapeHtml(t("platformMode.previewGuest", "Preview Guest AI Experience"))}</button>
      <button class="ghost-button" data-preview-partner-ai type="button">${escapeHtml(t("platformMode.previewPartner", "Preview Partner AI Demand"))}</button>
      ${isAIConciergeMode() ? `<button class="ghost-button" data-open-ai-concierge-version type="button">${escapeHtml(t("platformMode.openAIExperience", "Open AI Concierge Version"))}</button>` : ""}
      ${isAIConciergeMode() ? `<button class="ghost-button" data-open-partner-ai-demand type="button">${escapeHtml(t("platformMode.openPartnerAI", "Open Partner AI Demand"))}</button>` : ""}
    </div>
  `;
}

function platformHeaderModeControl() {
  if (!isSuperAdmin()) return "";
  return `
    <details class="platform-header-control">
      <summary>${escapeHtml(t("platform_header_label", "Platform"))}: ${escapeHtml(platformModeLabel())}</summary>
      <div class="platform-header-menu">
        <button data-header-mode-choice="basic" type="button">${escapeHtml(t("platformMode.basic", "Basic reservation marketplace"))}</button>
        <button data-header-mode-choice="ai_concierge" type="button">${escapeHtml(t("platformMode.aiConcierge", "AI Concierge version"))}</button>
      </div>
    </details>
  `;
}

function platformModeQuickPanel() {
  return `
    <article class="panel wide-panel platform-mode-quick-panel" id="admin-platform-mode-quick">
      <div class="section-title-row compact">
        <div>
          <span class="section-kicker">${escapeHtml(t("platform_settings_kicker", "Platform settings"))}</span>
          <h2>${escapeHtml(t("platformMode.title", "Platform Mode"))}</h2>
        </div>
        <span class="status ${escapeAttr(currentPlatformMode())}">${escapeHtml(t("platformMode.currentMode", "Current mode"))}: ${escapeHtml(platformModeLabel())}</span>
      </div>
      ${platformModeControl("platformModeQuickForm", true)}
      ${platformPreviewActions()}
    </article>
  `;
}

function platformModePanel() {
  const registry = Object.entries(state.featureRegistry || defaultFeatureRegistry);
  return `
    <article class="panel wide-panel" id="admin-platform-settings">
      <div class="section-title-row compact">
        <div>
          <span class="section-kicker">${escapeHtml(t("platform_settings_kicker", "Platform settings"))}</span>
          <h2>${escapeHtml(t("platformMode.title", "Platform Mode"))}</h2>
        </div>
        <span class="status ${escapeAttr(currentPlatformMode())}">${escapeHtml(t("platformMode.currentMode", "Current mode"))}: ${escapeHtml(platformModeLabel())}</span>
      </div>
      <p class="form-note">${escapeHtml(t("platform_mode_note", "Basic mode hides AI and unfinished modules from public and partner daily views. AI Concierge mode can expose AI sections that are marked working or demo."))}</p>
      ${platformModeControl("platformModeSettingsForm")}
      ${platformPreviewActions()}
      <div class="table-wrap">
        <table>
          <thead><tr><th>${escapeHtml(t("feature_label", "Feature"))}</th><th>${escapeHtml(t("feature_flag_label", "Feature flag"))}</th><th>${escapeHtml(t("mode_label", "Mode"))}</th><th>${escapeHtml(t("audience_label", "Audience"))}</th><th>${escapeHtml(t("status_label", "Status"))}</th><th>${escapeHtml(t("visibility_label", "Visibility"))}</th><th>${escapeHtml(t("backend_label", "Backend"))}</th></tr></thead>
          <tbody>
            ${registry.map(([key, feature]) => `
              <tr>
                <td><strong>${escapeHtml(feature.label || key)}</strong><br><span class="muted">${escapeHtml(key)}</span></td>
                <td>${escapeHtml(feature.flag_key || "always_on")}<br><span class="muted">${escapeHtml(isFeatureFlagEnabled(feature.flag_key) ? t("setting_on", "On") : t("setting_off", "Off"))}</span></td>
                <td>${escapeHtml((feature.modes || []).join(", "))}</td>
                <td>${escapeHtml((feature.audiences || ["all"]).join(", "))}</td>
                <td>${statusBadge(feature.status || "disabled")}</td>
                <td>${escapeHtml(featureVisibilityLabel(feature))}</td>
                <td>${escapeHtml((feature.required_backend_support || []).join(", ") || "N/A")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function aiAdminControlsPanel() {
  const aiFeatures = Object.entries(state.featureRegistry || defaultFeatureRegistry).filter(([key]) => key.startsWith("ai."));
  const visibleCount = aiFeatures.filter(([key]) => canShowFeature(key, { audience: "admin" })).length;
  return `
    <article class="panel wide-panel ai-admin-controls-panel" id="admin-ai-controls">
      <div class="section-title-row compact">
        <div>
          <div class="status-title-row"><span class="section-kicker">${escapeHtml(t("ai_controls_kicker", "AI controls"))}</span>${isAiDemoVisible() ? demoBadge(t("platformMode.preview", "Preview")) : ""}</div>
          <h2>${escapeHtml(t("ai_controls_title", "AI Concierge command center"))}</h2>
        </div>
        <span class="status ${escapeAttr(currentPlatformMode())}">${escapeHtml(platformModeLabel())}</span>
      </div>
      <p class="form-note">${escapeHtml(t("ai_controls_body", "Use this area to govern AI visibility, demo previews, feature status, AI content, and user-facing AI demonstrations."))}</p>
      <div class="stats-grid compact-stats">
        ${statCard(t("platformMode.aiDemoVisibility", "AI Demo Visibility"), aiDemoVisibilityEnabled() ? t("setting_on", "On") : t("setting_off", "Off"))}
        ${statCard(t("platformMode.showPublicBadge", "Show AI mode badge publicly"), publicAiBadgeEnabled() ? t("setting_on", "On") : t("setting_off", "Off"))}
        ${statCard(t("ai_feature_registry_title", "AI feature registry"), aiFeatures.length)}
        ${statCard(t("ai_visible_features_title", "Visible AI features"), visibleCount)}
      </div>
      <div class="button-row">
        <a class="ghost-button" href="#admin-platform-settings">${escapeHtml(t("ai_demo_settings_button", "AI demo settings"))}</a>
        <a class="ghost-button" href="#admin-feature-flags">${escapeHtml(t("ai_feature_registry_button", "AI feature registry"))}</a>
        <a class="ghost-button" href="#admin-content">${escapeHtml(t("ai_content_controls_button", "AI content controls"))}</a>
        <a class="ghost-button" href="#admin-content">${escapeHtml(t("ai_marketing_text_settings_button", "AI marketing text settings"))}</a>
      </div>
      ${platformPreviewActions()}
      <div class="feature-card-grid">
        ${aiFeatures.map(([key, feature]) => `
          <section class="feature-status-card">
            <div class="status-title-row"><strong>${escapeHtml(feature.label || key)}</strong>${feature.status === "demo" ? demoBadge(t("platformMode.demo", "Demo")) : statusBadge(feature.status || "disabled")}</div>
            <span>${escapeHtml(featureVisibilityLabel(feature))}</span>
            <small>${escapeHtml((feature.required_backend_support || []).join(", ") || "No backend requirement listed")}</small>
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function aiExperiencePreviewPanel() {
  const features = Object.values(state.featureRegistry || defaultFeatureRegistry);
  const counts = features.reduce((acc, feature) => {
    const status = String(feature.status || "disabled");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const statusRows = ["working", "demo", "hidden", "disabled"];
  return `
    <article class="panel wide-panel ai-experience-preview-panel" id="admin-ai-preview">
      <div class="section-title-row compact">
        <div>
          <span class="section-kicker">${escapeHtml(t("ai_experience_preview_kicker", "AI Experience Preview"))}</span>
          <h2>${escapeHtml(t("ai_experience_preview_title", "Preview AI routes and user-facing experiences"))}</h2>
        </div>
        ${isAiDemoVisible() ? demoBadge(t("platformMode.preview", "Preview")) : ""}
      </div>
      <div class="ai-preview-grid">
        <section class="ai-preview-card">
          <strong>${escapeHtml(t("guest_preview_title", "Guest preview"))}</strong>
          <p>${escapeHtml(t("guest_preview_body", "Preview how guests see the AI Concierge experience."))}</p>
          <button class="primary-button" data-preview-guest-ai type="button">${escapeHtml(t("open_guest_ai_preview", "Open Guest AI Preview"))}</button>
        </section>
        <section class="ai-preview-card">
          <strong>${escapeHtml(t("partner_preview_title", "Partner preview"))}</strong>
          <p>${escapeHtml(t("partner_preview_body", "Preview the partner AI Demand dashboard."))}</p>
          <button class="primary-button" data-preview-partner-ai type="button">${escapeHtml(t("open_partner_ai_preview", "Open Partner AI Preview"))}</button>
        </section>
        <section class="ai-preview-card feature-status-preview">
          <strong>${escapeHtml(t("feature_status_preview_title", "Feature status preview"))}</strong>
          <div class="status-count-grid">
            ${statusRows.map((status) => `
              <span>${statusBadge(status)} <b>${escapeHtml(counts[status] || 0)}</b></span>
            `).join("")}
          </div>
        </section>
      </div>
    </article>
  `;
}

function billingFoundationPanel() {
  const billing = state.adminBilling || {};
  const plans = billing.plans || [];
  const subscriptions = billing.subscriptions || [];
  const invoices = billing.invoices || [];
  return `
    <article class="panel wide-panel" id="admin-billing">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">Billing</span>${featureBadge("billing_foundation", "beta")}</div><h2>Stripe-ready subscription foundation</h2></div>
      </div>
      <p class="form-note">This is the subscription foundation only. Stripe checkout, customer portal, and webhooks still require live Stripe keys and webhook configuration.</p>
      <section class="marketplace-insight-grid">
        ${plans.map((plan) => `
          <section class="marketplace-insight-card">
            <span>${escapeHtml(plan.name || plan.key)}</span>
            <strong>${formatMoney(plan.monthly_price || 0)} / mo</strong>
            <small>${formatMoney(plan.per_booking_fee || 0)} per booking</small>
          </section>
        `).join("") || '<div class="empty-state">No billing plans configured.</div>'}
      </section>
      <section class="dashboard-grid two-col compact-operational-grid">
        <div>
          <h3>Subscriptions</h3>
          ${subscriptions.length ? subscriptions.slice(0, 6).map((subscription) => `
            <article class="log-row">
              <strong>${escapeHtml(subscription.restaurants?.name || subscription.restaurant_name || subscription.restaurant_id || "Restaurant")}</strong>
              <span>${escapeHtml(subscription.status)} - ${escapeHtml(subscription.stripe_subscription_id || "Stripe ID required")}</span>
            </article>
          `).join("") : '<div class="empty-state">No subscriptions yet.</div>'}
        </div>
        <div>
          <h3>Invoices</h3>
          ${invoices.length ? invoices.slice(0, 6).map((invoice) => `
            <article class="log-row">
              <strong>${formatMoney(invoice.amount_due || 0)} - ${escapeHtml(invoice.status || "draft")}</strong>
              <span>${escapeHtml(invoice.stripe_invoice_id || invoice.hosted_invoice_url || "Stripe invoice required")}</span>
            </article>
          `).join("") : '<div class="empty-state">No invoices yet.</div>'}
        </div>
      </section>
    </article>
  `;
}

function monitoringPanel() {
  const data = state.adminErrors || {};
  const groups = [
    ["App errors", data.app_errors || []],
    ["Integration errors", data.integration_errors || []],
    ["Failed emails", data.failed_emails || []],
    ["Failed AI actions", data.failed_ai_actions || []],
    ["Admin alerts", data.admin_alerts || []]
  ];
  return `
    <article class="panel wide-panel" id="admin-monitoring">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">Monitoring</span>${featureBadge("monitoring_error_logs", "beta")}</div><h2>Errors, failed jobs, and admin alerts</h2></div>
      </div>
      <div class="monitoring-grid">
        ${groups.map(([title, rows]) => `
          <section class="monitoring-card">
            <div class="section-title-row compact"><strong>${escapeHtml(title)}</strong><span class="feature-badge beta">${escapeHtml(rows.length)}</span></div>
            ${rows.length ? rows.slice(0, 4).map((row) => `
              <article class="log-row ${row.severity === "critical" || row.severity === "error" ? "warning" : ""}">
                <strong>${escapeHtml(row.title || row.error_code || row.event_type || row.action_type || row.area || row.provider || "Log")}</strong>
                <span>${escapeHtml(row.message || row.status || row.result?.message || "")}</span>
              </article>
            `).join("") : '<div class="empty-state">No records.</div>'}
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function readinessChecklistPanel() {
  const checklists = state.systemChecklists || {};
  const renderList = (title, rows = []) => `
    <section class="readiness-card">
      <h3>${escapeHtml(title)}</h3>
      ${rows.map((item) => `
        <article class="readiness-row">
          <span>${escapeHtml(item.label)}</span>
          ${operationalStatusBadge(item.status)}
        </article>
      `).join("") || '<div class="empty-state">Checklist unavailable.</div>'}
    </section>
  `;
  return `
    <article class="panel wide-panel" id="admin-readiness">
      <div class="section-title-row compact">
        <div><span class="section-kicker">Production readiness</span><h2>MVP, AI, and integration readiness</h2></div>
      </div>
      <div class="dashboard-grid two-col">
        ${renderList("Ready for real restaurants", checklists.mvp || [])}
        ${renderList("Real AI engine requirements", checklists.ai_engine || [])}
        ${renderList("Reservation integration readiness", checklists.integration_readiness || [])}
      </div>
      <p class="privacy-note">No module should claim live production performance unless it reads real records, logs actions, measures outcomes, and has the needed provider or data volume.</p>
    </article>
  `;
}

function partnerIntegrationPanel() {
  const data = state.partnerIntegrations || {};
  const providers = data.providers || [];
  const imports = state.partnerImports || {};
  const reservations = imports.imported_reservations || [];
  return `
    <article class="panel wide-panel partner-integration-panel" id="partner-integrations">
      <div class="section-title-row compact">
        <div>
          <div class="status-title-row"><span class="section-kicker">Integrations</span>${featureBadge("reservation_integrations", "requires_integration")}</div>
          <h2>Reservation platform data</h2>
        </div>
      </div>
      <p class="form-note">OpenTable, Resy, SevenRooms, Tock, Google Reserve, and approved reservation software require provider API access and restaurant authorization. SmartTable integrates with reservation systems only and does not request POS, payment, order, transaction, or inventory data.</p>
      <div class="integration-provider-grid compact">
        ${providers.filter((provider) => provider.category === "reservation").slice(0, 6).map((provider) => `
          <section class="integration-provider-card">
            <strong>${escapeHtml(provider.display_name)}</strong>
            ${operationalStatusBadge(provider.status)}
            <small>${escapeHtml(provider.connection_status || "not_connected")} - ${escapeHtml(provider.sync_status || "requires_provider_api_access")}</small>
            ${labelChips(provider.labels)}
            <div class="button-row">
              <button class="ghost-button" data-partner-integration-action="connect" data-partner-integration-provider="${escapeAttr(provider.provider)}" type="button">Prepare</button>
              <button class="ghost-button" data-partner-integration-action="sync_reservations" data-partner-integration-provider="${escapeAttr(provider.provider)}" type="button">Check</button>
            </div>
          </section>
        `).join("") || '<div class="empty-state">No provider catalog available.</div>'}
      </div>
      <section class="dashboard-grid two-col compact-operational-grid">
        <form class="mini-form" id="reservationImportForm">
          <h3>CSV reservation import</h3>
          <label>Source
            <select name="provider">
              <option value="csv_import">CSV / manual export</option>
              <option value="opentable">OpenTable export</option>
              <option value="resy">Resy export</option>
              <option value="sevenrooms">SevenRooms export</option>
              <option value="tock">Tock export</option>
            </select>
          </label>
          <textarea name="csv" rows="7" placeholder="reservation_date,time,party_size,guest_name,guest_email,guest_phone,status,notes&#10;2026-07-07,18:30,2,Emma Carter,emma@example.com,+1 212 555 0101,confirmed,Window table"></textarea>
          <button class="primary-button" type="submit">Import reservations</button>
          <p class="form-note">Guest data should only be imported when permitted by your reservation platform export and privacy rules. Do not upload POS, payment, order, transaction, revenue, or inventory fields.</p>
        </form>
        <form class="mini-form" id="manualPerformanceForm">
          <h3>Manual weekly reservation summary</h3>
          <input name="service_week" type="date">
          <input name="reservations_count" type="number" min="0" placeholder="Reservations">
          <input name="covers_count" type="number" min="0" placeholder="Covers / guests">
          <textarea name="notes" placeholder="Notes, weak hours, unusual events"></textarea>
          <input type="hidden" name="import_type" value="weekly_performance">
          <button class="ghost-button" type="submit">Save weekly summary</button>
        </form>
      </section>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Imported reservation</th><th>Guest</th><th>Source</th><th>Status</th></tr></thead>
          <tbody>
            ${reservations.slice(0, 8).map((row) => `
              <tr>
                <td>${escapeHtml(row.reservation_start || row.reservation_date || "Imported date")}</td>
                <td>${escapeHtml(row.guest_name || "Guest")}<br><span class="muted">${escapeHtml(row.guest_email || "")}</span></td>
                <td>${escapeHtml(row.provider || row.source || "csv_import")}</td>
                <td>${statusBadge(row.status || "confirmed")}</td>
              </tr>
            `).join("") || '<tr><td colspan="4">No imported reservations yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function renderAdmin() {
  if (!state.session || !isAdminRole(state.session.profile.role)) return renderLogin("admin");
  const stats = state.stats || {};
  const adminNavItems = [
    { id: "admin-stats", label: t("admin_nav_statistics", "Statistics") },
    { id: "admin-platform-settings", label: t("admin_nav_settings", "Settings") },
    { id: "admin-content", label: t("admin_nav_content", "Site content") },
    { id: "admin-restaurants", label: t("admin_nav_restaurants", "Restaurants") },
    { id: "admin-partners", label: t("admin_nav_partners", "Partners") },
    { id: "admin-offers", label: t("admin_nav_offers", "Offers") },
    { id: "admin-reviews", label: t("admin_nav_reviews", "Reviews") },
    { id: "admin-photo-submissions", label: t("admin_nav_photo_rewards", "Photo rewards") },
    { id: "admin-notifications", label: t("admin_nav_notifications", "Notifications") },
    { id: "admin-reservations", label: t("admin_nav_reservations", "Reservations") }
  ];
  if (canShowFeature("ai.adminAIControls", { allowDemo: true })) {
    adminNavItems.splice(2, 0,
      { id: "admin-ai-controls", label: t("ai_controls_kicker", "AI controls") },
      { id: "admin-ai-preview", label: t("admin_nav_ai_preview", "AI preview") },
      { id: "admin-ai-trends", label: t("admin_nav_ai_trends", "AI trends") },
      { id: "admin-integrations", label: t("admin_nav_integrations", "Integrations") },
      { id: "admin-feature-flags", label: t("admin_nav_feature_flags", "Feature flags") },
      { id: "admin-billing", label: t("admin_nav_billing", "Billing") },
      { id: "admin-monitoring", label: t("admin_nav_monitoring", "Monitoring") },
      { id: "admin-readiness", label: t("admin_nav_readiness", "Readiness") },
      { id: "admin-marketplace-insights", label: t("admin_nav_marketplace_insights", "Marketplace insights") },
      { id: "admin-consumer-intelligence", label: t("admin_nav_consumer_intelligence", "Consumer intelligence") }
    );
  }
  const aiAdminPanels = canShowFeature("ai.adminAIControls", { allowDemo: true }) ? `
    ${aiAdminControlsPanel()}
    ${aiExperiencePreviewPanel()}
    ${platformTrendPanel()}
    ${integrationHubPanel()}
    ${featureFlagsPanel()}
    ${billingFoundationPanel()}
    ${monitoringPanel()}
    ${readinessChecklistPanel()}
    ${marketplaceInsightsPanel()}
    ${consumerIntelligencePanel()}
  ` : "";
  app.innerHTML = dashboardShell(adminNavItems, `
    <section class="dashboard-head">
      <div>
        <span class="section-kicker">${escapeHtml(t("admin_dashboard_kicker", "Super Admin dashboard"))}</span>
        <h1>${escapeHtml(t("admin_dashboard_title", "Smart Table operations"))}</h1>
      </div>
      <div class="admin-head-actions">
        ${platformHeaderModeControl()}
        <span class="status ${escapeAttr(currentPlatformMode())}">${escapeHtml(t("platformMode.currentMode", "Current mode"))}: ${escapeHtml(platformModeLabel())}</span>
        <div class="notification-wrap">
          <button class="ghost-button notification-button" id="toggleNotifications" type="button">${escapeHtml(t("notifications_title", "Notifications"))} <span>${escapeHtml(state.unreadNotifications)}</span></button>
          ${state.showNotifications ? notificationDropdown() : ""}
        </div>
        <button class="primary-button" id="refreshAdmin" type="button">${escapeHtml(t("refresh_button", "Refresh"))}</button>
      </div>
    </section>
    ${platformModeQuickPanel()}
    <section class="stats-grid" id="admin-stats">
      ${statCard("Restaurants", stats.restaurants_total)}
      ${statCard("Pending approvals", stats.restaurants_pending)}
      ${statCard("Partners", stats.partners_total)}
      ${statCard("Active offers", stats.offers_active)}
      ${statCard("Reservations", stats.reservations_total)}
      ${statCard("Views", stats.views_total)}
      ${statCard("Favorites", stats.favorites_total)}
      ${statCard("New favorites this week", stats.favorites_this_week)}
      ${statCard("New favorites this month", stats.favorites_this_month)}
    </section>
    ${platformModePanel()}
    ${aiAdminPanels}
    ${contentEditorV2()}
    <section class="dashboard-grid two-col">
      <article class="panel" id="admin-restaurants">
        <div class="section-title-row compact">
          <div><span class="section-kicker">${escapeHtml(t("admin_nav_restaurants", "Restaurants"))}</span><h2>${escapeHtml(t("admin_restaurants_title", "Manage restaurants"))}</h2></div>
        </div>
        <form class="mini-form admin-form" id="restaurantForm">
          <input name="name" placeholder="Restaurant name" required>
          <input name="email" type="email" placeholder="Restaurant email" required>
          <input name="phone" placeholder="Phone">
          <input name="address" placeholder="Address" required>
          <input name="district" placeholder="Neighborhood" value="New York">
          <input name="cuisine_type" placeholder="Cuisine" required>
          <input name="sort_order" type="number" min="0" placeholder="Sort order">
          <input name="latitude" type="number" step="0.000001" placeholder="Latitude">
          <input name="longitude" type="number" step="0.000001" placeholder="Longitude">
          <input name="google_place_id" placeholder="Google Place ID">
          <input name="website" placeholder="Website">
          <input name="instagram" placeholder="Instagram">
          <input name="facebook" placeholder="Facebook">
          <input name="tiktok" placeholder="TikTok">
          <input name="google_maps_url" placeholder="Google Maps">
          <input name="card_image" placeholder="Card image URL">
          <textarea name="description_en" placeholder="Description in English"></textarea>
          <textarea name="description_es" placeholder="Description in Spanish"></textarea>
          <textarea name="description_hu" placeholder="Description in Hungarian"></textarea>
          <select name="billing_plan">
            <option value="free">Free</option>
            <option value="monthly">Monthly</option>
            <option value="per_booking">Per booking</option>
          </select>
          <input name="monthly_fee" type="number" min="0" step="0.01" placeholder="Monthly fee">
          <input name="fee_per_booking" type="number" min="0" step="0.01" placeholder="Fee per booking">
          ${canShowFeature("ai.adminAIControls", { allowDemo: true }) ? `<select name="ai_discount_enabled">
            <option value="true">AI discount enabled</option>
            <option value="false">AI discount disabled</option>
          </select>
          <input name="min_discount_percent" type="number" min="0" max="90" placeholder="Minimum AI discount %">
          <input name="max_discount_percent" type="number" min="0" max="90" placeholder="Maximum AI discount %">
          <input name="target_margin_percent" type="number" min="0" max="100" step="0.1" placeholder="Target margin %">
          <input name="average_service_minutes" type="number" min="15" placeholder="Average service minutes">` : ""}
          <button class="primary-button" type="submit">Add restaurant</button>
        </form>
        ${restaurantTable()}
      </article>
      <article class="panel" id="admin-partners">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Partners</span><h2>Restaurant accounts</h2></div>
        </div>
        <form class="mini-form admin-form" id="partnerForm">
          <input name="full_name" placeholder="Owner name" required>
          <input name="email" type="email" placeholder="Owner email" required>
          <input name="password" type="password" placeholder="Temporary password" required>
          <select name="restaurant_id" required>
            <option value="">Choose restaurant</option>
            ${state.restaurants.map((restaurant) => `<option value="${escapeAttr(restaurant.id)}">${escapeHtml(restaurant.name)}</option>`).join("")}
          </select>
          <button class="primary-button" type="submit">Create partner login</button>
        </form>
        ${partnerTable()}
      </article>
      <article class="panel" id="admin-offers">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Offers</span><h2>All discounted tables</h2></div>
        </div>
        ${offerAdminTable()}
      </article>
      <article class="panel" id="admin-reviews">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Reviews</span><h2>Moderate restaurant reviews</h2></div>
        </div>
        ${reviewAdminTable()}
      </article>
      <article class="panel" id="admin-photo-submissions">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Rewards moderation</span><h2>${escapeHtml(t("admin_photo_submissions_title", "Guest Photo & Review Submissions"))}</h2></div>
        </div>
        ${photoSubmissionAdminTable()}
      </article>
      <article class="panel" id="admin-notifications">
        <div class="section-title-row compact">
          <div><span class="section-kicker">${escapeHtml(t("notifications_title", "Notifications"))}</span><h2>Partner activity</h2></div>
          <button class="ghost-button" id="markAllNotifications" type="button">${escapeHtml(t("notifications_mark_read", "Mark as read"))}</button>
        </div>
        ${notificationList(true)}
      </article>
      <article class="panel" id="admin-reservations">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Reservations</span><h2>Track reservations</h2></div>
        </div>
        ${reservationFilterForm("admin", state.adminReservationFilters)}
        ${reservationTable(state.reservations, true)}
      </article>
    </section>
  `);
  document.querySelector("#refreshAdmin").addEventListener("click", async () => {
    await loadAdminData();
    renderAdmin();
  });
  document.querySelector("#toggleNotifications")?.addEventListener("click", () => {
    state.showNotifications = !state.showNotifications;
    renderAdmin();
  });
  document.querySelector("#markAllNotifications")?.addEventListener("click", () => markNotificationRead(null, true));
  document.querySelectorAll("[data-mark-notification]").forEach((button) => {
    button.addEventListener("click", () => markNotificationRead(button.dataset.markNotification));
  });
  document.querySelectorAll("[data-admin-integration-action]").forEach((button) => {
    button.addEventListener("click", () => runIntegrationAction("/admin/integrations", button.dataset.adminIntegrationProvider, button.dataset.adminIntegrationAction, loadAdminData, renderAdmin));
  });
  document.querySelectorAll("[data-save-feature-flag]").forEach((button) => {
    button.addEventListener("click", () => saveFeatureFlag(button.dataset.saveFeatureFlag));
  });
  document.querySelectorAll(".platform-mode-form").forEach((form) => {
    form.addEventListener("submit", savePlatformMode);
  });
  document.querySelectorAll("[data-platform-mode-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isSuperAdmin()) return;
      const form = button.closest(".platform-mode-form");
      const input = form?.querySelector('[name="platform_mode"]');
      if (!input) return;
      input.value = button.dataset.platformModeChoice;
      form.querySelectorAll("[data-platform-mode-choice]").forEach((choice) => {
        choice.classList.toggle("active", choice === button);
      });
    });
  });
  document.querySelectorAll("[data-platform-setting-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isSuperAdmin()) return;
      const form = button.closest(".platform-mode-form");
      const input = form?.querySelector(`[name="${CSS.escape(button.dataset.platformSettingToggle)}"]`);
      if (!input) return;
      const nextValue = input.value !== "true";
      input.value = nextValue ? "true" : "false";
      button.classList.toggle("active", nextValue);
      const status = button.querySelector("span");
      if (status) status.textContent = nextValue ? t("setting_on", "On") : t("setting_off", "Off");
    });
  });
  document.querySelectorAll("[data-header-mode-choice]").forEach((button) => {
    button.addEventListener("click", () => quickSwitchPlatformMode(button.dataset.headerModeChoice));
  });
  document.querySelectorAll("[data-preview-guest-ai], [data-open-ai-concierge-version]").forEach((button) => {
    button.addEventListener("click", openGuestAiExperience);
  });
  document.querySelectorAll("[data-preview-partner-ai], [data-open-partner-ai-demand]").forEach((button) => {
    button.addEventListener("click", openPartnerAiDemandPreview);
  });
  document.querySelectorAll("[data-review-status]").forEach((button) => {
    button.addEventListener("click", () => updateReviewStatus(button.dataset.reviewId, button.dataset.reviewStatus));
  });
  document.querySelectorAll("[data-photo-submission-status]").forEach((button) => {
    button.addEventListener("click", () => updatePhotoSubmissionStatus(button.dataset.photoSubmissionId, button.dataset.photoSubmissionStatus));
  });
  document.querySelector("#restaurantForm").addEventListener("submit", submitRestaurant);
  document.querySelector("#partnerForm").addEventListener("submit", submitPartner);
  document.querySelector("#contentSearch")?.addEventListener("input", (event) => {
    const value = event.target.value;
    state.contentSearch = value;
    renderAdmin();
    const search = document.querySelector("#contentSearch");
    search?.focus();
    search?.setSelectionRange(value.length, value.length);
  });
  document.querySelectorAll("[data-edit-content]").forEach((button) => {
    button.addEventListener("click", () => {
      state.contentEditKey = button.dataset.editContent;
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-close-content-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      state.contentEditKey = null;
      renderAdmin();
    });
  });
  document.querySelector("#contentEditForm")?.addEventListener("submit", saveContentModal);
  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => approveRestaurant(button.dataset.approve, button));
  });
  document.querySelectorAll("[data-save-restaurant]").forEach((button) => {
    button.addEventListener("click", () => saveRestaurantRow(button.dataset.saveRestaurant, button));
  });
  document.querySelectorAll("[data-disable-restaurant]").forEach((button) => {
    button.addEventListener("click", () => updateRestaurantStatus(button.dataset.disableRestaurant, "suspended", button));
  });
  document.querySelectorAll("[data-save-admin-offer]").forEach((button) => {
    button.addEventListener("click", () => saveOfferRow("/admin/offers", button.dataset.saveAdminOffer, loadAdminData, renderAdmin, button));
  });
  document.querySelectorAll("[data-delete-admin-offer]").forEach((button) => {
    button.addEventListener("click", () => deleteOffer("/admin/offers", button.dataset.deleteAdminOffer, loadAdminData, renderAdmin, button));
  });
  document.querySelectorAll("[data-view-as-partner]").forEach((button) => {
    button.addEventListener("click", () => viewAsPartner(button.dataset.viewAsPartner));
  });
  bindReservationStatusButtons("/admin/reservations", loadAdminData, renderAdmin);
  bindReservationFilterForms();
  finalizeRenderedLanguage();
}

function restaurantTable() {
  if (!state.restaurants.length) return '<div class="empty-state">No restaurants yet.</div>';
  const showAiControls = canShowFeature("ai.adminAIControls", { allowDemo: true });
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Restaurant</th><th>Order / map</th><th>Social / images</th>${showAiControls ? "<th>AI guardrails</th>" : ""}<th>Status</th><th>Billing</th><th></th></tr></thead>
        <tbody>
          ${state.restaurants.map((restaurant) => `
            <tr class="admin-restaurant-row" data-restaurant-row="${escapeAttr(restaurant.id)}">
              <td>
                <input data-field="name" value="${escapeAttr(restaurant.name)}" aria-label="Restaurant name">
                <input data-field="email" value="${escapeAttr(restaurant.email || restaurant.contact_email || "")}" aria-label="Restaurant email">
                <input data-field="address" value="${escapeAttr(restaurant.address || "")}" aria-label="Address">
                <input data-field="cuisine_type" value="${escapeAttr(restaurant.cuisine_type || restaurant.cuisine || "")}" aria-label="Cuisine">
                <input data-field="rating" type="number" min="0" max="5" step="0.1" value="${escapeAttr(restaurant.rating || 4.5)}" aria-label="Rating">
              </td>
              <td>
                <input data-field="sort_order" type="number" min="0" value="${escapeAttr(restaurant.sort_order ?? "")}" placeholder="Sort order">
                <input data-field="district" value="${escapeAttr(restaurant.district || "")}" placeholder="Neighborhood">
                <input data-field="latitude" type="number" step="0.000001" value="${escapeAttr(restaurant.latitude ?? "")}" placeholder="Latitude">
                <input data-field="longitude" type="number" step="0.000001" value="${escapeAttr(restaurant.longitude ?? "")}" placeholder="Longitude">
                <input data-field="google_place_id" value="${escapeAttr(restaurant.google_place_id || "")}" placeholder="Google Place ID">
              </td>
              <td>
                <input data-field="website" value="${escapeAttr(restaurant.website || "")}" placeholder="Website">
                <input data-field="instagram" value="${escapeAttr(restaurant.instagram || "")}" placeholder="Instagram">
                <input data-field="facebook" value="${escapeAttr(restaurant.facebook || "")}" placeholder="Facebook">
                <input data-field="tiktok" value="${escapeAttr(restaurant.tiktok || "")}" placeholder="TikTok">
                <input data-field="google_maps_url" value="${escapeAttr(restaurant.google_maps_url || "")}" placeholder="Google Maps">
                <input data-field="card_image" value="${escapeAttr(restaurant.card_image || restaurant.cover_image || "")}" placeholder="Card image URL">
              </td>
              ${showAiControls ? `<td>
                <select data-field="ai_discount_enabled">
                  <option value="true" ${restaurant.ai_discount_enabled !== false ? "selected" : ""}>enabled</option>
                  <option value="false" ${restaurant.ai_discount_enabled === false ? "selected" : ""}>disabled</option>
                </select>
                <input data-field="min_discount_percent" type="number" min="0" max="90" value="${escapeAttr(restaurant.min_discount_percent ?? 10)}" placeholder="Min discount %">
                <input data-field="max_discount_percent" type="number" min="0" max="90" value="${escapeAttr(restaurant.max_discount_percent ?? 30)}" placeholder="Max discount %">
                <input data-field="target_margin_percent" type="number" min="0" max="100" step="0.1" value="${escapeAttr(restaurant.target_margin_percent ?? 65)}" placeholder="Target margin %">
                <input data-field="average_service_minutes" type="number" min="15" value="${escapeAttr(restaurant.average_service_minutes ?? 75)}" placeholder="Service minutes">
              </td>` : ""}
              <td>
                ${statusBadge(restaurant.status)}
                <select data-field="status">
                  <option value="pending" ${restaurant.status === "pending" ? "selected" : ""}>pending</option>
                  <option value="approved" ${restaurant.status === "approved" ? "selected" : ""}>approved</option>
                  <option value="suspended" ${restaurant.status === "suspended" ? "selected" : ""}>suspended</option>
                </select>
              </td>
              <td>${escapeHtml(restaurant.billing_plan || "free")}<br><span class="muted">${escapeHtml(restaurant.billing_status || "trialing")}</span></td>
              <td>
                <div class="button-row">
                  <button class="ghost-button" data-save-restaurant="${escapeAttr(restaurant.id)}" type="button">Save</button>
                  ${restaurant.status !== "approved" ? `<button class="ghost-button" data-approve="${escapeAttr(restaurant.id)}" type="button">Approve</button>` : ""}
                  <button class="ghost-button danger" data-disable-restaurant="${escapeAttr(restaurant.id)}" type="button">Disable</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function partnerTable() {
  if (!state.partners.length) return '<div class="empty-state">No partner accounts yet.</div>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Restaurant</th>${isSuperAdmin() ? "<th></th>" : ""}</tr></thead>
        <tbody>
          ${state.partners.map((partner) => `
            <tr>
              <td>${escapeHtml(partner.full_name || "Partner")}</td>
              <td>${escapeHtml(partner.email)}</td>
              <td>${statusBadge(normalizeRole(partner.role))}</td>
              <td>${escapeHtml(partner.restaurant_id || "Not linked")}</td>
              ${isSuperAdmin() ? `<td><button class="ghost-button" data-view-as-partner="${escapeAttr(partner.id)}" type="button">View as partner</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function offerAdminTable() {
  if (!state.adminOffers.length) return `<div class="empty-state">${escapeHtml(t("no_offers_yet", "No offers yet."))}</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>${escapeHtml(t("offer_table_title_header", "Title"))}</th><th>${escapeHtml(t("offer_table_date_time_header", "Date/time"))}</th><th>${escapeHtml(t("offer_table_tables_header", "Tables"))}</th><th>${escapeHtml(t("offer_table_discount_header", "Discount"))}</th><th>${escapeHtml(t("status_label", "Status"))}</th><th></th></tr></thead>
        <tbody>
          ${state.adminOffers.map((offer) => `
            <tr class="offer-edit-row" data-offer-row="${escapeAttr(offer.id)}">
              <td><input data-field="title_en" value="${escapeAttr(offer.title_en || t("discounted_table_label", "Discounted table"))}"><br><span class="muted">${escapeHtml(offer.restaurant_name || offer.restaurant_id || "")}</span></td>
              <td>
                <input data-field="offer_date" type="date" value="${escapeAttr(offer.offer_date || "")}">
                <input data-field="start_time" type="time" value="${escapeAttr(offer.start_time || offer.offer_time || "")}">
                <input data-field="end_time" type="time" value="${escapeAttr(offer.end_time || "")}">
              </td>
              <td>
                <input data-field="available_tables" type="number" min="1" value="${escapeAttr(offer.available_tables || offer.seat_count || 1)}">
                <span class="muted">${escapeHtml(offer.reserved_tables || 0)} ${escapeHtml(t("reserved_label", "reserved"))}</span>
              </td>
              <td><input data-field="discount_value" type="number" min="1" max="90" value="${escapeAttr(offer.discount_value || offer.discount_percent || 20)}"></td>
              <td>
                ${statusBadge(offer.status, offerStatusLabel(offer.status))}
                <select data-field="status">
                  <option value="active" ${offer.status === "active" ? "selected" : ""}>${escapeHtml(t("offer_status_active", "Active"))}</option>
                  <option value="paused" ${offer.status === "paused" ? "selected" : ""}>${escapeHtml(t("offer_status_paused", "Paused"))}</option>
                  <option value="sold_out" ${offer.status === "sold_out" ? "selected" : ""}>${escapeHtml(t("offer_status_sold_out", "Sold out"))}</option>
                  <option value="expired" ${offer.status === "expired" ? "selected" : ""}>${escapeHtml(t("offer_status_expired", "Expired"))}</option>
                </select>
              </td>
              <td>
                <div class="button-row">
                  <button class="ghost-button" data-save-admin-offer="${escapeAttr(offer.id)}" type="button">${escapeHtml(t("save_button", "Save"))}</button>
                  <button class="ghost-button danger" data-delete-admin-offer="${escapeAttr(offer.id)}" type="button">${escapeHtml(t("delete_button", "Delete"))}</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function notificationTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString((supportedLanguages[state.lang] || supportedLanguages.en).locale);
}

function notificationList(limit = false) {
  const rows = limit === true ? state.notifications : state.notifications.slice(0, 6);
  if (!rows.length) return '<div class="empty-state">No notifications yet.</div>';
  return `
    <div class="notification-list">
      ${rows.map((item) => `
        <article class="notification-item ${item.read_at ? "" : "unread"}">
          <div>
            <strong>${escapeHtml(item.title || item.type)}</strong>
            <p>${escapeHtml(item.message || "")}</p>
            <small>${escapeHtml(item.partner_name || item.partner_email || "Partner")} - ${escapeHtml(item.restaurant_name || "Restaurant")} - ${escapeHtml(notificationTime(item.created_at))}</small>
          </div>
          ${item.read_at ? "" : `<button class="ghost-button" data-mark-notification="${escapeAttr(item.id)}" type="button">${escapeHtml(t("notifications_mark_read", "Mark as read"))}</button>`}
        </article>
      `).join("")}
    </div>
  `;
}

function notificationDropdown() {
  return `
    <div class="notification-panel">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("notifications_title", "Notifications"))}</span><h2>Recent activity</h2></div>
      </div>
      ${notificationList(false)}
      <a class="ghost-button wide center-button" href="#admin-notifications">${escapeHtml(t("notifications_view_all", "View all notifications"))}</a>
    </div>
  `;
}

function reviewAdminTable() {
  if (!state.adminReviews.length) return '<div class="empty-state">No reviews yet.</div>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Restaurant</th><th>Guest</th><th>Ratings</th><th>Comment</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${state.adminReviews.map((review) => `
            <tr>
              <td>${escapeHtml(review.restaurant_name || review.restaurant_id)}</td>
              <td>${escapeHtml(review.guest_name || "Anonymous")}<br><span class="muted">${escapeHtml(review.guest_email || "")}</span></td>
              <td>
                ${escapeHtml(t("review_food_label", "Food"))}: ${escapeHtml(review.food_rating)}<br>
                ${escapeHtml(t("review_service_label", "Service"))}: ${escapeHtml(review.service_rating)}<br>
                ${escapeHtml(t("review_ambience_label", "Ambience"))}: ${escapeHtml(review.ambience_rating)}
              </td>
              <td>${escapeHtml(review.comment || "")}</td>
              <td>${statusBadge(review.status)}</td>
              <td>
                <div class="button-row">
                  <button class="ghost-button" data-review-id="${escapeAttr(review.id)}" data-review-status="approved" type="button">Approve</button>
                  <button class="ghost-button danger" data-review-id="${escapeAttr(review.id)}" data-review-status="rejected" type="button">Reject</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function photoSubmissionAdminTable() {
  if (!state.adminPhotoSubmissions.length) return '<div class="empty-state">No guest photo or review submissions yet.</div>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Restaurant</th><th>Guest</th><th>Booking</th><th>Photo</th><th>Rating</th><th>Review</th><th>Points</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${state.adminPhotoSubmissions.map((submission) => `
            <tr>
              <td>${escapeHtml(submission.restaurant_name || submission.restaurant_id || "Restaurant")}</td>
              <td>${escapeHtml(submission.guest_name || "Guest")}<br><span class="muted">${escapeHtml(submission.guest_email || "")}</span></td>
              <td>${escapeHtml(submission.reference || submission.booking_id || submission.reservation_id || "")}</td>
              <td>${submission.image_url ? `<img class="submission-thumb" src="${escapeAttr(submission.image_url)}" alt="${escapeAttr(t("photo_submission_thumbnail_alt", "Guest-submitted dining photo"))}" loading="lazy" decoding="async">` : `<span class="muted">${escapeHtml(t("no_photo_label", "No photo"))}</span>`}</td>
              <td>
                ${escapeHtml(t("review_overall_label", "Overall"))}: ${escapeHtml(submission.rating || "N/A")}<br>
                ${escapeHtml(t("review_food_label", "Food"))}: ${escapeHtml(submission.food_rating || "N/A")}<br>
                ${escapeHtml(t("review_service_label", "Service"))}: ${escapeHtml(submission.service_rating || "N/A")}<br>
                ${escapeHtml(t("review_ambience_label", "Ambience"))}: ${escapeHtml(submission.ambience_rating || "N/A")}
              </td>
              <td>
                <strong>${escapeHtml(submission.ordered_items || "")}</strong>
                <p class="muted">${escapeHtml(submission.review || submission.short_review || "")}</p>
              </td>
              <td>${escapeHtml(submission.points_earned || submission.pointsEarned || 0)}</td>
              <td>${statusBadge(submission.moderation_status || "pending")}</td>
              <td>
                <div class="button-row">
                  <button class="ghost-button" data-photo-submission-id="${escapeAttr(submission.id || submission.submission_id)}" data-photo-submission-status="approved" type="button">Approve</button>
                  <button class="ghost-button danger" data-photo-submission-id="${escapeAttr(submission.id || submission.submission_id)}" data-photo-submission-status="rejected" type="button">Reject</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function saveContent() {
  try {
    const items = [...document.querySelectorAll(".content-row")].map((row) => ({
      key: row.dataset.key,
      group_name: row.dataset.group,
      content_type: row.dataset.type,
      value_en: row.querySelector('[data-field="value_en"]').value,
      value_es: row.querySelector('[data-field="value_es"]').value,
      value_hu: row.querySelector('[data-field="value_hu"]')?.value || ""
    }));
    await api("/admin/content", {
      method: "PATCH",
      body: JSON.stringify({ items })
    });
    await loadPublicContent();
    await loadAdminData();
    renderAdmin();
    showToast(t("content_saved_toast", "Content saved."));
  } catch (error) {
    showToast(error.message);
  }
}

async function saveContentModal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  try {
    await api("/admin/content", {
      method: "PATCH",
      body: JSON.stringify({
        key: form.dataset.key,
        group_name: form.dataset.group,
        content_type: form.dataset.type,
        value_en: data.value_en,
        value_es: data.value_es,
        value_hu: data.value_hu
      })
    });
    state.contentEditKey = null;
    await loadPublicContent();
    await loadAdminData();
    renderAdmin();
    showToast(t("content_saved_toast", "Content saved."));
  } catch (error) {
    showToast(error.message);
  }
}

async function runIntegrationAction(endpoint, provider, action, reload, render) {
  try {
    await api(endpoint, {
      method: "POST",
      body: JSON.stringify({ provider, action })
    });
    await reload();
    render();
    showToast(action === "disconnect" ? t("integration_disconnected_toast", "Integration disconnected.") : t("integration_status_updated_toast", "Integration status updated. Provider access may still be required."));
  } catch (error) {
    showToast(error.message);
  }
}

async function saveFeatureFlag(key) {
  const row = document.querySelector(`[data-feature-key="${CSS.escape(key)}"]`);
  if (!row) return;
  const status = row.querySelector('[data-field="status"]')?.value || "beta";
  const enabled = row.querySelector('[data-field="enabled"]')?.checked;
  const audience = row.querySelector('[data-field="audience"]')?.value || "all";
  const description = row.querySelector('[data-field="description"]')?.value || "";
  try {
    await api("/admin/feature-flags", {
      method: "PATCH",
      body: JSON.stringify({ key, status, enabled, audience, description })
    });
    await loadAdminData();
    renderAdmin();
    showToast(t("feature_status_saved_toast", "Feature status saved."));
  } catch (error) {
    showToast(error.message);
  }
}

async function savePlatformMode(event) {
  event.preventDefault();
  if (!isSuperAdmin()) {
    showToast(t("platform_mode_super_admin_only", "Only Super Admin can change the global platform mode."));
    return;
  }
  const data = formObject(event.currentTarget);
  const nextMode = normalizePlatformMode(data.platform_mode);
  if (nextMode !== currentPlatformMode()) {
    const message = contentTemplate("platformMode.switchConfirmation", "Switch the entire platform to {{mode}} mode?", { mode: platformModeLabel(nextMode) });
    if (!window.confirm(message)) return;
  }
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  try {
    setButtonPending(submitButton, true);
    await api("/admin/settings/platform-mode", {
      method: "PATCH",
      body: JSON.stringify({
        platform_mode: nextMode,
        ai_demo_visibility: data.ai_demo_visibility,
        show_ai_mode_badge: data.show_ai_mode_badge
      })
    });
    await loadPublicConfig();
    await loadPublicContent();
    await loadFeatureStatus();
    await loadAdminData();
    renderAdmin();
    showToast(contentTemplate("platformMode.switchSuccess", "Platform mode changed successfully to {{mode}}.", { mode: platformModeLabel(state.platformMode) }));
  } catch (error) {
    setButtonPending(submitButton, false);
    showToast(error.message);
  }
}

async function quickSwitchPlatformMode(mode) {
  if (!isSuperAdmin()) {
    showToast(t("platform_mode_super_admin_only", "Only Super Admin can change the global platform mode."));
    return;
  }
  const targetMode = normalizePlatformMode(mode);
  if (targetMode === currentPlatformMode()) return;
  const message = contentTemplate("platformMode.switchConfirmation", "Switch the entire platform to {{mode}} mode?", { mode: platformModeLabel(targetMode) });
  if (!window.confirm(message)) return;
  try {
    await api("/admin/settings/platform-mode", {
      method: "PATCH",
      body: JSON.stringify({
        platform_mode: targetMode,
        ai_demo_visibility: aiDemoVisibilityEnabled(),
        show_ai_mode_badge: publicAiBadgeEnabled()
      })
    });
    await loadPublicConfig();
    await loadPublicContent();
    await loadFeatureStatus();
    await loadAdminData();
    renderAdmin();
    showToast(contentTemplate("platformMode.switchSuccess", "Platform mode changed successfully to {{mode}}.", { mode: platformModeLabel(targetMode) }));
  } catch (error) {
    showToast(error.message);
  }
}

async function openGuestAiExperience() {
  if (!isAIConciergeMode()) {
    showToast(t("ai_preview_requires_mode", "Switch the platform to AI Concierge mode first."));
    return;
  }
  if (!canShowFeature("ai.concierge", { audience: "guest" })) {
    showToast(t("ai_preview_requires_demo", "Turn AI Demo Visibility On to show this preview."));
    return;
  }
  location.hash = "#ai-concierge";
  state.mode = "guest";
  await renderCurrentMode();
}

async function openPartnerAiDemandPreview() {
  if (!isAIConciergeMode()) {
    showToast(t("ai_preview_requires_mode", "Switch the platform to AI Concierge mode first."));
    return;
  }
  if (!canShowFeature("ai.partnerDemand", { audience: "partner" })) {
    showToast(t("ai_preview_requires_demo", "Turn AI Demo Visibility On to show this preview."));
    return;
  }
  const partner = state.partners?.[0];
  if (!partner) {
    showToast(t("partner_preview_missing", "Create or load a partner account before opening the Partner AI Demand preview."));
    return;
  }
  location.hash = "#partner-ai-demand";
  await viewAsPartner(partner.id);
  window.setTimeout(() => document.querySelector("#partner-ai-demand")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

async function submitRestaurant(event) {
  event.preventDefault();
  try {
    await api("/admin/restaurants", {
      method: "POST",
      body: JSON.stringify(formObject(event.currentTarget))
    });
    await loadAdminData();
    renderAdmin();
    showToast(t("restaurant_added_toast", "Restaurant added."));
  } catch (error) {
    showToast(error.message);
  }
}

async function submitPartner(event) {
  event.preventDefault();
  try {
    await api("/admin/partners", {
      method: "POST",
      body: JSON.stringify(formObject(event.currentTarget))
    });
    await loadAdminData();
    renderAdmin();
    showToast(t("partner_login_created_toast", "Partner login created."));
  } catch (error) {
    showToast(error.message);
  }
}

async function viewAsPartner(partnerId) {
  try {
    const adminSession = state.session;
    const payload = await api("/admin/impersonate-partner", {
      method: "POST",
      body: JSON.stringify({ partner_id: partnerId })
    });
    payload.profile.role = normalizeRole(payload.profile.role);
    state.originalAdminSession = adminSession;
    saveSession(payload);
    state.mode = "partner";
    await loadPartnerData();
    renderPartner();
    showToast(t("viewing_partner_dashboard_toast", "Viewing partner dashboard."));
  } catch (error) {
    showToast(error.message);
  }
}

async function returnToSuperAdmin() {
  if (!state.originalAdminSession) return;
  saveSession(state.originalAdminSession);
  state.originalAdminSession = null;
  state.mode = "admin";
  await loadAdminData();
  renderAdmin();
  showToast(t("returned_to_super_admin_toast", "Returned to Super Admin."));
}

async function approveRestaurant(id, button) {
  return updateRestaurantStatus(id, "approved", button);
}

async function updateRestaurantStatus(id, status, button = null) {
  if (status === "suspended" && !confirm(t("restaurant_suspend_confirm", "Suspend this restaurant? It will no longer appear publicly."))) return;
  try {
    setButtonPending(button, true);
    await api("/admin/restaurants", {
      method: "PATCH",
      body: JSON.stringify({ id, status })
    });
    await loadAdminData();
    renderAdmin();
    showToast(contentTemplate("restaurant_status_changed_toast", "Restaurant {{status}}.", { status }));
  } catch (error) {
    setButtonPending(button, false);
    showToast(error.message);
  }
}

async function saveRestaurantRow(id, button = null) {
  const row = document.querySelector(`[data-restaurant-row="${CSS.escape(id)}"]`);
  if (!row) return;
  const body = { id };
  row.querySelectorAll("[data-field]").forEach((input) => {
    body[input.dataset.field] = input.value;
  });
  try {
    setButtonPending(button, true);
    await api("/admin/restaurants", {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    await loadAdminData();
    renderAdmin();
    showToast(t("restaurant_saved_toast", "Restaurant saved."));
  } catch (error) {
    setButtonPending(button, false);
    showToast(error.message);
  }
}

async function markNotificationRead(id, readAll = false) {
  try {
    const payload = readAll ? { read_all: true } : { id };
    const response = await api("/admin/notifications", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    state.notifications = response.notifications || [];
    state.unreadNotifications = response.unread_count || 0;
    renderAdmin();
    showToast(t("notification_updated_toast", "Notification updated."));
  } catch (error) {
    showToast(error.message);
  }
}

async function updateReviewStatus(id, status) {
  try {
    await api("/admin/reviews", {
      method: "PATCH",
      body: JSON.stringify({ id, status })
    });
    await loadAdminData();
    renderAdmin();
    showToast(t("review_updated_toast", "Review updated."));
  } catch (error) {
    showToast(error.message);
  }
}

async function updatePhotoSubmissionStatus(id, status) {
  try {
    await api("/admin/photo-reward-submissions", {
      method: "PATCH",
      body: JSON.stringify({ id, status })
    });
    await loadAdminData();
    renderAdmin();
    showToast(t("photo_reward_submission_updated_toast", "Photo reward submission updated."));
  } catch (error) {
    showToast(error.message);
  }
}

async function loadPartnerData() {
  const aiEnabled = canShowFeature("ai.partnerDemand", { allowDemo: true });
  const [profile, offers, reservations, stats, forecast, recommendation, intelligence, feedback, integrations, imports] = await Promise.all([
    api("/partner/profile"),
    api("/partner/offers"),
    api(`/partner/reservations${queryStringFromFilters(state.partnerReservationFilters)}`),
    api("/partner/stats"),
    aiEnabled ? api("/ai/demand-forecast").catch(() => ({ forecast: null })) : Promise.resolve({ forecast: null }),
    aiEnabled ? api("/ai/recommendations/restaurant").catch(() => ({ recommendation: null })) : Promise.resolve({ recommendation: null }),
    aiEnabled ? api("/ai/restaurant-intelligence").catch(() => ({ summary: null })) : Promise.resolve({ summary: null }),
    api("/partner/photo-reward-submissions").catch(() => ({ submissions: [], insights: null })),
    aiEnabled ? api("/partner/integrations").catch(() => ({ providers: [], sync_runs: [], errors: [], import_jobs: [] })) : Promise.resolve({ providers: [], sync_runs: [], errors: [], import_jobs: [] }),
    aiEnabled ? api("/integrations/import-reservations").catch(() => ({ jobs: [], imported_reservations: [], manual_uploads: [] })) : Promise.resolve({ jobs: [], imported_reservations: [], manual_uploads: [] })
  ]);
  state.partnerProfile = profile.restaurant;
  state.offersMine = offers.offers || [];
  state.reservations = reservations.reservations || [];
  state.partnerStats = stats.stats || {};
  state.aiDemandForecast = forecast.forecast || null;
  state.partnerAiRecommendation = recommendation.recommendation || null;
  state.restaurantIntelligence = intelligence.summary || null;
  state.partnerPhotoSubmissions = feedback.submissions || [];
  state.partnerFeedbackInsights = feedback.insights || null;
  state.partnerIntegrations = integrations || null;
  state.partnerImports = imports || null;
}

function partnerKpiCards(stats, forecast) {
  return `
    <section class="stats-grid compact-stats premium-kpis" id="partner-stats">
      ${statCard(t("partner_kpi_views", "Views"), stats.views ?? 0)}
      ${statCard(t("partner_kpi_bookings", "Bookings"), stats.bookings ?? 0)}
      ${statCard(t("partner_kpi_accepted", "Accepted"), stats.accepted ?? 0)}
      ${statCard(t("partner_kpi_rejected", "Rejected"), stats.rejected ?? 0)}
      ${statCard(t("partner_kpi_favorites", "Favorites"), stats.favorites_total ?? 0)}
      ${statCard(t("partner_kpi_favorites_week", "Favorites this week"), stats.favorites_this_week ?? 0)}
      ${statCard(t("partner_kpi_favorites_month", "Favorites this month"), stats.favorites_this_month ?? 0)}
      ${statCard(t("partner_kpi_conversion", "Conversion rate"), `${stats.conversion_rate ?? 0}%`)}
      ${statCard(t("partner_kpi_revenue_recovered", "Revenue recovered"), formatMoney(stats.estimated_revenue_recovered ?? forecast.estimated_revenue_lift ?? 0))}
      ${statCard(t("partner_kpi_active_offers", "Active offers"), stats.active_offers ?? state.offersMine.filter((offer) => offer.status === "active").length)}
    </section>
  `;
}

function partnerAiOverview(stats = {}, forecast = {}) {
  const demandScore = Number(forecast.demand_score ?? 0);
  const confidence = Number(forecast.confidence_score ?? 55);
  const activeOffers = Number(stats.active_offers ?? state.offersMine.filter((offer) => offer.status === "active").length);
  const bookings = Number(stats.bookings ?? 0);
  const aiScore = Number(forecast.ai_score ?? Math.min(100, Math.round(demandScore * 0.58 + confidence * 0.26 + Math.min(100, activeOffers * 16 + bookings * 8) * 0.16)));
  const riskLevel = forecast.risk_level || (demandScore < 40 ? "High" : demandScore < 62 ? "Medium" : "Low");
  const opportunity = Number(forecast.revenue_opportunity_weekly ?? Math.max(forecast.estimated_revenue_lift || 0, Math.round((100 - demandScore) * 18 + activeOffers * 80)));
  const suggestedAction = forecast.ai_recommendation || (demandScore < 45
    ? `Open 2 more discounted tables Friday 6-8 PM at ${forecast.suggested_discount_percent || 20}%.`
    : demandScore > 78
      ? "Lower discounts and protect margin in prime dinner windows."
      : "Hold current strategy and monitor conversion.");
  return {
    aiScore,
    demandScore,
    revenueOpportunity: opportunity,
    riskLevel,
    suggestedAction,
    confidence,
    trend: forecast.trend || "flat"
  };
}

function partnerAiScoreCard(stats, forecast) {
  const overview = partnerAiOverview(stats, forecast);
  const scoreData = partnerAiMockData.restaurantAiScore || {};
  const aiScore = Math.round((Number(scoreData.total || overview.aiScore) + Number(overview.aiScore || 0)) / 2);
  const subscores = (scoreData.subscores || []).map((row) => {
    const dynamicBoost = row.key === "revenue" ? Math.min(7, Number(stats.bookings || 0)) : row.key === "guest_loyalty" ? Math.min(8, Number(stats.favorites_total || 0)) : 0;
    return { ...row, score: Math.max(0, Math.min(100, Number(row.score || 0) + dynamicBoost)) };
  });
  return `
    <section class="panel ai-score-card" id="partner-ai-score">
      <div class="ai-score-main">
        <span class="section-kicker">${escapeHtml(t("partner_ai_score_kicker", "Restaurant intelligence"))}</span>
        <h2>${escapeHtml(t("restaurant_ai_score_title", "Restaurant AI Score"))}</h2>
        <div class="ai-score-number"><strong>${escapeHtml(aiScore)}</strong><span>/100</span></div>
        <p>${escapeHtml(overview.suggestedAction)}</p>
      </div>
      <div class="ai-score-metrics">
        ${statCard(t("partner_demand_score", "Demand score"), `${overview.demandScore}/100`)}
        ${statCard(t("partner_revenue_opportunity_week", "Revenue opportunity"), `+${formatMoney(overview.revenueOpportunity)} ${t("this_week_label", "this week")}`)}
        ${statCard(t("partner_risk_level", "Risk level"), overview.riskLevel)}
        ${statCard(t("partner_confidence_label", "Confidence"), `${overview.confidence}%`)}
        ${statCard(t("partner_trend_label", "Trend"), overview.trend)}
      </div>
      <div class="ai-score-breakdown">
        ${subscores.map((row) => progressBarMini(t(`ai_subscore_${row.key}`, row.label), row.score, `${row.score}/100`)).join("")}
      </div>
      ${aiConfidenceExplanation(overview.confidence)}
    </section>
  `;
}

function ceoSummaryPanel(stats = {}, forecast = {}) {
  const restaurantName = state.partnerProfile?.name || t("partner_generic_name", "Partner");
  const ceo = partnerAiMockData.ceoSummary || {};
  const expectedGain = Math.max(Number(ceo.expectedGainToday || 0), Number(forecast.estimated_revenue_lift || 0), 310);
  const confidence = Number(ceo.confidence || forecast.confidence_score || 66);
  const revenueDirection = Number(ceo.revenueDeltaPercent || 0) >= 0 ? t("ceo_revenue_increased", "increased") : t("ceo_revenue_decreased", "decreased");
  return `
    <section class="panel ceo-summary-card" id="partner-ceo-summary">
      <div class="ceo-summary-copy">
        <span class="section-kicker">${escapeHtml(t("ceo_summary_kicker", "Executive AI Summary"))}</span>
        <h2>${escapeHtml(t("ceo_summary_title", "Today's CEO Summary"))}</h2>
        <p class="ceo-greeting">${escapeHtml(contentTemplate("ceo_summary_greeting", "Good morning, {{restaurant_name}}.", { restaurant_name: restaurantName }))}</p>
        <p>${escapeHtml(contentTemplate("ceo_summary_revenue", "Yesterday revenue {{direction}} by {{delta}}%.", {
          direction: revenueDirection,
          delta: Math.abs(Number(ceo.revenueDeltaPercent || -7))
        }))}</p>
        <p>${escapeHtml(ceo.demandSignal || t("ceo_opportunity_default", "Friday early dinner is below forecast."))}</p>
        <p>${escapeHtml(ceo.riskSignal || t("ceo_risk_default", "Rain may reduce demand around 6 PM."))}</p>
        <p><strong>${escapeHtml(t("partner_suggested_action", "Suggested action"))}:</strong> ${escapeHtml(ceo.recommendedAction || t("ceo_recommended_default", "Launch a 15% early dinner campaign."))}</p>
      </div>
      <div class="ceo-summary-metrics">
        ${statCard(t("ceo_expected_gain", "Expected gain today"), `+${formatMoney(expectedGain)}`)}
        ${statCard(t("partner_confidence_label", "AI confidence"), `${confidence}%`)}
        <button class="primary-button wide" data-partner-ai-action="ceo-recommendation" type="button">${escapeHtml(t("ceo_apply_button", "Apply CEO recommendation"))}</button>
      </div>
      ${aiConfidenceExplanation(confidence)}
    </section>
  `;
}

function ownerDashboardLevelHeader(kicker, title, body) {
  return `
    <header class="owner-level-header">
      <div>
        <span class="section-kicker">${escapeHtml(kicker)}</span>
        <h2>${escapeHtml(title)}</h2>
      </div>
      ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    </header>
  `;
}

function ownerTodayHeroPanel(stats = {}, forecast = {}) {
  const restaurantName = state.partnerProfile?.name || state.session?.profile?.full_name || t("partner_generic_name", "Partner");
  const ceo = partnerAiMockData.ceoSummary || {};
  const recommendation = state.partnerAiRecommendation || {};
  const expectedGain = Math.max(0, Number(recommendation.expected_revenue_lift || 0), Number(forecast.estimated_revenue_lift || 0), state.apiMode === "demo" ? 420 : 0);
  const confidence = Number(recommendation.confidence_score || forecast.confidence_score || (state.apiMode === "demo" ? 89 : 0));
  const demandScore = Number(forecast.demand_score || 56);
  const bookings = Number(stats.bookings || forecast.expected_bookings || 0);
  const guests = Number(forecast.expected_guests || Math.max(8, Math.round(Math.max(bookings, 3) * 2.4)));
  const recommendationText = recommendation.explanation?.why_recommended || forecast.ai_recommendation || t("owner_today_recommendation_copy", "Create a 15% early dinner offer and notify favorite guests.");
  const risk = ceo.riskSignal || t("owner_today_risk_copy", "Rain may reduce demand by 18% around 6 PM.");
  const opportunity = recommendation.explanation?.what_happened || t("owner_today_opportunity_copy", "Friday 5:30-7:00 PM has weak demand and recoverable tables.");
  const missingData = recommendation.missing_data || forecast.missing_data || [];
  return `
    <section class="panel owner-today-hero" id="partner-today-ceo">
      <div class="owner-hero-copy">
        <div class="status-title-row"><span class="section-kicker">${escapeHtml(t("owner_today_ceo_kicker", "AI CEO Dashboard"))}</span>${featureBadge("ai_demand_recommendations", state.apiMode === "demo" ? "demo_only" : "beta")}</div>
        <h2>${escapeHtml(t("owner_today_ceo_title", "Today's AI CEO Summary"))}</h2>
        <p class="owner-hero-message">${escapeHtml(contentTemplate("owner_today_ceo_message", "Good morning, {{restaurant_name}}. Friday 5:30-7:00 PM has weak demand. Rain may reduce demand by 18%. Recommended action: create a 15% early dinner offer and notify favorite guests. Expected gain today: +{{expected_gain}}. AI confidence: {{confidence}}%.", {
          restaurant_name: restaurantName,
          expected_gain: formatMoney(expectedGain),
          confidence
        }))}</p>
        <div class="owner-hero-actions">
          <button class="primary-button large-action" data-partner-ai-action="ceo-recommendation" type="button">${escapeHtml(t("owner_apply_ai_recommendation", "Apply AI Recommendation"))}</button>
          <button class="ghost-button" data-open-details="todayRecommendationWhy" type="button">${escapeHtml(t("owner_see_why", "See why"))}</button>
          <button class="ghost-button" data-partner-ai-action="edit-recommendation" type="button">${escapeHtml(t("owner_edit_before_applying", "Edit before applying"))}</button>
        </div>
        ${state.partnerAiActionNotice ? `<div class="ai-action-notice">${escapeHtml(state.partnerAiActionNotice)}</div>` : ""}
      </div>
      <div class="owner-hero-metrics">
        ${statCard(t("partner_demand_score", "Demand score"), `${demandScore}/100`)}
        ${statCard(t("partner_todays_bookings", "Today's bookings"), bookings || Math.max(3, Number(forecast.expected_bookings || 0)))}
        ${statCard(t("partner_expected_guests", "Expected guests"), guests)}
        ${statCard(t("ceo_expected_gain", "Expected gain today"), `+${formatMoney(expectedGain)}`)}
        ${statCard(t("owner_main_risk", "Main risk"), risk)}
        ${statCard(t("owner_main_opportunity", "Main opportunity"), opportunity)}
      </div>
      <details class="ai-explanation-box owner-why-box" id="todayRecommendationWhy">
        <summary>${escapeHtml(t("recommendation_why_title", "Why this recommendation?"))}</summary>
        <div class="owner-why-grid">
          <p><strong>${escapeHtml(t("owner_what_happened", "What happened"))}:</strong> ${escapeHtml(opportunity)}</p>
          <p><strong>${escapeHtml(t("owner_smarttable_recommends", "What SmartTable recommends"))}:</strong> ${escapeHtml(recommendationText)}</p>
          <p><strong>${escapeHtml(t("owner_expected_result", "Expected result"))}:</strong> ${escapeHtml(contentTemplate("owner_expected_gain_copy", "Recover approximately {{expected_gain}} today.", { expected_gain: formatMoney(expectedGain) }))}</p>
          <p><strong>${escapeHtml(t("partner_confidence_label", "Confidence"))}:</strong> ${escapeHtml(confidence)}%</p>
        </div>
        ${missingData.length ? `<p class="form-note"><strong>${escapeHtml(t("missing_data_label", "Data still missing"))}:</strong> ${escapeHtml(missingData.join(", "))}</p>` : ""}
        ${aiConfidenceExplanation(confidence)}
      </details>
    </section>
  `;
}

function ownerRecommendedActionPanel(stats = {}, forecast = {}) {
  const item = partnerRecommendationItems(stats, forecast)[0] || {};
  const recommendation = state.partnerAiRecommendation || {};
  const expectedGain = Math.max(0, Number(recommendation.expected_revenue_lift || 0), Number(forecast.estimated_revenue_lift || 0), state.apiMode === "demo" ? 420 : 0);
  const confidence = Number(recommendation.confidence_score || item.confidence || forecast.confidence_score || 0);
  const missingData = recommendation.missing_data || forecast.missing_data || [];
  return `
    <article class="panel owner-recommendation-panel" id="partner-recommended-action">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("owner_recommended_action_kicker", "Recommended AI action"))}</span>${featureBadge("ai_action_approval", state.apiMode === "demo" ? "demo_only" : "beta")}</div><h2>${escapeHtml(t("owner_recommended_action_title", "The one thing to do now"))}</h2></div>
        <button class="primary-button" data-partner-ai-action="ceo-recommendation" type="button">${escapeHtml(t("owner_apply_ai_recommendation", "Apply AI Recommendation"))}</button>
      </div>
      <div class="owner-recommendation-grid">
        <section>
          <span>${escapeHtml(t("owner_what_happened", "What happened"))}</span>
          <strong>${escapeHtml(item.title || "Friday early dinner is below normal.")}</strong>
          <p>${escapeHtml(item.reason || "Demand is pacing below forecast for the next recoverable window.")}</p>
        </section>
        <section>
          <span>${escapeHtml(t("owner_smarttable_recommends", "What SmartTable recommends"))}</span>
          <strong>${escapeHtml(item.action || "Create a 15% early dinner offer.")}</strong>
          <p>${escapeHtml(t("owner_notify_copy", "Notify favorite and VIP guests after the offer is activated."))}</p>
        </section>
        <section>
          <span>${escapeHtml(t("owner_expected_result", "Expected result"))}</span>
          <strong>+${escapeHtml(formatMoney(expectedGain))}</strong>
          <p>${escapeHtml(item.impact || "+4 bookings")}</p>
        </section>
        <section>
          <span>${escapeHtml(t("partner_confidence_label", "Confidence"))}</span>
          <strong>${escapeHtml(confidence)}%</strong>
          <p>${escapeHtml(t("owner_confidence_simple", "Strong enough for an owner decision, with deeper details below."))}</p>
        </section>
      </div>
      <details class="ai-explanation-box">
        <summary>${escapeHtml(t("recommendation_why_title", "Why this recommendation?"))}</summary>
        <ul>
          ${(item.why || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
          <li>${escapeHtml(t("owner_recommendation_reason_margin", "Discount stays inside restaurant margin guardrails."))}</li>
        </ul>
        ${missingData.length ? `<p class="form-note"><strong>${escapeHtml(t("missing_data_label", "Data still missing"))}:</strong> ${escapeHtml(missingData.join(", "))}</p>` : ""}
      </details>
    </article>
  `;
}

function ownerSmartTableValuePanel(stats = {}, forecast = {}) {
  const month = partnerAiMockData.monthlyRoi || {};
  const recovered = Math.max(Number(month.revenueRecovered || 0), Number(stats.estimated_revenue_recovered || forecast.estimated_revenue_lift || 0));
  return `
    <article class="panel owner-value-panel" id="partner-value-month">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("roi_kicker", "SmartTable ROI"))}</span><h2>${escapeHtml(t("owner_value_month_title", "SmartTable value this month"))}</h2></div>
      </div>
      <div class="owner-value-grid">
        ${statCard(t("roi_recovered", "Revenue recovered"), formatMoney(recovered))}
        ${statCard(t("roi_bookings_generated", "Bookings generated"), month.bookingsGeneratedByAi || 43)}
        ${statCard(t("roi_ai_actions_accepted", "AI actions accepted"), month.aiActionsAccepted || 17)}
        ${statCard(t("roi_percentage", "ROI"), `${formatNumber(month.roiPercentage || 2820)}%`)}
      </div>
    </article>
  `;
}

function partnerExecutiveSummaryPanel(stats = {}, forecast = {}) {
  const restaurantName = state.partnerProfile?.name || t("partner_generic_name", "Partner");
  const missedRevenue = Math.max(420, Math.round((100 - Number(forecast.demand_score || 48)) * 8.6));
  const recoverableRevenue = Math.max(310, Number(forecast.estimated_revenue_lift || 0));
  const actions = [
    [t("executive_action_lunch_offer", "Create 15% Lunch Offer"), "create-offer"],
    [t("executive_action_notify_favorites", "Notify favorite guests"), "notify-followers"],
    [t("executive_action_increase_dinner", "Increase early dinner availability"), "increase-availability"]
  ];
  return `
    <section class="panel executive-summary-card" id="partner-executive-summary">
      <div class="executive-copy">
        <span class="section-kicker">${escapeHtml(t("executive_kicker", "AI Revenue Operating System"))}</span>
        <h2>${escapeHtml(contentTemplate("executive_title", "Good morning, {{restaurant_name}}!", { restaurant_name: restaurantName }))}</h2>
        <p>${escapeHtml(t("executive_subtitle", "Your AI Revenue Manager has analyzed today's demand, guest behavior, weather, traffic, and booking signals."))}</p>
        <strong>${escapeHtml(contentTemplate("executive_message", "Yesterday you may have missed approximately {{missed_revenue}} because Friday lunch demand stayed below normal. Today SmartTable can help recover an estimated {{recoverable_revenue}} with the recommended actions below.", {
          missed_revenue: formatMoney(missedRevenue),
          recoverable_revenue: formatMoney(recoverableRevenue)
        }))}</strong>
      </div>
      <div class="executive-actions">
        ${actions.map(([label, action]) => `<button class="ghost-button" data-partner-ai-action="${escapeAttr(action)}" type="button">${escapeHtml(label)}</button>`).join("")}
        <button class="primary-button wide" data-partner-ai-action="apply-all" type="button">${escapeHtml(t("executive_apply_all", "Apply all recommendations"))}</button>
      </div>
    </section>
  `;
}

function dailyRevenueOpportunityPanel(stats = {}, forecast = {}) {
  const expectedBookings = Number(forecast.expected_bookings ?? Math.max(3, stats.bookings || 0));
  const expectedGuests = Number(forecast.expected_guests ?? Math.max(8, Math.round(expectedBookings * 2.4)));
  const recovered = Math.max(486, Number(stats.estimated_revenue_recovered ?? forecast.estimated_revenue_lift ?? 0));
  const opportunityPct = Math.min(98, Math.max(61, Number(forecast.confidence_score || 61) + 26));
  return `
    <article class="panel daily-opportunity-card" id="partner-daily-opportunity">
      <span class="section-kicker">${escapeHtml(t("daily_opportunity_kicker", "Daily Revenue Opportunity"))}</span>
      <h2>${escapeHtml(contentTemplate("daily_opportunity_title", "You can earn +{{amount}} today", { amount: formatMoney(recovered) }))}</h2>
      <div class="opportunity-meter">
        <span style="width:${opportunityPct}%"></span>
      </div>
      <p>${escapeHtml(t("daily_opportunity_percent", "Revenue opportunity"))}: <strong>${escapeHtml(opportunityPct)}%</strong></p>
      <div class="daily-opportunity-grid">
        ${statCard(t("partner_expected_bookings", "Expected bookings"), expectedBookings)}
        ${statCard(t("partner_expected_guests", "Expected guests"), expectedGuests)}
        ${statCard(t("partner_suggested_discount", "Suggested discount"), `${forecast.suggested_discount_percent ?? 15}%`)}
        ${statCard(t("estimated_recovered_revenue", "Estimated recovered revenue"), formatMoney(recovered))}
      </div>
    </article>
  `;
}

function signalStatusClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["good", "low", "normal"].includes(normalized)) return "good";
  if (["risk", "high", "critical"].includes(normalized)) return "risk";
  return "watch";
}

function miniSparkline(values = [], label = "Trend") {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return "";
  const width = 180;
  const height = 54;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const range = Math.max(1, max - min);
  const step = numeric.length > 1 ? width / (numeric.length - 1) : width;
  const points = numeric.map((value, index) => {
    const x = Math.round(index * step);
    const y = Math.round(height - ((value - min) / range) * (height - 10) - 5);
    return `${x},${y}`;
  }).join(" ");
  return `
    <svg class="mini-sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(label)}">
      <polyline points="${escapeAttr(points)}" fill="none" />
    </svg>
  `;
}

function circularScoreIndicator(score, label) {
  const value = Math.max(0, Math.min(100, Number(score || 0)));
  return `
    <div class="circular-score" style="--score:${value}">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function progressBarMini(label, value, detail = "") {
  const percent = Math.max(0, Math.min(100, Number(value || 0)));
  return `
    <div class="mini-progress-row">
      <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail || `${percent}%`)}</span></div>
      <div class="progress-track"><span style="width:${percent}%"></span></div>
    </div>
  `;
}

function statusChip(label, status) {
  const statusClass = signalStatusClass(status);
  return `<span class="status-chip ${escapeAttr(statusClass)}">${escapeHtml(label)}</span>`;
}

function aiConfidenceExplanation(confidence = 0) {
  const rows = partnerAiMockData.confidenceContributions || [];
  const total = rows.reduce((sum, row) => sum + Number(row.percent || 0), 0) || 100;
  return `
    <details class="ai-confidence-details">
      <summary>${escapeHtml(t("confidence_why_title", "Why this confidence?"))} <span>${escapeHtml(confidence)}%</span></summary>
      <div class="confidence-contribution-grid">
        ${rows.map((row) => {
          const percent = Math.round((Number(row.percent || 0) / total) * 100);
          return progressBarMini(t(`confidence_${String(row.label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`, row.label), percent, `${percent}%`);
        }).join("")}
      </div>
    </details>
  `;
}

function revenueComparisonChart(rows = []) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));
  return `
    <div class="revenue-bar-chart">
      ${rows.map((row) => {
        const width = Math.max(8, Math.round((Number(row.value || 0) / max) * 100));
        return `
          <div class="revenue-bar-row">
            <span>${escapeHtml(row.label)}</span>
            <div><i style="width:${width}%"></i></div>
            <strong>${escapeHtml(formatMoney(row.value || 0))}</strong>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function riskDashboardPanel(stats = {}, forecast = {}) {
  const risks = partnerAiMockData.riskScores || [];
  return `
    <article class="panel risk-dashboard-panel" id="partner-risk-dashboard">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("risk_kicker", "Revenue protection"))}</span><h2>${escapeHtml(t("ai_risk_score_title", "AI Risk Score"))}</h2></div>
      </div>
      <div class="risk-card-grid">
        ${risks.map((risk) => `
          <section class="risk-score-card ${escapeAttr(signalStatusClass(risk.level))}">
            <div>
              <strong>${escapeHtml(t(`risk_${risk.key}_label`, risk.label))}</strong>
              ${statusChip(t(`risk_level_${String(risk.level || "").toLowerCase()}`, risk.level), risk.level)}
            </div>
            <p>${escapeHtml(t(`risk_${risk.key}_explanation`, risk.explanation))}</p>
            <small><b>${escapeHtml(t("partner_suggested_action", "Suggested action"))}:</b> ${escapeHtml(t(`risk_${risk.key}_action`, risk.action))}</small>
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function scoreProgress(label, score) {
  const value = Math.max(0, Math.min(100, Number(score || 0)));
  return `
    <div class="health-row">
      <div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}/100</span></div>
      <div class="progress-track"><span style="width:${value}%"></span></div>
    </div>
  `;
}

function restaurantHealthScorePanel(stats = {}, forecast = {}) {
  const demand = Number(forecast.demand_score || 56);
  const components = [
    [t("health_revenue", "Revenue"), Math.max(90, Math.min(100, 88 + Number(stats.bookings || 0) * 2))],
    [t("health_guest_demand", "Guest Demand"), Math.max(78, Math.min(96, demand + 32))],
    [t("health_reputation", "Reputation"), Math.round(Math.max(90, Number(state.partnerProfile?.rating || 4.7) * 20))],
    [t("health_operations", "Operations"), 90],
    [t("health_ai_efficiency", "AI Efficiency"), Math.max(87, Number(forecast.confidence_score || 61) + 26)]
  ];
  const overall = Math.round(components.reduce((sum, [, score]) => sum + score, 0) / components.length);
  return `
    <article class="panel health-score-panel" id="partner-health-score">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("health_kicker", "Restaurant Health Score"))}</span><h2>${escapeHtml(t("health_title", "Restaurant Health Score"))}</h2></div>
        <div class="health-ring"><strong>${escapeHtml(overall)}</strong><span>/100</span></div>
      </div>
      <p class="muted">${escapeHtml(t("health_overall", "Overall Health"))}: <strong>${escapeHtml(overall)}/100</strong></p>
      <div class="health-score-list">
        ${components.map(([label, score]) => scoreProgress(label, score)).join("")}
      </div>
    </article>
  `;
}

function liveMarketSignalsPanel() {
  const signals = [
    [t("market_nearby_events", "Nearby events"), "watch"],
    [t("market_hotels", "Hotels"), "good"],
    [t("market_offices", "Offices"), "good"],
    [t("market_traffic", "Traffic"), "risk"],
    [t("market_subway", "Subway access"), "good"],
    [t("market_parking", "Parking"), "watch"],
    [t("market_competitors", "Competitors"), "watch"],
    [t("market_weather", "Weather"), "watch"]
  ];
  return `
    <article class="panel live-market-panel" id="partner-market-signals">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("market_kicker", "Market Signals"))}</span>${featureBadge("reservation_integrations", "requires_integration")}</div><h2>${escapeHtml(t("market_title", "Market Signals"))}</h2></div>
      </div>
      <div class="market-map-layout">
        <div class="market-map-placeholder">
          <span class="map-pulse one"></span>
          <span class="map-pulse two"></span>
          <span class="map-pulse three"></span>
          <strong>${escapeHtml(t("market_map_placeholder", "Neighborhood signal map"))}</strong>
          <small>${escapeHtml(t("market_map_note", "Google Maps and live provider layers are prepared for future integration."))}</small>
        </div>
        <div class="market-signal-list">
          ${signals.map(([label, status]) => {
            const statusClass = signalStatusClass(status);
            return `<span class="market-signal ${escapeAttr(statusClass)}"><strong>${escapeHtml(label)}</strong><em>${escapeHtml(t(`partner_planning_status_${statusClass}`, statusClass))}</em></span>`;
          }).join("")}
        </div>
      </div>
    </article>
  `;
}

function demandForecastTimelinePanel(forecast = {}) {
  const demand = Number(forecast.demand_score || 56);
  const points = [
    ["9 AM", t("timeline_rising", "Demand rising"), "good"],
    ["12 PM", t("timeline_normal", "Normal"), "watch"],
    ["3 PM", t("timeline_weak", "Weak"), demand < 60 ? "risk" : "watch"],
    ["5 PM", t("timeline_high", "High"), "good"],
    ["8 PM", t("timeline_peak", "Peak"), "good"],
    ["10 PM", t("timeline_drop", "Drop"), "risk"]
  ];
  return `
    <article class="panel forecast-timeline-panel" id="partner-demand-timeline">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("timeline_kicker", "AI Forecast Timeline"))}</span><h2>${escapeHtml(t("timeline_title", "Today's Demand Forecast"))}</h2></div>
      </div>
      <div class="forecast-timeline">
        ${points.map(([time, label, status]) => `
          <span class="timeline-point ${escapeAttr(status)}">
            <strong>${escapeHtml(time)}</strong>
            <em>${escapeHtml(label)}</em>
          </span>
        `).join("")}
      </div>
    </article>
  `;
}

function aiLearningConfidencePanel(forecast = {}) {
  const confidence = Number(forecast.confidence_score || 61);
  const items = [
    "42,813 reservations",
    "1.8M guest actions",
    t("learning_weather", "Weather patterns"),
    t("learning_traffic", "Traffic signals"),
    t("learning_seasonality", "Seasonality"),
    t("learning_holidays", "Holiday trends"),
    t("learning_competitors", "Competitor signals"),
    t("learning_events", "Local events")
  ];
  return `
    <article class="panel ai-confidence-panel" id="partner-ai-confidence">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("learning_kicker", "AI Learning"))}</span><h2>${escapeHtml(t("learning_title", "SmartTable AI has analyzed"))}</h2></div>
        <span class="confidence-badge">${escapeHtml(t("learning_confidence", "AI confidence today"))}: ${escapeHtml(confidence)}%</span>
      </div>
      <div class="learning-grid">
        ${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
      <div class="opportunity-meter confidence-meter"><span style="width:${Math.max(0, Math.min(100, confidence))}%"></span></div>
      ${aiConfidenceExplanation(confidence)}
    </article>
  `;
}

function smartTableRoiPanel(stats = {}, forecast = {}) {
  const month = partnerAiMockData.monthlyRoi || {};
  const withoutSmartTable = Math.max(9100, Number(forecast.expected_revenue_without_discount || 0) * 3 || 0);
  const recovered = Math.max(Number(month.revenueRecovered || 0), Number(forecast.estimated_revenue_lift || stats.estimated_revenue_recovered || 0) * 3 || 0);
  const subscriptionCost = Number(month.subscriptionCost || 199);
  const netGain = Math.max(0, Number(month.netGain || recovered - subscriptionCost));
  const withSmartTable = Math.max(11450, withoutSmartTable + recovered);
  const liftPct = Math.max(Number(month.roiPercentage || 0), Math.round((netGain / Math.max(1, subscriptionCost)) * 100));
  return `
    <article class="panel roi-dashboard-panel" id="partner-roi">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("roi_kicker", "SmartTable ROI"))}</span>${featureBadge("ai_action_approval", state.apiMode === "demo" ? "demo_only" : "beta")}</div><h2>${escapeHtml(t("roi_month_title", "SmartTable ROI This Month"))}</h2></div>
      </div>
      <div class="roi-compare">
        <div><span>${escapeHtml(t("roi_without", "Without SmartTable"))}</span><strong>${escapeHtml(formatMoney(withoutSmartTable))}</strong></div>
        <div><span>${escapeHtml(t("roi_with", "With SmartTable"))}</span><strong>${escapeHtml(formatMoney(withSmartTable))}</strong></div>
      </div>
      ${revenueComparisonChart([
        { label: t("roi_without", "Without SmartTable"), value: withoutSmartTable },
        { label: t("roi_with", "With SmartTable"), value: withSmartTable }
      ])}
      <div class="daily-opportunity-grid">
        ${statCard(t("roi_recovered", "Revenue recovered"), formatMoney(recovered))}
        ${statCard(t("roi_subscription_cost", "Subscription cost"), formatMoney(subscriptionCost))}
        ${statCard(t("roi_net_gain", "Net gain"), formatMoney(netGain))}
        ${statCard(t("roi_percentage", "ROI"), `${formatNumber(liftPct)}%`)}
        ${statCard(t("roi_ai_actions_accepted", "AI actions accepted"), month.aiActionsAccepted || 0)}
        ${statCard(t("roi_bookings_generated", "Bookings generated by AI actions"), month.bookingsGeneratedByAi || 0)}
      </div>
      <p class="form-note">${escapeHtml(state.apiMode === "demo" ? "Demo ROI values are seeded examples. Connect Supabase and measure AI action results for live ROI." : "ROI combines measured AI action results and current forecast data.")}</p>
    </article>
  `;
}

function portfolioViewPanel() {
  const rows = partnerAiMockData.portfolioRestaurants;
  const filter = state.partnerPortfolioFilter || "all";
  const filtered = filter === "all" ? rows : rows.filter((row) => row.status === filter || (filter === "risk" && row.health < 70));
  const filters = [
    ["all", t("portfolio_filter_all", "All")],
    ["strong", t("portfolio_filter_strong", "Strong")],
    ["needs-action", t("portfolio_filter_needs_action", "Needs action")],
    ["risk", t("portfolio_filter_risk", "Risk")]
  ];
  return `
    <article class="panel portfolio-panel" id="partner-portfolio">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("portfolio_kicker", "Multi-restaurant intelligence"))}</span>${featureBadge("marketplace_intelligence", "requires_more_data")}</div><h2>${escapeHtml(t("portfolio_title", "Portfolio View"))}</h2></div>
      </div>
      <div class="segmented-control">
        ${filters.map(([value, label]) => `<button class="${filter === value ? "active" : ""}" data-portfolio-filter="${escapeAttr(value)}" type="button">${escapeHtml(label)}</button>`).join("")}
      </div>
      <div class="portfolio-grid">
        ${filtered.map((row) => `
          <section class="portfolio-card ${escapeAttr(row.status)}">
            <div>
              <strong>${escapeHtml(row.name)}</strong>
              <span>${escapeHtml(row.trend)}</span>
            </div>
            <div class="portfolio-health">
              <b>${escapeHtml(row.health)}</b><small>${escapeHtml(t("portfolio_health_label", "Health"))}</small>
            </div>
          </section>
        `).join("")}
      </div>
      <p class="form-note">${escapeHtml(t("portfolio_note", "Demo portfolio structure for future franchise and multi-location owners."))}</p>
    </article>
  `;
}

function aiActionHistoryPanel() {
  const rows = [...(state.partnerAiActionHistory || []), ...(partnerAiMockData.actionHistory || [])].slice(0, 9);
  return `
    <article class="panel ai-action-history-panel" id="partner-action-history">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("action_history_kicker", "AI operating log"))}</span><h2>${escapeHtml(t("action_history_title", "AI Action History"))}</h2></div>
      </div>
      <div class="action-history-timeline">
        ${rows.map((row) => `
          <section class="action-history-item ${escapeAttr(signalStatusClass(row.status))}">
            <span>${escapeHtml(row.time)}</span>
            <div>
              <strong>${escapeHtml(t(`action_history_${String(row.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`, row.title))}</strong>
              <p>${escapeHtml(row.result)}</p>
            </div>
            ${statusChip(t(`action_status_${String(row.status || "").toLowerCase()}`, row.status), row.status)}
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function weeklyAiReportPanel() {
  const report = partnerAiMockData.weeklyReport || {};
  return `
    <article class="panel weekly-report-panel" id="partner-weekly-report">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("weekly_report_kicker", "Weekly operating review"))}</span><h2>${escapeHtml(t("weekly_report_title", "Weekly AI Report"))}</h2></div>
      </div>
      <div class="weekly-report-grid">
        ${statCard(t("weekly_recovered_revenue", "Total recovered revenue this week"), formatMoney(report.recoveredRevenue || 0))}
        ${statCard(t("weekly_best_campaign", "Best performing campaign"), report.bestCampaign || "N/A")}
        ${statCard(t("weekly_weakest_window", "Weakest time window"), report.weakestWindow || "N/A")}
        ${statCard(t("weekly_top_segment", "Top customer segment"), report.topCustomerSegment || "N/A")}
        ${statCard(t("weekly_biggest_risk", "Biggest risk"), report.biggestRisk || "N/A")}
        ${statCard(t("weekly_next_action", "Recommended next week action"), report.nextWeekAction || "N/A")}
      </div>
    </article>
  `;
}

function aiPricingEnginePanel(forecast = {}) {
  const current = Number(activePartnerOffer()?.discount_value || activePartnerOffer()?.discount_percent || 20);
  const recommended = Math.max(5, Math.min(50, Number(forecast.suggested_discount_percent || 18) - 2));
  return `
    <article class="panel ai-pricing-panel" id="partner-ai-pricing">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("pricing_kicker", "AI Pricing Engine"))}</span><h2>${escapeHtml(t("pricing_title", "AI Pricing Engine"))}</h2></div>
        <button class="primary-button" data-partner-ai-action="apply-pricing" type="button">${escapeHtml(t("pricing_apply", "Apply AI pricing"))}</button>
      </div>
      <div class="daily-opportunity-grid">
        ${statCard(t("pricing_current_discount", "Current discount"), `${current}%`)}
        ${statCard(t("pricing_recommended_discount", "Recommended discount"), `${recommended}%`)}
        ${statCard(t("pricing_margin_protection", "Margin protection"), t("pricing_margin_active", "Active"))}
        ${statCard(t("pricing_conversion_lift", "Expected conversion lift"), "+31%")}
        ${statCard(t("pricing_revenue_impact", "Expected revenue impact"), "+$310")}
      </div>
    </article>
  `;
}

function staffPlanningPanel(forecast = {}) {
  const guests = Math.max(42, Number(forecast.expected_guests || 0));
  return `
    <article class="panel ai-ops-panel" id="partner-staff-planning">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("staff_kicker", "AI Staff Planning"))}</span><h2>${escapeHtml(t("staff_title", "AI Staff Planning"))}</h2></div>
      </div>
      <div class="daily-opportunity-grid">
        ${statCard(t("staff_expected_guests", "Expected guests today"), guests)}
        ${statCard(t("staff_recommended_servers", "Recommended servers"), 3)}
        ${statCard(t("staff_host_coverage", "Recommended host coverage"), 1)}
        ${statCard(t("staff_peak_window", "Peak window"), "6:00 PM - 8:00 PM")}
        ${statCard(t("staff_risk", "Staffing risk"), t("risk_medium", "Medium"))}
      </div>
    </article>
  `;
}

function eventPredictionPanel() {
  return `
    <article class="panel ai-ops-panel" id="partner-event-prediction">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("event_prediction_kicker", "Nearby Event Prediction"))}</span><h2>${escapeHtml(t("event_prediction_title", "Nearby Event Prediction"))}</h2></div>
      </div>
      <div class="daily-opportunity-grid">
        ${statCard(t("event_local_impact", "Local event impact"), t("risk_medium", "Medium"))}
        ${statCard(t("event_traffic_lift", "Expected traffic lift"), "+14%")}
        ${statCard(t("event_best_window", "Best booking window"), "5:30 PM - 7:00 PM")}
      </div>
    </article>
  `;
}

function guestLifetimeValuePanel() {
  return `
    <article class="panel ai-ops-panel" id="partner-guest-ltv">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("ltv_kicker", "Guest Lifetime Value Intelligence"))}</span><h2>${escapeHtml(t("ltv_title", "Guest Lifetime Value Intelligence"))}</h2></div>
      </div>
      <div class="daily-opportunity-grid">
        ${statCard(t("ltv_average_guest_value", "Average guest value"), "$186")}
        ${statCard(t("ltv_returning_rate", "Returning guest rate"), "28%")}
        ${statCard(t("ltv_favorite_opportunity", "Favorite guest opportunity"), t("risk_high", "High"))}
        ${statCard(t("ltv_vip_potential", "VIP potential guests"), 14)}
      </div>
    </article>
  `;
}

function vipDetectionPanel() {
  return `
    <article class="panel ai-ops-panel" id="partner-vip-detection">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("vip_kicker", "AI VIP Detection"))}</span><h2>${escapeHtml(t("vip_title", "AI VIP Detection"))}</h2></div>
      </div>
      <div class="daily-opportunity-grid">
        ${statCard(t("vip_potential_week", "Potential VIP guests this week"), 14)}
        ${statCard(t("vip_high_value_repeat", "High-value repeat guests"), 7)}
      </div>
      <div class="ai-planning-note">
        <strong>${escapeHtml(t("partner_suggested_action", "Suggested action"))}</strong>
        <p>${escapeHtml(t("vip_suggested_action", "Send personalized offer"))}</p>
      </div>
    </article>
  `;
}

function marketingGeneratorPanel() {
  const message = state.partnerMarketingMessage || "Tonight only: enjoy 20% off your early dinner reservation at our restaurant. Limited tables available.";
  return `
    <article class="panel marketing-generator-panel" id="partner-marketing-generator">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("marketing_kicker", "AI Marketing Generator"))}</span>${featureBadge("ai_marketing_generator", state.apiMode === "demo" ? "demo_only" : "beta")}</div><h2>${escapeHtml(t("marketing_title", "AI Marketing Generator"))}</h2></div>
      </div>
      <textarea class="marketing-message-card" id="partnerMarketingMessage">${escapeHtml(message)}</textarea>
      <div class="button-row">
        <button class="primary-button" data-marketing-action="generate" type="button">${escapeHtml(t("marketing_generate", "Generate message"))}</button>
        <button class="ghost-button" data-marketing-action="send-favorites" type="button">${escapeHtml(t("marketing_send_favorites", "Send to favorites"))}</button>
        <button class="ghost-button" data-marketing-action="copy" type="button">${escapeHtml(t("marketing_copy", "Copy message"))}</button>
      </div>
    </article>
  `;
}

function competitorTrackerPanel(forecast = {}) {
  const data = partnerAiMockData.competitorTracker;
  const suggested = Number(forecast.suggested_discount_percent || data.yourSuggestedDiscount);
  return `
    <article class="panel ai-ops-panel visual-ai-panel" id="partner-competitor-tracker">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("competitor_kicker", "AI Competitor Tracker"))}</span><h2>${escapeHtml(t("competitor_title", "AI Competitor Tracker"))}</h2></div>
        ${statusChip(t("competitor_position_strong", data.competitivePosition), "good")}
      </div>
      <div class="visual-card-row">
        <div class="chart-card">
          ${miniSparkline(data.trend, t("competitor_trend_label", "Local competition trend"))}
          <span>${escapeHtml(t("competitor_trend_label", "Local competition trend"))}</span>
        </div>
        <div class="daily-opportunity-grid compact-grid">
          ${statCard(t("competitor_nearby_active", "Nearby competitors active"), data.nearbyCompetitorsActive)}
          ${statCard(t("competitor_avg_discount", "Average local discount"), `${data.averageLocalDiscount}%`)}
          ${statCard(t("competitor_your_discount", "Your suggested discount"), `${suggested}%`)}
          ${statCard(t("competitor_position", "Competitive position"), data.competitivePosition)}
        </div>
      </div>
    </article>
  `;
}

function menuEngineeringPanel() {
  const data = partnerAiMockData.menuEngineering;
  return `
    <article class="panel ai-ops-panel visual-ai-panel" id="partner-menu-engineering">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("menu_engineering_kicker", "AI Menu Engineering"))}</span><h2>${escapeHtml(t("menu_engineering_title", "AI Menu Engineering"))}</h2></div>
      </div>
      <div class="daily-opportunity-grid compact-grid">
        ${statCard(t("menu_best_margin", "Best margin item"), data.bestMarginItem)}
        ${statCard(t("menu_best_conversion", "Best conversion item"), data.bestConversionItem)}
        ${statCard(t("menu_weak_item", "Weak item"), data.weakItem)}
      </div>
      <div class="mini-progress-stack">
        ${data.marginMix.map((item) => progressBarMini(item.label, item.value)).join("")}
      </div>
      <div class="ai-planning-note">
        <strong>${escapeHtml(t("partner_suggested_action", "Suggested action"))}</strong>
        <p>${escapeHtml(t("menu_suggested_action", data.suggestedAction))}</p>
      </div>
    </article>
  `;
}

function dynamicPricingPanel() {
  const rows = partnerAiMockData.dynamicPricing;
  return `
    <article class="panel ai-ops-panel visual-ai-panel" id="partner-dynamic-pricing">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("dynamic_pricing_kicker", "AI Dynamic Pricing"))}</span><h2>${escapeHtml(t("dynamic_pricing_title", "AI Dynamic Pricing"))}</h2></div>
      </div>
      <div class="pricing-table" role="table" aria-label="${escapeAttr(t("dynamic_pricing_title", "AI Dynamic Pricing"))}">
        <div class="pricing-row head" role="row">
          <strong>${escapeHtml(t("pricing_window_label", "Window"))}</strong>
          <strong>${escapeHtml(t("pricing_discount_label", "Discount"))}</strong>
          <strong>${escapeHtml(t("pricing_demand_label", "Demand"))}</strong>
        </div>
        ${rows.map((row) => `
          <div class="pricing-row ${escapeAttr(row.status)}" role="row">
            <span>${escapeHtml(row.window)}</span>
            <strong>${escapeHtml(row.discount)}</strong>
            <div class="progress-track"><span style="width:${Math.max(0, Math.min(100, row.strength))}%"></span></div>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function partnerLoyaltyEnginePanel() {
  const data = partnerAiMockData.loyaltyEngine;
  return `
    <article class="panel ai-ops-panel visual-ai-panel" id="partner-loyalty-engine">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("loyalty_engine_kicker", "AI Loyalty Engine"))}</span><h2>${escapeHtml(t("loyalty_engine_title", "AI Loyalty Engine"))}</h2></div>
      </div>
      <div class="visual-card-row">
        <div class="chart-card">
          ${miniSparkline(data.returnReadiness, t("loyalty_return_readiness", "Return readiness"))}
          <span>${escapeHtml(t("loyalty_return_readiness", "Return readiness"))}</span>
        </div>
        <div class="daily-opportunity-grid compact-grid">
          ${statCard(t("loyalty_favorite_guests", "Favorite guests"), data.favoriteGuests)}
          ${statCard(t("loyalty_ready_to_return", "Guests ready to return"), data.guestsReadyToReturn)}
        </div>
      </div>
      <div class="ai-planning-note">
        <strong>${escapeHtml(t("loyalty_recommended_campaign", "Recommended campaign"))}</strong>
        <p>${escapeHtml(t("loyalty_campaign_example", data.recommendedCampaign))}</p>
      </div>
    </article>
  `;
}

function reviewAnalyzerPanel() {
  const data = partnerAiMockData.reviewAnalyzer;
  return `
    <article class="panel ai-ops-panel visual-ai-panel" id="partner-review-analyzer">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("review_analyzer_kicker", "AI Review Analyzer"))}</span><h2>${escapeHtml(t("review_analyzer_title", "AI Review Analyzer"))}</h2></div>
        ${statusChip(t("review_sentiment_positive", data.recentSentiment), "good")}
      </div>
      <div class="visual-card-row">
        <div class="chart-card">
          ${miniSparkline(data.sentimentTrend, t("review_sentiment_trend", "Sentiment trend"))}
          <span>${escapeHtml(t("review_sentiment_trend", "Sentiment trend"))}</span>
        </div>
        <div class="mini-progress-stack">
          ${progressBarMini(t("review_food_rating", "Food rating"), data.foodRating * 20, data.foodRating)}
          ${progressBarMini(t("review_service_rating", "Service rating"), data.serviceRating * 20, data.serviceRating)}
          ${progressBarMini(t("review_ambience_rating", "Ambience rating"), data.ambienceRating * 20, data.ambienceRating)}
        </div>
      </div>
      ${statCard(t("review_improvement_area", "Main improvement area"), data.mainImprovementArea)}
    </article>
  `;
}

function reputationMonitorPanel() {
  const data = partnerAiMockData.reputationMonitor;
  return `
    <article class="panel ai-ops-panel visual-ai-panel" id="partner-reputation-monitor">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("reputation_kicker", "AI Reputation Monitor"))}</span><h2>${escapeHtml(t("reputation_title", "AI Reputation Monitor"))}</h2></div>
      </div>
      <div class="visual-card-row">
        ${circularScoreIndicator(data.reputationScore, t("reputation_score_label", "Reputation"))}
        <div class="daily-opportunity-grid compact-grid">
          ${statCard(t("reputation_overall_rating", "Overall rating"), data.overallRating)}
          ${statCard(t("reputation_rating_trend", "Rating trend"), data.ratingTrend)}
          ${statCard(t("reputation_negative_risk", "Negative review risk"), data.negativeReviewRisk)}
          ${statCard(t("reputation_satisfaction", "Guest satisfaction"), data.guestSatisfaction)}
        </div>
      </div>
    </article>
  `;
}

function revenueForecastPanel(stats, forecast) {
  const expectedBookings = Number(forecast.expected_bookings ?? Math.max(1, stats.bookings || 0));
  const expectedGuests = Number(forecast.expected_guests ?? Math.max(2, Math.round(expectedBookings * 2.4)));
  const withoutAi = Number(forecast.expected_revenue_without_discount ?? expectedBookings * 85);
  const withAi = Number(forecast.expected_revenue_with_suggested_discount ?? Math.round(withoutAi * 1.18));
  const lift = Number(forecast.estimated_revenue_lift ?? Math.max(0, withAi - withoutAi));
  return `
    <article class="panel revenue-forecast-panel" id="partner-revenue-forecast">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("revenue_forecast_kicker", "Revenue forecast"))}</span><h2>${escapeHtml(t("revenue_forecast_title", "SmartTable revenue forecast"))}</h2></div>
      </div>
      <div class="revenue-forecast-grid">
        ${statCard(t("revenue_without_ai", "Revenue without AI"), formatMoney(withoutAi))}
        ${statCard(t("revenue_with_ai", "Revenue with AI"), formatMoney(withAi))}
        ${statCard(t("potential_lift", "Potential lift"), `+${formatMoney(lift)}`)}
        ${statCard(t("partner_expected_bookings", "Expected bookings"), expectedBookings)}
        ${statCard(t("partner_expected_guests", "Expected guests"), expectedGuests)}
        ${statCard(t("partner_suggested_discount", "Suggested discount"), `${forecast.suggested_discount_percent ?? 0}%`)}
        ${statCard(t("estimated_recovered_revenue", "Estimated recovered revenue"), formatMoney(stats.estimated_revenue_recovered ?? lift))}
      </div>
      ${revenueComparisonChart([
        { label: t("revenue_without_ai", "Revenue without AI"), value: withoutAi },
        { label: t("revenue_with_ai", "Revenue with AI"), value: withAi }
      ])}
      <p class="form-note">${escapeHtml(t("revenue_forecast_note", "This shows how SmartTable can recover otherwise quiet-table revenue while keeping discounts controlled."))}</p>
    </article>
  `;
}

function partnerRecommendationItems(stats = {}, forecast = {}) {
  const demand = Number(forecast.demand_score || 0);
  const discount = Number(forecast.suggested_discount_percent || 15);
  const favorites = Number(stats.favorites_total || 0);
  const activeOffers = state.offersMine.filter((offer) => offer.status === "active");
  const lateOffer = activeOffers.find((offer) => String(offer.start_time || offer.offer_time || "").startsWith("20"));
  return [
    {
      title: "Friday 6-8 PM is below normal.",
      reason: demand < 62 ? "Demand signals are not yet strong enough for prime conversion." : "Prime demand is stable, but early dinner still has recoverable capacity.",
      action: `Create a ${discount}% early dinner offer.`,
      impact: "+4 bookings",
      confidence: forecast.confidence_score || 66,
      button: t("partner_create_suggested_offer", "Create offer"),
      actionKey: "create-offer",
      why: [
        t("why_rain_after_8", "Rain starts after 8 PM"),
        t("why_conversion_improves", "Historical conversion improves by 31%"),
        t("why_nearby_event", "Nearby event may increase early dinner traffic"),
        t("why_parking_normal", "Parking availability is normal"),
        t("why_late_dinner_weak", "Late dinner demand is weak")
      ]
    },
    {
      title: "Your favorite guest audience is warm.",
      reason: favorites ? `${favorites} guests follow or favorited this restaurant.` : "Favorite/follower volume is still early, but the workflow is ready.",
      action: "Notify guests who favorited your restaurant.",
      impact: favorites ? `Reach ${favorites} interested guests` : "Build repeat demand",
      confidence: Math.max(52, Number(forecast.confidence_score || 60) - 6),
      button: t("partner_notify_favorite_guests", "Notify followers"),
      actionKey: "notify-followers",
      why: [
        t("why_favorites_intent", "Guests who favorited you have higher conversion intent"),
        t("why_warm_audience", "New offers perform better when sent to warm audiences"),
        t("why_no_personal_shared", "No personal behavior is shared with the restaurant"),
        t("why_notifications_recover", "Notifications can recover quiet-table demand")
      ]
    },
    {
      title: lateOffer ? "Your late dinner window has weak demand." : "Late dinner coverage is missing.",
      reason: lateOffer ? "Later windows usually need a sharper trigger than prime dinner." : "No active late dinner offer is available for flexible guests.",
      action: lateOffer ? "Raise discount for weak demand window." : "Create a late-window SmartTable offer.",
      impact: "+2 late bookings",
      confidence: 61,
      button: lateOffer ? t("partner_raise_discount", "Raise discount") : t("partner_create_suggested_offer", "Create offer"),
      actionKey: lateOffer ? "raise-discount" : "create-offer",
      why: [
        t("why_late_weaker", "Late dinner demand is weaker than early dinner"),
        t("why_flexible_value", "Flexible guests respond to sharper last-minute value"),
        t("why_traffic_drops", "Traffic pressure drops later in the evening"),
        t("why_guardrails", "Discounts stay inside restaurant-defined guardrails")
      ]
    },
    {
      title: "Protect margin when demand improves.",
      reason: demand >= 68 ? "Demand is strong enough to test a lower discount." : "Keep this ready for high-demand periods.",
      action: "Lower discount to protect margin.",
      impact: "+3-6% margin protection",
      confidence: demand >= 68 ? 72 : 54,
      button: t("partner_lower_discount", "Lower discount"),
      actionKey: "lower-discount",
      why: [
        t("why_high_demand_no_max", "High-demand windows do not need maximum incentives"),
        t("why_lower_first", "Guests can convert at a lower discount first"),
        t("why_margin_priority", "SmartTable prioritizes restaurant margin when demand rises"),
        t("why_increase_later", "Discounts can be increased later if conversion slows")
      ]
    }
  ];
}

function aiRecommendationFeed(stats, forecast, options = {}) {
  const limit = Number(options.limit || 0);
  const items = limit ? partnerRecommendationItems(stats, forecast).slice(0, limit) : partnerRecommendationItems(stats, forecast);
  const title = options.title || t("ai_recommendation_feed_title", "Recommended next moves");
  return `
    <article class="panel ai-recommendation-feed" id="partner-ai-feed">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("ai_recommendation_feed_kicker", "AI recommendation feed"))}</span>${demoBadge(t("platformMode.demo", "Demo"))}</div><h2>${escapeHtml(title)}</h2></div>
      </div>
      <div class="ai-feed-list">
        ${items.map((item) => `
          <section class="ai-feed-item">
            <div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.reason)}</p>
              <p><strong>${escapeHtml(t("partner_suggested_action", "Suggested action"))}:</strong> ${escapeHtml(item.action)}</p>
              <div class="tag-row">
                <span class="tag">${escapeHtml(t("expected_impact_label", "Expected impact"))}: ${escapeHtml(item.impact)}</span>
                <span class="tag">${escapeHtml(t("partner_confidence_label", "Confidence"))}: ${escapeHtml(item.confidence)}%</span>
              </div>
              <details class="ai-explanation-box">
                <summary>${escapeHtml(t("recommendation_why_title", "Why this recommendation?"))}</summary>
                <p>${escapeHtml(t("recommendation_why_intro", "We recommend this because:"))}</p>
                <ul>
                  ${(item.why || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
                </ul>
              </details>
              ${aiConfidenceExplanation(item.confidence)}
            </div>
            <button class="primary-button" data-partner-ai-action="${escapeAttr(item.actionKey)}" type="button">${escapeHtml(item.button)}</button>
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function partnerAiDemandEntryCard() {
  if (!canShowFeature("ai.partnerDemand", { audience: "partner" })) return "";
  return `
    <article class="panel partner-ai-entry-card">
      <div>
        <div class="status-title-row"><span class="section-kicker">SmartTable AI</span>${demoBadge(t("platformMode.demo", "Demo"))}</div>
        <h2>${escapeHtml(t("partner_ai_demand_entry_title", "AI Demand Intelligence"))}</h2>
        <p class="muted">${escapeHtml(t("partner_ai_demand_entry_body", "View predicted demand, weaker reservation periods and AI-generated offer opportunities."))}</p>
      </div>
      <a class="primary-button" href="#partner-ai-demand">${escapeHtml(t("open_ai_demand_button", "Open AI Demand"))}</a>
    </article>
  `;
}

function bookingHeatMapPanel(forecast) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const windows = ["Lunch", "Early dinner", "Prime dinner", "Late dinner"];
  const calendar = partnerAiMockData.demandCalendar || [];
  const base = Number(forecast.demand_score || 50);
  const fallbackCell = (dayIndex, windowIndex, day, windowLabel) => {
    const score = base + (dayIndex >= 4 ? 12 : 0) + (windowIndex === 2 ? 18 : 0) - (windowIndex === 3 ? 18 : 0) - (dayIndex === 6 && windowIndex === 3 ? 18 : 0) - (dayIndex === 0 ? 8 : 0);
    const status = score >= 78 ? "Strong" : score >= 55 ? "Normal" : "Weak";
    return {
      day,
      window: windowLabel,
      status,
      occupancy: Math.max(24, Math.min(98, score)),
      bookings: Math.max(1, Math.round(score / 10)),
      discount: status === "Strong" ? "0-10%" : status === "Normal" ? "10-15%" : "18-25%",
      revenueLift: Math.max(80, Math.round((100 - score) * 8))
    };
  };
  return `
    <article class="panel booking-heatmap-panel" id="partner-heatmap">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("booking_heatmap_kicker", "Demand calendar"))}</span><h2>${escapeHtml(t("demand_calendar_title", "Demand Calendar"))}</h2></div>
      </div>
      <div class="heatmap-grid">
        <span class="heatmap-corner"></span>
        ${windows.map((windowLabel) => `<strong>${escapeHtml(windowLabel)}</strong>`).join("")}
        ${days.map((day, dayIndex) => `
          <strong>${escapeHtml(day)}</strong>
          ${windows.map((windowLabel, windowIndex) => {
            const cell = calendar.find((item) => item.day === day && item.window === windowLabel) || fallbackCell(dayIndex, windowIndex, day, windowLabel);
            const statusClass = String(cell.status || "Normal").toLowerCase().replaceAll(" ", "-");
            return `
              <span class="heatmap-cell demand-calendar-cell ${escapeAttr(statusClass)}">
                <small>${escapeHtml(windowLabel)}</small>
                <b>${escapeHtml(t(`demand_status_${statusClass}`, cell.status))}</b>
                <em>${escapeHtml(t("demand_occupancy_label", "Occupancy"))}: ${escapeHtml(cell.occupancy)}%</em>
                <em>${escapeHtml(t("partner_expected_bookings", "Expected bookings"))}: ${escapeHtml(cell.bookings)}</em>
                <em>${escapeHtml(t("partner_suggested_discount", "Recommended discount"))}: ${escapeHtml(cell.discount)}</em>
                <em>${escapeHtml(t("partner_expected_revenue_lift", "Expected revenue lift"))}: ${escapeHtml(formatMoney(cell.revenueLift))}</em>
              </span>
            `;
          }).join("")}
        `).join("")}
      </div>
    </article>
  `;
}

function percentDiff(value, benchmark) {
  const base = Math.max(1, Number(benchmark || 1));
  const diff = Math.round(((Number(value || 0) - base) / base) * 100);
  return `${diff >= 0 ? "+" : ""}${diff}%`;
}

function benchmarkClass(value) {
  return String(value).startsWith("-") ? "down" : "up";
}

function restaurantBenchmarkPanel(stats = {}, forecast = {}) {
  const summary = state.restaurantIntelligence || {};
  const activeOffers = Math.max(1, Number(stats.active_offers || state.offersMine.filter((offer) => offer.status === "active").length || 1));
  const avgDiscount = averageLocal(state.offersMine.map((offer) => Number(offer.discount_value || offer.discount_percent || 0)).filter(Boolean)) || Number(forecast.suggested_discount_percent || 15);
  const rows = [
    [t("benchmark_bookings", "Bookings"), percentDiff(stats.bookings || 0, 7)],
    [t("benchmark_favorites", "Favorites"), percentDiff(stats.favorites_total || 0, 5)],
    [t("benchmark_rating", "Rating"), percentDiff(state.partnerProfile?.rating || summary.satisfaction_score || 4.6, 4.4)],
    [t("benchmark_service_duration", "Average service duration"), percentDiff(summary.average_dining_duration || state.partnerProfile?.average_service_minutes || 75, 82)],
    [t("benchmark_discount_performance", "Discount performance"), percentDiff(avgDiscount * activeOffers, 28)],
    [t("benchmark_conversion_rate", "Conversion rate"), percentDiff(stats.conversion_rate || 0, 8)]
  ];
  return `
    <article class="panel benchmark-panel" id="partner-benchmark">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("benchmark_kicker", "Restaurant benchmark"))}</span><h2>${escapeHtml(t("benchmark_title", "Compared to Similar Restaurants"))}</h2></div>
      </div>
      <div class="benchmark-grid">
        ${rows.map(([label, value]) => `
          <section class="benchmark-card ${escapeAttr(benchmarkClass(value))}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </section>
        `).join("")}
      </div>
      <p class="form-note">${escapeHtml(t("benchmark_note", "Benchmarks use anonymized category-level comparison data and demo estimates until live market analytics are connected."))}</p>
    </article>
  `;
}

function averageLocal(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function todayOverviewPanel(stats, forecast) {
  const today = new Date().toISOString().slice(0, 10);
  const todaysReservations = state.reservations.filter((row) => (row.reservation_date || row.offer_date) === today);
  const expectedGuests = todaysReservations.reduce((sum, row) => sum + Number(row.party_size || 0), 0);
  const activeToday = state.offersMine.filter((offer) => offer.status === "active" && (!offer.offer_date || offer.offer_date === today)).length;
  return `
    <article class="panel today-overview-panel" id="partner-today">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("partner_today_kicker", "Operations"))}</span><h2>${escapeHtml(t("partner_today_overview_title", "Today overview"))}</h2></div>
      </div>
      <div class="today-grid">
        ${statCard(t("partner_todays_bookings", "Today's bookings"), todaysReservations.length || Math.min(2, stats.bookings ?? 0))}
        ${statCard(t("partner_expected_guests", "Expected guests"), expectedGuests || Math.max(2, Math.min(12, (stats.bookings || 1) * 2)))}
        ${statCard(t("partner_today_active_offers", "Active offers"), activeToday || stats.active_offers || 0)}
        ${statCard(t("partner_demand_score", "Demand score"), forecast.demand_score ?? 0)}
        ${statCard(t("partner_suggested_discount", "Suggested discount"), `${forecast.suggested_discount_percent ?? 0}%`)}
      </div>
      <div class="ai-planning-note">
        <strong>${escapeHtml(t("partner_ai_recommendation_label", "AI recommendation"))}</strong>
        <p>${escapeHtml(forecast.ai_recommendation || t("partner_ai_recommendation_fallback", "Create a focused offer for the next lower-demand window and monitor conversion."))}</p>
      </div>
    </article>
  `;
}

function partnerAiActionsPanel(forecast) {
  return `
    <article class="panel ai-actions-panel" id="partner-ai-actions">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("partner_ai_actions_kicker", "Automation"))}</span><h2>${escapeHtml(t("partner_ai_actions_title", "One-click AI actions"))}</h2></div>
      </div>
      <div class="ai-action-grid">
        <button class="primary-button" data-partner-ai-action="apply-all" type="button">${escapeHtml(t("executive_apply_all", "Apply all recommendations"))}</button>
        <button class="primary-button" data-partner-ai-action="apply-best" type="button">${escapeHtml(t("partner_apply_best_recommendation", "Apply best recommendation"))}</button>
        <button class="ghost-button" data-partner-ai-action="create-offer" type="button">${escapeHtml(t("partner_create_suggested_offer", "Create suggested offer"))}</button>
        <button class="ghost-button" data-partner-ai-action="notify-followers" type="button">${escapeHtml(t("partner_notify_favorite_guests", "Notify favorite guests"))}</button>
        <button class="ghost-button" data-partner-ai-action="notify-vip" type="button">${escapeHtml(t("partner_notify_vip_guests", "Notify VIP guests"))}</button>
        <button class="ghost-button" data-partner-ai-action="generate-marketing" type="button">${escapeHtml(t("action_generate_marketing", "Generate marketing message"))}</button>
        <button class="ghost-button" data-partner-ai-action="create-social-post" type="button">${escapeHtml(t("action_create_social", "Create social post"))}</button>
        <button class="ghost-button" data-partner-ai-action="send-email-campaign" type="button">${escapeHtml(t("action_send_email_campaign", "Send email campaign"))}</button>
        <button class="ghost-button" data-partner-ai-action="optimize-pricing" type="button">${escapeHtml(t("action_optimize_pricing", "Optimize today's pricing"))}</button>
        <button class="ghost-button" data-partner-ai-action="pause-offer" type="button">${escapeHtml(t("partner_pause_low_offer", "Pause low-performing offer"))}</button>
        <button class="ghost-button" data-partner-ai-action="increase-availability" type="button">${escapeHtml(t("partner_increase_availability", "Increase availability"))}</button>
        <button class="ghost-button" data-partner-ai-action="lower-discount" type="button">${escapeHtml(t("partner_lower_discount", "Lower discount to protect margin"))}</button>
        <button class="ghost-button" data-partner-ai-action="raise-discount" type="button">${escapeHtml(t("partner_raise_discount", "Raise discount for weak demand"))}</button>
        <button class="ghost-button" data-partner-ai-action="reduce-prep" type="button">${escapeHtml(t("partner_reduce_weak_hour_prep", "Reduce weak-hour prep"))}</button>
      </div>
      ${state.partnerAiActionNotice ? `<div class="ai-action-notice">${escapeHtml(state.partnerAiActionNotice)}</div>` : ""}
      <p class="form-note">${escapeHtml(t("partner_current_recommendation", "Current recommendation"))}: ${escapeHtml(forecast.ai_recommendation || String(forecast.suggested_action || "hold_current_strategy").replaceAll("_", " "))}</p>
    </article>
  `;
}

function badgeClass(value) {
  if (["up", "good"].includes(value)) return "good";
  if (["down", "risk"].includes(value)) return "risk";
  return "watch";
}

function aiDemandPanel() {
  const forecast = state.aiDemandForecast || {};
  const inputs = forecast.inputs || {};
  const reasons = forecast.reasons || ["Weather impact", "Local event nearby", "Day of week", "Time of day", "Reservation history", "Offer conversion", "Competition level", "Traffic condition"];
  return `
    <article class="panel premium-demand-panel" id="partner-ai-demand">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">SmartTable AI</span>${demoBadge(t("platformMode.demo", "Demo"))}</div><h2>${escapeHtml(t("ai_demand_title", "Demand intelligence"))}</h2></div>
      </div>
      ${forecast.error ? `<div class="empty-state">${escapeHtml(forecast.error)}</div>` : `
        <div class="demand-hero-row">
          <div class="demand-score-badge">
            <span>${escapeHtml(t("partner_demand_score", "Demand score"))}</span>
            <strong>${escapeHtml(forecast.demand_score ?? 0)}</strong>
            <small>/100</small>
          </div>
          <div class="demand-badge-stack">
            <span class="insight-badge ${badgeClass(forecast.trend)}">${escapeHtml(t("partner_trend_label", "Trend"))} ${escapeHtml(forecast.trend || "flat")}</span>
            <span class="insight-badge good">${escapeHtml(t("partner_confidence_label", "Confidence"))} ${escapeHtml(forecast.confidence_score ?? 55)}%</span>
            <span class="insight-badge watch">${escapeHtml(forecast.confidence || "Directional")}</span>
          </div>
        </div>
        <div class="ai-demand-grid">
          ${statCard(t("partner_suggested_discount", "Suggested discount"), `${forecast.suggested_discount_percent ?? 0}%`)}
          ${statCard(t("partner_expected_bookings", "Expected bookings"), forecast.expected_bookings ?? 0)}
          ${statCard(t("partner_expected_revenue_lift", "Expected revenue lift"), formatMoney(forecast.estimated_revenue_lift ?? 0))}
        </div>
        <p class="muted"><strong>${escapeHtml(t("partner_suggested_action", "Suggested action"))}:</strong> ${escapeHtml(String(forecast.suggested_action || "hold_current_strategy").replaceAll("_", " "))}</p>
        <div class="revenue-compare-card">
          <div><span>${escapeHtml(t("partner_revenue_without_discount", "Without suggested discount"))}</span><strong>${escapeHtml(formatMoney(forecast.expected_revenue_without_discount ?? 0))}</strong></div>
          <div><span>${escapeHtml(t("partner_revenue_with_discount", "With suggested discount"))}</span><strong>${escapeHtml(formatMoney(forecast.expected_revenue_with_suggested_discount ?? 0))}</strong></div>
          <div><span>${escapeHtml(t("partner_revenue_lift", "Lift"))}</span><strong>${escapeHtml(formatMoney(forecast.estimated_revenue_lift ?? 0))}</strong></div>
        </div>
        <div class="tag-row reason-chip-row">
          ${reasons.map((reason) => `<span class="tag">${escapeHtml(reason)}</span>`).join("")}
          <span class="tag">${escapeHtml(inputs.reservations_7d ?? inputs.reservations ?? 0)} ${escapeHtml(t("partner_reservations_signal", "reservations signal"))}</span>
          <span class="tag">${escapeHtml(inputs.active_offers ?? 0)} ${escapeHtml(t("partner_active_offers_signal", "active offers"))}</span>
          <span class="tag">${escapeHtml(inputs.views ?? 0)} ${escapeHtml(t("partner_views_signal", "views"))}</span>
        </div>
        ${aiConfidenceExplanation(forecast.confidence_score ?? 55)}
      `}
    </article>
  `;
}

/**
 * @typedef {Object} FutureTimePlanningSignal
 * @property {string} key
 * @property {string} label
 * @property {"good"|"watch"|"risk"} status
 */
function futureTimePlanningPanel() {
  const forecast = state.aiDemandForecast || {};
  const risk = Number(forecast.demand_score || 0) < 45 ? "risk" : Number(forecast.demand_score || 0) > 72 ? "good" : "watch";
  /** @type {FutureTimePlanningSignal[]} */
  const chips = [
    { key: "weather", label: "Weather", status: "watch" },
    { key: "traffic", label: "Traffic", status: risk },
    { key: "parking", label: "Parking", status: "watch" },
    { key: "walking_time", label: "Walking time", status: "good" },
    { key: "transit", label: "Transit", status: "good" },
    { key: "nearby_events", label: "Nearby events", status: "watch" },
    { key: "service_duration", label: "Service duration", status: "good" },
    { key: "best_booking_windows", label: "Best booking windows", status: risk },
    { key: "risk_alerts", label: "Risk alerts", status: risk }
  ];
  return `
    <article class="panel future-planning-panel" id="partner-time-planning">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("partner_future_time_planning_kicker", "Planning intelligence"))}</span><h2>${escapeHtml(t("partner_future_time_planning_title", "Future Time Planning"))}</h2></div>
      </div>
      <p class="muted">${escapeHtml(t("partner_future_time_planning_alert", "Rain expected around 6 PM. Demand may drop by 18%. Recommend 20% discount between 5:30 PM and 7:00 PM."))}</p>
      <div class="planning-chip-grid">
        ${chips.map((signal) => `<span class="planning-chip ${escapeAttr(signal.status)}"><strong>${escapeHtml(t(`partner_planning_${signal.key}`, signal.label))}</strong><small>${escapeHtml(t(`partner_planning_status_${signal.status}`, signal.status))}</small></span>`).join("")}
      </div>
    </article>
  `;
}

const advisorSuggestedPrompts = [
  "How can I increase bookings tomorrow?",
  "What discount should I use tonight?",
  "Why is demand low?",
  "Which offer performs best?"
];

function advisorSeedMessages() {
  return [{
    role: "assistant",
    text: "Hi, I am SmartTable AI Advisor. Ask me about demand, discounts, offers, or tomorrow's booking strategy."
  }];
}

function advisorAnswer(question) {
  const stats = state.partnerStats || {};
  const forecast = state.aiDemandForecast || {};
  const offers = state.offersMine || [];
  const lower = question.toLowerCase();
  const bookings = Number(stats.bookings || 0);
  const views = Number(stats.views || 0);
  const favorites = Number(stats.favorites_total || 0);
  const demand = Number(forecast.demand_score || 0);
  const suggested = Number(forecast.suggested_discount_percent || 20);
  const activeOffers = offers.filter((offer) => offer.status === "active");
  const bestOffer = [...activeOffers].sort((a, b) => Number(b.discount_value || b.discount_percent || 0) - Number(a.discount_value || a.discount_percent || 0))[0];

  if (lower.includes("tomorrow") || lower.includes("increase")) {
    if (!activeOffers.length) return `Create one focused offer for tomorrow between 5:30 PM and 7:00 PM at ${suggested || 20}%. Your current demand score is ${demand}/100, so SmartTable should create urgency without over-discounting.`;
    return `For tomorrow, keep your strongest active offer visible and add one early-window offer at ${suggested || 15}%. You have ${views} views and ${favorites} followers/favorites, so the fastest win is notifying interested guests and tightening the booking window.`;
  }
  if (lower.includes("discount") || lower.includes("tonight")) {
    if (demand >= 70) return `Demand is strong at ${demand}/100. Use 0-10% tonight, or hold current pricing if tables are moving. Protect margin first.`;
    if (demand <= 45) return `Demand is soft at ${demand}/100. I would test ${Math.max(20, suggested)}% for a narrow 90-minute window, then reduce it once bookings start.`;
    return `Use ${suggested || 15}% tonight. The signal is directional, so keep the offer narrow and watch conversion.`;
  }
  if (lower.includes("why") || lower.includes("low")) {
    const reasons = (forecast.reasons || ["Low recent views", "Offer conversion", "Day of week", "Competition level"]).join(", ");
    return `Demand is likely low because of: ${reasons}. Current views are ${views}, bookings are ${bookings}, and active offers are ${activeOffers.length}. I would improve the offer title, add a better hero image, and test one sharper time window.`;
  }
  if (lower.includes("best") || lower.includes("perform")) {
    if (!bestOffer) return "There is no active offer performance signal yet. Create one offer with a clear title, limited tables, and a controlled discount so SmartTable can compare conversion.";
    return `${bestOffer.title_en || "Your top active offer"} is the best candidate right now because it has the strongest discount signal (${bestOffer.discount_value || bestOffer.discount_percent || 0}%) and active availability. Add notes or reduce tables to make it feel more limited.`;
  }
  return `Based on ${views} views, ${bookings} bookings, ${favorites} favorites, ${activeOffers.length} active offers, and a ${demand}/100 demand score, my recommendation is: use a controlled ${suggested || 15}% offer in the next weak window, keep the best-performing offer active, and monitor conversion after the next 25-50 views.`;
}

function partnerAdvisorWidget() {
  const messages = state.advisorMessages.length ? state.advisorMessages : advisorSeedMessages();
  return `
    <aside class="advisor-widget ${state.advisorOpen ? "open" : ""}" aria-live="polite">
      <button class="advisor-launcher" data-advisor-toggle type="button">
        <span>AI</span>
        <strong>${escapeHtml(t("advisor_name", "SmartTable AI Advisor"))}</strong>
      </button>
      ${state.advisorOpen ? `
        <section class="advisor-drawer">
          <div class="advisor-head">
            <div>
              <span class="section-kicker">SmartTable AI</span>
              <h2>${escapeHtml(t("advisor_name", "SmartTable AI Advisor"))}</h2>
            </div>
            <button class="icon-button" data-advisor-toggle type="button" aria-label="${escapeAttr(t("modal_cancel_label", "Cancel"))}">X</button>
          </div>
          <div class="advisor-messages">
            ${messages.map((message) => `<div class="advisor-bubble ${escapeAttr(message.role)}">${escapeHtml(message.text)}</div>`).join("")}
            ${state.advisorTyping ? `<div class="advisor-bubble assistant typing">${escapeHtml(t("advisor_typing", "SmartTable is thinking..."))}</div>` : ""}
          </div>
          <div class="advisor-prompts">
            ${advisorSuggestedPrompts.map((prompt) => `<button class="ghost-button" data-advisor-prompt="${escapeAttr(prompt)}" type="button">${escapeHtml(prompt)}</button>`).join("")}
          </div>
          <form class="advisor-form" id="advisorForm">
            <input id="advisorInput" name="question" placeholder="${escapeAttr(t("advisor_placeholder", "Ask about demand, discounts, offers..."))}" autocomplete="off">
            <button class="primary-button" type="submit">${escapeHtml(t("advisor_send", "Send"))}</button>
          </form>
          <p class="form-note">${escapeHtml(t("advisor_future_note", "Demo advisor now. OpenAI/API integration layer is prepared for later."))}</p>
        </section>
      ` : ""}
    </aside>
  `;
}

function sendAdvisorQuestion(question) {
  const text = cleanQuestion(question);
  if (!text || state.advisorTyping) return;
  if (!state.advisorMessages.length) state.advisorMessages = advisorSeedMessages();
  state.advisorMessages.push({ role: "user", text });
  state.advisorTyping = true;
  state.advisorOpen = true;
  renderPartner();
  window.setTimeout(() => {
    state.advisorMessages.push({ role: "assistant", text: advisorAnswer(text) });
    state.advisorTyping = false;
    renderPartner();
  }, 650);
}

function cleanQuestion(value) {
  return String(value || "").trim().slice(0, 240);
}

function restaurantIntelligencePanel() {
  const summary = state.restaurantIntelligence || {};
  const trends = [
    ...(summary.top_dishes || []),
    ...(summary.most_uploaded_drinks || []),
    ...(summary.top_trends || [])
  ].slice(0, 10);
  return `
    <article class="panel" id="partner-intelligence">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("consumer_intelligence_kicker", "Consumer intelligence"))}</span><h2>${escapeHtml(t("ai_business_intelligence_title", "Restaurant intelligence"))}</h2></div>
      </div>
      ${summary.error ? `<div class="empty-state">${escapeHtml(summary.error)}</div>` : `
        <div class="ai-demand-grid">
          ${statCard(t("consumer_uploaded_photo_count", "Uploaded photo count"), summary.uploaded_photo_count ?? summary.photos_total ?? 0)}
          ${statCard(t("photo_points_label", "Photo points"), summary.loyalty_points_awarded ?? 0)}
          ${statCard(t("average_duration_label", "Avg duration"), summary.average_dining_duration ? `${summary.average_dining_duration} min` : "N/A")}
          ${statCard(t("benchmark_rating", "Rating"), summary.satisfaction_score ? `${summary.satisfaction_score}/5` : "N/A")}
          ${statCard(t("partner_kpi_favorites", "Favorites"), summary.followers_total ?? 0)}
          ${statCard(t("partner_kpi_bookings", "Bookings"), summary.reservations_total ?? 0)}
        </div>
        <div class="tag-row intelligence-tags">
          ${trends.map((item) => `<span class="tag">${escapeHtml(item.label)} ${escapeHtml(item.count)}</span>`).join("") || `<span class="tag">${escapeHtml(t("consumer_no_trends_yet", "No trend data yet"))}</span>`}
        </div>
        <p class="form-note">${escapeHtml(t("ai_privacy_note", "Only aggregated, anonymized analytics are shared with restaurants. Personal behavior is never exposed."))}</p>
      `}
    </article>
  `;
}

function feedbackRating(value) {
  const number = Number(value || 0);
  return number ? `${number.toFixed(number % 1 ? 1 : 0)}/5` : "N/A";
}

function feedbackIntelligenceSummary(submissions = []) {
  const mock = partnerAiMockData.feedbackIntelligence || {};
  const reviews = submissions.map((item) => `${item.short_review || item.review || ""} ${item.description || ""} ${item.liked_highlight || ""}`.toLowerCase()).join(" ");
  const positiveVocabulary = ["warm", "excellent", "smooth", "fresh", "great", "friendly", "delicious", "attentive", "cozy", "fast"];
  const negativeVocabulary = ["wait", "slow", "noise", "cold", "crowded", "late", "expensive"];
  const countWords = (words) => words
    .map((word) => ({ word, count: (reviews.match(new RegExp(`\\b${word}\\b`, "g")) || []).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((item) => item.word);
  const recommendRows = submissions.filter((item) => item.would_recommend);
  const returnRows = submissions.filter((item) => item.would_return);
  const recommendYes = recommendRows.filter((item) => String(item.would_recommend).toLowerCase() === "yes").length;
  const returnYes = returnRows.filter((item) => String(item.would_return).toLowerCase() === "yes").length;
  const photographed = submissions
    .filter((item) => item.image_url)
    .flatMap((item) => splitCommaList(item.ordered_items).concat(item.detected_dish || [], item.detected_drink || []))
    .filter(Boolean)
    .slice(0, 4);
  return {
    mostPhotographedDishes: photographed.length ? photographed : mock.mostPhotographedDishes || ["Handmade pasta", "Chocolate dessert", "Wine by the glass"],
    positiveWords: countWords(positiveVocabulary).length ? countWords(positiveVocabulary) : mock.positiveWords || ["warm", "excellent", "smooth"],
    negativeWords: countWords(negativeVocabulary).length ? countWords(negativeVocabulary) : mock.negativeWords || ["wait", "noise"],
    wouldRecommendPercent: recommendRows.length ? Math.round((recommendYes / recommendRows.length) * 100) : mock.wouldRecommendPercent || 0,
    wouldReturnPercent: returnRows.length ? Math.round((returnYes / returnRows.length) * 100) : mock.wouldReturnPercent || 0,
    repeatIntentSignal: mock.repeatIntentSignal || "Strong",
    satisfactionTrend: mock.satisfactionTrend || "Improving"
  };
}

function partnerPostVisitFeedbackPanel() {
  const submissions = state.partnerPhotoSubmissions || [];
  const insights = state.partnerFeedbackInsights || {};
  const guestIntel = feedbackIntelligenceSummary(submissions);
  const insightRows = [
    [t("feedback_most_photographed", "Most photographed dishes"), guestIntel.mostPhotographedDishes.join(", ")],
    [t("feedback_positive_words", "Most mentioned positive words"), guestIntel.positiveWords.join(", ")],
    [t("feedback_negative_words", "Most mentioned negative words"), guestIntel.negativeWords.join(", ")],
    [t("feedback_recommend_percent", "Would recommend %"), `${guestIntel.wouldRecommendPercent}%`],
    [t("feedback_return_percent", "Would return %"), `${guestIntel.wouldReturnPercent}%`],
    [t("repeat_intent_signal_label", "Repeat intent signal"), guestIntel.repeatIntentSignal],
    [t("guest_satisfaction_trend_label", "Guest satisfaction trend"), guestIntel.satisfactionTrend],
    [t("popular_dishes_label", "Popular dishes"), insights.popular_dishes || "Pasta, steak, wine"],
    [t("weak_service_signals_label", "Weak service signals"), insights.weak_service_signals || "No weak service signal detected"],
    [t("ambience_sentiment_label", "Ambience sentiment"), insights.ambience_sentiment || "Positive"],
    [t("photo_engagement_label", "Photo engagement"), insights.photo_engagement || "Demo feedback photo engagement is available"]
  ];
  return `
    <article class="panel post-visit-feedback-panel" id="partner-post-visit-feedback">
      <div class="section-title-row compact">
        <div>
          <span class="section-kicker">${escapeHtml(t("booking_completed_event", "Booking completed"))}</span>
          <h2>${escapeHtml(t("partner_post_visit_feedback_title", "Post-Visit Guest Feedback"))}</h2>
        </div>
      </div>
      <p class="ai-learning-copy">${escapeHtml(isBasicMode()
        ? t("partner_post_visit_basic_note", "Guest-submitted photos, reviews, ordered items, and ratings are shown as aggregated feedback after moderation.")
        : t("partner_post_visit_ai_learning", "Guest-submitted photos, reviews, ordered items, and ratings help SmartTable learn real dining preferences and improve future recommendations."))}</p>
      ${canShowFeature("ai.partnerDemand", { allowDemo: true }) ? `<section class="feedback-insights-block">
        <div class="section-title-row compact">
          <div><span class="section-kicker">SmartTable AI</span><h3>${escapeHtml(t("post_visit_ai_insights_title", "AI Insights from guest feedback"))}</h3></div>
        </div>
        <div class="feedback-insight-grid">
          ${insightRows.map(([label, value]) => `
            <div class="feedback-insight-card">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `).join("")}
        </div>
      </section>` : ""}
      ${submissions.length ? `
        <div class="feedback-card-grid">
          ${submissions.map((submission) => `
            <article class="feedback-card">
              <div class="feedback-card-head">
                <div>
                  <strong>${escapeHtml(t("anonymous_feedback_label", "Anonymized guest feedback"))}</strong>
                  <span class="muted">${escapeHtml(t("approved_visit_signal", "Approved SmartTable visit signal"))}</span>
                </div>
                ${statusBadge(submission.moderation_status || "pending")}
              </div>
              <div class="feedback-rating-grid">
                ${statCard(t("review_overall_label", "Overall rating"), feedbackRating(submission.rating))}
                ${statCard(t("review_food_label", "Food"), feedbackRating(submission.food_rating))}
                ${statCard(t("review_service_label", "Service"), feedbackRating(submission.service_rating))}
                ${statCard(t("review_ambience_label", "Ambience"), feedbackRating(submission.ambience_rating))}
              </div>
              <p class="feedback-review">"${escapeHtml(submission.short_review || submission.review || t("no_review_text", "No short review yet."))}"</p>
              <dl class="feedback-detail-list">
                <div><dt>${escapeHtml(t("ordered_items_label", "What did you order?"))}</dt><dd>${escapeHtml(submission.ordered_items || "N/A")}</dd></div>
                <div><dt>${escapeHtml(t("would_recommend_label", "Would you recommend this restaurant?"))}</dt><dd>${escapeHtml(submission.would_recommend || "N/A")}</dd></div>
                <div><dt>${escapeHtml(t("would_return_label", "Would you return?"))}</dt><dd>${escapeHtml(submission.would_return || "N/A")}</dd></div>
              </dl>
              ${submission.image_url ? `<img class="feedback-photo" src="${escapeAttr(submission.image_url)}" alt="${escapeAttr(submission.uploaded_file_name || t("guest_dining_photo_alt", "Guest dining photo"))}" loading="lazy" decoding="async">` : `<div class="feedback-photo placeholder">${escapeHtml(t("photo_upload_label", "Photo upload"))}</div>`}
              <div class="tag-row">
                ${(submission.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
                ${submission.points_earned ? `<span class="tag">${escapeHtml(submission.points_earned)} pts</span>` : ""}
              </div>
            </article>
          `).join("")}
        </div>
      ` : `
        <div class="empty-state">${escapeHtml(t("partner_post_visit_empty", "No post-visit feedback yet. Completed bookings will invite guests to rate their visit and upload photos for loyalty points."))}</div>
      `}
      <p class="form-note">${escapeHtml(t("partner_guest_intel_privacy_note", "Only aggregated, anonymized analytics are shared with restaurants. Personal guest behavior is never exposed."))}</p>
    </article>
  `;
}

function partnerTodayOffersPanel() {
  const activeOffers = state.offersMine.filter((offer) => offer.status === "active").slice(0, 4);
  return `
    <article class="panel today-operational-panel" id="partner-today-offers">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("partner_nav_offers", "Offers"))}</span>${featureBadge("guest_booking_leads", "live")}</div><h2>${escapeHtml(t("today_active_offers_title", "Active offers"))}</h2></div>
        <a class="ghost-button" href="#partner-deals">${escapeHtml(t("manage_offers_button", "Manage offers"))}</a>
      </div>
      ${activeOffers.length ? `
        <div class="today-list">
          ${activeOffers.map((offer) => `
            <section class="today-list-item">
              <div>
                <strong>${escapeHtml(offer.title_en || offer.title || "SmartTable offer")}</strong>
                <span>${escapeHtml(formatDate(offer.offer_date, offer.start_time || offer.offer_time, offer.end_time))}</span>
              </div>
              <div class="today-list-meta">
                <b>${escapeHtml(discountLabel(offer))}</b>
                <small>${escapeHtml(offer.available_tables || offer.seat_count || 0)} tables</small>
              </div>
            </section>
          `).join("")}
        </div>
      ` : `<div class="empty-state">${escapeHtml(isBasicMode() ? t("today_offers_empty_basic", "No active offers right now. Create a discounted table offer to appear on the public marketplace.") : t("today_offers_empty", "No active offers right now. Create one from Settings or apply the AI recommendation."))}</div>`}
    </article>
  `;
}

function partnerTodayReservationLeadsPanel() {
  const rows = state.reservations.slice(0, 5);
  const pendingCount = state.reservations.filter((row) => ["pending", "requested"].includes(String(row.status))).length;
  return `
    <article class="panel today-operational-panel" id="partner-today-reservation-leads">
      <div class="section-title-row compact">
        <div><div class="status-title-row"><span class="section-kicker">${escapeHtml(t("partner_nav_reservations", "Reservations"))}</span>${featureBadge("guest_booking_leads", "live")}</div><h2>${escapeHtml(t("today_reservation_leads_title", "Reservation leads"))}</h2></div>
        <a class="ghost-button" href="#partner-reservations">${escapeHtml(t("manage_reservations_button", "Manage reservations"))}</a>
      </div>
      <div class="owner-value-grid compact-grid">
        ${statCard(t("reservations_pending_label", "Pending"), pendingCount)}
        ${statCard(t("partner_kpi_bookings", "Bookings"), state.partnerStats?.bookings ?? state.reservations.length)}
      </div>
      ${rows.length ? `
        <div class="today-list">
          ${rows.map((reservation) => `
            <section class="today-list-item">
              <div>
                <strong>${escapeHtml(reservation.guest_name || "Guest")}</strong>
                <span>${escapeHtml(formatDate(reservation.reservation_date || reservation.offer_date, reservation.reservation_time || reservation.offer_time))}</span>
              </div>
              <div class="today-list-meta">
                ${statusBadge(reservation.status, reservationStatusLabel(reservation.status))}
                <small>${escapeHtml(reservation.party_size || 0)} ${escapeHtml(t("guests_label", "guests"))}</small>
              </div>
            </section>
          `).join("")}
        </div>
      ` : `<div class="empty-state">${escapeHtml(t("today_reservations_empty", "No reservation leads yet. New guest requests will appear here."))}</div>`}
    </article>
  `;
}

const unfinishedAiModules = [
  {
    key: "vip_detection",
    title: "VIP Detection",
    needs: "Consented repeat-guest identity, reservation frequency, favorites, ratings, and return-intent feedback.",
    current: "Requires more reservation and feedback history before reliable VIP detection."
  },
  {
    key: "guest_lifetime_value",
    title: "Guest Lifetime Value Intelligence",
    needs: "Repeat reservations, imported reservation-platform guest profiles, favorites, ratings, and consented behavior.",
    current: "Requires more reservation and feedback data before LTV should be used operationally."
  },
  {
    key: "competitor_tracker",
    title: "Full Competitor Tracker",
    needs: "Approved reservation-platform availability signals, SmartTable market activity, weather, traffic, and local event feeds.",
    current: "Not live. Current competitor cards are directional placeholders."
  },
  {
    key: "real_time_pricing_engine",
    title: "Full Real-time Pricing Engine",
    needs: "Conversion history, discount guardrails, capacity, demand, and restaurant approval rules.",
    current: "Current AI stays approval-based. No autonomous pricing is enabled."
  },
  {
    key: "staff_planning",
    title: "Staff Planning",
    needs: "Live reservations, service duration, labor model, roles, schedules, and compliance rules.",
    current: "Coming soon until staffing data is connected."
  }
];

function comingSoonModulesPanel() {
  return `
    <article class="panel wide-panel coming-soon-modules-panel" id="partner-coming-soon-ai">
      <div class="section-title-row compact">
        <div><span class="section-kicker">${escapeHtml(t("coming_soon_kicker", "Coming soon"))}</span><h2>${escapeHtml(t("coming_soon_ai_title", "Advanced modules that need real integrations"))}</h2></div>
      </div>
      <p class="form-note">${escapeHtml(t("coming_soon_truth_note", "These modules are intentionally separated from the working dashboard until the underlying data sources are connected and reliable."))}</p>
      <div class="coming-soon-grid">
        ${unfinishedAiModules.map((module) => `
          <section class="coming-soon-card">
            <div class="section-title-row compact">
              <strong>${escapeHtml(module.title)}</strong>
              ${featureBadge(module.key, "coming_soon")}
            </div>
            <p><strong>${escapeHtml(t("module_data_required_label", "Data required"))}:</strong> ${escapeHtml(module.needs)}</p>
            <p><strong>${escapeHtml(t("module_current_status_label", "Current status"))}:</strong> ${escapeHtml(module.current)}</p>
          </section>
        `).join("")}
      </div>
    </article>
  `;
}

function bindPartnerCoreEvents(includeAi = true) {
  document.querySelector("#refreshPartner")?.addEventListener("click", async () => {
    await loadPartnerData();
    renderPartner();
  });
  document.querySelector("#returnAdmin")?.addEventListener("click", returnToSuperAdmin);
  document.querySelector("#profileForm")?.addEventListener("submit", submitProfile);
  document.querySelector("#reservationImportForm")?.addEventListener("submit", submitReservationImport);
  document.querySelector("#manualPerformanceForm")?.addEventListener("submit", submitManualPerformance);
  document.querySelector("#offerForm")?.addEventListener("submit", submitOffer);
  document.querySelectorAll("[data-upload-button]").forEach((button) => {
    button.addEventListener("click", () => uploadMedia(button.dataset.uploadButton, button.dataset.uploadTarget));
  });
  document.querySelectorAll("[data-save-partner-offer]").forEach((button) => {
    button.addEventListener("click", () => saveOfferRow("/partner/offers", button.dataset.savePartnerOffer, loadPartnerData, renderPartner, button));
  });
  document.querySelectorAll("[data-delete-partner-offer]").forEach((button) => {
    button.addEventListener("click", () => deleteOffer("/partner/offers", button.dataset.deletePartnerOffer, loadPartnerData, renderPartner, button));
  });
  bindReservationStatusButtons("/partner/reservations", loadPartnerData, renderPartner);
  bindReservationFilterForms();

  if (!includeAi) return;
  bindAdvisorEvents();
  document.querySelectorAll("[data-partner-ai-action]").forEach((button) => {
    button.addEventListener("click", () => runPartnerAiAction(button.dataset.partnerAiAction));
  });
  document.querySelectorAll("[data-open-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.dataset.openDetails);
      if (!panel) return;
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  document.querySelectorAll("[data-portfolio-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.partnerPortfolioFilter = button.dataset.portfolioFilter || "all";
      renderPartner();
    });
  });
  document.querySelectorAll("[data-marketing-action]").forEach((button) => {
    button.addEventListener("click", () => runMarketingAction(button.dataset.marketingAction));
  });
  document.querySelector("#partnerMarketingMessage")?.addEventListener("input", (event) => {
    state.partnerMarketingMessage = event.currentTarget.value;
    localStorage.setItem("smarttable.partnerMarketingMessage", state.partnerMarketingMessage);
  });
  document.querySelectorAll("[data-partner-integration-action]").forEach((button) => {
    button.addEventListener("click", () => runIntegrationAction("/partner/integrations", button.dataset.partnerIntegrationProvider, button.dataset.partnerIntegrationAction, loadPartnerData, renderPartner));
  });
}

function basicPartnerOverviewPanel(stats = {}) {
  const pendingCount = state.reservations.filter((row) => ["pending", "requested"].includes(String(row.status))).length;
  const activeOffers = state.offersMine.filter((offer) => offer.status === "active").length;
  const accepted = stats.accepted || state.reservations.filter((row) => normalizeReservationStatusValue(row.status) === "accepted").length;
  const rejected = stats.rejected || state.reservations.filter((row) => normalizeReservationStatusValue(row.status) === "rejected").length;
  return `
    <section class="dashboard-grid two-col" id="partner-overview">
      <article class="panel wide-panel">
        <div class="section-title-row compact">
          <div>
            <span class="section-kicker">${escapeHtml(t("platform_mode_basic_label", "Basic"))}</span>
            <h2>${escapeHtml(t("basic_partner_overview_title", "Reservation marketplace overview"))}</h2>
          </div>
          ${featureBadge("guest_booking_leads", "live")}
        </div>
        <p class="muted">${escapeHtml(t("basic_partner_overview_body", "Manage discounted table offers, review guest reservation requests, and keep your restaurant profile current."))}</p>
        <div class="stats-grid compact-grid">
          ${statCard(t("partner_kpi_bookings", "Bookings"), stats.bookings ?? state.reservations.length)}
          ${statCard(t("reservations_pending_label", "Pending"), pendingCount)}
          ${statCard(t("partner_kpi_accepted", "Accepted"), accepted)}
          ${statCard(t("partner_kpi_rejected", "Rejected"), rejected)}
          ${statCard(t("partner_kpi_active_offers", "Active offers"), activeOffers)}
          ${statCard(t("partner_kpi_favorites", "Favorites"), stats.favorites_total ?? 0)}
        </div>
      </article>
      ${partnerTodayReservationLeadsPanel()}
      ${partnerTodayOffersPanel()}
    </section>
  `;
}

function partnerEmailDiagnosticNotice(restaurant = {}) {
  const diagnostics = restaurant.email_diagnostics || {};
  if (!diagnostics.status || diagnostics.status === "configured") return "";
  const messageKey = diagnostics.status === "missing"
    ? "partner_email_diagnostics_missing"
    : "partner_email_diagnostics_invalid";
  const fallback = diagnostics.status === "missing"
    ? "Reservation notification email is missing. Guests can still request tables, but partner email notifications will fail until this is fixed."
    : "Reservation notification email is invalid. Guests can still request tables, but partner email notifications will fail until this is fixed.";
  return `<p class="form-note warning">${escapeHtml(t(messageKey, fallback))}</p>`;
}

function renderBasicPartner(restaurant, stats, greeting) {
  app.innerHTML = dashboardShell([
    { id: "partner-overview", label: t("partner_nav_today", "Today") },
    { id: "partner-deals", label: t("partner_nav_offers", "Offers") },
    { id: "partner-reservations", label: t("partner_nav_reservations", "Reservations") },
    { id: "partner-guests", label: t("partner_nav_guests", "Guests") },
    { id: "partner-reviews", label: t("partner_nav_reviews", "Reviews") },
    { id: "partner-settings", label: t("partner_nav_settings", "Settings") }
  ], `
    <section class="dashboard-head owner-focused-head">
      <div>
        <span class="section-kicker">${escapeHtml(t("partner_dashboard_kicker_basic", "Partner dashboard"))}</span>
        <h1>${escapeHtml(greeting)}</h1>
        <p class="muted">${escapeHtml(t("partner_dashboard_intro_basic", "Manage offers, reservation requests, guest feedback, and restaurant profile details."))}</p>
      </div>
      <div class="button-row">
        ${state.originalAdminSession ? `<button class="ghost-button" id="returnAdmin" type="button">${escapeHtml(t("partner_return_admin", "Return to Super Admin"))}</button>` : ""}
        <button class="primary-button" id="refreshPartner" type="button">${escapeHtml(t("partner_refresh", "Refresh"))}</button>
      </div>
    </section>
    ${basicPartnerOverviewPanel(stats)}
    <section class="owner-dashboard-level dashboard-grid two-col partner-management-grid" id="partner-settings">
      <article class="panel" id="partner-profile">
        <div class="section-title-row compact">
          <div><span class="section-kicker">${escapeHtml(t("profile_label", "Profile"))}</span><h2>${escapeHtml(t("restaurant_profile_title", "Restaurant profile"))}</h2></div>
          <button class="primary-button" form="profileForm" type="submit">${escapeHtml(t("save_profile_button", "Save profile"))}</button>
        </div>
        <form class="mini-form profile-form" id="profileForm">
          ${partnerEmailDiagnosticNotice(restaurant)}
          ${textInput("name", t("restaurant_name_label", "Restaurant name"), restaurant.name, "text", "required")}
          ${textArea("description_en", t("description_english_label", "Description English"), restaurant.description_en || restaurant.description)}
          ${textArea("description_es", t("description_spanish_label", "Description Spanish"), restaurant.description_es)}
          ${textArea("description_hu", t("description_hungarian_label", "Description Hungarian"), restaurant.description_hu)}
          ${textInput("address", t("address_label", "Address"), restaurant.address, "text", "required")}
          ${textInput("phone", t("phone_label", "Phone"), restaurant.phone)}
          ${textInput("email", t("email_label", "Email"), restaurant.email || restaurant.contact_email, "email", "required")}
          ${textInput("website", t("website_label", "Website"), restaurant.website, "url")}
          ${textInput("instagram", "Instagram", restaurant.instagram)}
          ${textInput("facebook", "Facebook", restaurant.facebook, "url")}
          ${textInput("google_maps_url", "Google Maps", restaurant.google_maps_url, "url")}
          <div class="form-grid">
            ${textInput("cuisine_type", t("cuisine_label", "Cuisine"), restaurant.cuisine_type || restaurant.cuisine)}
            ${textInput("opening_hours", t("business_hours_label", "Business hours"), restaurant.opening_hours)}
            ${textInput("price_range", t("price_range_label", "Price range"), restaurant.price_range || "$$")}
          </div>
          ${textInput("logo_url", t("logo_url_label", "Logo URL"), restaurant.logo_url || restaurant.icon_image || restaurant.card_image)}
          ${mediaUploadControl("logo", "logo_url", t("upload_logo_button", "Upload logo"))}
          ${textInput("card_image", t("card_image_url_label", "Restaurant card image URL"), restaurant.card_image || restaurant.cover_image)}
          ${mediaUploadControl("card", "card_image", t("upload_card_image_button", "Upload card image"))}
          ${textArea("gallery_images", t("gallery_image_urls_label", "Gallery image URLs"), (restaurant.gallery_images || []).join("\\n"))}
          ${mediaUploadControl("gallery", "gallery_images", t("upload_gallery_image_button", "Upload gallery image"))}
        </form>
      </article>
      <article class="panel" id="partner-deals">
        <div class="section-title-row compact">
          <div><span class="section-kicker">${escapeHtml(t("partner_nav_offers", "Offers"))}</span><h2>${escapeHtml(t("create_offers_title", "Create discounted table offers"))}</h2></div>
        </div>
        <form class="mini-form offer-form" id="offerForm">
          ${textInput("title_en", t("title_english_label", "Title English"), "", "text", "required")}
          ${textInput("title_es", t("title_spanish_label", "Title Spanish"))}
          ${textInput("title_hu", t("title_hungarian_label", "Title Hungarian"))}
          ${textArea("description_en", t("description_english_label", "Description English"))}
          ${textArea("description_es", t("description_spanish_label", "Description Spanish"))}
          ${textArea("description_hu", t("description_hungarian_label", "Description Hungarian"))}
          <div class="form-grid">
            ${textInput("offer_date", t("date_label", "Date"), "", "date", "required")}
            ${textInput("start_time", t("start_time_label", "Start time"), "", "time", "required")}
            ${textInput("end_time", t("end_time_label", "End time"), "", "time", "required")}
            ${textInput("available_tables", t("available_tables_label", "Available tables"), "", "number", "min=\"1\" required")}
            ${textInput("max_party_size", t("max_party_label", "Max party"), "4", "number", "min=\"1\" required")}
            ${textInput("discount_value", t("discount_percent_label", "Discount %"), "", "number", "min=\"1\" max=\"90\" required")}
          </div>
          ${textInput("offer_image", t("offer_image_url_label", "Offer image URL"), "/assets/restaurant-hero.png")}
          ${mediaUploadControl("offer", "offer_image", t("upload_offer_image_button", "Upload offer image"))}
          <button class="primary-button wide" type="submit">${escapeHtml(t("create_offer_button", "Create offer"))}</button>
        </form>
      </article>
      <article class="panel" id="partner-current-offers">
        <div class="section-title-row compact">
          <div><span class="section-kicker">${escapeHtml(t("partner_nav_offers", "Offers"))}</span><h2>${escapeHtml(t("current_offers_title", "Current offers"))}</h2></div>
        </div>
        ${partnerOfferTable()}
      </article>
      <article class="panel" id="partner-reservations">
        <div class="section-title-row compact">
          <div><span class="section-kicker">${escapeHtml(t("partner_nav_reservations", "Reservations"))}</span><h2>${escapeHtml(t("manage_reservations_title", "Manage reservations"))}</h2></div>
        </div>
        ${reservationFilterForm("partner", state.partnerReservationFilters)}
        ${reservationTable(state.reservations, false)}
      </article>
    </section>
    <section class="owner-dashboard-level" id="partner-guests">
      ${partnerTodayReservationLeadsPanel()}
    </section>
    <section class="owner-dashboard-level" id="partner-reviews">
      ${partnerPostVisitFeedbackPanel()}
    </section>
  `);
  bindPartnerCoreEvents(false);
  finalizeRenderedLanguage();
}

function renderPartner() {
  if (!state.session || normalizeRole(state.session.profile.role) !== "partner") return renderLogin("partner");
  const restaurant = state.partnerProfile || {};
  const stats = state.partnerStats || {};
  const forecast = state.aiDemandForecast || {};
  const greeting = contentTemplate("partner_greeting_template", "Good afternoon, {{restaurant_name}}.", { restaurant_name: restaurant.name || state.session.profile.full_name || "Restaurant" });
  if (isBasicMode()) {
    renderBasicPartner(restaurant, stats, greeting);
    return;
  }
  app.innerHTML = dashboardShell([
    { id: "partner-today-level", label: t("partner_nav_today", "Today") },
    { id: "partner-ai-demand", label: t("partner_nav_ai_demand", "AI Demand") },
    { id: "partner-weekly-level", label: t("partner_nav_weekly_intelligence", "Weekly Intelligence") },
    { id: "partner-advanced-level", label: t("partner_nav_advanced_ai", "Advanced AI") },
    { id: "partner-deals", label: t("partner_nav_offers", "Offers") },
    { id: "partner-reservations", label: t("partner_nav_reservations", "Reservations") },
    { id: "partner-guests", label: t("partner_nav_guests", "Guests") },
    { id: "partner-reviews", label: t("partner_nav_reviews", "Reviews") },
    { id: "partner-settings", label: t("partner_nav_settings", "Settings") }
  ], `
    <section class="dashboard-head owner-focused-head">
      <div>
        <span class="section-kicker">${escapeHtml(t("partner_dashboard_kicker", "SmartTable AI"))}</span>
        <h1>${escapeHtml(greeting)}</h1>
        <p class="muted">${escapeHtml(t("partner_dashboard_intro", "The AI Revenue Operating System for Restaurants. Start with today's recommendation, then go deeper only when you need to."))}</p>
      </div>
      <div class="button-row">
        ${state.originalAdminSession ? `<button class="ghost-button" id="returnAdmin" type="button">${escapeHtml(t("partner_return_admin", "Return to Super Admin"))}</button>` : ""}
        <a class="ghost-button" href="#partner-ai-demand">${escapeHtml(t("partner_nav_ai_demand", "AI Demand"))}</a>
        <button class="primary-button" id="refreshPartner" type="button">${escapeHtml(t("partner_refresh", "Refresh"))}</button>
      </div>
    </section>
    ${aiModeBanner("partner")}
    <section class="owner-dashboard-level today-level" id="partner-today-level">
      ${ownerTodayHeroPanel(stats, forecast)}
      ${partnerAiDemandEntryCard()}
      <section class="dashboard-grid two-col owner-today-grid">
        ${aiDemandPanel()}
        ${todayOverviewPanel(stats, forecast)}
      </section>
      <section class="dashboard-grid two-col owner-today-grid">
        ${revenueForecastPanel(stats, forecast)}
        ${ownerSmartTableValuePanel(stats, forecast)}
      </section>
      ${ownerRecommendedActionPanel(stats, forecast)}
      <section class="dashboard-grid two-col owner-today-grid">
        ${partnerTodayOffersPanel()}
        ${partnerTodayReservationLeadsPanel()}
      </section>
      <section class="dashboard-grid two-col owner-today-grid">
        ${marketingGeneratorPanel()}
        ${aiActionHistoryPanel()}
      </section>
    </section>
    <section class="owner-dashboard-level weekly-level" id="partner-weekly-level">
      ${ownerDashboardLevelHeader(t("partner_nav_weekly_intelligence", "Weekly Intelligence"), t("weekly_level_title", "Plan the week without crowding today"), t("weekly_level_intro", "Only modules backed by current SmartTable data stay here. Integration-dependent modules are separated under Coming Soon."))}
      <section class="dashboard-grid two-col partner-ai-os-grid">
        ${reviewAnalyzerPanel()}
        ${weeklyAiReportPanel()}
      </section>
      ${bookingHeatMapPanel(forecast)}
    </section>
    <section class="owner-dashboard-level advanced-level" id="partner-advanced-level">
      ${ownerDashboardLevelHeader(t("partner_nav_advanced_ai", "Advanced AI"), t("advanced_level_title", "Advanced operating intelligence"), t("advanced_level_intro", "Deep AI modules are still available, but they no longer compete with the daily decision."))}
      ${partnerAiScoreCard(stats, forecast)}
      <section class="dashboard-grid two-col partner-ai-os-grid">
        ${restaurantHealthScorePanel(stats, forecast)}
        ${riskDashboardPanel(stats, forecast)}
      </section>
      ${aiRecommendationFeed(stats, forecast, { title: t("ai_recommendation_feed_title", "Recommended next moves") })}
      <section class="dashboard-grid two-col partner-ai-os-grid">
        ${demandForecastTimelinePanel(forecast)}
        ${liveMarketSignalsPanel()}
      </section>
      <section class="dashboard-grid two-col partner-ai-os-grid">
        ${smartTableRoiPanel(stats, forecast)}
        ${aiLearningConfidencePanel(forecast)}
      </section>
      <section class="dashboard-grid two-col partner-ai-os-grid">
        ${restaurantIntelligencePanel()}
        ${menuEngineeringPanel()}
      </section>
      <section class="dashboard-grid two-col partner-ai-os-grid">
        ${restaurantBenchmarkPanel(stats, forecast)}
        ${futureTimePlanningPanel()}
      </section>
      ${comingSoonModulesPanel()}
      ${portfolioViewPanel()}
      ${partnerAiActionsPanel(forecast)}
      ${partnerKpiCards(stats, forecast)}
    </section>
    <section class="owner-dashboard-level" id="partner-guests">
      ${ownerDashboardLevelHeader(t("partner_nav_guests", "Guests"), t("guests_level_title", "Guest loyalty and return demand"), t("guests_level_intro", "Use this when you want to grow repeat visits, favorites, and high-intent guest campaigns."))}
      ${partnerLoyaltyEnginePanel()}
    </section>
    <section class="owner-dashboard-level" id="partner-reviews">
      ${ownerDashboardLevelHeader(t("partner_nav_reviews", "Reviews"), t("reviews_level_title", "Reviews and post-visit intelligence"), t("reviews_level_intro", "Aggregated guest feedback, photo rewards, and review signals stay here."))}
      ${partnerPostVisitFeedbackPanel()}
    </section>
    <section class="owner-dashboard-level dashboard-grid two-col partner-management-grid" id="partner-settings">
      <article class="panel" id="partner-profile">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Profile</span><h2>Restaurant profile</h2></div>
          <button class="primary-button" form="profileForm" type="submit">Save profile</button>
        </div>
        <form class="mini-form profile-form" id="profileForm">
          ${partnerEmailDiagnosticNotice(restaurant)}
          ${textInput("name", "Restaurant name", restaurant.name, "text", "required")}
          ${textArea("description_en", "Description English", restaurant.description_en || restaurant.description)}
          ${textArea("description_es", "Description Spanish", restaurant.description_es)}
          ${textArea("description_hu", "Description Hungarian", restaurant.description_hu)}
          ${textInput("address", "Address", restaurant.address, "text", "required")}
          ${textInput("phone", "Phone", restaurant.phone)}
          ${textInput("email", "Email", restaurant.email || restaurant.contact_email, "email", "required")}
          ${textInput("website", "Website", restaurant.website, "url")}
          ${textInput("instagram", "Instagram", restaurant.instagram)}
          ${textInput("facebook", "Facebook", restaurant.facebook, "url")}
          ${textInput("tiktok", "TikTok", restaurant.tiktok, "url")}
          ${textInput("google_maps_url", "Google Maps", restaurant.google_maps_url, "url")}
          ${textInput("google_place_id", "Google Place ID", restaurant.google_place_id)}
          <div class="form-grid">
            ${textInput("latitude", "Latitude", restaurant.latitude ?? "", "number", "step=\"0.000001\"")}
            ${textInput("longitude", "Longitude", restaurant.longitude ?? "", "number", "step=\"0.000001\"")}
          </div>
          <div class="form-grid">
            ${textInput("cuisine_type", "Cuisine", restaurant.cuisine_type || restaurant.cuisine)}
            ${textInput("opening_hours", "Business hours", restaurant.opening_hours)}
            ${textInput("price_range", "Price range", restaurant.price_range || "$$")}
            ${textInput("dress_code", "Dress code", restaurant.dress_code || "")}
          </div>
          ${textInput("logo_url", "Logo URL", restaurant.logo_url || restaurant.icon_image || restaurant.card_image)}
          ${mediaUploadControl("logo", "logo_url", "Upload logo")}
          ${textInput("hero_image_url", "Hero image URL", restaurant.hero_image_url || restaurant.cover_image)}
          ${mediaUploadControl("hero", "hero_image_url", "Upload hero image")}
          ${textInput("menu_pdf_url", "Menu PDF URL", restaurant.menu_pdf_url || "")}
          ${textInput("icon_image", "Restaurant icon/card image URL", restaurant.icon_image || restaurant.card_image || restaurant.cover_image)}
          ${mediaUploadControl("icon", "icon_image", "Upload icon/card image")}
          ${textInput("card_image", "Restaurant card image URL", restaurant.card_image || restaurant.cover_image)}
          ${mediaUploadControl("card", "card_image", "Upload card image")}
          ${textInput("cover_image", "Cover image URL", restaurant.cover_image)}
          ${mediaUploadControl("cover", "cover_image", "Upload cover image")}
          ${textArea("gallery_images", "Gallery image URLs", (restaurant.gallery_images || []).join("\\n"))}
          ${mediaUploadControl("gallery", "gallery_images", "Upload gallery image")}
          <div class="form-grid">
            ${textInput("chef_name", "Chef name", restaurant.chef_name || "")}
            ${textInput("year_opened", "Year opened", restaurant.year_opened ?? "", "number", "min=\"1800\" max=\"2100\"")}
            ${textInput("capacity", "Capacity", restaurant.capacity ?? "", "number", "min=\"0\"")}
          </div>
          <label>Payment methods<input name="payment_methods" value="${escapeAttr(paymentMethods(restaurant.payment_methods).join(", "))}" placeholder="Visa, Mastercard, Amex, Apple Pay"></label>
          <div class="checkbox-row amenities-editor">
            ${checkboxInput("outdoor_seating", "Outdoor seating", restaurant.outdoor_seating)}
            ${checkboxInput("parking_available", "Parking available", restaurant.parking_available)}
            ${checkboxInput("kids_friendly", "Kids friendly", restaurant.kids_friendly)}
            ${checkboxInput("pet_friendly", "Pet friendly", restaurant.pet_friendly)}
            ${checkboxInput("wheelchair_accessible", "Wheelchair accessible", restaurant.wheelchair_accessible)}
            ${checkboxInput("private_room_available", "Private room available", restaurant.private_room_available)}
          </div>
          <div class="form-grid">
            <label>Billing plan
              <select name="billing_plan">
                <option value="free" ${restaurant.billing_plan === "free" ? "selected" : ""}>Free</option>
                <option value="monthly" ${restaurant.billing_plan === "monthly" ? "selected" : ""}>Monthly</option>
                <option value="per_booking" ${restaurant.billing_plan === "per_booking" ? "selected" : ""}>Per booking</option>
              </select>
            </label>
            ${textInput("monthly_fee", "Monthly fee", restaurant.monthly_fee ?? 0, "number", "min=\"0\" step=\"0.01\"")}
            ${textInput("fee_per_booking", "Fee per booking", restaurant.fee_per_booking ?? 0, "number", "min=\"0\" step=\"0.01\"")}
          </div>
          <div class="form-grid">
            <label>AI discount engine
              <select name="ai_discount_enabled">
                <option value="true" ${restaurant.ai_discount_enabled !== false ? "selected" : ""}>Enabled</option>
                <option value="false" ${restaurant.ai_discount_enabled === false ? "selected" : ""}>Disabled</option>
              </select>
            </label>
            ${textInput("min_discount_percent", "Minimum AI discount %", restaurant.min_discount_percent ?? 10, "number", "min=\"0\" max=\"90\"")}
            ${textInput("max_discount_percent", "Maximum AI discount %", restaurant.max_discount_percent ?? 30, "number", "min=\"0\" max=\"90\"")}
            ${textInput("target_margin_percent", "Target margin %", restaurant.target_margin_percent ?? 65, "number", "min=\"0\" max=\"100\" step=\"0.1\"")}
            ${textInput("average_service_minutes", "Average service minutes", restaurant.average_service_minutes ?? 75, "number", "min=\"15\"")}
          </div>
        </form>
      </article>
      ${partnerIntegrationPanel()}
      <article class="panel" id="partner-deals">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Deals</span><h2>Create discounted table offers</h2></div>
        </div>
        <form class="mini-form offer-form" id="offerForm">
          ${textInput("title_en", "Title English", "", "text", "required")}
          ${textInput("title_es", "Title Spanish")}
          ${textInput("title_hu", "Title Hungarian")}
          ${textArea("description_en", "Description English")}
          ${textArea("description_es", "Description Spanish")}
          ${textArea("description_hu", "Description Hungarian")}
          <div class="form-grid">
            ${textInput("offer_date", "Date", "", "date", "required")}
            ${textInput("start_time", "Start time", "", "time", "required")}
            ${textInput("end_time", "End time", "", "time", "required")}
            ${textInput("available_tables", "Available tables", "", "number", "min=\"1\" required")}
            ${textInput("max_party_size", "Max party size", "4", "number", "min=\"1\" required")}
            ${textInput("discount_value", "Discount %", "", "number", "min=\"1\" max=\"90\" required")}
          </div>
          ${textInput("offer_image", "Offer image URL", "/assets/restaurant-hero.png")}
          ${mediaUploadControl("offer", "offer_image", "Upload offer image")}
          <label>Valid days
            <span class="checkbox-row">
              ${Object.entries(dayLabels).map(([value, label]) => `
                <label class="check"><input type="checkbox" name="valid_days" value="${escapeAttr(value)}" checked> ${escapeHtml(label)}</label>
              `).join("")}
            </span>
          </label>
          <button class="primary-button wide" type="submit">Create offer</button>
        </form>
      </article>
      <article class="panel" id="partner-current-offers">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Offers</span><h2>Current offers</h2></div>
        </div>
        ${partnerOfferTable()}
      </article>
      <article class="panel" id="partner-reservations">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Reservations</span><h2>Manage reservations</h2></div>
        </div>
        ${reservationFilterForm("partner", state.partnerReservationFilters)}
        ${reservationTable(state.reservations, false)}
      </article>
    </section>
  `);
  app.insertAdjacentHTML("beforeend", partnerAdvisorWidget());
  document.querySelector("#refreshPartner").addEventListener("click", async () => {
    await loadPartnerData();
    renderPartner();
  });
  bindAdvisorEvents();
  document.querySelectorAll("[data-partner-ai-action]").forEach((button) => {
    button.addEventListener("click", () => runPartnerAiAction(button.dataset.partnerAiAction));
  });
  document.querySelectorAll("[data-open-details]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(button.dataset.openDetails);
      if (!panel) return;
      panel.open = true;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  document.querySelectorAll("[data-portfolio-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.partnerPortfolioFilter = button.dataset.portfolioFilter || "all";
      renderPartner();
    });
  });
  document.querySelectorAll("[data-marketing-action]").forEach((button) => {
    button.addEventListener("click", () => runMarketingAction(button.dataset.marketingAction));
  });
  document.querySelector("#partnerMarketingMessage")?.addEventListener("input", (event) => {
    state.partnerMarketingMessage = event.currentTarget.value;
    localStorage.setItem("smarttable.partnerMarketingMessage", state.partnerMarketingMessage);
  });
  document.querySelector("#returnAdmin")?.addEventListener("click", returnToSuperAdmin);
  document.querySelector("#profileForm").addEventListener("submit", submitProfile);
  document.querySelector("#reservationImportForm")?.addEventListener("submit", submitReservationImport);
  document.querySelector("#manualPerformanceForm")?.addEventListener("submit", submitManualPerformance);
  document.querySelectorAll("[data-partner-integration-action]").forEach((button) => {
    button.addEventListener("click", () => runIntegrationAction("/partner/integrations", button.dataset.partnerIntegrationProvider, button.dataset.partnerIntegrationAction, loadPartnerData, renderPartner));
  });
  document.querySelector("#offerForm").addEventListener("submit", submitOffer);
  document.querySelectorAll("[data-upload-button]").forEach((button) => {
    button.addEventListener("click", () => uploadMedia(button.dataset.uploadButton, button.dataset.uploadTarget));
  });
  document.querySelectorAll("[data-save-partner-offer]").forEach((button) => {
    button.addEventListener("click", () => saveOfferRow("/partner/offers", button.dataset.savePartnerOffer, loadPartnerData, renderPartner, button));
  });
  document.querySelectorAll("[data-delete-partner-offer]").forEach((button) => {
    button.addEventListener("click", () => deleteOffer("/partner/offers", button.dataset.deletePartnerOffer, loadPartnerData, renderPartner, button));
  });
  bindReservationStatusButtons("/partner/reservations", loadPartnerData, renderPartner);
  bindReservationFilterForms();
  finalizeRenderedLanguage();
}

function bindAdvisorEvents() {
  document.querySelectorAll("[data-advisor-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      state.advisorOpen = !state.advisorOpen;
      renderPartner();
    });
  });
  document.querySelectorAll("[data-advisor-prompt]").forEach((button) => {
    button.addEventListener("click", () => sendAdvisorQuestion(button.dataset.advisorPrompt));
  });
  document.querySelector("#advisorForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendAdvisorQuestion(new FormData(event.currentTarget).get("question"));
  });
}

function partnerOfferTable() {
  if (!state.offersMine.length) return `<div class="empty-state">${escapeHtml(t("no_offers_yet", "No offers yet."))}</div>`;
  return `
    <div class="table-wrap partner-table-wrap">
      <table class="partner-data-table partner-offers-table">
        <thead><tr><th>${escapeHtml(t("offer_table_title_header", "Title"))}</th><th>${escapeHtml(t("offer_table_date_time_header", "Date/time"))}</th><th>${escapeHtml(t("offer_table_tables_header", "Tables"))}</th><th>${escapeHtml(t("offer_table_discount_header", "Discount"))}</th><th>${escapeHtml(t("status_label", "Status"))}</th><th></th></tr></thead>
        <tbody>
          ${state.offersMine.map((offer) => `
            <tr class="offer-edit-row" data-offer-row="${escapeAttr(offer.id)}">
              <td>
                <input data-field="title_en" value="${escapeAttr(offer.title_en || t("discounted_table_label", "Discounted table"))}">
                <input data-field="offer_image" value="${escapeAttr(offer.offer_image || "")}" placeholder="${escapeAttr(t("offer_image_url_label", "Offer image URL"))}">
                <span class="muted">${escapeHtml((offer.valid_days || []).join(", "))}</span>
              </td>
              <td>
                <input data-field="offer_date" type="date" value="${escapeAttr(offer.offer_date || "")}">
                <input data-field="start_time" type="time" value="${escapeAttr(offer.start_time || offer.offer_time || "")}">
                <input data-field="end_time" type="time" value="${escapeAttr(offer.end_time || "")}">
              </td>
              <td>
                <input data-field="available_tables" type="number" min="1" value="${escapeAttr(offer.available_tables || offer.seat_count || 1)}">
                <input data-field="max_party_size" type="number" min="1" value="${escapeAttr(offer.max_party_size || 4)}">
                <span class="muted">${escapeHtml(offer.reserved_tables || 0)} ${escapeHtml(t("reserved_label", "reserved"))}</span>
              </td>
              <td><input data-field="discount_value" type="number" min="1" max="90" value="${escapeAttr(offer.discount_value || offer.discount_percent || 20)}"></td>
              <td>
                ${statusBadge(offer.status, offerStatusLabel(offer.status))}
                <select data-field="status">
                  <option value="active" ${offer.status === "active" ? "selected" : ""}>${escapeHtml(t("offer_status_active", "Active"))}</option>
                  <option value="paused" ${offer.status === "paused" ? "selected" : ""}>${escapeHtml(t("offer_status_paused", "Paused"))}</option>
                  <option value="sold_out" ${offer.status === "sold_out" ? "selected" : ""}>${escapeHtml(t("offer_status_sold_out", "Sold out"))}</option>
                  <option value="expired" ${offer.status === "expired" ? "selected" : ""}>${escapeHtml(t("offer_status_expired", "Expired"))}</option>
                </select>
              </td>
              <td>
                <div class="button-row">
                  <button class="ghost-button" data-save-partner-offer="${escapeAttr(offer.id)}" type="button">${escapeHtml(t("save_button", "Save"))}</button>
                  <button class="ghost-button danger" data-delete-partner-offer="${escapeAttr(offer.id)}" type="button">${escapeHtml(t("delete_button", "Delete"))}</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function submitProfile(event) {
  event.preventDefault();
  const submitButton = document.querySelector('[form="profileForm"][type="submit"]') || event.currentTarget.querySelector('[type="submit"]');
  if (submitButton?.disabled) return;
  try {
    setButtonPending(submitButton, true);
    await api("/partner/profile", {
      method: "PATCH",
      body: JSON.stringify(formObject(event.currentTarget))
    });
    await loadPartnerData();
    renderPartner();
    showToast(t("profile_saved_toast", "Profile saved."));
  } catch (error) {
    setButtonPending(submitButton, false);
    showToast(error.message);
  }
}

async function submitReservationImport(event) {
  event.preventDefault();
  try {
    await api("/integrations/import-reservations", {
      method: "POST",
      body: JSON.stringify(formObject(event.currentTarget))
    });
    await loadPartnerData();
    renderPartner();
    showToast(t("reservation_import_completed_toast", "Reservation import completed."));
  } catch (error) {
    showToast(error.message);
  }
}

async function submitManualPerformance(event) {
  event.preventDefault();
  try {
    await api("/integrations/import-reservations", {
      method: "POST",
      body: JSON.stringify(formObject(event.currentTarget))
    });
    await loadPartnerData();
    renderPartner();
    showToast(t("weekly_performance_saved_toast", "Weekly performance saved."));
  } catch (error) {
    showToast(error.message);
  }
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function activePartnerOffer() {
  return state.offersMine.find((offer) => offer.status === "active") || state.offersMine[0] || null;
}

async function createAiSuggestedOffer(discount, title = null) {
  await api("/partner/offers", {
    method: "POST",
    body: JSON.stringify({
      title_en: title || `AI recommended ${discount}% dinner window`,
      title_es: "",
      title_hu: "",
      description_en: (state.aiDemandForecast || {}).ai_recommendation || "SmartTable AI suggested this offer for the next low-demand window.",
      description_es: "",
      description_hu: "",
      offer_date: tomorrowDate(),
      start_time: "17:30",
      end_time: "19:00",
      available_tables: 4,
      max_party_size: 4,
      discount_value: discount,
      valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      offer_image: state.partnerProfile?.card_image || state.partnerProfile?.cover_image || "/assets/restaurant-hero.png"
    })
  });
}

function aiActionSuccessToast() {
  showToast(t("ai_action_success", "AI action applied successfully."));
}

function recordPartnerAiAction(title, result, status = "complete") {
  const entry = {
    time: new Date().toLocaleString((supportedLanguages[state.lang] || supportedLanguages.en).locale, { weekday: "short", hour: "numeric", minute: "2-digit" }),
    title,
    result,
    status
  };
  state.partnerAiActionHistory = [entry, ...(state.partnerAiActionHistory || [])].slice(0, 12);
  localStorage.setItem("smarttable.partnerAiActionHistory", JSON.stringify(state.partnerAiActionHistory));
}

async function runMarketingAction(action) {
  const restaurantName = state.partnerProfile?.name || "our restaurant";
  if (action === "generate") {
    state.partnerMarketingMessage = `Tonight only: enjoy 20% off your early dinner reservation at ${restaurantName}. Limited tables available.`;
    localStorage.setItem("smarttable.partnerMarketingMessage", state.partnerMarketingMessage);
    state.partnerAiActionNotice = t("marketing_generated_notice", "AI marketing message generated.");
    recordPartnerAiAction("Marketing message generated", "New campaign copy prepared for favorite guests.");
    renderPartner();
    aiActionSuccessToast();
    return;
  }
  if (action === "copy") {
    const message = state.partnerMarketingMessage || document.querySelector("#partnerMarketingMessage")?.value || "";
    try {
      await navigator.clipboard?.writeText(message);
    } catch {
      // Browser clipboard may be unavailable in local preview; keep the message visible.
    }
    state.partnerAiActionNotice = t("marketing_copied_notice", "Marketing message copied.");
    recordPartnerAiAction("Marketing message copied", "Campaign copy was copied for external use.");
    renderPartner();
    aiActionSuccessToast();
    return;
  }
  state.partnerAiActionNotice = t("marketing_sent_notice", "Marketing message prepared for favorite guests.");
  recordPartnerAiAction("Marketing campaign prepared", "Favorite guest campaign queued in demo mode.", "active");
  renderPartner();
  aiActionSuccessToast();
}

async function runPartnerAiAction(action) {
  const forecast = state.aiDemandForecast || {};
  try {
    if (action === "edit-recommendation") {
      state.partnerAiActionNotice = t("edit_recommendation_notice", "Recommendation opened for editing. Adjust discount, time window, or audience before applying.");
      recordPartnerAiAction("Recommendation opened for editing", "Owner reviewed the AI recommendation before applying.", "watch");
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (["generate-marketing", "create-social-post", "send-email-campaign", "optimize-pricing", "apply-pricing"].includes(action)) {
      if (action === "generate-marketing") {
        state.partnerMarketingMessage = `Tonight only: enjoy ${Math.max(15, Number(forecast.suggested_discount_percent || 20))}% off your early dinner reservation at ${state.partnerProfile?.name || "our restaurant"}. Limited tables available.`;
        localStorage.setItem("smarttable.partnerMarketingMessage", state.partnerMarketingMessage);
        state.partnerAiActionNotice = t("marketing_generated_notice", "AI marketing message generated.");
        recordPartnerAiAction("Generate marketing message", "AI generated campaign copy for tonight.");
      } else if (action === "create-social-post") {
        state.partnerAiActionNotice = t("social_post_created_notice", "AI social post created for review.");
        recordPartnerAiAction("Create social post", "Social post draft created for review.");
      } else if (action === "send-email-campaign") {
        state.partnerAiActionNotice = t("email_campaign_ready_notice", "Email campaign prepared for favorite guests.");
        recordPartnerAiAction("Send email campaign", "Email campaign queued in demo mode.", "active");
      } else {
        state.partnerAiActionNotice = t("pricing_applied_notice", "AI pricing optimization applied.");
        recordPartnerAiAction("Optimize today's pricing", "Pricing guardrails updated for today's windows.");
      }
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (action === "ceo-recommendation" || action === "apply-all") {
      const discount = Math.max(10, Number(forecast.suggested_discount_percent || 15));
      const response = await api("/ai/actions", {
        method: "POST",
        body: JSON.stringify({
          action_type: action === "apply-all" ? "apply_all_recommendations" : "apply_recommendation",
          decision: "approve",
          recommendation_id: state.partnerAiRecommendation?.id || null,
          suggested_discount_percent: discount
        })
      });
      state.partnerAiRecommendation = response.recommendation || state.partnerAiRecommendation;
      state.partnerMarketingMessage = response.campaign?.message || `Tonight only: enjoy ${discount}% off your early dinner reservation at ${state.partnerProfile?.name || "our restaurant"}. SmartTable AI found limited recoverable tables for 5:30-7:00 PM.`;
      localStorage.setItem("smarttable.partnerMarketingMessage", state.partnerMarketingMessage);
      state.partnerAiActionNotice = action === "ceo-recommendation"
        ? `Applied AI recommendation: created a ${discount}% early dinner offer, generated campaign copy, and queued guest outreach for approval-based tracking.`
        : `Applied executive recommendations: created a ${discount}% recovery offer, generated campaign copy, queued guest outreach, and logged the AI action.`;
      recordPartnerAiAction("Recommendation accepted", "Owner accepted the AI recommendation.", "complete");
      recordPartnerAiAction("Offer activated", response.offer?.id ? `Created offer ${response.offer.id}.` : `Created a ${discount}% early dinner recovery offer.`, "active");
      recordPartnerAiAction("Guests notified", response.campaign?.id ? `Campaign ${response.campaign.id} queued.` : "Favorite and VIP guest notification prepared.", "active");
      recordPartnerAiAction("Revenue recovery started", state.partnerAiActionNotice, "watch");
      await loadPartnerData();
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (action === "apply" || action === "apply-best") {
      const suggested = String(forecast.suggested_action || "");
      if (suggested.includes("reduce")) action = "lower-discount";
      else if (suggested.includes("hold")) action = "notify-followers";
      else action = "create-offer";
    }

    if (action === "pause-offer") {
      const activeOffer = activePartnerOffer();
      if (!activeOffer) {
        showToast(t("no_active_offer_to_pause_toast", "No active offer to pause."));
        return;
      }
      await api("/partner/offers", {
        method: "PATCH",
        body: JSON.stringify({ id: activeOffer.id, status: "paused" })
      });
      await loadPartnerData();
      state.partnerAiActionNotice = "Paused one low-performing offer.";
      recordPartnerAiAction("Pause low-performing offer", "One active offer was paused to protect performance.");
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (action === "notify-followers") {
      const count = Number(state.partnerStats?.favorites_total || 0);
      state.partnerAiActionNotice = count
        ? `Prepared SmartTable notification for ${count} favorite guests.`
        : "Notification workflow prepared. Followers will receive alerts once audience volume grows.";
      recordPartnerAiAction("Notify favorite guests", state.partnerAiActionNotice, "active");
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (action === "notify-vip") {
      state.partnerAiActionNotice = "Prepared VIP guest notification for 14 high-value repeat guests.";
      recordPartnerAiAction("Notify VIP guests", state.partnerAiActionNotice, "active");
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (action === "reduce-prep") {
      state.partnerAiActionNotice = "Reduced weak-hour prep recommendation by 12% for late-night seafood exposure.";
      recordPartnerAiAction("Reduce weak-hour prep", state.partnerAiActionNotice);
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (action === "increase-availability") {
      const activeOffer = activePartnerOffer();
      if (!activeOffer) {
        await createAiSuggestedOffer(Math.max(10, Number(forecast.suggested_discount_percent || 15)), "AI availability recovery offer");
        state.partnerAiActionNotice = "Created a new offer because no active availability was found.";
      } else {
        await api("/partner/offers", {
          method: "PATCH",
          body: JSON.stringify({
            id: activeOffer.id,
            available_tables: Number(activeOffer.available_tables || activeOffer.seat_count || 1) + 2
          })
        });
        state.partnerAiActionNotice = "Added 2 more tables to the selected active offer.";
      }
      await loadPartnerData();
      recordPartnerAiAction("Increase availability", state.partnerAiActionNotice, "active");
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    if (action === "lower-discount" || action === "raise-discount") {
      const activeOffer = activePartnerOffer();
      const delta = action === "lower-discount" ? -5 : 5;
      if (!activeOffer) {
        await createAiSuggestedOffer(Math.max(10, Number(forecast.suggested_discount_percent || 15)), "AI weak-demand offer");
        state.partnerAiActionNotice = "Created a new weak-demand offer because no active offer was available.";
      } else {
        const current = Number(activeOffer.discount_value || activeOffer.discount_percent || forecast.suggested_discount_percent || 15);
        const next = Math.max(5, Math.min(50, current + delta));
        await api("/partner/offers", {
          method: "PATCH",
          body: JSON.stringify({ id: activeOffer.id, discount_value: next })
        });
        state.partnerAiActionNotice = action === "lower-discount"
          ? `Lowered discount to ${next}% to protect margin.`
          : `Raised discount to ${next}% for a weak-demand window.`;
      }
      await loadPartnerData();
      recordPartnerAiAction(action === "lower-discount" ? "Lower discount to protect margin" : "Raise discount for weak demand", state.partnerAiActionNotice);
      renderPartner();
      aiActionSuccessToast();
      return;
    }

    const discount = Math.max(5, Number(forecast.suggested_discount_percent || 20));
    await createAiSuggestedOffer(discount);
    await loadPartnerData();
    state.partnerAiActionNotice = `Created a suggested ${discount}% offer for tomorrow 5:30-7:00 PM.`;
    recordPartnerAiAction("Create suggested offer", state.partnerAiActionNotice, "active");
    renderPartner();
    aiActionSuccessToast();
  } catch (error) {
    showToast(error.message);
  }
}

async function submitOffer(event) {
  event.preventDefault();
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  if (submitButton?.disabled) return;
  try {
    setButtonPending(submitButton, true);
    await api("/partner/offers", {
      method: "POST",
      body: JSON.stringify(formObject(event.currentTarget))
    });
    await loadPartnerData();
    renderPartner();
    showToast(t("offer_created_toast", "Offer created."));
  } catch (error) {
    setButtonPending(submitButton, false);
    showToast(error.message);
  }
}

async function saveOfferRow(endpoint, id, reload, render, button = null) {
  const row = document.querySelector(`[data-offer-row="${CSS.escape(id)}"]`);
  if (!row) return;
  const body = { id };
  row.querySelectorAll("[data-field]").forEach((input) => {
    body[input.dataset.field] = input.value;
  });
  try {
    setButtonPending(button, true);
    await api(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    await reload();
    render();
    showToast(t("offer_saved_toast", "Offer saved."));
  } catch (error) {
    setButtonPending(button, false);
    showToast(error.message);
  }
}

async function deleteOffer(endpoint, id, reload, render, button = null) {
  if (!confirm(t("delete_offer_confirm", "Delete this offer? It will no longer be bookable."))) return;
  try {
    setButtonPending(button, true, t("deleting_button", "Deleting..."));
    await api(endpoint, {
      method: "DELETE",
      body: JSON.stringify({ id })
    });
    await reload();
    render();
    showToast(t("offer_deleted_toast", "Offer deleted."));
  } catch (error) {
    setButtonPending(button, false);
    showToast(error.message);
  }
}

function reservationTable(rows, showRestaurant) {
  if (!rows.length) return `<div class="empty-state">${escapeHtml(t("account_no_reservations", "No reservations yet."))}</div>`;
  return `
    <div class="table-wrap partner-table-wrap">
      <table class="partner-data-table partner-reservations-table">
        <thead><tr><th>${escapeHtml(t("reservation_reference_label", "Reference"))}</th>${showRestaurant ? `<th>${escapeHtml(t("restaurant_label", "Restaurant"))}</th>` : ""}<th>${escapeHtml(t("guest_label", "Guest"))}</th><th>${escapeHtml(t("reservation_table_label", "Table"))}</th><th>${escapeHtml(t("status_label", "Status"))}</th><th>${escapeHtml(t("internal_notes_label", "Internal notes"))}</th><th></th></tr></thead>
        <tbody>
          ${rows.map((reservation) => `
            <tr>
              <td>${escapeHtml(reservation.reference)}</td>
              ${showRestaurant ? `<td>${escapeHtml(reservation.restaurant_name)}</td>` : ""}
              <td>${escapeHtml(reservation.guest_name)}<br><span class="muted">${escapeHtml(reservation.guest_email)}</span><br><span class="muted">${escapeHtml(reservation.guest_phone || "")}</span></td>
              <td>${escapeHtml(formatDate(reservation.reservation_date || reservation.offer_date, reservation.reservation_time || reservation.offer_time))}<br><span class="muted">${escapeHtml(reservation.party_size)} ${escapeHtml(t("guests_label", "guests"))} - ${escapeHtml(reservation.discount_percent || reservation.discount_value || 0)}% ${escapeHtml(t("off_label", "off"))}</span></td>
              <td>${statusBadge(reservation.status, reservationStatusLabel(reservation.status))}</td>
              <td>
                <textarea data-note-field="${escapeAttr(reservation.reservation_id)}" placeholder="${escapeAttr(t("reservation_internal_notes_placeholder", "Internal restaurant notes"))}">${escapeHtml(reservation.partner_notes || "")}</textarea>
                <button class="ghost-button" data-save-note="${escapeAttr(reservation.reservation_id)}" type="button">${escapeHtml(t("save_note_button", "Save note"))}</button>
              </td>
              <td>
                <div class="button-row">
                  ${reservationActionButtons(reservation)}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function reservationFilterForm(scope, filters) {
  return `
    <form class="mini-form reservation-filter-form" data-reservation-filter-scope="${escapeAttr(scope)}">
      <select name="status" aria-label="${escapeAttr(t("reservation_filter_status_label", "Reservation status"))}">
        <option value="all" ${filters.status === "all" ? "selected" : ""}>${escapeHtml(t("reservation_filter_all", "All"))}</option>
        <option value="pending" ${filters.status === "pending" ? "selected" : ""}>${escapeHtml(t("reservations_pending_label", "Pending"))}</option>
        <option value="accepted" ${filters.status === "accepted" ? "selected" : ""}>${escapeHtml(t("reservation_status_accepted", "Accepted"))}</option>
        <option value="rejected" ${filters.status === "rejected" ? "selected" : ""}>${escapeHtml(t("reservation_status_declined", "Declined"))}</option>
        <option value="cancelled" ${filters.status === "cancelled" ? "selected" : ""}>${escapeHtml(t("reservation_status_cancelled", "Cancelled"))}</option>
        <option value="completed" ${filters.status === "completed" ? "selected" : ""}>${escapeHtml(t("reservation_status_completed", "Completed"))}</option>
      </select>
      <input name="date" type="date" value="${escapeAttr(filters.date || "")}" aria-label="${escapeAttr(t("date_label", "Date"))}">
      <input name="search" value="${escapeAttr(filters.search || "")}" placeholder="${escapeAttr(t("reservation_search_placeholder", "Search guest, email, restaurant, reference"))}" aria-label="${escapeAttr(t("reservation_search_label", "Search reservations"))}">
      <button class="primary-button" type="submit">${escapeHtml(t("apply_filters_button", "Apply filters"))}</button>
      <button class="ghost-button" data-clear-reservation-filters="${escapeAttr(scope)}" type="button">${escapeHtml(t("clear_filters_button", "Clear"))}</button>
    </form>
  `;
}

function reservationActionButtons(reservation = {}) {
  const status = normalizeReservationStatusValue(reservation.status);
  const id = escapeAttr(reservation.reservation_id);
  const buttons = [];
  if (status === "pending") {
    buttons.push(`<button class="ghost-button" data-status="accepted" data-reservation="${id}" type="button">${escapeHtml(t("accept_button", "Accept"))}</button>`);
    buttons.push(`<button class="ghost-button warning" data-status="rejected" data-reservation="${id}" type="button">${escapeHtml(t("decline_button", "Decline"))}</button>`);
    buttons.push(`<button class="ghost-button danger" data-status="cancelled" data-reservation="${id}" type="button">${escapeHtml(t("cancel_button", "Cancel"))}</button>`);
  } else if (status === "accepted") {
    buttons.push(`<button class="ghost-button" data-status="completed" data-reservation="${id}" type="button">${escapeHtml(t("complete_button", "Complete"))}</button>`);
    buttons.push(`<button class="ghost-button danger" data-status="cancelled" data-reservation="${id}" type="button">${escapeHtml(t("cancel_button", "Cancel"))}</button>`);
    buttons.push(`<button class="ghost-button" data-status="no_show" data-reservation="${id}" type="button">${escapeHtml(t("no_show_button", "No-show"))}</button>`);
  }
  if (status === "completed") {
    buttons.push(`<button class="ghost-button success" data-post-visit-email="${id}" type="button">${escapeHtml(t("post_visit_email_send_button", "Send post-visit email"))}</button>`);
  }
  if (!buttons.length) return `<span class="muted">${escapeHtml(t("reservation_no_actions_available", "No actions available"))}</span>`;
  return buttons.join("");
}

function bindReservationFilterForms() {
  document.querySelectorAll("[data-reservation-filter-scope]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const scope = form.dataset.reservationFilterScope;
      const target = scope === "admin" ? state.adminReservationFilters : state.partnerReservationFilters;
      const data = formObject(form);
      target.status = data.status || "all";
      target.date = data.date || "";
      target.search = data.search || "";
      if (scope === "admin") {
        await loadAdminData();
        renderAdmin();
      } else {
        await loadPartnerData();
        renderPartner();
      }
    });
  });
  document.querySelectorAll("[data-clear-reservation-filters]").forEach((button) => {
    button.addEventListener("click", async () => {
      const scope = button.dataset.clearReservationFilters;
      const target = scope === "admin" ? state.adminReservationFilters : state.partnerReservationFilters;
      target.status = "all";
      target.date = "";
      target.search = "";
      if (scope === "admin") {
        await loadAdminData();
        renderAdmin();
      } else {
        await loadPartnerData();
        renderPartner();
      }
    });
  });
}

function bindReservationStatusButtons(endpoint, reload, render) {
  document.querySelectorAll("[data-reservation]").forEach((button) => {
    button.addEventListener("click", async () => {
      const reservationId = button.dataset.reservation;
      const relatedButtons = Array.from(document.querySelectorAll(`[data-reservation="${CSS.escape(reservationId)}"], [data-post-visit-email="${CSS.escape(reservationId)}"]`));
      try {
        const nextStatus = button.dataset.status;
        if (nextStatus === "accepted" && !confirm(t("accept_reservation_confirm", "Accept this reservation request?"))) return;
        if (nextStatus === "rejected" && !confirm(t("decline_reservation_confirm", "Decline this reservation request?"))) return;
        if (nextStatus === "cancelled" && !confirm(t("cancel_reservation_confirm", "Cancel this reservation request?"))) return;
        relatedButtons.forEach((item) => setButtonPending(item, true));
        await api(endpoint, {
          method: "PATCH",
          body: JSON.stringify({
            id: reservationId,
            status: nextStatus,
            confirm: nextStatus === "cancelled"
          })
        });
        await reload();
        render();
        showToast(t("reservation_updated_toast", "Reservation updated."));
      } catch (error) {
        relatedButtons.forEach((item) => setButtonPending(item, false));
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-save-note]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.saveNote;
      const note = document.querySelector(`[data-note-field="${CSS.escape(id)}"]`)?.value || "";
      try {
        setButtonPending(button, true);
        await api(endpoint, {
          method: "PATCH",
          body: JSON.stringify({ id, partner_notes: note })
        });
        await reload();
        render();
        showToast(t("reservation_note_saved_toast", "Reservation note saved."));
      } catch (error) {
        setButtonPending(button, false);
        showToast(error.message);
      }
    });
  });
  document.querySelectorAll("[data-post-visit-email]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        setButtonPending(button, true, t("sending_button", "Sending..."));
        const payload = await api(endpoint, {
          method: "PATCH",
          body: JSON.stringify({ id: button.dataset.postVisitEmail, action: "send_post_visit_email" })
        });
        await reload();
        render();
        showToast(payload.ok
          ? t("post_visit_email_sent_notice", "Post-visit email and notification sent.")
          : t("post_visit_email_unconfirmed_notice", "Post-visit notification was recorded, but email delivery could not be confirmed."));
      } catch (error) {
        setButtonPending(button, false);
        showToast(error.message);
      }
    });
  });
}

async function renderCurrentMode() {
  app.innerHTML = loadingSkeleton();
  await loadTranslations();
  await loadPublicConfig();
  await loadPublicContent();
  await loadFeatureStatus();
  updateSessionButton();
  try {
    const accountRoute = currentGuestAccountRoute();
    if (accountRoute === "signup") {
      state.mode = "guest";
      renderGuestSignup();
      return;
    }
    if (accountRoute === "login") {
      state.mode = "guest";
      renderGuestLogin();
      return;
    }
    if (accountRoute === "forgot-password") {
      state.mode = "guest";
      renderForgotPassword();
      return;
    }
    if (accountRoute === "reset-password") {
      state.mode = "guest";
      renderResetPassword();
      return;
    }
    if (accountRoute === "verify-email") {
      state.mode = "guest";
      await renderVerifyEmail();
      return;
    }
    if (accountRoute === "account") {
      const protectedRoute = currentProtectedAreaRoute();
      if (guardProtectedAreaRoute(protectedRoute)) return;
      applyGuestAccountRouteTab();
      await loadGuestAccountData();
      renderGuestAccount();
      return;
    }
    const route = currentAiRoute();
    if (route) {
      const access = aiRouteAccess(route);
      if (!access.allowed) {
        renderUnavailableRoute(access);
        return;
      }
      const protectedRoute = currentProtectedAreaRoute();
      if (guardProtectedAreaRoute(protectedRoute)) return;
      applyRouteIntent(route);
    }
    const protectedRoute = currentProtectedAreaRoute();
    if (protectedRoute && guardProtectedAreaRoute(protectedRoute)) return;
    if (protectedRoute) state.mode = protectedRoute.mode;
    const activeRoute = route || protectedRoute;
    if (state.mode === "admin") {
      if (isAdminRole(state.session?.profile.role)) await loadAdminData();
      renderAdmin();
      scrollToRouteTarget(activeRoute);
      return;
    }
    if (state.mode === "partner") {
      if (state.session && normalizeRole(state.session.profile.role) === "partner") await loadPartnerData();
      renderPartner();
      scrollToRouteTarget(activeRoute);
      return;
    }
    const publicRoute = currentPublicGuestRoute();
    if (publicRoute.kind === "info") {
      renderPublicGuestInfoPage(publicRoute);
      return;
    }
    if (publicRoute.kind === "not-found") {
      renderNotFoundRoute(publicRoute);
      return;
    }
    await Promise.all([loadPublicOffers(), loadNewestRestaurants(), loadAiPreferences(), loadAiRecommendations(), loadRewardBookingContext()]);
    if (publicRoute.kind === "restaurant-detail") {
      const restaurant = findPublicRestaurantBySlug(publicRoute.slug);
      if (!restaurant) {
        renderNotFoundRoute({ ...publicRoute, path: window.location.pathname });
        return;
      }
      state.restaurantDetail = restaurant.id;
    }
    renderGuest(publicRoute);
    scrollToRouteTarget(route);
  } catch (error) {
    if (isAuthError(error)) {
      saveSession(null);
      clearGuestPrivateState();
      state.originalAdminSession = null;
      if (state.mode === "partner") renderLogin("partner");
      else if (state.mode === "guest") renderGuestLogin();
      else renderLogin("admin");
      showToast(t("session_expired_message", "Session expired. Please log in again."));
      return;
    }
    throw error;
  }
}

function bindNav() {
  document.querySelector("#guestNav").addEventListener("click", async () => {
    maybeTrackSignupAbandoned("guest_navigation");
    history.pushState(null, "", "/");
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelector("#aiConciergeNav")?.addEventListener("click", async () => {
    maybeTrackSignupAbandoned("ai_navigation");
    history.pushState(null, "", "/ai-concierge");
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelector("#adminNav").addEventListener("click", async () => {
    maybeTrackSignupAbandoned("admin_navigation");
    history.pushState(null, "", "/admin");
    state.mode = "admin";
    await renderCurrentMode();
  });
  document.querySelector("#restaurantNav").addEventListener("click", async () => {
    maybeTrackSignupAbandoned("partner_navigation");
    history.pushState(null, "", "/partner");
    state.mode = "partner";
    await renderCurrentMode();
  });
  signupNav?.addEventListener("click", async () => {
    history.pushState(null, "", "/signup");
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", async () => {
      await setLanguage(button.dataset.lang);
    });
  });
  sessionButton.addEventListener("click", async () => {
    maybeTrackSignupAbandoned("session_button");
    if (state.session) {
      if (isGuestSession()) {
        state.showAccountMenu = !state.showAccountMenu;
        updateSessionButton();
        return;
      }
      await signOut();
    } else {
      history.pushState(null, "", "/login");
      state.mode = "guest";
      await renderCurrentMode();
    }
  });
  document.addEventListener("click", (event) => {
    if (!state.showAccountMenu) return;
    if (event.target.closest("#sessionButton") || event.target.closest("#guestAccountMenu")) return;
    state.showAccountMenu = false;
    updateSessionButton();
  });
}

window.addEventListener("beforeunload", () => {
  maybeTrackSignupAbandoned("beforeunload", true);
});

async function boot() {
  bindNav();
  updateSessionButton();
  try {
    const health = await api("/health");
    state.apiMode = health.mode;
  } catch {
    state.apiMode = "offline";
  }
  if (state.session?.profile) state.session.profile.role = normalizeRole(state.session.profile.role);
  if (!localStorage.getItem("smarttable.lang") && state.session?.profile?.preferred_language) {
    state.lang = normalizeLanguage(state.session.profile.preferred_language);
    localStorage.setItem("smarttable.lang", state.lang);
  }
  await renderCurrentMode();
}

boot().catch(() => {
  renderFatalAppError();
});
