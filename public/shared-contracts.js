export const SUPPORTED_LANGUAGE_CONFIG = {
  en: { label: "English \uD83C\uDDFA\uD83C\uDDF8", locale: "en-US", currency: "USD" },
  es: { label: "Espa\u00f1ol \uD83C\uDDEA\uD83C\uDDF8", locale: "es-ES", currency: "USD" },
  hu: { label: "Magyar \uD83C\uDDED\uD83C\uDDFA", locale: "hu-HU", currency: "USD" }
};

export const SUPPORTED_LANGUAGE_CODES = Object.keys(SUPPORTED_LANGUAGE_CONFIG);

export const PLATFORM_MODES = {
  basic: "basic",
  ai_concierge: "ai_concierge"
};

export const DEFAULT_PLATFORM_SETTINGS = {
  platform_mode: PLATFORM_MODES.basic,
  ai_demo_visibility: false,
  show_ai_mode_badge: true,
  feature_flags: {}
};

export const DEFAULT_FEATURE_FLAGS = {
  restaurant_listings: true,
  discount_offers: true,
  reservations: true,
  partner_dashboard: true,
  admin_management: true,
  reviews: true,
  favorites: true,
  loyalty: true,
  ai_concierge: true,
  ai_recommendation: true,
  ai_route_planning: false,
  ai_calendar: false,
  push_notification: false,
  sms: false,
  referral_program: false,
  restaurant_analytics: true
};

export const PLATFORM_FEATURE_REGISTRY = {
  "basic.restaurantListings": {
    label: "Restaurant listings",
    flag_key: "restaurant_listings",
    audiences: ["guest", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: true,
    required_backend_support: ["restaurants", "offers", "public_available_offers"]
  },
  "basic.discountOffers": {
    label: "Discounted table offers",
    flag_key: "discount_offers",
    audiences: ["guest", "partner", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: true,
    required_backend_support: ["offers", "reservations"]
  },
  "basic.reservations": {
    label: "Reservation requests",
    flag_key: "reservations",
    audiences: ["guest", "partner", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: true,
    required_backend_support: ["reservations", "email_logs"]
  },
  "basic.partnerDashboard": {
    label: "Restaurant partner dashboard",
    flag_key: "partner_dashboard",
    audiences: ["partner", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: false,
    required_backend_support: ["partner/profile", "partner/offers", "partner/reservations"]
  },
  "basic.adminManagement": {
    label: "Admin management",
    flag_key: "admin_management",
    audiences: ["admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: false,
    required_backend_support: ["admin/restaurants", "admin/offers", "admin/content", "admin/notifications"]
  },
  "basic.favorites": {
    label: "Favorites and restaurant follows",
    flag_key: "favorites",
    audiences: ["guest", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: true,
    required_backend_support: ["restaurant_followers", "guest/favorites"]
  },
  "basic.reviews": {
    label: "Verified guest reviews",
    flag_key: "reviews",
    audiences: ["guest", "partner", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: true,
    required_backend_support: ["restaurant_reviews", "guest_feedback", "admin/reviews"]
  },
  "basic.loyalty": {
    label: "Dining photo rewards and loyalty",
    flag_key: "loyalty",
    audiences: ["guest", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "demo",
    public_visibility: false,
    required_backend_support: ["dining_consumption_uploads", "photo_reward_submissions", "loyalty_accounts"]
  },
  "ai.concierge": {
    label: "AI Dining Concierge",
    flag_key: "ai_concierge",
    audiences: ["guest", "admin"],
    modes: ["ai_concierge"],
    status: "demo",
    public_visibility: false,
    required_backend_support: ["ai/preferences", "ai/recommendations", "ai/events"]
  },
  "ai.preferenceSurvey": {
    label: "AI preference questionnaire",
    flag_key: "ai_concierge",
    audiences: ["guest", "admin"],
    modes: ["ai_concierge"],
    status: "demo",
    public_visibility: false,
    required_backend_support: ["ai/preferences"]
  },
  "ai.recommendation": {
    label: "AI restaurant recommendation",
    flag_key: "ai_recommendation",
    audiences: ["guest", "partner", "admin"],
    modes: ["ai_concierge"],
    status: "demo",
    public_visibility: false,
    required_backend_support: ["ai/recommendations", "ai_recommendations", "ai_actions"]
  },
  "ai.demandEngine": {
    label: "AI demand engine",
    flag_key: "ai_recommendation",
    audiences: ["partner", "admin"],
    modes: ["ai_concierge"],
    status: "demo",
    public_visibility: false,
    required_backend_support: ["ai/demand-forecast", "ai/recommendations"]
  },
  "ai.routePlanning": {
    label: "AI route planning",
    flag_key: "ai_route_planning",
    audiences: ["guest", "admin"],
    modes: ["ai_concierge"],
    status: "demo",
    public_visibility: false,
    required_backend_support: ["ai/route-plan"]
  },
  "ai.calendarSync": {
    label: "Calendar sync",
    flag_key: "ai_calendar",
    audiences: ["guest", "admin"],
    modes: ["ai_concierge"],
    status: "disabled",
    public_visibility: false,
    required_backend_support: ["future_calendar_provider"]
  },
  "ai.partnerDemand": {
    label: "Partner AI demand dashboard",
    flag_key: "restaurant_analytics",
    audiences: ["partner", "admin"],
    modes: ["ai_concierge"],
    status: "demo",
    public_visibility: false,
    required_backend_support: ["ai/demand-forecast", "ai/actions"]
  },
  "ai.adminAIControls": {
    label: "Admin AI controls",
    flag_key: "ai_concierge",
    audiences: ["admin"],
    modes: ["ai_concierge"],
    status: "working",
    public_visibility: false,
    required_backend_support: ["feature_flags", "ai_recommendations", "ai_actions"]
  },
  "notification.push": {
    label: "Push notifications",
    flag_key: "push_notification",
    audiences: ["guest", "partner", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "disabled",
    public_visibility: false,
    required_backend_support: ["push_subscriptions", "push_provider"]
  },
  "notification.sms": {
    label: "SMS notifications",
    flag_key: "sms",
    audiences: ["guest", "partner", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "disabled",
    public_visibility: false,
    required_backend_support: ["sms_provider", "notification_logs"]
  },
  "growth.referralProgram": {
    label: "Referral program",
    flag_key: "referral_program",
    audiences: ["guest", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "hidden",
    public_visibility: false,
    required_backend_support: ["referrals"]
  },
  "partner.restaurantAnalytics": {
    label: "Restaurant analytics",
    flag_key: "restaurant_analytics",
    audiences: ["partner", "admin"],
    modes: ["basic", "ai_concierge"],
    status: "working",
    public_visibility: false,
    required_backend_support: ["partner/stats", "reservations", "offers", "restaurant_followers"]
  }
};

export const ALLOWED_RESERVATION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "declined",
  "cancelled",
  "canceled",
  "completed",
  "requested",
  "confirmed",
  "no_show",
  "expired",
  "waiting_external_confirmation"
];

export const BOOKING_SOURCES = ["SMARTTABLE", "RESY", "OPENTABLE", "SEVENROOMS", "MANUAL"];

export const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "declined",
  "cancelled",
  "expired",
  "waiting_external_confirmation",
  "completed",
  "no_show"
];

export const ALLOWED_RESTAURANT_STATUSES = ["pending", "approved", "suspended"];
export const ALLOWED_OFFER_STATUSES = ["active", "paused", "sold_out", "expired"];
export const ALLOWED_REVIEW_STATUSES = ["pending", "approved", "rejected", "removed"];
export const ALLOWED_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function normalizeLanguage(value) {
  const lang = String(value || "").toLowerCase().slice(0, 2);
  return SUPPORTED_LANGUAGE_CONFIG[lang] ? lang : "en";
}

export function normalizePlatformMode(value) {
  const mode = String(value || "").toLowerCase();
  return PLATFORM_MODES[mode] ? mode : PLATFORM_MODES.basic;
}

export function normalizeBooleanSetting(value, fallback = false) {
  if (value === undefined || value === null) return Boolean(fallback);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

export function normalizeFeatureFlagSettings(value = {}) {
  const raw = value && typeof value === "object" ? value : {};
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  for (const [key, fallback] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    flags[key] = normalizeBooleanSetting(raw[key], fallback);
  }
  for (const [key, enabled] of Object.entries(raw)) {
    if (key && flags[key] === undefined) flags[key] = normalizeBooleanSetting(enabled, false);
  }
  return flags;
}

export function normalizePlatformSettings(value = {}) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    platform_mode: normalizePlatformMode(raw.platform_mode || raw.platformMode || raw.mode || DEFAULT_PLATFORM_SETTINGS.platform_mode),
    ai_demo_visibility: normalizeBooleanSetting(raw.ai_demo_visibility ?? raw.aiDemoVisibility, DEFAULT_PLATFORM_SETTINGS.ai_demo_visibility),
    show_ai_mode_badge: normalizeBooleanSetting(raw.show_ai_mode_badge ?? raw.showAiModeBadge, DEFAULT_PLATFORM_SETTINGS.show_ai_mode_badge),
    feature_flags: normalizeFeatureFlagSettings(raw.feature_flags || raw.featureFlags || {}),
    updated_at: raw.updated_at || null,
    updated_by: raw.updated_by || null
  };
}

export function canShowRegisteredFeature(featureKey, options = {}) {
  const feature = PLATFORM_FEATURE_REGISTRY[featureKey];
  if (!feature) return false;
  const mode = normalizePlatformMode(options.platformMode || DEFAULT_PLATFORM_SETTINGS.platform_mode);
  const audience = options.audience || "guest";
  const flags = normalizeFeatureFlagSettings(options.featureFlags || {});
  const demoVisible = normalizeBooleanSetting(options.aiDemoVisibility, false);
  if (!feature.modes.includes(mode)) return false;
  if (!feature.audiences.includes(audience)) return false;
  if (!normalizeBooleanSetting(flags[feature.flag_key], true)) return false;
  if (feature.status === "working") return true;
  if (feature.status === "demo") return Boolean(options.allowDemo || demoVisible);
  return false;
}
