import crypto from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  OFFER_ERROR_MESSAGES,
  availableSeatsForOffer,
  availableTablesForOffer,
  evaluateOfferValidity,
  offerReservationError
} from "./offer-validity.js";
import { createEmailService, isEmailAccepted } from "./email-service.js";
import { createReservationProvider, reservationProviderCatalog } from "./reservation-providers.js";
import {
  ALLOWED_DAYS,
  ALLOWED_OFFER_STATUSES,
  ALLOWED_RESERVATION_STATUSES,
  ALLOWED_RESTAURANT_STATUSES,
  ALLOWED_REVIEW_STATUSES,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_FEATURE_REGISTRY,
  normalizeBooleanSetting,
  normalizeFeatureFlagSettings,
  normalizeLanguage,
  normalizePlatformMode,
  normalizePlatformSettings
} from "../public/shared-contracts.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_SETTINGS_FILE = path.join(__dirname, "..", "data", "app-settings.json");

function envClean(value = "") {
  return String(value ?? "").trim();
}

function normalizeRuntimeEnvironment(value = "") {
  const normalized = envClean(value).toLowerCase();
  if (["prod", "production"].includes(normalized)) return "production";
  if (["preview", "staging", "stage"].includes(normalized)) return normalized === "stage" ? "staging" : normalized;
  return "development";
}

function normalizeBaseUrl(value = "") {
  return envClean(value).replace(/\/+$/, "");
}

function isValidHttpUrl(value = "") {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isLocalBaseUrl(value = "") {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname) || hostname.endsWith(".localhost");
  } catch {
    return true;
  }
}

function isDeprecatedPublicBaseDomain(value = "") {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "smarttable.com" || hostname === "www.smarttable.com";
  } catch {
    return false;
  }
}

function parseEmailAllowlist(value = "") {
  return envClean(value)
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const RUNTIME_ENVIRONMENT = normalizeRuntimeEnvironment(process.env.SMARTTABLE_ENV || process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "development");
const IS_PRODUCTION_RUNTIME = RUNTIME_ENVIRONMENT === "production";
const SUPABASE_URL = normalizeBaseUrl(process.env.SUPABASE_URL || "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const RAW_PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL || "");
const PUBLIC_BASE_URL = RAW_PUBLIC_BASE_URL || "https://smarttablenyc.com";
const RAW_EMAIL_FROM = envClean(process.env.EMAIL_FROM || "");
const EMAIL_FROM = RAW_EMAIL_FROM || "SmartTable <reservations@mail.smarttablenyc.com>";
const RESEND_API_KEY = envClean(process.env.RESEND_API_KEY || "");
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "admin@smarttable.com";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "smarttable-media";
const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
const IMPERSONATION_SECRET = process.env.IMPERSONATION_SECRET || SUPABASE_SERVICE_ROLE_KEY || "smarttable-dev-secret";
const TERMS_VERSION = process.env.TERMS_VERSION || "2026-07-17";
const PRIVACY_POLICY_VERSION = process.env.PRIVACY_POLICY_VERSION || "2026-07-17";
const EMAIL_TEMPLATE_VERSION = process.env.EMAIL_TEMPLATE_VERSION || "2026-07-19";
const EMAIL_RETRY_LIMIT = Math.max(1, Number(process.env.EMAIL_RETRY_LIMIT || 3));
const EMAIL_QUEUE_MAX_ATTEMPTS = Math.max(1, Number(process.env.EMAIL_QUEUE_MAX_ATTEMPTS || EMAIL_RETRY_LIMIT || 3));
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "";
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || "";
const EMAIL_WEBHOOK_TOLERANCE_SECONDS = Math.max(60, Number(process.env.EMAIL_WEBHOOK_TOLERANCE_SECONDS || 300));
const EMAIL_QUEUE_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];
const EMAIL_RECIPIENT_ALLOWLIST = parseEmailAllowlist(process.env.EMAIL_RECIPIENT_ALLOWLIST || process.env.EMAIL_ALLOWED_RECIPIENTS || "");
const SUPABASE_REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.SUPABASE_REQUEST_TIMEOUT_MS || 8000));
const APPLICATION_VERSION = envClean(process.env.npm_package_version || process.env.SMARTTABLE_VERSION || "");
const APPLICATION_COMMIT = envClean(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "").slice(0, 40);

const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);
const emailService = createEmailService({
  provider: "resend",
  resendApiKey: RESEND_API_KEY,
  defaultFrom: EMAIL_FROM,
  defaultReplyTo: EMAIL_REPLY_TO,
  environment: RUNTIME_ENVIRONMENT,
  enforceRecipientAllowlist: !IS_PRODUCTION_RUNTIME && Boolean(RESEND_API_KEY),
  recipientAllowlist: EMAIL_RECIPIENT_ALLOWLIST,
  fetchImpl: fetch
});

function productionConfigurationIssues() {
  if (!IS_PRODUCTION_RUNTIME) return [];
  const issues = [];
  if (!supabaseConfigured) issues.push("SUPABASE_CONFIGURATION_MISSING");
  if (!RAW_PUBLIC_BASE_URL) issues.push("PUBLIC_BASE_URL_MISSING");
  if (RAW_PUBLIC_BASE_URL && !isValidHttpUrl(RAW_PUBLIC_BASE_URL)) issues.push("PUBLIC_BASE_URL_INVALID");
  if (RAW_PUBLIC_BASE_URL && isLocalBaseUrl(RAW_PUBLIC_BASE_URL)) issues.push("PUBLIC_BASE_URL_LOCALHOST");
  if (RAW_PUBLIC_BASE_URL && isDeprecatedPublicBaseDomain(RAW_PUBLIC_BASE_URL)) issues.push("PUBLIC_BASE_URL_DEPRECATED_DOMAIN");
  if (!RAW_EMAIL_FROM) issues.push("EMAIL_FROM_MISSING");
  if (!RESEND_API_KEY) issues.push("RESEND_API_KEY_MISSING");
  return issues;
}

function productionConfigurationReady() {
  return productionConfigurationIssues().length === 0;
}

function deploymentDataMode() {
  if (IS_PRODUCTION_RUNTIME && !productionConfigurationReady()) return "configuration_error";
  return supabaseConfigured ? "supabase" : "demo";
}

function logSafeServerEvent(eventType, metadata = {}) {
  const safeMetadata = {
    event: String(eventType || "server_event"),
    timestamp: new Date().toISOString(),
    environment: RUNTIME_ENVIRONMENT,
    ...metadata
  };
  for (const key of Object.keys(safeMetadata)) {
    if (/secret|token|password|key|authorization/i.test(key)) {
      delete safeMetadata[key];
    }
  }
  console.error(JSON.stringify(safeMetadata));
}

async function checkDatabaseReachable() {
  if (!supabaseConfigured) return false;
  try {
    await supabaseFetch("/rest/v1/restaurants?select=id&limit=1", {
      service: true,
      timeoutMs: Math.min(SUPABASE_REQUEST_TIMEOUT_MS, 2500)
    });
    return true;
  } catch (error) {
    logSafeServerEvent("database_health_check_failed", {
      status: error.status || 500,
      code: error.code || "DATABASE_UNREACHABLE"
    });
    return false;
  }
}

async function runtimeHealthPayload() {
  const issues = productionConfigurationIssues();
  const databaseReachable = await checkDatabaseReachable();
  const ok = issues.length === 0 && (!IS_PRODUCTION_RUNTIME || databaseReachable);
  return {
    ok,
    status: ok ? "ok" : "degraded",
    environment: RUNTIME_ENVIRONMENT,
    runtime_mode: RUNTIME_ENVIRONMENT,
    mode: deploymentDataMode(),
    platform_mode_default: defaultPlatformSettings.platform_mode,
    version: APPLICATION_VERSION || null,
    commit: APPLICATION_COMMIT || null,
    public_base_url_configured: Boolean(RAW_PUBLIC_BASE_URL),
    public_base_url_uses_localhost: Boolean(PUBLIC_BASE_URL && isLocalBaseUrl(PUBLIC_BASE_URL)),
    supabase_configured: supabaseConfigured,
    database_reachable: databaseReachable,
    email_configured: emailService.configured,
    resend_webhook_configured: Boolean(RESEND_WEBHOOK_SECRET),
    webhook_status: RESEND_WEBHOOK_SECRET ? "configured" : "deferred",
    production_configuration_issues: issues
  };
}

const allowedReservationStatuses = new Set(ALLOWED_RESERVATION_STATUSES);
const bookingSources = new Set(BOOKING_SOURCES);
const bookingStatuses = new Set(BOOKING_STATUSES);
const allowedRestaurantStatuses = new Set(ALLOWED_RESTAURANT_STATUSES);
const allowedOfferStatuses = new Set(ALLOWED_OFFER_STATUSES);
const allowedReviewStatuses = new Set(ALLOWED_REVIEW_STATUSES);
const allowedDays = new Set(ALLOWED_DAYS);
const mutableReservationStatuses = new Set(["pending", "accepted", "rejected", "cancelled", "completed", "no_show"]);
const reservationStatusTransitions = {
  pending: new Set(["accepted", "rejected", "cancelled"]),
  accepted: new Set(["cancelled", "completed", "no_show"]),
  waiting_external_confirmation: new Set(["accepted", "rejected", "cancelled"])
};
const allowedSignupAnalyticsEvents = new Set([
  "signup_started",
  "signup_step_completed",
  "signup_abandoned",
  "signup_completed",
  "preference_selected",
  "terms_accepted",
  "privacy_accepted",
  "marketing_consent_given",
  "restaurant_followed_during_signup",
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
const allowedSignupAnalyticsProperties = new Set([
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
]);
const defaultPlatformSettings = DEFAULT_PLATFORM_SETTINGS;

const platformFeatureRegistry = PLATFORM_FEATURE_REGISTRY;

function isFeatureWorking(featureKey) {
  return platformFeatureRegistry[featureKey]?.status === "working";
}

function isLoyaltyRewardsWorking() {
  return isFeatureWorking("basic.loyalty");
}

function boolValue(value) {
  if (Array.isArray(value)) return boolValue(value.at(-1));
  return value === true || value === "true" || value === "on" || value === 1 || value === "1";
}

function languageColumn(lang, base = "value") {
  return `${base}_${normalizeLanguage(lang)}`;
}

const demo = {
  booted: false,
  users: [],
  profiles: [],
  guests: [],
  guestProfiles: [],
  restaurants: [],
  offers: [],
  reservations: [],
  siteContent: [],
  emailEvents: [],
  restaurantFollowers: [],
  restaurantReviews: [],
  adminNotifications: [],
  guestNotifications: [],
  aiPreferenceProfiles: [],
  aiInteractionEvents: [],
  analyticsEvents: [],
  aiDemandForecasts: [],
  aiRecommendations: [],
  aiActions: [],
  aiActionResults: [],
  aiServiceTimeObservations: [],
  aiRoutePlans: [],
  marketingCampaigns: [],
  emailLogs: [],
  emailQueue: [],
  notificationLogs: [],
  emailRateLimits: [],
  integrationConnections: [],
  integrationSyncRuns: [],
  integrationErrorLogs: [],
  dataImportJobs: [],
  importedReservations: [],
  importedGuests: [],
  manualPerformanceUploads: [],
  featureFlags: [],
  billingPlans: [],
  subscriptions: [],
  invoices: [],
  paymentEvents: [],
  appErrorLogs: [],
  adminAlerts: [],
  privacyRequests: [],
  guestConsents: [],
  consumptionUploads: [],
  photoRewardSubmissions: [],
  loyaltyAccounts: [],
  featureStatus: [],
  authAttempts: [],
  passwordResetTokens: [],
  appSettings: normalizePlatformSettings({ platform_mode: "basic" })
};

const defaultSiteContent = [
  {
    key: "seo_title",
    value_en: "SmartTable AI | The AI Revenue Operating System for Restaurants",
    value_es: "SmartTable AI | El sistema operativo de ingresos con IA para restaurantes",
    content_type: "text",
    group_name: "seo"
  },
  {
    key: "seo_meta_description",
    value_en: "SmartTable AI combines reservations, guest personalization, predictive demand intelligence, and revenue recovery tools for New York restaurants.",
    value_es: "SmartTable AI combina reservas, personalizacion para clientes, inteligencia predictiva de demanda y recuperacion de ingresos para restaurantes de Nueva York.",
    content_type: "textarea",
    group_name: "seo"
  },
  {
    key: "brand_title",
    value_en: "SmartTable AI",
    value_es: "SmartTable AI",
    content_type: "text",
    group_name: "site"
  },
  {
    key: "brand_subtitle",
    value_en: "The AI Revenue Operating System for Restaurants",
    value_es: "El sistema operativo de ingresos con IA para restaurantes",
    content_type: "text",
    group_name: "site"
  },
  {
    key: "basic_brand_title",
    value_en: "SmartTable",
    value_es: "SmartTable",
    value_hu: "SmartTable",
    content_type: "text",
    group_name: "site"
  },
  {
    key: "basic_brand_subtitle",
    value_en: "Discounted restaurant reservations",
    value_es: "Reservas de restaurantes con descuento",
    value_hu: "Kedvezmenyes ettermi foglalasok",
    content_type: "text",
    group_name: "site"
  },
  {
    key: "basic_seo_title",
    value_en: "SmartTable | Discounted New York restaurant reservations",
    value_es: "SmartTable | Reservas con descuento en restaurantes de New York",
    value_hu: "SmartTable | Kedvezmenyes ettermi foglalasok New Yorkban",
    content_type: "text",
    group_name: "seo"
  },
  {
    key: "basic_seo_meta_description",
    value_en: "Book discounted restaurant tables across New York and send reservation requests directly to restaurants.",
    value_es: "Reserva mesas con descuento en New York y envia solicitudes directamente a los restaurantes.",
    value_hu: "Foglalj kedvezmenyes ettermi asztalokat New Yorkban, kozvetlen foglalasi kerelemmel az etterem fele.",
    content_type: "textarea",
    group_name: "seo"
  },
  {
    key: "basic_hero_kicker",
    value_en: "SmartTable",
    value_es: "SmartTable",
    value_hu: "SmartTable",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "basic_hero_title",
    value_en: "Discounted restaurant reservations in New York",
    value_es: "Reservas de restaurantes con descuento en New York",
    value_hu: "Kedvezmenyes ettermi foglalasok New Yorkban",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "basic_hero_subtitle",
    value_en: "Browse restaurants, choose a discounted table offer, and send a reservation request directly to the restaurant.",
    value_es: "Explora restaurantes, elige una oferta de mesa con descuento y envia una solicitud de reserva directamente al restaurante.",
    value_hu: "Bongessz ettermeket, valassz kedvezmenyes asztalajanlatot, es kuldj foglalasi kerelmet kozvetlenul az etteremnek.",
    content_type: "textarea",
    group_name: "home"
  },
  {
    key: "hero_kicker",
    value_en: "SmartTable AI",
    value_es: "SmartTable AI",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "hero_title",
    value_en: "The AI Revenue Operating System for Restaurants",
    value_es: "El sistema operativo de ingresos con IA para restaurantes",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "hero_subtitle",
    value_en: "Personalized dining for guests, predictive demand intelligence for restaurants, and smarter revenue recovery across New York.",
    value_es: "Experiencias personalizadas para clientes, inteligencia predictiva de demanda para restaurantes y recuperacion inteligente de ingresos en Nueva York.",
    content_type: "textarea",
    group_name: "home"
  },
  {
    key: "company_description",
    value_en: "Smart Table is a SaaS reservation marketplace for New York restaurants that want to fill open tables with controlled discounts.",
    value_es: "Smart Table es una plataforma SaaS de reservas para restaurantes de Nueva York que quieren llenar mesas disponibles con descuentos controlados.",
    content_type: "textarea",
    group_name: "home"
  },
  {
    key: "marketplace_status_title",
    value_en: "Marketplace status",
    value_es: "Estado del marketplace",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "marketplace_status_demo",
    value_en: "Demo mode is active. Connect Supabase environment variables for production storage.",
    value_es: "El modo demo esta activo. Conecta las variables de Supabase para almacenamiento en produccion.",
    content_type: "textarea",
    group_name: "home"
  },
  {
    key: "marketplace_status_live",
    value_en: "Live Supabase storage is enabled for reservations, offers, users, and content.",
    value_es: "Supabase esta activo para reservas, ofertas, usuarios y contenido.",
    content_type: "textarea",
    group_name: "home"
  },
  {
    key: "offers_kicker",
    value_en: "Guest booking",
    value_es: "Reserva de clientes",
    content_type: "text",
    group_name: "offers"
  },
  {
    key: "offers_title",
    value_en: "Available discounted tables",
    value_es: "Mesas con descuento disponibles",
    content_type: "text",
    group_name: "offers"
  },
  {
    key: "offers_empty",
    value_en: "No active offers yet.",
    value_es: "Todavia no hay ofertas activas.",
    content_type: "text",
    group_name: "offers"
  },
  {
    key: "reserve_button",
    value_en: "Reserve",
    value_es: "Reservar",
    content_type: "text",
    group_name: "offers"
  },
  {
    key: "offers_count_label",
    value_en: "active offers",
    value_es: "ofertas activas",
    content_type: "text",
    group_name: "offers"
  },
  {
    key: "filter_neighborhood_label",
    value_en: "Neighborhood",
    value_es: "Barrio",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "filter_cuisine_label",
    value_en: "Cuisine",
    value_es: "Cocina",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "filter_discount_label",
    value_en: "Minimum discount",
    value_es: "Descuento minimo",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "filter_date_label",
    value_en: "Date",
    value_es: "Fecha",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "filter_time_label",
    value_en: "Time",
    value_es: "Hora",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "filter_party_size_label",
    value_en: "Party size",
    value_es: "Personas",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "filter_restaurant_name_label",
    value_en: "Restaurant name",
    value_es: "Nombre del restaurante",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "filter_available_only_label",
    value_en: "Only available offers",
    value_es: "Solo ofertas disponibles",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "sort_label",
    value_en: "Sort",
    value_es: "Ordenar",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "sort_recommended_label",
    value_en: "Recommended",
    value_es: "Recomendado",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "sort_newest_label",
    value_en: "Newest",
    value_es: "Mas nuevo",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "sort_highest_discount_label",
    value_en: "Highest discount",
    value_es: "Mayor descuento",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "sort_soonest_label",
    value_en: "Soonest available",
    value_es: "Mas pronto disponible",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "sort_name_label",
    value_en: "Restaurant name A-Z",
    value_es: "Restaurante A-Z",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "sort_admin_order_label",
    value_en: "Admin custom order",
    value_es: "Orden del admin",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "view_list_label",
    value_en: "List",
    value_es: "Lista",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "view_map_label",
    value_en: "Map",
    value_es: "Mapa",
    content_type: "text",
    group_name: "filters"
  },
  {
    key: "map_key_missing",
    value_en: "Google Maps is ready, but the API key is not configured yet.",
    value_es: "Google Maps esta preparado, pero falta configurar la clave API.",
    content_type: "text",
    group_name: "map"
  },
  {
    key: "follow_button",
    value_en: "Follow restaurant",
    value_es: "Seguir restaurante",
    content_type: "text",
    group_name: "favorites"
  },
  {
    key: "favorite_button",
    value_en: "Add to favorites",
    value_es: "Agregar a favoritos",
    content_type: "text",
    group_name: "favorites"
  },
  {
    key: "follow_title",
    value_en: "Follow this restaurant",
    value_es: "Seguir este restaurante",
    content_type: "text",
    group_name: "favorites"
  },
  {
    key: "follow_copy",
    value_en: "Get notified when this restaurant publishes new Smart Table offers.",
    value_es: "Recibe avisos cuando este restaurante publique nuevas ofertas en Smart Table.",
    content_type: "textarea",
    group_name: "favorites"
  },
  {
    key: "follow_success",
    value_en: "You are following this restaurant.",
    value_es: "Ahora sigues este restaurante.",
    content_type: "text",
    group_name: "favorites"
  },
  {
    key: "reserve_modal_title",
    value_en: "Reservation request",
    value_es: "Solicitud de reserva",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "modal_offer_label",
    value_en: "Selected offer",
    value_es: "Oferta seleccionada",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "modal_submit_label",
    value_en: "Send reservation request",
    value_es: "Enviar solicitud de reserva",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "modal_cancel_label",
    value_en: "Cancel",
    value_es: "Cancelar",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "confirmation_done_label",
    value_en: "Done",
    value_es: "Listo",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "reservation_success_title",
    value_en: "Reservation request sent",
    value_es: "Solicitud de reserva enviada",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "reservation_success_body",
    value_en: "Your reservation request was saved. A confirmation email has been queued. This is not a confirmed reservation yet; the restaurant still needs to accept it.",
    value_es: "Tu solicitud de reserva fue guardada. El email de confirmacion se puso en cola. Todavia no es una reserva confirmada; el restaurante debe aceptarla.",
    content_type: "textarea",
    group_name: "forms"
  },
  {
    key: "reservation_success_body_email_unconfirmed",
    value_en: "Your reservation request was saved, but the confirmation email could not be sent. You can still view it in My Reservations.",
    value_es: "Tu solicitud de reserva fue guardada, pero no se pudo enviar el email de confirmacion. Aun puedes verla en Mis reservas.",
    content_type: "textarea",
    group_name: "forms"
  },
  {
    key: "forgot_password_sent_title",
    value_en: "Request received",
    value_es: "Solicitud recibida",
    content_type: "text",
    group_name: "account"
  },
  {
    key: "forgot_password_sent_body",
    value_en: "If a SmartTable account exists for this email, a password reset message will be sent when email delivery is configured.",
    value_es: "Si existe una cuenta de SmartTable para este email, se enviara un mensaje de restablecimiento cuando la entrega de email este configurada.",
    content_type: "textarea",
    group_name: "account"
  },
  {
    key: "review_button",
    value_en: "Write review",
    value_es: "Escribir resena",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_title",
    value_en: "Review this restaurant",
    value_es: "Valorar este restaurante",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_food_label",
    value_en: "Food",
    value_es: "Comida",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_service_label",
    value_en: "Service",
    value_es: "Servicio",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_ambience_label",
    value_en: "Ambience",
    value_es: "Ambiente",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_overall_label",
    value_en: "Overall",
    value_es: "General",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_comment_label",
    value_en: "Comment",
    value_es: "Comentario",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_submit_label",
    value_en: "Submit review",
    value_es: "Enviar resena",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_success",
    value_en: "Thanks. Your review is waiting for admin approval.",
    value_es: "Gracias. Tu resena esta esperando aprobacion del admin.",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "review_count_label",
    value_en: "reviews",
    value_es: "resenas",
    content_type: "text",
    group_name: "reviews"
  },
  {
    key: "newest_restaurants_title",
    value_en: "Newest Restaurants This Week",
    value_es: "Restaurantes nuevos esta semana",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "newest_restaurants_kicker",
    value_en: "New this week",
    value_es: "Nuevo esta semana",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "newest_restaurants_empty",
    value_en: "No new restaurants were added this week. Check back soon.",
    value_es: "No se agregaron restaurantes nuevos esta semana. Vuelve pronto.",
    content_type: "textarea",
    group_name: "home"
  },
  {
    key: "newest_restaurants_cta",
    value_en: "View restaurant",
    value_es: "Ver restaurante",
    content_type: "text",
    group_name: "home"
  },
  {
    key: "notifications_title",
    value_en: "Notifications",
    value_es: "Notificaciones",
    content_type: "text",
    group_name: "admin"
  },
  {
    key: "notifications_mark_read",
    value_en: "Mark as read",
    value_es: "Marcar como leida",
    content_type: "text",
    group_name: "admin"
  },
  {
    key: "notifications_view_all",
    value_en: "View all notifications",
    value_es: "Ver todas las notificaciones",
    content_type: "text",
    group_name: "admin"
  },
  {
    key: "ai_concierge_title",
    value_en: "AI Dining Concierge",
    value_es: "Concierge gastronomico con IA",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_concierge_body",
    value_en: "Tell SmartTable what you like, then get restaurant recommendations that learn from your preferences, favorites, ratings, and reservation behavior.",
    value_es: "Dile a SmartTable lo que te gusta y recibe recomendaciones que aprenden de tus preferencias, favoritos, valoraciones y reservas.",
    content_type: "textarea",
    group_name: "ai"
  },
  {
    key: "ai_preferences_button",
    value_en: "Set dining preferences",
    value_es: "Configurar preferencias",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_recommendations_title",
    value_en: "Recommended for you",
    value_es: "Recomendado para ti",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_recommendations_empty",
    value_en: "Set your preferences to unlock personalized recommendations.",
    value_es: "Configura tus preferencias para ver recomendaciones personalizadas.",
    content_type: "textarea",
    group_name: "ai"
  },
  {
    key: "ai_match_label",
    value_en: "AI match",
    value_es: "Afinidad IA",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_smart_discount_label",
    value_en: "Smart discount",
    value_es: "Descuento inteligente",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_reason_label",
    value_en: "Why this works",
    value_es: "Por que encaja",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_wizard_title",
    value_en: "Build your dining profile",
    value_es: "Crea tu perfil gastronomico",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_wizard_save",
    value_en: "Save preferences",
    value_es: "Guardar preferencias",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_wizard_saved",
    value_en: "Your AI dining profile was saved.",
    value_es: "Tu perfil gastronomico de IA fue guardado.",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_budget_label",
    value_en: "Preferred spend per person",
    value_es: "Gasto preferido por persona",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_distance_label",
    value_en: "Preferred travel distance",
    value_es: "Distancia preferida",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_neighborhoods_label",
    value_en: "Preferred neighborhoods",
    value_es: "Barrios preferidos",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_dietary_label",
    value_en: "Dietary restrictions",
    value_es: "Restricciones dieteticas",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_discount_range_label",
    value_en: "Preferred discount range",
    value_es: "Rango de descuento preferido",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_demand_title",
    value_en: "Demand intelligence",
    value_es: "Inteligencia de demanda",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_cuisine_preferences_label",
    value_en: "Cuisine preferences",
    value_es: "Preferencias de cocina",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_food_interests_label",
    value_en: "Food interests",
    value_es: "Intereses de comida",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_drink_preferences_label",
    value_en: "Drink preferences",
    value_es: "Preferencias de bebidas",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_atmosphere_label",
    value_en: "Atmosphere",
    value_es: "Ambiente",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_preferred_times_label",
    value_en: "Preferred reservation times",
    value_es: "Horarios preferidos",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_preferred_days_label",
    value_en: "Preferred days",
    value_es: "Dias preferidos",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_favorite_restaurants_label",
    value_en: "Favorite restaurants",
    value_es: "Restaurantes favoritos",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_calendar_opt_in_label",
    value_en: "Use calendar signals later when connected",
    value_es: "Usar senales de calendario cuando este conectado",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_notes_label",
    value_en: "Extra preferences",
    value_es: "Preferencias adicionales",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_time_planning_title",
    value_en: "Future time planning",
    value_es: "Planificacion de tiempo futura",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_time_planning_body",
    value_en: "Calendar, traffic, walking time, parking, transit, and service duration are modeled for future concierge planning.",
    value_es: "Calendario, trafico, caminata, estacionamiento, transporte y duracion del servicio estan modelados para futura planificacion.",
    content_type: "textarea",
    group_name: "ai"
  },
  {
    key: "ai_service_time_title",
    value_en: "Service time estimate",
    value_es: "Estimacion de tiempo de servicio",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_route_planner_title",
    value_en: "Route planner",
    value_es: "Planificador de ruta",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_route_planner_body",
    value_en: "Plan home, restaurant, event, and return-home timing with traffic, walking, transit, parking, and weather hooks ready for live providers.",
    value_es: "Planifica casa, restaurante, evento y regreso con trafico, caminata, transporte, estacionamiento y clima listos para proveedores en vivo.",
    content_type: "textarea",
    group_name: "ai"
  },
  {
    key: "ai_consumption_title",
    value_en: "Dining photo rewards",
    value_es: "Recompensas por fotos",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_consumption_body",
    value_en: "Upload food or drink photos, add a short review, and earn loyalty points while helping SmartTable learn dining trends.",
    value_es: "Sube fotos de comida o bebidas, agrega una resena corta y gana puntos mientras ayudas a SmartTable a aprender tendencias.",
    content_type: "textarea",
    group_name: "ai"
  },
  {
    key: "ai_consumption_submit",
    value_en: "Submit photo intelligence",
    value_es: "Enviar inteligencia de foto",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_consumption_success",
    value_en: "Thanks. Loyalty points were added and the photo is queued for AI analysis.",
    value_es: "Gracias. Se agregaron puntos y la foto queda en cola para analisis de IA.",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_business_intelligence_title",
    value_en: "Restaurant intelligence",
    value_es: "Inteligencia del restaurante",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_privacy_note",
    value_en: "Only aggregated, anonymized analytics are shared with restaurants. Personal behavior is never exposed.",
    value_es: "Solo se comparten analiticas agregadas y anonimas con restaurantes. El comportamiento personal nunca se expone.",
    content_type: "textarea",
    group_name: "ai"
  },
  {
    key: "partner_greeting_template",
    value_en: "Good afternoon, {{restaurant_name}}.",
    value_es: "Buenas tardes, {{restaurant_name}}.",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_today_overview_title",
    value_en: "Today overview",
    value_es: "Resumen de hoy",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_ai_actions_title",
    value_en: "One-click AI actions",
    value_es: "Acciones de IA en un clic",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_apply_recommendation",
    value_en: "Apply recommendation",
    value_es: "Aplicar recomendacion",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_create_suggested_offer",
    value_en: "Create suggested offer",
    value_es: "Crear oferta sugerida",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_pause_low_offer",
    value_en: "Pause low-performing offer",
    value_es: "Pausar oferta de bajo rendimiento",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_future_time_planning_title",
    value_en: "Future Time Planning",
    value_es: "Planificacion futura del tiempo",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_future_time_planning_alert",
    value_en: "Rain expected around 6 PM. Demand may drop by 18%. Recommend 20% discount between 5:30 PM and 7:00 PM.",
    value_es: "Se espera lluvia alrededor de las 6 PM. La demanda puede bajar 18%. Recomendamos 20% de descuento entre 5:30 PM y 7:00 PM.",
    content_type: "textarea",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_dashboard_kicker",
    value_en: "Partner dashboard",
    value_es: "Panel de partner",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_dashboard_intro",
    value_en: "Your SmartTable operating cockpit for demand, offers, bookings, and AI recommendations.",
    value_es: "Tu centro operativo de SmartTable para demanda, ofertas, reservas y recomendaciones de IA.",
    content_type: "textarea",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_return_admin",
    value_en: "Return to Super Admin",
    value_es: "Volver a Super Admin",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_refresh",
    value_en: "Refresh",
    value_es: "Actualizar",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_today_kicker",
    value_en: "Operations",
    value_es: "Operaciones",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_ai_actions_kicker",
    value_en: "Automation",
    value_es: "Automatizacion",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_current_recommendation",
    value_en: "Current recommendation",
    value_es: "Recomendacion actual",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_ai_recommendation_label",
    value_en: "AI recommendation",
    value_es: "Recomendacion de IA",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_ai_recommendation_fallback",
    value_en: "Create a focused offer for the next lower-demand window and monitor conversion.",
    value_es: "Crea una oferta enfocada para la proxima ventana de menor demanda y monitorea la conversion.",
    content_type: "textarea",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_future_time_planning_kicker",
    value_en: "Planning intelligence",
    value_es: "Inteligencia de planificacion",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_views",
    value_en: "Views",
    value_es: "Vistas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_bookings",
    value_en: "Bookings",
    value_es: "Reservas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_accepted",
    value_en: "Accepted",
    value_es: "Aceptadas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_rejected",
    value_en: "Rejected",
    value_es: "Rechazadas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_favorites",
    value_en: "Favorites",
    value_es: "Favoritos",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_favorites_week",
    value_en: "Favorites this week",
    value_es: "Favoritos esta semana",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_favorites_month",
    value_en: "Favorites this month",
    value_es: "Favoritos este mes",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_conversion",
    value_en: "Conversion rate",
    value_es: "Tasa de conversion",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_revenue_recovered",
    value_en: "Revenue recovered",
    value_es: "Ingresos recuperados",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_kpi_active_offers",
    value_en: "Active offers",
    value_es: "Ofertas activas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_todays_bookings",
    value_en: "Today's bookings",
    value_es: "Reservas de hoy",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_expected_guests",
    value_en: "Expected guests",
    value_es: "Clientes esperados",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_today_active_offers",
    value_en: "Active offers",
    value_es: "Ofertas activas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_demand_score",
    value_en: "Demand score",
    value_es: "Puntaje de demanda",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_suggested_discount",
    value_en: "Suggested discount",
    value_es: "Descuento sugerido",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_trend_label",
    value_en: "Trend",
    value_es: "Tendencia",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_confidence_label",
    value_en: "Confidence",
    value_es: "Confianza",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_expected_bookings",
    value_en: "Expected bookings",
    value_es: "Reservas esperadas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_expected_revenue_lift",
    value_en: "Expected revenue lift",
    value_es: "Aumento esperado de ingresos",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_suggested_action",
    value_en: "Suggested action",
    value_es: "Accion sugerida",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_revenue_without_discount",
    value_en: "Without suggested discount",
    value_es: "Sin descuento sugerido",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_revenue_with_discount",
    value_en: "With suggested discount",
    value_es: "Con descuento sugerido",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_revenue_lift",
    value_en: "Lift",
    value_es: "Incremento",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_reservations_signal",
    value_en: "reservations signal",
    value_es: "senal de reservas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_active_offers_signal",
    value_en: "active offers",
    value_es: "ofertas activas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_views_signal",
    value_en: "views",
    value_es: "vistas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_weather",
    value_en: "Weather",
    value_es: "Clima",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_traffic",
    value_en: "Traffic",
    value_es: "Trafico",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_parking",
    value_en: "Parking",
    value_es: "Estacionamiento",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_walking_time",
    value_en: "Walking time",
    value_es: "Tiempo caminando",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_transit",
    value_en: "Transit",
    value_es: "Transporte publico",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_nearby_events",
    value_en: "Nearby events",
    value_es: "Eventos cercanos",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_service_duration",
    value_en: "Service duration",
    value_es: "Duracion del servicio",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_best_booking_windows",
    value_en: "Best booking windows",
    value_es: "Mejores ventanas de reserva",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_risk_alerts",
    value_en: "Risk alerts",
    value_es: "Alertas de riesgo",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_status_good",
    value_en: "good",
    value_es: "bien",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_status_watch",
    value_en: "watch",
    value_es: "vigilar",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_planning_status_risk",
    value_en: "risk",
    value_es: "riesgo",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_overview",
    value_en: "Overview",
    value_es: "Resumen",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_today",
    value_en: "Today",
    value_es: "Hoy",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_ai_actions",
    value_en: "AI actions",
    value_es: "Acciones IA",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_ai_demand",
    value_en: "AI demand",
    value_es: "Demanda IA",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_time_planning",
    value_en: "Time planning",
    value_es: "Planificacion",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_intelligence",
    value_en: "Intelligence",
    value_es: "Inteligencia",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_profile",
    value_en: "Profile",
    value_es: "Perfil",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_create_offer",
    value_en: "Create offer",
    value_es: "Crear oferta",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_offers",
    value_en: "Offers",
    value_es: "Ofertas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "partner_nav_reservations",
    value_en: "Reservations",
    value_es: "Reservas",
    content_type: "text",
    group_name: "partner_dashboard"
  },
  {
    key: "guest_name_label",
    value_en: "Name",
    value_es: "Nombre",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "guest_email_label",
    value_en: "Email",
    value_es: "Email",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "guest_phone_label",
    value_en: "Phone",
    value_es: "Telefono",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "party_size_label",
    value_en: "Party size",
    value_es: "Personas",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "notes_label",
    value_en: "Notes",
    value_es: "Notas",
    content_type: "text",
    group_name: "forms"
  },
  {
    key: "about_title",
    value_en: "About Smart Table",
    value_es: "Sobre Smart Table",
    content_type: "text",
    group_name: "about"
  },
  {
    key: "about_body",
    value_en: "We help restaurants turn quiet service windows into booked revenue while guests discover better-value tables across New York.",
    value_es: "Ayudamos a restaurantes a convertir horarios tranquilos en ingresos reservados mientras los clientes descubren mejores mesas en Nueva York.",
    content_type: "textarea",
    group_name: "about"
  },
  {
    key: "how_it_works_title",
    value_en: "How it works",
    value_es: "Como funciona",
    content_type: "text",
    group_name: "about"
  },
  {
    key: "how_it_works_body",
    value_en: "Restaurants publish discounted table offers, guests request a reservation, and the restaurant accepts or rejects it from the partner dashboard.",
    value_es: "Los restaurantes publican ofertas con descuento, los clientes solicitan una reserva y el restaurante la acepta o rechaza desde su panel.",
    content_type: "textarea",
    group_name: "about"
  },
  {
    key: "restaurants_title",
    value_en: "For restaurants",
    value_es: "Para restaurantes",
    content_type: "text",
    group_name: "audience"
  },
  {
    key: "restaurants_body",
    value_en: "Control discounts, table availability, profile content, reservation decisions, and performance from one partner dashboard.",
    value_es: "Controla descuentos, disponibilidad, perfil, decisiones de reservas y rendimiento desde un solo panel de partner.",
    content_type: "textarea",
    group_name: "audience"
  },
  {
    key: "guests_title",
    value_en: "For guests",
    value_es: "Para clientes",
    content_type: "text",
    group_name: "audience"
  },
  {
    key: "guests_body",
    value_en: "Find a deal, request a table, and receive email updates when the restaurant reviews your reservation.",
    value_es: "Encuentra una oferta, solicita una mesa y recibe emails cuando el restaurante revise tu reserva.",
    content_type: "textarea",
    group_name: "audience"
  },
  {
    key: "footer_text",
    value_en: "SmartTable serves New York restaurants and guests with discounted reservation technology.",
    value_es: "SmartTable conecta restaurantes y clientes de Nueva York con tecnologia de reservas con descuento.",
    content_type: "textarea",
    group_name: "footer"
  },
  {
    key: "banner_image",
    value_en: "/assets/restaurant-hero.png",
    value_es: "/assets/restaurant-hero.png",
    content_type: "image",
    group_name: "media"
  },
  {
    key: "nav_offers",
    value_en: "Offers",
    value_es: "Ofertas",
    content_type: "text",
    group_name: "navigation"
  },
  {
    key: "nav_admin",
    value_en: "Super Admin",
    value_es: "Admin",
    content_type: "text",
    group_name: "navigation"
  },
  {
    key: "nav_partner",
    value_en: "Partner",
    value_es: "Partner",
    content_type: "text",
    group_name: "navigation"
  },
  {
    key: "login_button",
    value_en: "Login",
    value_es: "Entrar",
    content_type: "text",
    group_name: "navigation"
  },
  {
    key: "logout_button",
    value_en: "Logout",
    value_es: "Salir",
    content_type: "text",
    group_name: "navigation"
  },
  {
    key: "email_guest_registration_subject",
    value_en: "Welcome to SmartTable",
    value_es: "Bienvenido a SmartTable",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_guest_registration_body",
    value_en: "Hi {{guest_name}}, your SmartTable account is ready. You can now explore restaurants, save favorites, and request discounted tables.",
    value_es: "Hola {{guest_name}}, tu cuenta de SmartTable esta lista. Ahora puedes explorar restaurantes, guardar favoritos y solicitar mesas con descuento.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_cta_explore_restaurants",
    value_en: "Explore Restaurants",
    value_es: "Explorar restaurantes",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_verification_subject",
    value_en: "Verify your SmartTable email",
    value_es: "Verifica tu email de SmartTable",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_verification_body",
    value_en: "Hi {{guest_name}}, verify your SmartTable email address here: {{verification_url}}",
    value_es: "Hola {{guest_name}}, verifica tu direccion de email de SmartTable aqui: {{verification_url}}",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_cta_verify_email",
    value_en: "Verify email",
    value_es: "Verificar email",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_password_reset_subject",
    value_en: "Reset your SmartTable password",
    value_es: "Restablece tu contrasena de SmartTable",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_password_reset_body",
    value_en: "If you requested a SmartTable password reset, use this link: {{reset_url}}. If you did not request it, you can ignore this message.",
    value_es: "Si solicitaste restablecer tu contrasena de SmartTable, usa este enlace: {{reset_url}}. Si no lo solicitaste, puedes ignorar este mensaje.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_cta_reset_password",
    value_en: "Reset password",
    value_es: "Restablecer contrasena",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_password_changed_subject",
    value_en: "Your SmartTable password was changed",
    value_es: "Tu contrasena de SmartTable fue cambiada",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_password_changed_body",
    value_en: "Hi {{guest_name}}, your SmartTable password was changed successfully. If you did not make this change, contact SmartTable support immediately.",
    value_es: "Hola {{guest_name}}, tu contrasena de SmartTable se cambio correctamente. Si no hiciste este cambio, contacta al soporte de SmartTable de inmediato.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_cta_my_account",
    value_en: "Open my account",
    value_es: "Abrir mi cuenta",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_guest_received_subject",
    value_en: "Your Smart Table reservation request was received",
    value_es: "Recibimos tu solicitud de reserva en Smart Table",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_guest_received_body",
    value_en: "Hi {{guest_name}}, we received your reservation request for {{reservation_summary}}. Reference: {{reference}}. The restaurant will review it soon.",
    value_es: "Hola {{guest_name}}, recibimos tu solicitud para {{reservation_summary}}. Referencia: {{reference}}. El restaurante la revisara pronto.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_guest_pending_notice",
    value_en: "Status: pending. This is a reservation request, not a confirmed reservation yet. The restaurant must accept it before it is confirmed.",
    value_es: "Estado: pendiente. Esta es una solicitud de reserva, no una reserva confirmada todavia. El restaurante debe aceptarla antes de que quede confirmada.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_cta_my_reservations",
    value_en: "View My Reservations",
    value_es: "Ver mis reservas",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_restaurant_new_subject",
    value_en: "New reservation request from Smart Table",
    value_es: "Nueva solicitud de reserva de Smart Table",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_restaurant_new_body",
    value_en: "New pending reservation request for {{restaurant_name}}. Reference: {{reference}}. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.",
    value_es: "Nueva solicitud de reserva pendiente para {{restaurant_name}}. Referencia: {{reference}}. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notas: {{notes}}.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_cta_open_dashboard",
    value_en: "Open dashboard",
    value_es: "Abrir dashboard",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_admin_new_subject",
    value_en: "Smart Table admin notice: new reservation request",
    value_es: "Aviso admin de Smart Table: nueva solicitud de reserva",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_admin_new_body",
    value_en: "A new reservation was created for {{restaurant_name}}. {{reservation_summary}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}.",
    value_es: "Se creo una nueva reserva para {{restaurant_name}}. {{reservation_summary}}. Cliente: {{guest_name}}, {{guest_email}}, {{guest_phone}}.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_guest_accepted_subject",
    value_en: "Your reservation was confirmed",
    value_es: "Tu reserva fue confirmada",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_guest_accepted_body",
    value_en: "Good news, {{guest_name}}. {{restaurant_name}} confirmed your reservation. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Discount: {{discount}}%. Address: {{restaurant_address}}. Reference: {{reference}}.",
    value_es: "Buenas noticias, {{guest_name}}. {{restaurant_name}} confirmo tu reserva. Oferta: {{offer_title}}. Fecha/hora: {{reservation_date}} {{reservation_time}}. Personas: {{party_size}}. Descuento: {{discount}}%. Direccion: {{restaurant_address}}. Referencia: {{reference}}.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_guest_accepted_notice",
    value_en: "Status: accepted. Your reservation is confirmed by the restaurant.",
    value_es: "Estado: aceptada. Tu reserva esta confirmada por el restaurante.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_guest_rejected_subject",
    value_en: "Your reservation request was not confirmed",
    value_es: "Tu solicitud de reserva no fue confirmada",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_guest_rejected_body",
    value_en: "Hi {{guest_name}}, {{restaurant_name}} could not confirm your reservation request for {{reservation_date}} at {{reservation_time}}. Reference: {{reference}}.",
    value_es: "Hola {{guest_name}}, {{restaurant_name}} no pudo confirmar tu solicitud para {{reservation_date}} a las {{reservation_time}}. Referencia: {{reference}}.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_guest_rejected_notice",
    value_en: "Status: declined. You can return to SmartTable to find another available table.",
    value_es: "Estado: rechazada. Puedes volver a SmartTable para encontrar otra mesa disponible.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_cta_find_another_table",
    value_en: "Find another table",
    value_es: "Buscar otra mesa",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_guest_cancelled_subject",
    value_en: "Your reservation was cancelled",
    value_es: "Tu reserva fue cancelada",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_guest_cancelled_body",
    value_en: "Hi {{guest_name}}, your SmartTable reservation at {{restaurant_name}} for {{reservation_date}} at {{reservation_time}} was cancelled. Reference: {{reference}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.",
    value_es: "Hola {{guest_name}}, tu reserva de SmartTable en {{restaurant_name}} para {{reservation_date}} a las {{reservation_time}} fue cancelada. Referencia: {{reference}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_guest_cancelled_notice",
    value_en: "Status: cancelled. This reservation is no longer active.",
    value_es: "Estado: cancelada. Esta reserva ya no esta activa.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "email_restaurant_cancelled_subject",
    value_en: "SmartTable reservation cancelled: {{reference}}",
    value_es: "Reserva de SmartTable cancelada: {{reference}}",
    content_type: "text",
    group_name: "email"
  },
  {
    key: "email_restaurant_cancelled_body",
    value_en: "Reservation {{reference}} for {{restaurant_name}} on {{reservation_date}} at {{reservation_time}} was cancelled. Guest: {{guest_name}}. Cancelled at: {{cancelled_at}}. Cancelled by: {{cancelled_by_label}}.",
    value_es: "La reserva {{reference}} para {{restaurant_name}} el {{reservation_date}} a las {{reservation_time}} fue cancelada. Cliente: {{guest_name}}. Cancelada a las: {{cancelled_at}}. Cancelada por: {{cancelled_by_label}}.",
    content_type: "textarea",
    group_name: "email"
  },
  {
    key: "reservation_accepted_notification_title",
    value_en: "Reservation confirmed",
    value_es: "Reserva confirmada",
    content_type: "text",
    group_name: "notifications"
  },
  {
    key: "reservation_accepted_notification_message",
    value_en: "{{restaurant_name}} confirmed your reservation. Reference: {{reference}}.",
    value_es: "{{restaurant_name}} confirmo tu reserva. Referencia: {{reference}}.",
    content_type: "textarea",
    group_name: "notifications"
  },
  {
    key: "reservation_accepted_notification_cta",
    value_en: "View reservation",
    value_es: "Ver reserva",
    content_type: "text",
    group_name: "notifications"
  },
  {
    key: "reservation_rejected_notification_title",
    value_en: "Reservation not confirmed",
    value_es: "Reserva no confirmada",
    content_type: "text",
    group_name: "notifications"
  },
  {
    key: "reservation_rejected_notification_message",
    value_en: "{{restaurant_name}} could not confirm your reservation request. Reference: {{reference}}.",
    value_es: "{{restaurant_name}} no pudo confirmar tu solicitud de reserva. Referencia: {{reference}}.",
    content_type: "textarea",
    group_name: "notifications"
  },
  {
    key: "reservation_rejected_notification_cta",
    value_en: "View reservation",
    value_es: "Ver reserva",
    content_type: "text",
    group_name: "notifications"
  },
  {
    key: "reservation_cancelled_notification_title",
    value_en: "Reservation cancelled",
    value_es: "Reserva cancelada",
    content_type: "text",
    group_name: "notifications"
  },
  {
    key: "reservation_cancelled_notification_message",
    value_en: "Your reservation at {{restaurant_name}} was cancelled. Reference: {{reference}}.",
    value_es: "Tu reserva en {{restaurant_name}} fue cancelada. Referencia: {{reference}}.",
    content_type: "textarea",
    group_name: "notifications"
  },
  {
    key: "reservation_cancelled_notification_cta",
    value_en: "View reservation",
    value_es: "Ver reserva",
    content_type: "text",
    group_name: "notifications"
  },
  {
    key: "advisor_name",
    value_en: "SmartTable AI Advisor",
    value_es: "Asesor IA de SmartTable",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "advisor_placeholder",
    value_en: "Ask about demand, discounts, offers...",
    value_es: "Pregunta sobre demanda, descuentos, ofertas...",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "advisor_future_note",
    value_en: "Demo advisor now. OpenAI/API integration layer is prepared for later.",
    value_es: "Asesor demo por ahora. La capa OpenAI/API esta preparada para despues.",
    content_type: "textarea",
    group_name: "ai"
  },
  {
    key: "restaurant_details_button",
    value_en: "View details",
    value_es: "Ver detalles",
    content_type: "text",
    group_name: "restaurant_detail"
  },
  {
    key: "restaurant_detail_kicker",
    value_en: "Restaurant profile",
    value_es: "Perfil del restaurante",
    content_type: "text",
    group_name: "restaurant_detail"
  },
  {
    key: "restaurant_ai_match_copy",
    value_en: "SmartTable compares your preferences, location, quality signals, and available offers for this match.",
    value_es: "SmartTable compara tus preferencias, ubicacion, calidad y ofertas disponibles para esta coincidencia.",
    content_type: "textarea",
    group_name: "restaurant_detail"
  },
  {
    key: "amenities_title",
    value_en: "Amenities",
    value_es: "Comodidades",
    content_type: "text",
    group_name: "restaurant_detail"
  },
  {
    key: "menu_link_label",
    value_en: "View menu",
    value_es: "Ver menu",
    content_type: "text",
    group_name: "restaurant_detail"
  },
  {
    key: "directions_link_label",
    value_en: "Map / directions",
    value_es: "Mapa / direcciones",
    content_type: "text",
    group_name: "restaurant_detail"
  },
  {
    key: "ai_walking_tolerance_label",
    value_en: "Walking distance tolerance",
    value_es: "Tolerancia de distancia caminando",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_time_windows_label",
    value_en: "Preferred time windows",
    value_es: "Ventanas horarias preferidas",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_occasion_label",
    value_en: "Occasion",
    value_es: "Ocasion",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_travel_estimate_label",
    value_en: "Travel estimate",
    value_es: "Estimacion de viaje",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_best_time_label",
    value_en: "Best time",
    value_es: "Mejor hora",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "ai_why_recommended_label",
    value_en: "Why recommended",
    value_es: "Por que recomendado",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "event_planner_title",
    value_en: "Plan around an event",
    value_es: "Planear alrededor de un evento",
    content_type: "text",
    group_name: "ai"
  },
  {
    key: "event_planner_body",
    value_en: "Tell SmartTable about a show, meeting, game, or family event and get a dining window with travel and buffer time.",
    value_es: "Cuenta a SmartTable sobre un show, reunion, partido o evento familiar y recibe una ventana para comer con viaje y margen.",
    content_type: "textarea",
    group_name: "ai"
  }
];

defaultSiteContent.push(
  { key: "advisor_send", value_en: "Send", value_es: "Enviar", content_type: "text", group_name: "ai" },
  { key: "advisor_typing", value_en: "SmartTable is thinking...", value_es: "SmartTable esta pensando...", content_type: "text", group_name: "ai" },
  { key: "active_offers_label", value_en: "Active offers", value_es: "Ofertas activas", content_type: "text", group_name: "restaurant_detail" },
  { key: "restaurant_offers_title", value_en: "Available tables", value_es: "Mesas disponibles", content_type: "text", group_name: "restaurant_detail" },
  { key: "offer_default_title", value_en: "SmartTable offer", value_es: "Oferta SmartTable", content_type: "text", group_name: "restaurant_detail" },
  { key: "tables_left_label", value_en: "tables left", value_es: "mesas disponibles", content_type: "text", group_name: "restaurant_detail" },
  { key: "max_party_label", value_en: "Max party", value_es: "Grupo maximo", content_type: "text", group_name: "restaurant_detail" },
  { key: "business_hours_label", value_en: "Business hours", value_es: "Horario", content_type: "text", group_name: "restaurant_detail" },
  { key: "chef_name_label", value_en: "Chef", value_es: "Chef", content_type: "text", group_name: "restaurant_detail" },
  { key: "year_opened_label", value_en: "Year opened", value_es: "Ano de apertura", content_type: "text", group_name: "restaurant_detail" },
  { key: "capacity_label", value_en: "Capacity", value_es: "Capacidad", content_type: "text", group_name: "restaurant_detail" },
  { key: "dress_code_label", value_en: "Dress code", value_es: "Codigo de vestimenta", content_type: "text", group_name: "restaurant_detail" },
  { key: "amenities_empty", value_en: "Amenities will appear here soon.", value_es: "Las comodidades apareceran pronto.", content_type: "text", group_name: "restaurant_detail" },
  { key: "amenity_outdoor", value_en: "Outdoor seating", value_es: "Asientos al aire libre", content_type: "text", group_name: "restaurant_detail" },
  { key: "amenity_parking", value_en: "Parking available", value_es: "Estacionamiento disponible", content_type: "text", group_name: "restaurant_detail" },
  { key: "amenity_kids", value_en: "Kids friendly", value_es: "Apto para ninos", content_type: "text", group_name: "restaurant_detail" },
  { key: "amenity_pets", value_en: "Pet friendly", value_es: "Apto para mascotas", content_type: "text", group_name: "restaurant_detail" },
  { key: "amenity_accessible", value_en: "Wheelchair accessible", value_es: "Accesible en silla de ruedas", content_type: "text", group_name: "restaurant_detail" },
  { key: "amenity_private_room", value_en: "Private room", value_es: "Salon privado", content_type: "text", group_name: "restaurant_detail" },
  { key: "gallery_title", value_en: "Gallery", value_es: "Galeria", content_type: "text", group_name: "restaurant_detail" },
  { key: "restaurant_gallery_title", value_en: "Dining room and dishes", value_es: "Salon y platos", content_type: "text", group_name: "restaurant_detail" },
  { key: "reviews_title", value_en: "Reviews", value_es: "Resenas", content_type: "text", group_name: "restaurant_detail" },
  { key: "rating_summary_title", value_en: "Rating summary", value_es: "Resumen de calificaciones", content_type: "text", group_name: "restaurant_detail" },
  { key: "ai_parking_required_label", value_en: "Parking required", value_es: "Estacionamiento requerido", content_type: "text", group_name: "ai" },
  { key: "ai_subway_preferred_label", value_en: "Subway preferred", value_es: "Metro preferido", content_type: "text", group_name: "ai" },
  { key: "ai_kids_friendly_label", value_en: "Kids friendly", value_es: "Apto para ninos", content_type: "text", group_name: "ai" },
  { key: "ai_outdoor_seating_label", value_en: "Outdoor seating", value_es: "Asientos al aire libre", content_type: "text", group_name: "ai" },
  { key: "event_planner_kicker", value_en: "Program + dining planner", value_es: "Planificador de programa + cena", content_type: "text", group_name: "ai" },
  { key: "event_name_label", value_en: "Event name", value_es: "Nombre del evento", content_type: "text", group_name: "ai" },
  { key: "event_location_label", value_en: "Event location", value_es: "Ubicacion del evento", content_type: "text", group_name: "ai" },
  { key: "event_start_label", value_en: "Event start time", value_es: "Inicio del evento", content_type: "text", group_name: "ai" },
  { key: "event_end_label", value_en: "Event end time", value_es: "Fin del evento", content_type: "text", group_name: "ai" },
  { key: "event_dinner_timing_label", value_en: "Dinner timing", value_es: "Momento de cena", content_type: "text", group_name: "ai" },
  { key: "event_before_label", value_en: "Before event", value_es: "Antes del evento", content_type: "text", group_name: "ai" },
  { key: "event_after_label", value_en: "After event", value_es: "Despues del evento", content_type: "text", group_name: "ai" },
  { key: "event_transport_label", value_en: "Transportation preference", value_es: "Preferencia de transporte", content_type: "text", group_name: "ai" },
  { key: "event_max_travel_label", value_en: "Maximum travel time", value_es: "Tiempo maximo de viaje", content_type: "text", group_name: "ai" },
  { key: "event_restaurant_label", value_en: "Preferred restaurant", value_es: "Restaurante preferido", content_type: "text", group_name: "ai" },
  { key: "event_plan_button", value_en: "Create event dining plan", value_es: "Crear plan de cena", content_type: "text", group_name: "ai" },
  { key: "event_recommended_window", value_en: "Recommended dining window", value_es: "Ventana recomendada", content_type: "text", group_name: "ai" },
  { key: "event_suggested_restaurant", value_en: "Suggested restaurant", value_es: "Restaurante sugerido", content_type: "text", group_name: "ai" },
  { key: "event_estimated_travel", value_en: "Estimated travel", value_es: "Viaje estimado", content_type: "text", group_name: "ai" },
  { key: "event_buffer_time", value_en: "Buffer time", value_es: "Tiempo de margen", content_type: "text", group_name: "ai" },
  { key: "event_future_integrations", value_en: "Prepared for Google Calendar and Google Maps integration.", value_es: "Preparado para integracion con Google Calendar y Google Maps.", content_type: "textarea", group_name: "ai" },
  { key: "event_plan_created", value_en: "Event dining plan created.", value_es: "Plan de cena creado.", content_type: "text", group_name: "ai" }
);

defaultSiteContent.push(
  { key: "partner_ai_score_kicker", value_en: "Restaurant intelligence", value_es: "Inteligencia del restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_ai_score_title", value_en: "SmartTable AI Score", value_es: "Puntaje IA de SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_revenue_opportunity_week", value_en: "Revenue opportunity", value_es: "Oportunidad de ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "this_week_label", value_en: "this week", value_es: "esta semana", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_risk_level", value_en: "Risk level", value_es: "Nivel de riesgo", content_type: "text", group_name: "partner_dashboard" },
  { key: "revenue_forecast_kicker", value_en: "Revenue forecast", value_es: "Pronostico de ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "revenue_forecast_title", value_en: "SmartTable revenue forecast", value_es: "Pronostico de ingresos SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "revenue_without_ai", value_en: "Revenue without AI", value_es: "Ingresos sin IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "revenue_with_ai", value_en: "Revenue with AI", value_es: "Ingresos con IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "potential_lift", value_en: "Potential lift", value_es: "Incremento potencial", content_type: "text", group_name: "partner_dashboard" },
  { key: "estimated_recovered_revenue", value_en: "Estimated recovered revenue", value_es: "Ingresos recuperados estimados", content_type: "text", group_name: "partner_dashboard" },
  { key: "revenue_forecast_note", value_en: "This shows how SmartTable can recover otherwise quiet-table revenue while keeping discounts controlled.", value_es: "Esto muestra como SmartTable puede recuperar ingresos de mesas tranquilas manteniendo descuentos controlados.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "ai_recommendation_feed_kicker", value_en: "AI recommendation feed", value_es: "Feed de recomendaciones IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_recommendation_feed_title", value_en: "Recommended next moves", value_es: "Proximos pasos recomendados", content_type: "text", group_name: "partner_dashboard" },
  { key: "expected_impact_label", value_en: "Expected impact", value_es: "Impacto esperado", content_type: "text", group_name: "partner_dashboard" },
  { key: "booking_heatmap_kicker", value_en: "Demand heat map", value_es: "Mapa de calor de demanda", content_type: "text", group_name: "partner_dashboard" },
  { key: "booking_heatmap_title", value_en: "Booking demand by day and time", value_es: "Demanda por dia y hora", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_notify_favorite_guests", value_en: "Notify favorite guests", value_es: "Notificar clientes favoritos", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_increase_availability", value_en: "Increase availability", value_es: "Aumentar disponibilidad", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_lower_discount", value_en: "Lower discount to protect margin", value_es: "Bajar descuento para proteger margen", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_raise_discount", value_en: "Raise discount for weak demand", value_es: "Subir descuento para demanda debil", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_ai_score", value_en: "AI Score", value_es: "Puntaje IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_revenue", value_en: "Revenue", value_es: "Ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_recommendations", value_en: "AI feed", value_es: "Feed IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_heatmap", value_en: "Heat map", value_es: "Mapa de calor", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketplace_insights_kicker", value_en: "Marketplace intelligence", value_es: "Inteligencia del marketplace", content_type: "text", group_name: "admin" },
  { key: "marketplace_insights_title", value_en: "AI marketplace insights", value_es: "Insights IA del marketplace", content_type: "text", group_name: "admin" },
  { key: "marketplace_insights_note", value_en: "Placeholder market insights are structured for future live analytics, search, upload, reservation, and satisfaction pipelines.", value_es: "Insights placeholder preparados para futuras analiticas en vivo de busqueda, subidas, reservas y satisfaccion.", content_type: "textarea", group_name: "admin" }
);

defaultSiteContent.push(
  { key: "benchmark_kicker", value_en: "Restaurant benchmark", value_es: "Benchmark del restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_title", value_en: "Compared to Similar Restaurants", value_es: "Comparado con restaurantes similares", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_note", value_en: "Benchmarks use anonymized category-level comparison data and demo estimates until live market analytics are connected.", value_es: "Los benchmarks usan datos anonimos por categoria y estimaciones demo hasta conectar analiticas en vivo.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "partner_nav_benchmark", value_en: "Benchmark", value_es: "Benchmark", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_bookings", value_en: "Bookings", value_es: "Reservas", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_favorites", value_en: "Favorites", value_es: "Favoritos", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_rating", value_en: "Rating", value_es: "Calificacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_service_duration", value_en: "Average service duration", value_es: "Duracion media del servicio", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_discount_performance", value_en: "Discount performance", value_es: "Rendimiento del descuento", content_type: "text", group_name: "partner_dashboard" },
  { key: "benchmark_conversion_rate", value_en: "Conversion rate", value_es: "Tasa de conversion", content_type: "text", group_name: "partner_dashboard" },
  { key: "consumer_intelligence_kicker", value_en: "Consumer intelligence", value_es: "Inteligencia de consumidores", content_type: "text", group_name: "admin" },
  { key: "consumer_intelligence_title", value_en: "Anonymized dining behavior insights", value_es: "Insights anonimos de comportamiento gastronomico", content_type: "text", group_name: "admin" },
  { key: "consumer_intelligence_privacy", value_en: "Only aggregated and anonymized analytics are shown. Personal user behavior is never exposed.", value_es: "Solo se muestran analiticas agregadas y anonimas. El comportamiento personal nunca se expone.", content_type: "textarea", group_name: "admin" },
  { key: "consumer_top_dishes", value_en: "Top dishes", value_es: "Platos principales", content_type: "text", group_name: "admin" },
  { key: "consumer_fastest_growing_dishes", value_en: "Fastest growing dishes", value_es: "Platos de mayor crecimiento", content_type: "text", group_name: "admin" },
  { key: "consumer_most_uploaded_drinks", value_en: "Most uploaded drinks", value_es: "Bebidas mas subidas", content_type: "text", group_name: "admin" },
  { key: "consumer_most_photographed_foods", value_en: "Most photographed foods", value_es: "Comidas mas fotografiadas", content_type: "text", group_name: "admin" },
  { key: "consumer_popular_ingredients", value_en: "Most popular ingredients", value_es: "Ingredientes mas populares", content_type: "text", group_name: "admin" },
  { key: "consumer_flavor_profiles", value_en: "Most common flavor profiles", value_es: "Perfiles de sabor mas comunes", content_type: "text", group_name: "admin" },
  { key: "consumer_highest_rated_categories", value_en: "Highest-rated menu categories", value_es: "Categorias de menu mejor calificadas", content_type: "text", group_name: "admin" },
  { key: "consumer_value_perception_signals", value_en: "Value perception signals", value_es: "Senales de percepcion de valor", content_type: "text", group_name: "admin" },
  { key: "consumer_seasonal_food_trends", value_en: "Seasonal food trends", value_es: "Tendencias gastronomicas estacionales", content_type: "text", group_name: "admin" },
  { key: "ai_dining_duration_label", value_en: "Dining duration", value_es: "Duracion de la comida", content_type: "text", group_name: "ai" },
  { key: "available_offer_label", value_en: "Available offer", value_es: "Oferta disponible", content_type: "text", group_name: "ai" },
  { key: "event_suggested_reservation_time", value_en: "Suggested reservation time", value_es: "Hora de reserva sugerida", content_type: "text", group_name: "ai" },
  { key: "event_estimated_dining_duration", value_en: "Estimated dining duration", value_es: "Duracion estimada de la comida", content_type: "text", group_name: "ai" },
  { key: "event_travel_to_restaurant", value_en: "Travel to restaurant", value_es: "Viaje al restaurante", content_type: "text", group_name: "ai" },
  { key: "event_travel_to_event", value_en: "Travel to event", value_es: "Viaje al evento", content_type: "text", group_name: "ai" },
  { key: "event_delay_risk", value_en: "Delay risk", value_es: "Riesgo de retraso", content_type: "text", group_name: "ai" },
  { key: "event_weather_note", value_en: "Weather note", value_es: "Nota del clima", content_type: "text", group_name: "ai" },
  { key: "event_traffic_note", value_en: "Traffic note", value_es: "Nota de trafico", content_type: "text", group_name: "ai" },
  { key: "event_integrations_ready", value_en: "Future integrations", value_es: "Integraciones futuras", content_type: "text", group_name: "ai" },
  { key: "event_transport_walk", value_en: "Walk", value_es: "Caminar", content_type: "text", group_name: "ai" },
  { key: "event_transport_subway", value_en: "Subway", value_es: "Metro", content_type: "text", group_name: "ai" },
  { key: "event_transport_car", value_en: "Car", value_es: "Auto", content_type: "text", group_name: "ai" },
  { key: "route_restaurant_label", value_en: "Restaurant", value_es: "Restaurante", content_type: "text", group_name: "ai" },
  { key: "route_transport_label", value_en: "Transport", value_es: "Transporte", content_type: "text", group_name: "ai" },
  { key: "route_transport_driving", value_en: "Driving", value_es: "Conducir", content_type: "text", group_name: "ai" },
  { key: "route_transport_rideshare", value_en: "Rideshare", value_es: "Viaje compartido", content_type: "text", group_name: "ai" },
  { key: "route_transport_transit", value_en: "Public transportation", value_es: "Transporte publico", content_type: "text", group_name: "ai" },
  { key: "route_transport_walking", value_en: "Walking", value_es: "Caminar", content_type: "text", group_name: "ai" },
  { key: "route_reservation_time_label", value_en: "Reservation time", value_es: "Hora de reserva", content_type: "text", group_name: "ai" },
  { key: "route_home_restaurant_miles", value_en: "Home to restaurant miles", value_es: "Millas de casa al restaurante", content_type: "text", group_name: "ai" },
  { key: "route_restaurant_event_miles", value_en: "Restaurant to event miles", value_es: "Millas del restaurante al evento", content_type: "text", group_name: "ai" },
  { key: "route_event_home_miles", value_en: "Event to home miles", value_es: "Millas del evento a casa", content_type: "text", group_name: "ai" },
  { key: "route_weather_buffer_label", value_en: "Weather buffer minutes", value_es: "Minutos de margen por clima", content_type: "text", group_name: "ai" },
  { key: "route_traffic_buffer_label", value_en: "Traffic buffer minutes", value_es: "Minutos de margen por trafico", content_type: "text", group_name: "ai" },
  { key: "route_home_placeholder", value_en: "Home", value_es: "Casa", content_type: "text", group_name: "ai" },
  { key: "route_event_placeholder", value_en: "Event", value_es: "Evento", content_type: "text", group_name: "ai" },
  { key: "route_return_home_placeholder", value_en: "Return home", value_es: "Regreso a casa", content_type: "text", group_name: "ai" },
  { key: "route_sequence_label", value_en: "Home -> Restaurant -> Event -> Home", value_es: "Casa -> Restaurante -> Evento -> Casa", content_type: "text", group_name: "ai" },
  { key: "route_home_to_restaurant", value_en: "Home to restaurant", value_es: "Casa al restaurante", content_type: "text", group_name: "ai" },
  { key: "route_restaurant_to_event", value_en: "Restaurant to event", value_es: "Restaurante al evento", content_type: "text", group_name: "ai" },
  { key: "route_event_to_home", value_en: "Event to home", value_es: "Evento a casa", content_type: "text", group_name: "ai" },
  { key: "route_total_travel", value_en: "Total travel", value_es: "Viaje total", content_type: "text", group_name: "ai" },
  { key: "route_recommended_departure", value_en: "Recommended departure", value_es: "Salida recomendada", content_type: "text", group_name: "ai" },
  { key: "route_transport_mode", value_en: "Transportation mode", value_es: "Modo de transporte", content_type: "text", group_name: "ai" },
  { key: "route_full_plan", value_en: "Full plan", value_es: "Plan completo", content_type: "text", group_name: "ai" }
);

defaultSiteContent.push(
  { key: "ai_consumption_kicker", value_en: "SmartTable loyalty", value_es: "Lealtad SmartTable", content_type: "text", group_name: "ai" },
  { key: "photo_type_label", value_en: "Food or drink type", value_es: "Tipo de comida o bebida", content_type: "text", group_name: "ai" },
  { key: "photo_type_food", value_en: "Food", value_es: "Comida", content_type: "text", group_name: "ai" },
  { key: "photo_type_drink", value_en: "Drink", value_es: "Bebida", content_type: "text", group_name: "ai" },
  { key: "photo_type_dessert", value_en: "Dessert", value_es: "Postre", content_type: "text", group_name: "ai" },
  { key: "photo_type_menu", value_en: "Menu item", value_es: "Plato del menu", content_type: "text", group_name: "ai" },
  { key: "photo_upload_label", value_en: "Photo upload", value_es: "Subir foto", content_type: "text", group_name: "ai" },
  { key: "photo_url_label", value_en: "Optional image URL", value_es: "URL de imagen opcional", content_type: "text", group_name: "ai" },
  { key: "photo_url_placeholder", value_en: "Optional image URL", value_es: "URL de imagen opcional", content_type: "text", group_name: "ai" },
  { key: "photo_description_label", value_en: "Description", value_es: "Descripcion", content_type: "text", group_name: "ai" },
  { key: "photo_description_placeholder", value_en: "Steak, sushi, cocktail, pasta...", value_es: "Carne, sushi, coctel, pasta...", content_type: "text", group_name: "ai" },
  { key: "photo_short_review_label", value_en: "Short review", value_es: "Resena corta", content_type: "text", group_name: "ai" },
  { key: "photo_short_review_placeholder", value_en: "A quick note about the dish or drink", value_es: "Una nota breve sobre el plato o bebida", content_type: "text", group_name: "ai" },
  { key: "photo_liked_label", value_en: "What did you like?", value_es: "Que te gusto?", content_type: "text", group_name: "ai" },
  { key: "photo_liked_placeholder", value_en: "Texture, flavor, service moment, presentation...", value_es: "Textura, sabor, servicio, presentacion...", content_type: "text", group_name: "ai" },
  { key: "consumer_uploaded_photo_count", value_en: "Uploaded photo count", value_es: "Fotos subidas", content_type: "text", group_name: "ai" },
  { key: "consumer_no_trends_yet", value_en: "No trend data yet", value_es: "Aun no hay datos de tendencias", content_type: "text", group_name: "ai" },
  { key: "photo_points_label", value_en: "Photo points", value_es: "Puntos por fotos", content_type: "text", group_name: "ai" },
  { key: "average_duration_label", value_en: "Avg duration", value_es: "Duracion media", content_type: "text", group_name: "ai" },
  { key: "loyalty_points_label", value_en: "points", value_es: "puntos", content_type: "text", group_name: "ai" },
  { key: "photo_labels_label", value_en: "labels", value_es: "etiquetas", content_type: "text", group_name: "ai" },
  { key: "consent_uses_permission", value_en: "SmartTable only uses this data with your permission.", value_es: "SmartTable solo usa estos datos con tu permiso.", content_type: "textarea", group_name: "privacy" },
  { key: "consent_restaurants_aggregated", value_en: "Restaurants only see aggregated and anonymized analytics.", value_es: "Los restaurantes solo ven analiticas agregadas y anonimizadas.", content_type: "textarea", group_name: "privacy" },
  { key: "consent_personal_never_shared", value_en: "Personal behavior is never shared with restaurants.", value_es: "El comportamiento personal nunca se comparte con restaurantes.", content_type: "textarea", group_name: "privacy" },
  { key: "loyalty_kicker", value_en: "Loyalty gamification", value_es: "Gamificacion de lealtad", content_type: "text", group_name: "ai" },
  { key: "loyalty_title", value_en: "Points and badge progress", value_es: "Puntos y progreso de insignias", content_type: "text", group_name: "ai" },
  { key: "loyalty_points_balance", value_en: "Points", value_es: "Puntos", content_type: "text", group_name: "ai" },
  { key: "loyalty_lifetime_points", value_en: "Lifetime points", value_es: "Puntos acumulados", content_type: "text", group_name: "ai" },
  { key: "loyalty_unlocked_badges", value_en: "Unlocked badges", value_es: "Insignias desbloqueadas", content_type: "text", group_name: "ai" },
  { key: "loyalty_badge_food_explorer", value_en: "Food Explorer", value_es: "Explorador gastronomico", content_type: "text", group_name: "ai" },
  { key: "loyalty_badge_steak_master", value_en: "Steak Master", value_es: "Maestro de carne", content_type: "text", group_name: "ai" },
  { key: "loyalty_badge_sushi_hunter", value_en: "Sushi Hunter", value_es: "Cazador de sushi", content_type: "text", group_name: "ai" },
  { key: "loyalty_badge_wine_lover", value_en: "Wine Lover", value_es: "Amante del vino", content_type: "text", group_name: "ai" },
  { key: "loyalty_badge_cocktail_expert", value_en: "Cocktail Expert", value_es: "Experto en cocteles", content_type: "text", group_name: "ai" },
  { key: "loyalty_badge_nyc_food_hunter", value_en: "NYC Food Hunter", value_es: "Cazador gastronomico de NYC", content_type: "text", group_name: "ai" },
  { key: "loyalty_badge_trend_spotter", value_en: "Trend Spotter", value_es: "Detector de tendencias", content_type: "text", group_name: "ai" },
  { key: "recognition_kicker", value_en: "AI image recognition", value_es: "Reconocimiento de imagen IA", content_type: "text", group_name: "ai" },
  { key: "recognition_title", value_en: "Future-ready recognition placeholder", value_es: "Placeholder preparado para reconocimiento futuro", content_type: "text", group_name: "ai" },
  { key: "recognition_detected_dish", value_en: "Detected dish", value_es: "Plato detectado", content_type: "text", group_name: "ai" },
  { key: "recognition_detected_drink", value_en: "Detected drink", value_es: "Bebida detectada", content_type: "text", group_name: "ai" },
  { key: "recognition_cuisine_category", value_en: "Cuisine category", value_es: "Categoria de cocina", content_type: "text", group_name: "ai" },
  { key: "recognition_ingredients", value_en: "Ingredients", value_es: "Ingredientes", content_type: "text", group_name: "ai" },
  { key: "recognition_flavor_profile", value_en: "Flavor profile", value_es: "Perfil de sabor", content_type: "text", group_name: "ai" },
  { key: "recognition_presentation_score", value_en: "Presentation score", value_es: "Puntaje de presentacion", content_type: "text", group_name: "ai" },
  { key: "recognition_popularity_signal", value_en: "Popularity signal", value_es: "Senal de popularidad", content_type: "text", group_name: "ai" },
  { key: "recognition_note", value_en: "Placeholder values are stored now and can later be replaced by live AI image recognition.", value_es: "Los valores placeholder se guardan ahora y luego pueden reemplazarse con reconocimiento de imagen IA en vivo.", content_type: "textarea", group_name: "ai" }
);

defaultSiteContent.push(
  { key: "partner_generic_name", value_en: "Partner", value_es: "Socio", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_executive", value_en: "Executive", value_es: "Ejecutivo", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_opportunity", value_en: "Opportunity", value_es: "Oportunidad", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_risk", value_en: "Risk", value_es: "Riesgo", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_health", value_en: "Health", value_es: "Salud", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_market", value_en: "Market", value_es: "Mercado", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_timeline", value_en: "Timeline", value_es: "Linea de tiempo", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_confidence", value_en: "Confidence", value_es: "Confianza", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_roi", value_en: "ROI", value_es: "ROI", content_type: "text", group_name: "partner_dashboard" },
  { key: "executive_kicker", value_en: "AI Revenue Operating System", value_es: "Sistema operativo de ingresos con IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "executive_title", value_en: "Good morning, {{restaurant_name}}!", value_es: "Buenos dias, {{restaurant_name}}!", content_type: "text", group_name: "partner_dashboard" },
  { key: "executive_subtitle", value_en: "Your AI Revenue Manager has analyzed today's demand, guest behavior, weather, traffic, and booking signals.", value_es: "Tu gerente de ingresos IA analizo la demanda de hoy, comportamiento de clientes, clima, trafico y senales de reservas.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "executive_message", value_en: "Yesterday you may have missed approximately {{missed_revenue}} because Friday lunch demand stayed below normal. Today SmartTable can help recover an estimated {{recoverable_revenue}} with the recommended actions below.", value_es: "Ayer podrias haber perdido aproximadamente {{missed_revenue}} porque la demanda de almuerzo del viernes estuvo por debajo de lo normal. Hoy SmartTable puede ayudar a recuperar un estimado de {{recoverable_revenue}} con las acciones recomendadas.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "executive_action_lunch_offer", value_en: "Create 15% Lunch Offer", value_es: "Crear oferta de almuerzo 15%", content_type: "text", group_name: "partner_dashboard" },
  { key: "executive_action_notify_favorites", value_en: "Notify favorite guests", value_es: "Notificar clientes favoritos", content_type: "text", group_name: "partner_dashboard" },
  { key: "executive_action_increase_dinner", value_en: "Increase early dinner availability", value_es: "Aumentar disponibilidad de cena temprana", content_type: "text", group_name: "partner_dashboard" },
  { key: "executive_apply_all", value_en: "Apply all recommendations", value_es: "Aplicar todas las recomendaciones", content_type: "text", group_name: "partner_dashboard" },
  { key: "executive_apply_all_success", value_en: "All AI recommendations applied.", value_es: "Todas las recomendaciones IA fueron aplicadas.", content_type: "text", group_name: "partner_dashboard" },
  { key: "daily_opportunity_kicker", value_en: "Daily Revenue Opportunity", value_es: "Oportunidad diaria de ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "daily_opportunity_title", value_en: "You can earn +{{amount}} today", value_es: "Puedes ganar +{{amount}} hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "daily_opportunity_percent", value_en: "Revenue opportunity", value_es: "Oportunidad de ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_kicker", value_en: "Revenue protection", value_es: "Proteccion de ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_title", value_en: "Today's Risk Signals", value_es: "Senales de riesgo de hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_tonight_demand", value_en: "Tonight demand risk", value_es: "Riesgo de demanda esta noche", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_saturday_sold_out", value_en: "Saturday sold-out probability", value_es: "Probabilidad de lleno el sabado", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_rain_impact", value_en: "Rain impact", value_es: "Impacto de lluvia", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_traffic", value_en: "Traffic risk", value_es: "Riesgo de trafico", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_parking", value_en: "Parking risk", value_es: "Riesgo de estacionamiento", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_late_dinner", value_en: "Late dinner weakness", value_es: "Debilidad en cena tarde", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_medium", value_en: "Medium", value_es: "Medio", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_high", value_en: "High", value_es: "Alto", content_type: "text", group_name: "partner_dashboard" },
  { key: "recommendation_why_title", value_en: "Why this recommendation?", value_es: "Por que esta recomendacion?", content_type: "text", group_name: "partner_dashboard" },
  { key: "recommendation_why_intro", value_en: "We recommend this because:", value_es: "Recomendamos esto porque:", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_rain_after_8", value_en: "Rain starts after 8 PM", value_es: "La lluvia empieza despues de las 8 PM", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_conversion_improves", value_en: "Historical conversion improves by 31%", value_es: "La conversion historica mejora 31%", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_nearby_event", value_en: "Nearby event may increase early dinner traffic", value_es: "Un evento cercano puede aumentar el trafico de cena temprana", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_parking_normal", value_en: "Parking availability is normal", value_es: "La disponibilidad de estacionamiento es normal", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_late_dinner_weak", value_en: "Late dinner demand is weak", value_es: "La demanda de cena tarde es debil", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_favorites_intent", value_en: "Guests who favorited you have higher conversion intent", value_es: "Los clientes que te marcaron como favorito tienen mayor intencion de reservar", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_warm_audience", value_en: "New offers perform better when sent to warm audiences", value_es: "Las nuevas ofertas funcionan mejor con audiencias interesadas", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_no_personal_shared", value_en: "No personal behavior is shared with the restaurant", value_es: "No se comparte comportamiento personal con el restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_notifications_recover", value_en: "Notifications can recover quiet-table demand", value_es: "Las notificaciones pueden recuperar demanda en mesas tranquilas", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_late_weaker", value_en: "Late dinner demand is weaker than early dinner", value_es: "La demanda de cena tarde es mas debil que la cena temprana", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_flexible_value", value_en: "Flexible guests respond to sharper last-minute value", value_es: "Los clientes flexibles responden a mejor valor de ultimo minuto", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_traffic_drops", value_en: "Traffic pressure drops later in the evening", value_es: "La presion de trafico baja mas tarde en la noche", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_guardrails", value_en: "Discounts stay inside restaurant-defined guardrails", value_es: "Los descuentos permanecen dentro de reglas definidas por el restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_high_demand_no_max", value_en: "High-demand windows do not need maximum incentives", value_es: "Las ventanas de alta demanda no necesitan incentivos maximos", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_lower_first", value_en: "Guests can convert at a lower discount first", value_es: "Los clientes pueden convertir primero con un descuento menor", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_margin_priority", value_en: "SmartTable prioritizes restaurant margin when demand rises", value_es: "SmartTable prioriza el margen del restaurante cuando sube la demanda", content_type: "text", group_name: "partner_dashboard" },
  { key: "why_increase_later", value_en: "Discounts can be increased later if conversion slows", value_es: "Los descuentos pueden subir despues si baja la conversion", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_kicker", value_en: "Restaurant Health Score", value_es: "Puntaje de salud del restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_title", value_en: "Restaurant Health Score", value_es: "Puntaje de salud del restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_overall", value_en: "Overall Health", value_es: "Salud general", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_revenue", value_en: "Revenue", value_es: "Ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_guest_demand", value_en: "Guest Demand", value_es: "Demanda de clientes", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_reputation", value_en: "Reputation", value_es: "Reputacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_operations", value_en: "Operations", value_es: "Operaciones", content_type: "text", group_name: "partner_dashboard" },
  { key: "health_ai_efficiency", value_en: "AI Efficiency", value_es: "Eficiencia IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_kicker", value_en: "Live Market Signals", value_es: "Senales de mercado en vivo", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_title", value_en: "Live Market Signals", value_es: "Senales de mercado en vivo", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_map_placeholder", value_en: "Neighborhood signal map", value_es: "Mapa de senales del vecindario", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_map_note", value_en: "Google Maps and live provider layers are prepared for future integration.", value_es: "Google Maps y capas de proveedores en vivo estan preparados para integracion futura.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "market_nearby_events", value_en: "Nearby events", value_es: "Eventos cercanos", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_hotels", value_en: "Hotels", value_es: "Hoteles", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_offices", value_en: "Offices", value_es: "Oficinas", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_traffic", value_en: "Traffic", value_es: "Trafico", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_subway", value_en: "Subway access", value_es: "Acceso al metro", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_parking", value_en: "Parking", value_es: "Estacionamiento", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_competitors", value_en: "Competitors", value_es: "Competidores", content_type: "text", group_name: "partner_dashboard" },
  { key: "market_weather", value_en: "Weather", value_es: "Clima", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_kicker", value_en: "AI Forecast Timeline", value_es: "Linea de pronostico IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_title", value_en: "Today's Demand Forecast", value_es: "Pronostico de demanda de hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_rising", value_en: "Demand rising", value_es: "Demanda subiendo", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_normal", value_en: "Normal", value_es: "Normal", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_weak", value_en: "Weak", value_es: "Debil", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_high", value_en: "High", value_es: "Alta", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_peak", value_en: "Peak", value_es: "Pico", content_type: "text", group_name: "partner_dashboard" },
  { key: "timeline_drop", value_en: "Drop", value_es: "Baja", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_kicker", value_en: "AI Learning", value_es: "Aprendizaje IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_title", value_en: "SmartTable AI has analyzed", value_es: "La IA de SmartTable ha analizado", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_confidence", value_en: "AI confidence today", value_es: "Confianza IA hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_weather", value_en: "Weather patterns", value_es: "Patrones climaticos", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_traffic", value_en: "Traffic signals", value_es: "Senales de trafico", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_seasonality", value_en: "Seasonality", value_es: "Estacionalidad", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_holidays", value_en: "Holiday trends", value_es: "Tendencias de festivos", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_competitors", value_en: "Competitor signals", value_es: "Senales de competidores", content_type: "text", group_name: "partner_dashboard" },
  { key: "learning_events", value_en: "Local events", value_es: "Eventos locales", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_kicker", value_en: "SmartTable ROI", value_es: "ROI de SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_title", value_en: "SmartTable ROI", value_es: "ROI de SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_without", value_en: "Without SmartTable", value_es: "Sin SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_with", value_en: "With SmartTable", value_es: "Con SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_recovered", value_en: "Recovered revenue", value_es: "Ingresos recuperados", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_lift", value_en: "ROI lift", value_es: "Incremento ROI", content_type: "text", group_name: "partner_dashboard" }
);

defaultSiteContent.push(
  { key: "partner_nav_portfolio", value_en: "Portfolio", value_es: "Portafolio", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_pricing", value_en: "Pricing", value_es: "Precios", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_staff", value_en: "Staff", value_es: "Personal", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_events", value_en: "Events", value_es: "Eventos", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_ltv", value_en: "LTV", value_es: "LTV", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_vip", value_en: "VIP", value_es: "VIP", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_marketing", value_en: "Marketing", value_es: "Marketing", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_kicker", value_en: "Multi-restaurant intelligence", value_es: "Inteligencia multi-restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_title", value_en: "Portfolio View", value_es: "Vista de portafolio", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_filter_all", value_en: "All", value_es: "Todos", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_filter_strong", value_en: "Strong", value_es: "Fuerte", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_filter_needs_action", value_en: "Needs action", value_es: "Necesita accion", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_filter_risk", value_en: "Risk", value_es: "Riesgo", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_health_label", value_en: "Health", value_es: "Salud", content_type: "text", group_name: "partner_dashboard" },
  { key: "portfolio_note", value_en: "Demo portfolio structure for future franchise and multi-location owners.", value_es: "Estructura demo de portafolio para futuros duenos de franquicias y multiples ubicaciones.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "action_generate_marketing", value_en: "Generate marketing message", value_es: "Generar mensaje de marketing", content_type: "text", group_name: "partner_dashboard" },
  { key: "action_create_social", value_en: "Create social post", value_es: "Crear publicacion social", content_type: "text", group_name: "partner_dashboard" },
  { key: "action_send_email_campaign", value_en: "Send email campaign", value_es: "Enviar campana de email", content_type: "text", group_name: "partner_dashboard" },
  { key: "action_optimize_pricing", value_en: "Optimize today's pricing", value_es: "Optimizar precios de hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_action_success", value_en: "AI action applied successfully.", value_es: "Accion de IA aplicada correctamente.", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_kicker", value_en: "AI Pricing Engine", value_es: "Motor de precios IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_title", value_en: "AI Pricing Engine", value_es: "Motor de precios IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_apply", value_en: "Apply AI pricing", value_es: "Aplicar precios IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_current_discount", value_en: "Current discount", value_es: "Descuento actual", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_recommended_discount", value_en: "Recommended discount", value_es: "Descuento recomendado", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_margin_protection", value_en: "Margin protection", value_es: "Proteccion de margen", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_margin_active", value_en: "Active", value_es: "Activo", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_conversion_lift", value_en: "Expected conversion lift", value_es: "Incremento esperado de conversion", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_revenue_impact", value_en: "Expected revenue impact", value_es: "Impacto esperado en ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_applied_notice", value_en: "AI pricing optimization applied.", value_es: "Optimizacion de precios IA aplicada.", content_type: "text", group_name: "partner_dashboard" },
  { key: "staff_kicker", value_en: "AI Staff Planning", value_es: "Planificacion de personal IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "staff_title", value_en: "AI Staff Planning", value_es: "Planificacion de personal IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "staff_expected_guests", value_en: "Expected guests today", value_es: "Clientes esperados hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "staff_recommended_servers", value_en: "Recommended servers", value_es: "Meseros recomendados", content_type: "text", group_name: "partner_dashboard" },
  { key: "staff_host_coverage", value_en: "Recommended host coverage", value_es: "Cobertura de host recomendada", content_type: "text", group_name: "partner_dashboard" },
  { key: "staff_peak_window", value_en: "Peak window", value_es: "Ventana pico", content_type: "text", group_name: "partner_dashboard" },
  { key: "staff_risk", value_en: "Staffing risk", value_es: "Riesgo de personal", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_low", value_en: "Low", value_es: "Bajo", content_type: "text", group_name: "partner_dashboard" },
  { key: "event_prediction_kicker", value_en: "Nearby Event Prediction", value_es: "Prediccion de eventos cercanos", content_type: "text", group_name: "partner_dashboard" },
  { key: "event_prediction_title", value_en: "Nearby Event Prediction", value_es: "Prediccion de eventos cercanos", content_type: "text", group_name: "partner_dashboard" },
  { key: "event_local_impact", value_en: "Local event impact", value_es: "Impacto de evento local", content_type: "text", group_name: "partner_dashboard" },
  { key: "event_traffic_lift", value_en: "Expected traffic lift", value_es: "Incremento esperado de trafico", content_type: "text", group_name: "partner_dashboard" },
  { key: "event_best_window", value_en: "Best booking window", value_es: "Mejor ventana de reserva", content_type: "text", group_name: "partner_dashboard" },
  { key: "ltv_kicker", value_en: "Guest Lifetime Value Intelligence", value_es: "Inteligencia de valor de vida del cliente", content_type: "text", group_name: "partner_dashboard" },
  { key: "ltv_title", value_en: "Guest Lifetime Value Intelligence", value_es: "Inteligencia de valor de vida del cliente", content_type: "text", group_name: "partner_dashboard" },
  { key: "ltv_average_guest_value", value_en: "Average guest value", value_es: "Valor medio de cliente", content_type: "text", group_name: "partner_dashboard" },
  { key: "ltv_returning_rate", value_en: "Returning guest rate", value_es: "Tasa de clientes recurrentes", content_type: "text", group_name: "partner_dashboard" },
  { key: "ltv_favorite_opportunity", value_en: "Favorite guest opportunity", value_es: "Oportunidad de clientes favoritos", content_type: "text", group_name: "partner_dashboard" },
  { key: "ltv_vip_potential", value_en: "VIP potential guests", value_es: "Clientes potenciales VIP", content_type: "text", group_name: "partner_dashboard" },
  { key: "vip_kicker", value_en: "AI VIP Detection", value_es: "Deteccion VIP IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "vip_title", value_en: "AI VIP Detection", value_es: "Deteccion VIP IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "vip_potential_week", value_en: "Potential VIP guests this week", value_es: "Clientes VIP potenciales esta semana", content_type: "text", group_name: "partner_dashboard" },
  { key: "vip_high_value_repeat", value_en: "High-value repeat guests", value_es: "Clientes recurrentes de alto valor", content_type: "text", group_name: "partner_dashboard" },
  { key: "vip_suggested_action", value_en: "Send personalized offer", value_es: "Enviar oferta personalizada", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_kicker", value_en: "AI Marketing Generator", value_es: "Generador de marketing IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_title", value_en: "AI Marketing Generator", value_es: "Generador de marketing IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_generate", value_en: "Generate message", value_es: "Generar mensaje", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_send_favorites", value_en: "Send to favorites", value_es: "Enviar a favoritos", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_copy", value_en: "Copy message", value_es: "Copiar mensaje", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_generated_notice", value_en: "AI marketing message generated.", value_es: "Mensaje de marketing IA generado.", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_copied_notice", value_en: "Marketing message copied.", value_es: "Mensaje de marketing copiado.", content_type: "text", group_name: "partner_dashboard" },
  { key: "marketing_sent_notice", value_en: "Marketing message prepared for favorite guests.", value_es: "Mensaje de marketing preparado para clientes favoritos.", content_type: "text", group_name: "partner_dashboard" },
  { key: "social_post_created_notice", value_en: "AI social post created for review.", value_es: "Publicacion social IA creada para revisar.", content_type: "text", group_name: "partner_dashboard" },
  { key: "email_campaign_ready_notice", value_en: "Email campaign prepared for favorite guests.", value_es: "Campana de email preparada para clientes favoritos.", content_type: "text", group_name: "partner_dashboard" }
);

defaultSiteContent.push(
  { key: "top_actions_title", value_en: "Top 3 Recommended Actions", value_es: "Las 3 acciones recomendadas principales", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_competitor", value_en: "Competitors", value_es: "Competidores", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_menu_engineering", value_en: "Menu", value_es: "Menu", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_dynamic_pricing", value_en: "Dynamic pricing", value_es: "Precios dinamicos", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_loyalty_engine", value_en: "Loyalty", value_es: "Fidelizacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_review_analyzer", value_en: "Reviews", value_es: "Resenas", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_reputation", value_en: "Reputation", value_es: "Reputacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_kicker", value_en: "AI Competitor Tracker", value_es: "Rastreador de competidores IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_title", value_en: "AI Competitor Tracker", value_es: "Rastreador de competidores IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_nearby_active", value_en: "Nearby competitors active", value_es: "Competidores cercanos activos", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_avg_discount", value_en: "Average local discount", value_es: "Descuento local promedio", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_your_discount", value_en: "Your suggested discount", value_es: "Tu descuento sugerido", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_position", value_en: "Competitive position", value_es: "Posicion competitiva", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_position_strong", value_en: "Strong", value_es: "Fuerte", content_type: "text", group_name: "partner_dashboard" },
  { key: "competitor_trend_label", value_en: "Local competition trend", value_es: "Tendencia competitiva local", content_type: "text", group_name: "partner_dashboard" },
  { key: "menu_engineering_kicker", value_en: "AI Menu Engineering", value_es: "Ingenieria de menu IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "menu_engineering_title", value_en: "AI Menu Engineering", value_es: "Ingenieria de menu IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "menu_best_margin", value_en: "Best margin item", value_es: "Producto con mejor margen", content_type: "text", group_name: "partner_dashboard" },
  { key: "menu_best_conversion", value_en: "Best conversion item", value_es: "Producto con mejor conversion", content_type: "text", group_name: "partner_dashboard" },
  { key: "menu_weak_item", value_en: "Weak item", value_es: "Producto debil", content_type: "text", group_name: "partner_dashboard" },
  { key: "menu_suggested_action", value_en: "Promote high-margin items during weak demand windows.", value_es: "Promociona productos de alto margen durante ventanas de baja demanda.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "dynamic_pricing_kicker", value_en: "AI Dynamic Pricing", value_es: "Precios dinamicos IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "dynamic_pricing_title", value_en: "AI Dynamic Pricing", value_es: "Precios dinamicos IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_window_label", value_en: "Window", value_es: "Ventana", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_discount_label", value_en: "Discount", value_es: "Descuento", content_type: "text", group_name: "partner_dashboard" },
  { key: "pricing_demand_label", value_en: "Demand", value_es: "Demanda", content_type: "text", group_name: "partner_dashboard" },
  { key: "loyalty_engine_kicker", value_en: "AI Loyalty Engine", value_es: "Motor de fidelizacion IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "loyalty_engine_title", value_en: "AI Loyalty Engine", value_es: "Motor de fidelizacion IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "loyalty_favorite_guests", value_en: "Favorite guests", value_es: "Clientes favoritos", content_type: "text", group_name: "partner_dashboard" },
  { key: "loyalty_ready_to_return", value_en: "Guests ready to return", value_es: "Clientes listos para volver", content_type: "text", group_name: "partner_dashboard" },
  { key: "loyalty_recommended_campaign", value_en: "Recommended campaign", value_es: "Campana recomendada", content_type: "text", group_name: "partner_dashboard" },
  { key: "loyalty_campaign_example", value_en: "Come back this week and enjoy 15% off.", value_es: "Vuelve esta semana y disfruta 15% de descuento.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "loyalty_return_readiness", value_en: "Return readiness", value_es: "Preparacion para volver", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_analyzer_kicker", value_en: "AI Review Analyzer", value_es: "Analizador de resenas IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_analyzer_title", value_en: "AI Review Analyzer", value_es: "Analizador de resenas IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_food_rating", value_en: "Food rating", value_es: "Calificacion de comida", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_service_rating", value_en: "Service rating", value_es: "Calificacion de servicio", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_ambience_rating", value_en: "Ambience rating", value_es: "Calificacion de ambiente", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_sentiment_positive", value_en: "Positive", value_es: "Positivo", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_sentiment_trend", value_en: "Sentiment trend", value_es: "Tendencia de sentimiento", content_type: "text", group_name: "partner_dashboard" },
  { key: "review_improvement_area", value_en: "Main improvement area", value_es: "Area principal de mejora", content_type: "text", group_name: "partner_dashboard" },
  { key: "reputation_kicker", value_en: "AI Reputation Monitor", value_es: "Monitor de reputacion IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "reputation_title", value_en: "AI Reputation Monitor", value_es: "Monitor de reputacion IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "reputation_score_label", value_en: "Reputation", value_es: "Reputacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "reputation_overall_rating", value_en: "Overall rating", value_es: "Calificacion general", content_type: "text", group_name: "partner_dashboard" },
  { key: "reputation_rating_trend", value_en: "Rating trend", value_es: "Tendencia de calificacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "reputation_negative_risk", value_en: "Negative review risk", value_es: "Riesgo de resena negativa", content_type: "text", group_name: "partner_dashboard" },
  { key: "reputation_satisfaction", value_en: "Guest satisfaction", value_es: "Satisfaccion de clientes", content_type: "text", group_name: "partner_dashboard" }
);

defaultSiteContent.push(
  { key: "post_visit_email_subject", value_en: "How was your experience at {{restaurant_name}}?", value_es: "Como fue tu experiencia en {{restaurant_name}}?", content_type: "text", group_name: "email" },
  { key: "post_visit_email_preheader", value_en: "Share your SmartTable visit feedback after dining at {{restaurant_name}}.", value_es: "Comparte tu experiencia de SmartTable despues de cenar en {{restaurant_name}}.", content_type: "text", group_name: "email" },
  { key: "post_visit_email_body", value_en: "Hi {{guest_name}},\n\nThank you for dining at {{restaurant_name}} through SmartTable.\n\nWe'd love to hear about your experience from your visit on {{visit_date}}.\n\nPlease rate your visit:\n- Food\n- Service\n- Ambience\n- Overall experience\n\nYou can also share food or drink photos and a short note about what you ordered.\n\nYour feedback helps other guests discover great restaurants and helps SmartTable improve personalized dining recommendations.", value_es: "Hola {{guest_name}},\n\nGracias por cenar en {{restaurant_name}} a traves de SmartTable.\n\nNos encantaria conocer tu experiencia de tu visita del {{visit_date}}.\n\nCalifica tu visita:\n- Comida\n- Servicio\n- Ambiente\n- Experiencia general\n\nTambien puedes compartir fotos de comida o bebida y una nota breve sobre lo que pediste.\n\nTus comentarios ayudan a otros clientes a descubrir excelentes restaurantes y ayudan a SmartTable a mejorar recomendaciones personalizadas.", content_type: "textarea", group_name: "email" },
  { key: "post_visit_email_loyalty_note", value_en: "Eligible feedback may earn SmartTable loyalty points when the loyalty system is enabled for your account.", value_es: "Los comentarios elegibles pueden ganar puntos SmartTable cuando el sistema de lealtad este habilitado para tu cuenta.", content_type: "textarea", group_name: "email" },
  { key: "post_visit_email_footer", value_en: "You are receiving this because you completed a SmartTable reservation at {{restaurant_name}}.", value_es: "Recibes esto porque completaste una reserva de SmartTable en {{restaurant_name}}.", content_type: "textarea", group_name: "email" },
  { key: "post_visit_rate_button", value_en: "Rate your experience", value_es: "Califica tu experiencia", content_type: "text", group_name: "email" },
  { key: "post_visit_upload_button", value_en: "Upload photos", value_es: "Subir fotos", content_type: "text", group_name: "email" },
  { key: "post_visit_upload_rewards_button", value_en: "Upload photos & earn points", value_es: "Sube fotos y gana puntos", content_type: "text", group_name: "email" },
  { key: "post_visit_ordered_button", value_en: "Share what you ordered", value_es: "Comparte lo que pediste", content_type: "text", group_name: "email" },
  { key: "post_visit_notification_title", value_en: "How was {{restaurant_name}}?", value_es: "Como estuvo {{restaurant_name}}?", content_type: "text", group_name: "notifications" },
  { key: "post_visit_notification_message", value_en: "Rate your visit and upload dining photos after your SmartTable reservation.", value_es: "Califica tu visita y sube fotos despues de tu reserva SmartTable.", content_type: "textarea", group_name: "notifications" },
  { key: "post_visit_notification_cta", value_en: "Rate your visit", value_es: "Calificar visita", content_type: "text", group_name: "notifications" },
  { key: "photo_rewards_points_cap", value_en: "You can earn up to 160 points for this visit.", value_es: "Puedes ganar hasta 160 puntos por esta visita.", content_type: "text", group_name: "ai" },
  { key: "photo_rewards_confirmation_title", value_en: "Thank you for your feedback!", value_es: "Gracias por tus comentarios!", content_type: "text", group_name: "ai" },
  { key: "photo_rewards_confirmation_body", value_en: "You earned {{pointsEarned}} SmartTable points.", value_es: "Ganaste {{pointsEarned}} puntos SmartTable.", content_type: "text", group_name: "ai" },
  { key: "photo_rewards_confirmation_note", value_en: "Your photos and review help other guests and improve SmartTable AI recommendations.", value_es: "Tus fotos y resena ayudan a otros clientes y mejoran las recomendaciones de SmartTable AI.", content_type: "textarea", group_name: "ai" },
  { key: "photo_rewards_view_rewards", value_en: "View my rewards", value_es: "Ver mis recompensas", content_type: "text", group_name: "ai" },
  { key: "photo_rewards_find_table", value_en: "Find another table", value_es: "Buscar otra mesa", content_type: "text", group_name: "ai" },
  { key: "admin_photo_submissions_title", value_en: "Guest Photo & Review Submissions", value_es: "Envios de fotos y resenas de clientes", content_type: "text", group_name: "admin" },
  { key: "partner_nav_post_visit_feedback", value_en: "Post-visit feedback", value_es: "Comentarios post-visita", content_type: "text", group_name: "partner" },
  { key: "partner_post_visit_feedback_title", value_en: "Post-Visit Guest Feedback", value_es: "Comentarios de clientes despues de la visita", content_type: "text", group_name: "partner" },
  { key: "partner_post_visit_ai_learning", value_en: "Guest-submitted photos, reviews, ordered items, and ratings help SmartTable learn real dining preferences and improve future recommendations.", value_es: "Las fotos, resenas, platos pedidos y calificaciones enviadas por clientes ayudan a SmartTable a aprender preferencias reales y mejorar recomendaciones futuras.", content_type: "textarea", group_name: "partner" },
  { key: "post_visit_ai_insights_title", value_en: "AI Insights from guest feedback", value_es: "Insights de IA de los comentarios", content_type: "text", group_name: "partner" },
  { key: "popular_dishes_label", value_en: "Popular dishes", value_es: "Platos populares", content_type: "text", group_name: "partner" },
  { key: "weak_service_signals_label", value_en: "Weak service signals", value_es: "Senales de servicio debil", content_type: "text", group_name: "partner" },
  { key: "ambience_sentiment_label", value_en: "Ambience sentiment", value_es: "Sentimiento del ambiente", content_type: "text", group_name: "partner" },
  { key: "photo_engagement_label", value_en: "Photo engagement", value_es: "Interaccion con fotos", content_type: "text", group_name: "partner" },
  { key: "most_photographed_items_label", value_en: "Most photographed items", value_es: "Items mas fotografiados", content_type: "text", group_name: "partner" },
  { key: "guest_satisfaction_trend_label", value_en: "Guest satisfaction trend", value_es: "Tendencia de satisfaccion", content_type: "text", group_name: "partner" },
  { key: "repeat_intent_signal_label", value_en: "Repeat intent signal", value_es: "Senal de intencion de regreso", content_type: "text", group_name: "partner" },
  { key: "post_visit_email_send_button", value_en: "Send post-visit email", value_es: "Enviar email post-visita", content_type: "text", group_name: "partner" },
  { key: "post_visit_email_sent_notice", value_en: "Post-visit email and notification sent.", value_es: "Email y notificacion post-visita enviados.", content_type: "text", group_name: "partner" },
  { key: "post_visit_email_unconfirmed_notice", value_en: "Post-visit notification was recorded, but email delivery could not be confirmed.", value_es: "La notificacion post-visita fue registrada, pero no se pudo confirmar la entrega del email.", content_type: "text", group_name: "partner" },
  { key: "no_show_button", value_en: "No-show", value_es: "No asistio", content_type: "text", group_name: "partner" },
  { key: "photo_rewards_earn_cta", value_en: "Earn points for your visit", value_es: "Gana puntos por tu visita", content_type: "text", group_name: "ai" },
  { key: "photo_rewards_consent", value_en: "By submitting, you allow SmartTable to use your review, uploaded photos, and dining information to improve restaurant recommendations and platform analytics. Public display requires approval.", value_es: "Al enviar, permites que SmartTable use tu resena, fotos subidas e informacion de la comida para mejorar recomendaciones y analiticas de la plataforma. La visualizacion publica requiere aprobacion.", content_type: "textarea", group_name: "ai" },
  { key: "booking_completed_event", value_en: "Booking completed", value_es: "Reserva completada", content_type: "text", group_name: "ai" },
  { key: "booking_id_label", value_en: "Booking ID", value_es: "ID de reserva", content_type: "text", group_name: "ai" },
  { key: "reservation_reference_label", value_en: "Reference", value_es: "Referencia", content_type: "text", group_name: "ai" },
  { key: "ordered_items_label", value_en: "What did you order?", value_es: "Que pediste?", content_type: "text", group_name: "ai" },
  { key: "ordered_items_placeholder", value_en: "Pasta, steak, wine, dessert...", value_es: "Pasta, carne, vino, postre...", content_type: "text", group_name: "ai" },
  { key: "would_recommend_label", value_en: "Would you recommend this restaurant?", value_es: "Recomendarias este restaurante?", content_type: "text", group_name: "ai" },
  { key: "would_return_label", value_en: "Would you return?", value_es: "Volverias?", content_type: "text", group_name: "ai" },
  { key: "select_one_label", value_en: "Select one", value_es: "Selecciona una opcion", content_type: "text", group_name: "ai" },
  { key: "yes_label", value_en: "Yes", value_es: "Si", content_type: "text", group_name: "ai" },
  { key: "no_label", value_en: "No", value_es: "No", content_type: "text", group_name: "ai" },
  { key: "maybe_label", value_en: "Maybe", value_es: "Quizas", content_type: "text", group_name: "ai" },
  { key: "not_sure_label", value_en: "Not sure", value_es: "No estoy seguro", content_type: "text", group_name: "ai" },
  { key: "photo_tags_label", value_en: "Tags", value_es: "Etiquetas", content_type: "text", group_name: "ai" }
);

defaultSiteContent.push(
  { key: "partner_nav_ceo", value_en: "CEO Summary", value_es: "Resumen CEO", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_action_history", value_en: "Action history", value_es: "Historial de acciones", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_weekly_report", value_en: "Weekly report", value_es: "Reporte semanal", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_summary_kicker", value_en: "Executive AI Summary", value_es: "Resumen ejecutivo de IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_summary_title", value_en: "Today's CEO Summary", value_es: "Resumen CEO de hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_summary_greeting", value_en: "Good morning, {{restaurant_name}}.", value_es: "Buenos dias, {{restaurant_name}}.", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_summary_revenue", value_en: "Yesterday revenue {{direction}} by {{delta}}%.", value_es: "Ayer los ingresos {{direction}} {{delta}}%.", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_revenue_increased", value_en: "increased", value_es: "aumentaron", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_revenue_decreased", value_en: "decreased", value_es: "bajaron", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_expected_gain", value_en: "Expected gain today", value_es: "Ganancia esperada hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "ceo_apply_button", value_en: "Apply CEO recommendation", value_es: "Aplicar recomendacion CEO", content_type: "text", group_name: "partner_dashboard" },
  { key: "restaurant_ai_score_title", value_en: "Restaurant AI Score", value_es: "Puntaje IA del restaurante", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_subscore_revenue", value_en: "Revenue Score", value_es: "Puntaje de ingresos", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_subscore_marketing", value_en: "Marketing Score", value_es: "Puntaje de marketing", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_subscore_operations", value_en: "Operations Score", value_es: "Puntaje operativo", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_subscore_guest_loyalty", value_en: "Guest Loyalty Score", value_es: "Puntaje de lealtad", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_subscore_review", value_en: "Review Score", value_es: "Puntaje de resenas", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_subscore_availability", value_en: "Availability Score", value_es: "Puntaje de disponibilidad", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_subscore_competition", value_en: "Competition Score", value_es: "Puntaje competitivo", content_type: "text", group_name: "partner_dashboard" },
  { key: "ai_risk_score_title", value_en: "AI Risk Score", value_es: "Puntaje de riesgo IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_level_low", value_en: "Low", value_es: "Bajo", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_level_medium", value_en: "Medium", value_es: "Medio", content_type: "text", group_name: "partner_dashboard" },
  { key: "risk_level_high", value_en: "High", value_es: "Alto", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_why_title", value_en: "Why this confidence?", value_es: "Por que esta confianza?", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_reservation_data", value_en: "Reservation data", value_es: "Datos de reservas", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_guest_behavior", value_en: "Guest behavior", value_es: "Comportamiento de clientes", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_weather_signals", value_en: "Weather signals", value_es: "Senales de clima", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_traffic_signals", value_en: "Traffic signals", value_es: "Senales de trafico", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_local_events", value_en: "Local events", value_es: "Eventos locales", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_competitor_signals", value_en: "Competitor signals", value_es: "Senales de competidores", content_type: "text", group_name: "partner_dashboard" },
  { key: "confidence_review_signals", value_en: "Review signals", value_es: "Senales de resenas", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_month_title", value_en: "SmartTable ROI This Month", value_es: "ROI de SmartTable este mes", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_subscription_cost", value_en: "Subscription cost", value_es: "Costo de suscripcion", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_net_gain", value_en: "Net gain", value_es: "Ganancia neta", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_percentage", value_en: "ROI", value_es: "ROI", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_ai_actions_accepted", value_en: "AI actions accepted", value_es: "Acciones IA aceptadas", content_type: "text", group_name: "partner_dashboard" },
  { key: "roi_bookings_generated", value_en: "Bookings generated by AI actions", value_es: "Reservas generadas por IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "action_history_kicker", value_en: "AI operating log", value_es: "Registro operativo IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "action_history_title", value_en: "AI Action History", value_es: "Historial de acciones IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_report_kicker", value_en: "Weekly operating review", value_es: "Revision operativa semanal", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_report_title", value_en: "Weekly AI Report", value_es: "Reporte semanal IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_recovered_revenue", value_en: "Total recovered revenue this week", value_es: "Ingresos recuperados esta semana", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_best_campaign", value_en: "Best performing campaign", value_es: "Campana con mejor rendimiento", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_weakest_window", value_en: "Weakest time window", value_es: "Ventana mas debil", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_top_segment", value_en: "Top customer segment", value_es: "Segmento principal", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_biggest_risk", value_en: "Biggest risk", value_es: "Mayor riesgo", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_next_action", value_en: "Recommended next week action", value_es: "Accion recomendada para la proxima semana", content_type: "text", group_name: "partner_dashboard" },
  { key: "demand_calendar_title", value_en: "Demand Calendar", value_es: "Calendario de demanda", content_type: "text", group_name: "partner_dashboard" },
  { key: "demand_occupancy_label", value_en: "Occupancy", value_es: "Ocupacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "demand_status_weak", value_en: "Weak", value_es: "Debil", content_type: "text", group_name: "partner_dashboard" },
  { key: "demand_status_normal", value_en: "Normal", value_es: "Normal", content_type: "text", group_name: "partner_dashboard" },
  { key: "demand_status_strong", value_en: "Strong", value_es: "Fuerte", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_apply_best_recommendation", value_en: "Apply best recommendation", value_es: "Aplicar mejor recomendacion", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_notify_vip_guests", value_en: "Notify VIP guests", value_es: "Notificar clientes VIP", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_reduce_weak_hour_prep", value_en: "Reduce weak-hour prep", value_es: "Reducir preparacion en horas debiles", content_type: "text", group_name: "partner_dashboard" },
  { key: "feedback_most_photographed", value_en: "Most photographed dishes", value_es: "Platos mas fotografiados", content_type: "text", group_name: "partner_dashboard" },
  { key: "feedback_positive_words", value_en: "Most mentioned positive words", value_es: "Palabras positivas mas mencionadas", content_type: "text", group_name: "partner_dashboard" },
  { key: "feedback_negative_words", value_en: "Most mentioned negative words", value_es: "Palabras negativas mas mencionadas", content_type: "text", group_name: "partner_dashboard" },
  { key: "feedback_recommend_percent", value_en: "Would recommend %", value_es: "% recomendaria", content_type: "text", group_name: "partner_dashboard" },
  { key: "feedback_return_percent", value_en: "Would return %", value_es: "% volveria", content_type: "text", group_name: "partner_dashboard" },
  { key: "anonymous_feedback_label", value_en: "Anonymized guest feedback", value_es: "Comentario anonimizado", content_type: "text", group_name: "partner_dashboard" },
  { key: "approved_visit_signal", value_en: "Approved SmartTable visit signal", value_es: "Senal aprobada de visita SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_guest_intel_privacy_note", value_en: "Only aggregated, anonymized analytics are shared with restaurants. Personal guest behavior is never exposed.", value_es: "Solo se comparten analiticas agregadas y anonimizadas con restaurantes. El comportamiento personal de clientes nunca se expone.", content_type: "textarea", group_name: "partner_dashboard" }
);

defaultSiteContent.push(
  { key: "partner_nav_weekly_intelligence", value_en: "Weekly Intelligence", value_es: "Inteligencia semanal", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_advanced_ai", value_en: "Advanced AI", value_es: "IA avanzada", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_guests", value_en: "Guests", value_es: "Clientes", content_type: "text", group_name: "partner_dashboard" },
  { key: "partner_nav_settings", value_en: "Settings", value_es: "Configuracion", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_today_ceo_kicker", value_en: "AI CEO Dashboard", value_es: "Panel CEO de IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_today_ceo_title", value_en: "Today's AI CEO Summary", value_es: "Resumen CEO de IA de hoy", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_today_ceo_message", value_en: "Good morning, {{restaurant_name}}. Friday 5:30-7:00 PM has weak demand. Rain may reduce demand by 18%. Recommended action: create a 15% early dinner offer and notify favorite guests. Expected gain today: +{{expected_gain}}. AI confidence: {{confidence}}%.", value_es: "Buenos dias, {{restaurant_name}}. El viernes de 5:30 a 7:00 PM tiene demanda debil. La lluvia puede reducir la demanda en 18%. Accion recomendada: crear una oferta de cena temprana del 15% y avisar a clientes favoritos. Ganancia esperada hoy: +{{expected_gain}}. Confianza de IA: {{confidence}}%.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "owner_apply_ai_recommendation", value_en: "Apply AI Recommendation", value_es: "Aplicar recomendacion de IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_see_why", value_en: "See why", value_es: "Ver por que", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_edit_before_applying", value_en: "Edit before applying", value_es: "Editar antes de aplicar", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_main_risk", value_en: "Main risk", value_es: "Riesgo principal", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_main_opportunity", value_en: "Main opportunity", value_es: "Oportunidad principal", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_today_risk_copy", value_en: "Rain may reduce demand by 18% around 6 PM.", value_es: "La lluvia puede reducir la demanda en 18% cerca de las 6 PM.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "owner_today_opportunity_copy", value_en: "Friday 5:30-7:00 PM has weak demand and recoverable tables.", value_es: "El viernes de 5:30 a 7:00 PM tiene demanda debil y mesas recuperables.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "owner_today_recommendation_copy", value_en: "Create a 15% early dinner offer and notify favorite guests.", value_es: "Crear una oferta de cena temprana del 15% y avisar a clientes favoritos.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "owner_what_happened", value_en: "What happened", value_es: "Que paso", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_smarttable_recommends", value_en: "What SmartTable recommends", value_es: "Lo que recomienda SmartTable", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_expected_result", value_en: "Expected result", value_es: "Resultado esperado", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_expected_gain_copy", value_en: "Recover approximately {{expected_gain}} today.", value_es: "Recuperar aproximadamente {{expected_gain}} hoy.", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_recommended_action_kicker", value_en: "Recommended AI action", value_es: "Accion recomendada de IA", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_recommended_action_title", value_en: "The one thing to do now", value_es: "Lo principal para hacer ahora", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_notify_copy", value_en: "Notify favorite and VIP guests after the offer is activated.", value_es: "Avisar a clientes favoritos y VIP despues de activar la oferta.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "owner_confidence_simple", value_en: "Strong enough for an owner decision, with deeper details below.", value_es: "Suficiente para una decision del propietario, con mas detalles abajo.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "owner_recommendation_reason_margin", value_en: "Discount stays inside restaurant margin guardrails.", value_es: "El descuento se mantiene dentro de los limites de margen del restaurante.", content_type: "text", group_name: "partner_dashboard" },
  { key: "owner_value_month_title", value_en: "SmartTable value this month", value_es: "Valor de SmartTable este mes", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_level_title", value_en: "Plan the week without crowding today", value_es: "Planifica la semana sin saturar el dia", content_type: "text", group_name: "partner_dashboard" },
  { key: "weekly_level_intro", value_en: "Pricing, competitors, marketing, reviews, staffing, and the demand calendar live here for weekly planning.", value_es: "Precios, competidores, marketing, resenas, personal y calendario de demanda viven aqui para planificacion semanal.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "advanced_level_title", value_en: "Advanced operating intelligence", value_es: "Inteligencia operativa avanzada", content_type: "text", group_name: "partner_dashboard" },
  { key: "advanced_level_intro", value_en: "Deep AI modules are still available, but they no longer compete with the daily decision.", value_es: "Los modulos avanzados de IA siguen disponibles, pero ya no compiten con la decision diaria.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "guests_level_title", value_en: "Guest loyalty and return demand", value_es: "Lealtad y retorno de clientes", content_type: "text", group_name: "partner_dashboard" },
  { key: "guests_level_intro", value_en: "Use this when you want to grow repeat visits, favorites, and high-intent guest campaigns.", value_es: "Usalo cuando quieras crecer visitas repetidas, favoritos y campanas de alta intencion.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "reviews_level_title", value_en: "Reviews and post-visit intelligence", value_es: "Resenas e inteligencia post-visita", content_type: "text", group_name: "partner_dashboard" },
  { key: "reviews_level_intro", value_en: "Aggregated guest feedback, photo rewards, and review signals stay here.", value_es: "Comentarios agregados, recompensas de fotos y senales de resenas estan aqui.", content_type: "textarea", group_name: "partner_dashboard" },
  { key: "edit_recommendation_notice", value_en: "Recommendation opened for editing. Adjust discount, time window, or audience before applying.", value_es: "Recomendacion abierta para editar. Ajusta descuento, horario o audiencia antes de aplicar.", content_type: "textarea", group_name: "partner_dashboard" }
);

defaultSiteContent.push(
  { key: "missing_data_label", value_en: "Data still missing", value_es: "Datos aun faltantes", content_type: "text", group_name: "partner_dashboard" }
);

const defaultHungarianContent = {
  seo_title: "SmartTable AI | AI bev\u00e9teli oper\u00e1ci\u00f3s rendszer \u00e9ttermeknek",
  seo_meta_description: "A SmartTable AI foglal\u00e1sokat, vend\u00e9g-szem\u00e9lyre szab\u00e1st, predikt\u00edv keresleti intelligenci\u00e1t \u00e9s bev\u00e9tel-visszanyer\u00e9si eszk\u00f6z\u00f6ket ad New York-i \u00e9ttermeknek.",
  brand_title: "SmartTable AI",
  brand_subtitle: "AI Revenue Operating System \u00e9ttermeknek",
  nav_offers: "Aj\u00e1nlatok",
  nav_admin: "Super Admin",
  nav_partner: "Partner",
  login_button: "Bejelentkez\u00e9s",
  logout_button: "Kijelentkez\u00e9s",
  email_guest_registration_subject: "\u00dcdv\u00f6zl\u00fcnk a SmartTable-ben",
  email_guest_registration_body: "Szia {{guest_name}}, elk\u00e9sz\u00fclt a SmartTable fi\u00f3kod. Mostant\u00f3l b\u00f6ng\u00e9szhetsz \u00e9ttermeket, menthetsz kedvenceket \u00e9s kedvezm\u00e9nyes asztalokat k\u00e9rhetsz.",
  email_cta_explore_restaurants: "\u00c9ttermek b\u00f6ng\u00e9sz\u00e9se",
  email_verification_subject: "Er\u0151s\u00edtsd meg a SmartTable email c\u00edmedet",
  email_verification_body: "Szia {{guest_name}}, itt tudod meger\u0151s\u00edteni a SmartTable email c\u00edmedet: {{verification_url}}",
  email_cta_verify_email: "Email meger\u0151s\u00edt\u00e9se",
  email_password_reset_subject: "SmartTable jelsz\u00f3 vissza\u00e1ll\u00edt\u00e1sa",
  email_password_reset_body: "Ha SmartTable jelsz\u00f3-vissza\u00e1ll\u00edt\u00e1st k\u00e9rt\u00e9l, haszn\u00e1ld ezt a linket: {{reset_url}}. Ha nem te k\u00e9rted, hagyd figyelmen k\u00edv\u00fcl ezt az \u00fczenetet.",
  email_cta_reset_password: "Jelsz\u00f3 vissza\u00e1ll\u00edt\u00e1sa",
  email_password_changed_subject: "A SmartTable jelszavad megv\u00e1ltozott",
  email_password_changed_body: "Szia {{guest_name}}, a SmartTable jelszavad sikeresen megv\u00e1ltozott. Ha nem te v\u00e9gezted ezt a m\u00f3dos\u00edt\u00e1st, azonnal vedd fel a kapcsolatot a SmartTable \u00fcgyf\u00e9lszolg\u00e1lattal.",
  email_cta_my_account: "Fi\u00f3kom megnyit\u00e1sa",
  hero_kicker: "SmartTable AI",
  hero_title: "AI Revenue Operating System \u00e9ttermeknek",
  hero_subtitle: "Szem\u00e9lyre szabott \u00e9tteremaj\u00e1nl\u00e1s vend\u00e9geknek, predikt\u00edv keresleti intelligencia \u00e9ttermeknek, okosabb bev\u00e9tel-visszanyer\u00e9s New Yorkban.",
  company_description: "A SmartTable egy SaaS foglal\u00e1si marketplace New York-i \u00e9ttermeknek, amelyek kontroll\u00e1lt kedvezm\u00e9nyekkel szeretn\u00e9k megt\u00f6lteni szabad asztalaikat.",
  marketplace_status_title: "Marketplace \u00e1llapot",
  marketplace_status_demo: "Demo m\u00f3d akt\u00edv. \u00c9les t\u00e1rol\u00e1shoz csatlakoztasd a Supabase k\u00f6rnyezeti v\u00e1ltoz\u00f3kat.",
  marketplace_status_live: "\u00c9les Supabase t\u00e1rol\u00e1s akt\u00edv a foglal\u00e1sokhoz, aj\u00e1nlatokhoz, felhaszn\u00e1l\u00f3khoz \u00e9s tartalmakhoz.",
  offers_kicker: "Vend\u00e9gfoglal\u00e1s",
  offers_title: "El\u00e9rhet\u0151 kedvezm\u00e9nyes asztalok",
  offers_empty: "M\u00e9g nincs akt\u00edv aj\u00e1nlat.",
  reserve_button: "Foglal\u00e1s",
  offers_count_label: "akt\u00edv aj\u00e1nlat",
  filter_neighborhood_label: "V\u00e1rosr\u00e9sz",
  filter_cuisine_label: "Konyha",
  filter_discount_label: "Minimum kedvezm\u00e9ny",
  filter_date_label: "D\u00e1tum",
  filter_time_label: "Id\u0151pont",
  filter_party_size_label: "L\u00e9tsz\u00e1m",
  filter_restaurant_name_label: "\u00c9tterem neve",
  filter_available_only_label: "Csak el\u00e9rhet\u0151 aj\u00e1nlatok",
  sort_label: "Rendez\u00e9s",
  sort_recommended_label: "Aj\u00e1nlott",
  sort_newest_label: "Leg\u00fajabb",
  sort_highest_discount_label: "Legnagyobb kedvezm\u00e9ny",
  sort_soonest_label: "Leghamarabb el\u00e9rhet\u0151",
  sort_name_label: "\u00c9tterem neve A-Z",
  sort_admin_order_label: "Admin sorrend",
  view_list_label: "Lista",
  view_map_label: "T\u00e9rk\u00e9p",
  map_key_missing: "A Google Maps integr\u00e1ci\u00f3 el\u0151 van k\u00e9sz\u00edtve, de az API kulcs m\u00e9g nincs be\u00e1ll\u00edtva.",
  follow_button: "\u00c9tterem k\u00f6vet\u00e9se",
  favorite_button: "Hozz\u00e1ad\u00e1s a kedvencekhez",
  follow_title: "K\u00f6vesd ezt az \u00e9ttermet",
  follow_copy: "\u00c9rtes\u00edt\u00e9st kapsz, amikor ez az \u00e9tterem \u00faj SmartTable aj\u00e1nlatot tesz k\u00f6zz\u00e9.",
  follow_success: "Mostant\u00f3l k\u00f6veted ezt az \u00e9ttermet.",
  reserve_modal_title: "Foglal\u00e1si k\u00e9relem",
  modal_offer_label: "Kiv\u00e1lasztott aj\u00e1nlat",
  reservation_success_title: "Foglal\u00e1si k\u00e9relem elk\u00fcldve",
  reservation_success_body: "A foglal\u00e1si k\u00e9relmedet mentett\u00fck. A visszaigazol\u00f3 email sorba lett \u00e1ll\u00edtva. Ez m\u00e9g nem visszaigazolt foglal\u00e1s; az \u00e9tteremnek el kell fogadnia.",
  reservation_success_body_email_unconfirmed: "A foglal\u00e1si k\u00e9relmedet mentett\u00fck, de a visszaigazol\u00f3 emailt nem siker\u00fclt elk\u00fcldeni. A k\u00e9relmet tov\u00e1bbra is megtekintheted a Foglal\u00e1saim oldalon.",
  forgot_password_sent_title: "K\u00e9relem r\u00f6gz\u00edtve",
  forgot_password_sent_body: "Ha ehhez az email c\u00edmhez tartozik SmartTable fi\u00f3k, a jelsz\u00f3-vissza\u00e1ll\u00edt\u00f3 \u00fczenet akkor lesz elk\u00fcldve, amikor az email k\u00e9zbes\u00edt\u00e9s konfigur\u00e1lva van.",
  flexible_date_label: "Rugalmas d\u00e1tum",
  time_at_label: "",
  time_tbd_label: "egyeztet\u00e9s alatt",
  logged_in_toast: "Sikeres bejelentkez\u00e9s.",
  logged_out_toast: "Kijelentkezt\u00e9l.",
  session_expired_message: "A munkamenet lej\u00e1rt. K\u00e9rlek, jelentkezz be \u00fajra.",
  content_saved_toast: "Tartalom mentve.",
  email_guest_received_subject: "Megkaptuk a SmartTable foglal\u00e1si k\u00e9relmedet",
  email_guest_received_body: "Szia {{guest_name}}, megkaptuk a foglal\u00e1si k\u00e9relmedet: {{reservation_summary}}. Hivatkoz\u00e1s: {{reference}}.",
  email_guest_pending_notice: "\u00c1llapot: f\u00fcgg\u0151ben. Ez m\u00e9g foglal\u00e1si k\u00e9relem, nem visszaigazolt foglal\u00e1s. Az \u00e9tteremnek el kell fogadnia, miel\u0151tt visszaigazoltt\u00e1 v\u00e1lik.",
  email_cta_my_reservations: "Foglal\u00e1saim megtekint\u00e9se",
  email_restaurant_new_subject: "\u00daj foglal\u00e1si k\u00e9relem \u00e9rkezett a SmartTable-t\u00f3l",
  email_restaurant_new_body: "\u00daj f\u00fcgg\u0151ben l\u00e9v\u0151 foglal\u00e1si k\u00e9relem itt: {{restaurant_name}}. Hivatkoz\u00e1s: {{reference}}. Aj\u00e1nlat: {{offer_title}}. D\u00e1tum/id\u0151: {{reservation_date}} {{reservation_time}}. L\u00e9tsz\u00e1m: {{party_size}}. Vend\u00e9g: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Megjegyz\u00e9s: {{notes}}.",
  email_cta_open_dashboard: "Dashboard megnyit\u00e1sa",
  email_guest_accepted_subject: "A foglal\u00e1sodat visszaigazolt\u00e1k",
  email_guest_accepted_body: "{{restaurant_name}} visszaigazolta a foglal\u00e1sodat. Aj\u00e1nlat: {{offer_title}}. D\u00e1tum/id\u0151: {{reservation_date}} {{reservation_time}}. L\u00e9tsz\u00e1m: {{party_size}}. Kedvezm\u00e9ny: {{discount}}%. C\u00edm: {{restaurant_address}}. Hivatkoz\u00e1s: {{reference}}.",
  email_guest_accepted_notice: "\u00c1llapot: elfogadva. A foglal\u00e1sodat az \u00e9tterem visszaigazolta.",
  email_guest_rejected_subject: "A foglal\u00e1si k\u00e9relmedet nem tudt\u00e1k visszaigazolni",
  email_guest_rejected_body: "{{restaurant_name}} nem tudta visszaigazolni a {{reservation_date}} {{reservation_time}} id\u0151pontra k\u00e9rt foglal\u00e1si k\u00e9relmedet. Hivatkoz\u00e1s: {{reference}}.",
  email_guest_rejected_notice: "\u00c1llapot: elutas\u00edtva. Visszat\u00e9rhetsz a SmartTable-re, hogy m\u00e1sik el\u00e9rhet\u0151 asztalt tal\u00e1lj.",
  email_cta_find_another_table: "M\u00e1sik asztal keres\u00e9se",
  email_guest_cancelled_subject: "A foglal\u00e1sodat t\u00f6r\u00f6lt\u00e9k",
  email_guest_cancelled_body: "A SmartTable foglal\u00e1sod itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} id\u0151pontra t\u00f6r\u00f6lve lett. Hivatkoz\u00e1s: {{reference}}. T\u00f6rl\u00e9s ideje: {{cancelled_at}}. T\u00f6rl\u00e9st v\u00e9gezte: {{cancelled_by_label}}.",
  email_guest_cancelled_notice: "\u00c1llapot: t\u00f6r\u00f6lve. Ez a foglal\u00e1s m\u00e1r nem akt\u00edv.",
  email_restaurant_cancelled_subject: "SmartTable foglal\u00e1s t\u00f6r\u00f6lve: {{reference}}",
  email_restaurant_cancelled_body: "A(z) {{reference}} hivatkoz\u00e1s\u00fa foglal\u00e1s itt: {{restaurant_name}}, {{reservation_date}} {{reservation_time}} id\u0151pontra t\u00f6r\u00f6lve lett. Vend\u00e9g: {{guest_name}}. T\u00f6rl\u00e9s ideje: {{cancelled_at}}. T\u00f6rl\u00e9st v\u00e9gezte: {{cancelled_by_label}}.",
  reservation_accepted_notification_title: "Foglal\u00e1s visszaigazolva",
  reservation_accepted_notification_message: "{{restaurant_name}} visszaigazolta a foglal\u00e1sodat. Hivatkoz\u00e1s: {{reference}}.",
  reservation_accepted_notification_cta: "Foglal\u00e1s megtekint\u00e9se",
  reservation_rejected_notification_title: "Foglal\u00e1s nem visszaigazolva",
  reservation_rejected_notification_message: "{{restaurant_name}} nem tudta visszaigazolni a foglal\u00e1si k\u00e9relmedet. Hivatkoz\u00e1s: {{reference}}.",
  reservation_rejected_notification_cta: "Foglal\u00e1s megtekint\u00e9se",
  reservation_cancelled_notification_title: "Foglal\u00e1s t\u00f6r\u00f6lve",
  reservation_cancelled_notification_message: "A foglal\u00e1sod t\u00f6r\u00f6lve lett itt: {{restaurant_name}}. Hivatkoz\u00e1s: {{reference}}.",
  reservation_cancelled_notification_cta: "Foglal\u00e1s megtekint\u00e9se",
  email_admin_new_subject: "SmartTable admin \u00e9rtes\u00edt\u00e9s: \u00faj foglal\u00e1si k\u00e9relem",
  email_admin_new_body: "\u00daj foglal\u00e1s j\u00f6tt l\u00e9tre itt: {{restaurant_name}}. {{reservation_summary}}.",
  post_visit_email_subject: "Milyen volt az \u00e9lm\u00e9nyed itt: {{restaurant_name}}?",
  post_visit_email_preheader: "Oszd meg a SmartTable l\u00e1togat\u00e1sod tapasztalatait itt: {{restaurant_name}}.",
  post_visit_email_body: "Szia {{guest_name}},\n\nK\u00f6sz\u00f6nj\u00fck, hogy a SmartTable-en kereszt\u00fcl vacsor\u00e1zt\u00e1l itt: {{restaurant_name}}.\n\nSzeretn\u00e9nk hallani a {{visit_date}} napi l\u00e1togat\u00e1sod tapasztalatair\u00f3l.\n\n\u00c9rt\u00e9keld a l\u00e1togat\u00e1st:\n- \u00c9tel\n- Szerviz\n- Hangulat\n- Teljes \u00e9lm\u00e9ny\n\nMegoszthatsz \u00e9tel- vagy italfot\u00f3kat \u00e9s r\u00f6vid le\u00edr\u00e1st is arr\u00f3l, mit rendelt\u00e9l.\n\nA visszajelz\u00e9sed seg\u00edt m\u00e1s vend\u00e9geknek \u00e9s jav\u00edtja a SmartTable szem\u00e9lyre szabott aj\u00e1nl\u00e1sait.",
  post_visit_email_loyalty_note: "A jogosult visszajelz\u00e9sek SmartTable pontokat \u00e9rhetnek, ha a loyalty rendszer enged\u00e9lyezve van a fi\u00f3kodn\u00e1l.",
  post_visit_email_footer: "Az\u00e9rt kapod ezt az \u00fczenetet, mert teljes\u00edtett SmartTable foglal\u00e1sod volt itt: {{restaurant_name}}.",
  post_visit_rate_button: "\u00c9rt\u00e9keld az \u00e9lm\u00e9nyt",
  post_visit_upload_button: "Fot\u00f3k felt\u00f6lt\u00e9se",
  post_visit_upload_rewards_button: "Fot\u00f3k felt\u00f6lt\u00e9se pontok\u00e9rt",
  post_visit_ordered_button: "Oszd meg, mit rendelt\u00e9l",
  post_visit_notification_title: "Milyen volt: {{restaurant_name}}?",
  post_visit_notification_message: "\u00c9rt\u00e9keld a l\u00e1togat\u00e1st \u00e9s t\u00f6lts fel fot\u00f3kat a SmartTable foglal\u00e1sod ut\u00e1n.",
  post_visit_notification_cta: "L\u00e1togat\u00e1s \u00e9rt\u00e9kel\u00e9se",
  post_visit_email_unconfirmed_notice: "A post-visit \u00e9rtes\u00edt\u00e9s r\u00f6gz\u00edtve lett, de az email k\u00e9zbes\u00edt\u00e9s\u00e9t nem tudtuk meger\u0151s\u00edteni."
};

function nowIso() {
  return new Date().toISOString();
}

function json(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    },
    body
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

function nullableClean(value) {
  const result = clean(value);
  return result || null;
}

function lower(value) {
  return clean(value).toLowerCase();
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerInRange(value, min, max) {
  const parsed = Math.trunc(Number(value));
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function dateStartOfWeek(date = new Date()) {
  const target = new Date(date);
  const day = target.getUTCDay();
  const diff = (day + 6) % 7;
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() - diff);
  return target;
}

function dateStartOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function normalizeRole(role) {
  const value = clean(role || "guest");
  if (value === "restaurant" || value === "restaurant_partner") return "partner";
  return value;
}

function clientProfile(profile) {
  return profile ? { ...profile, role: normalizeRole(profile.role) } : profile;
}

function roleMatches(profileRole, roles) {
  const normalized = normalizeRole(profileRole);
  if (normalized === "super_admin" && roles.some((role) => normalizeRole(role) === "admin")) return true;
  return roles.some((role) => normalizeRole(role) === normalized);
}

function normalizeReservationStatus(status) {
  const value = clean(status).toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "requested") return "pending";
  if (value === "confirmed") return "accepted";
  if (value === "declined") return "rejected";
  if (value === "canceled") return "cancelled";
  return value;
}

function storageReservationStatus(status) {
  return normalizeReservationStatus(status);
}

function reservationTransitionPolicy(previousStatus, targetStatus) {
  const previous = normalizeReservationStatus(previousStatus);
  const target = normalizeReservationStatus(targetStatus);
  if (!mutableReservationStatuses.has(target)) {
    return {
      allowed: false,
      code: "INVALID_RESERVATION_STATUS",
      message: "Invalid reservation status."
    };
  }
  if (!previous) {
    return {
      allowed: false,
      code: "RESERVATION_NOT_FOUND",
      message: "Reservation not found."
    };
  }
  if (previous === target) {
    return {
      allowed: true,
      unchanged: true,
      code: "RESERVATION_STATUS_UNCHANGED",
      message: "Reservation status is already up to date."
    };
  }
  const allowedTargets = reservationStatusTransitions[previous] || new Set();
  if (allowedTargets.has(target)) {
    return {
      allowed: true,
      unchanged: false,
      code: "RESERVATION_STATUS_TRANSITION_ALLOWED",
      message: "Reservation status transition is allowed."
    };
  }
  return {
    allowed: false,
    code: "INVALID_RESERVATION_STATUS_TRANSITION",
    message: `Reservation cannot move from ${previous} to ${target}.`
  };
}

function assertReservationTransition(previousStatus, targetStatus) {
  const policy = reservationTransitionPolicy(previousStatus, targetStatus);
  if (!policy.allowed) {
    const error = new Error(policy.message);
    error.status = policy.code === "RESERVATION_NOT_FOUND" ? 404 : 409;
    error.code = policy.code;
    error.details = {
      previous_status: normalizeReservationStatus(previousStatus),
      target_status: normalizeReservationStatus(targetStatus)
    };
    throw error;
  }
  return policy;
}

function reservationStatusAuditPayload(targetStatus, options = {}) {
  const status = normalizeReservationStatus(targetStatus);
  const timestamp = options.changedAt || nowIso();
  const payload = {
    booking_status: bookingStatusFromReservationStatus(status),
    status_changed_at: timestamp
  };
  if (options.actorUserId) payload.status_changed_by = options.actorUserId;
  if (status === "accepted") payload.accepted_at = timestamp;
  if (status === "rejected") payload.rejected_at = timestamp;
  if (status === "completed") payload.completed_at = timestamp;
  if (status === "no_show") payload.no_show_at = timestamp;
  if (status === "cancelled") {
    payload.cancelled_at = timestamp;
    payload.cancelled_by_label = clean(options.cancelledByLabel || "SmartTable");
  }
  return payload;
}

function releasesOfferCapacity(previousStatus, targetStatus) {
  const previous = normalizeReservationStatus(previousStatus);
  const target = normalizeReservationStatus(targetStatus);
  return !["rejected", "cancelled", "no_show"].includes(previous)
    && ["rejected", "cancelled", "no_show"].includes(target);
}

function normalizeBookingSource(value) {
  const normalized = String(value || "SMARTTABLE").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "OPEN_TABLE") return "OPENTABLE";
  if (bookingSources.has(normalized)) return normalized;
  return "SMARTTABLE";
}

function bookingStatusFromReservationStatus(status) {
  const value = normalizeReservationStatus(status);
  if (value === "accepted") return "confirmed";
  if (value === "rejected") return "declined";
  if (value === "requested") return "pending";
  if (value === "confirmed") return "confirmed";
  if (value === "waiting_external_confirmation") return "waiting_external_confirmation";
  if (value === "expired") return "expired";
  if (value === "completed") return "completed";
  if (value === "no_show") return "no_show";
  if (value === "cancelled") return "cancelled";
  return "pending";
}

function normalizeBookingStatus(value, fallbackStatus = "pending") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "accepted") return "confirmed";
  if (normalized === "rejected") return "declined";
  if (normalized === "requested") return "pending";
  if (bookingStatuses.has(normalized)) return normalized;
  return bookingStatusFromReservationStatus(fallbackStatus);
}

function decorateReservationRow(row = {}) {
  const status = normalizeReservationStatus(row.status);
  const bookingSource = normalizeBookingSource(row.booking_source || row.source || row.reservation_source || "SMARTTABLE");
  return {
    ...row,
    status,
    booking_source: bookingSource,
    booking_status: normalizeBookingStatus(row.booking_status, status)
  };
}

function normalizeContentRow(row) {
  const key = clean(row.key);
  return {
    key,
    value_en: row.value_en ?? "",
    value_es: row.value_es ?? "",
    value_hu: row.value_hu ?? defaultHungarianContent[key] ?? "",
    content_type: clean(row.content_type || "text"),
    group_name: clean(row.group_name || "general"),
    updated_at: row.updated_at || nowIso()
  };
}

function mergeContentRows(rows = []) {
  const byKey = new Map(defaultSiteContent.map((row) => [row.key, normalizeContentRow(row)]));
  for (const row of rows) {
    if (!row?.key) continue;
    const current = byKey.get(row.key) || {};
    byKey.set(row.key, normalizeContentRow({ ...current, ...row }));
  }
  return [...byKey.values()].sort((a, b) => {
    const group = a.group_name.localeCompare(b.group_name);
    return group || a.key.localeCompare(b.key);
  });
}

function localizeRows(rows, lang = "en") {
  const normalized = normalizeLanguage(lang);
  const target = languageColumn(lang);
  return Object.fromEntries(rows.map((row) => [
    row.key,
    normalized === "en"
      ? clean(row.value_en)
      : clean(row[target])
  ]));
}

async function serverContentRows() {
  if (!supabaseConfigured) {
    ensureDemo();
    return mergeContentRows(demo.siteContent);
  }
  const rows = await supabaseFetch("/rest/v1/site_content?select=*&order=group_name.asc,key.asc", { service: true }).catch(() => []);
  return mergeContentRows(rows || []);
}

function contentValue(rows, key, fallback = "", lang = "en") {
  const row = rows.find((item) => item.key === key);
  const target = languageColumn(lang);
  return clean(row?.[target]) || clean(row?.value_en) || clean(row?.value_es) || clean(row?.value_hu) || fallback;
}

function template(value, context) {
  return clean(value).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => clean(context[key]));
}

function emailContext(row) {
  const bookingId = row.reservation_id || row.id || "";
  const rewardsUrl = `${PUBLIC_BASE_URL}/guest/rewards/photo-upload?bookingId=${encodeURIComponent(bookingId)}`;
  return {
    reference: row.reference,
    booking_id: bookingId,
    restaurant_name: row.restaurant_name,
    restaurantName: row.restaurant_name,
    restaurant_address: row.restaurant_address || "",
    reservation_summary: reservationEmailText(row),
    guest_name: row.guest_name,
    guestName: row.guest_name,
    guest_email: row.guest_email,
    guest_phone: row.guest_phone,
    notes: row.notes || "none",
    offer_title: row.offer_title || row.offer_name || "",
    discount: row.discount_percent || row.discount_value || "",
    party_size: row.party_size || "",
    status: normalizeReservationStatus(row.status),
    reservation_date: row.reservation_date || row.offer_date,
    reservation_time: row.reservation_time || row.offer_time,
    cancelled_at: row.cancelled_at || "",
    cancelled_by_label: row.cancelled_by_label || "SmartTable",
    dashboard_url: `${PUBLIC_BASE_URL}/partner/reservations?reservation=${encodeURIComponent(row.reference)}`,
    rewards_url: rewardsUrl,
    rate_url: rewardsUrl,
    photo_upload_url: rewardsUrl,
    ordered_items_url: rewardsUrl
  };
}

function localizedField(item, base, lang = "en") {
  if (!item) return "";
  const suffix = `_${normalizeLanguage(lang)}`;
  return clean(item[`${base}${suffix}`]) || clean(item[`${base}_en`]) || clean(item[base]);
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value)
    .split(/[\n,]/)
    .map(clean)
    .filter(Boolean);
}

function jsonFrom(value, fallback = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function validDaysFrom(value) {
  const days = arrayFrom(value).map((day) => day.toLowerCase().slice(0, 3));
  const filtered = days.filter((day) => allowedDays.has(day));
  return filtered.length ? filtered : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
}

function ensureDemo() {
  if (demo.booted) return;
  demo.booted = true;

  const adminId = "00000000-0000-4000-8000-000000000001";
  const regularAdminId = "00000000-0000-4000-8000-000000000004";
  const partnerUserId = "00000000-0000-4000-8000-000000000002";
  const guestId = "00000000-0000-4000-8000-000000000003";
  const restaurantId = "10000000-0000-4000-8000-000000000001";
  const secondRestaurantId = "10000000-0000-4000-8000-000000000002";
  const offerId = "20000000-0000-4000-8000-000000000001";
  const secondOfferId = "20000000-0000-4000-8000-000000000002";
  const demoBookingId = "30000000-0000-4000-8000-000000001042";
  const demoFeedbackBookingId = "30000000-0000-4000-8000-000000001043";

  demo.users = [
    { id: adminId, email: "admin@smarttable.com", password: "admin123" },
    { id: regularAdminId, email: "ops@smarttable.com", password: "admin123" },
    { id: partnerUserId, email: "owner@hudsonhearth.com", password: "restaurant123" },
    { id: guestId, email: "guest@smarttable.com", password: "guest123" }
  ];

  demo.profiles = [
    { id: adminId, email: "admin@smarttable.com", full_name: "Smarttable Admin", role: "super_admin", restaurant_id: null, preferred_language: "en" },
    { id: regularAdminId, email: "ops@smarttable.com", full_name: "Smarttable Operations Admin", role: "admin", restaurant_id: null, preferred_language: "en" },
    { id: partnerUserId, email: "owner@hudsonhearth.com", full_name: "Hudson Hearth Owner", role: "partner", restaurant_id: restaurantId, preferred_language: "en" },
    { id: guestId, email: "guest@smarttable.com", full_name: "Guest User", role: "guest", restaurant_id: null, preferred_language: "hu" }
  ];

  demo.restaurants = [
    {
      id: restaurantId,
      owner_user_id: partnerUserId,
      name: "Hudson Hearth",
      legal_name: "Hudson Hearth LLC",
      contact_email: "reservations@hudsonhearth.example",
      email: "reservations@hudsonhearth.example",
      phone: "+1 212 555 0188",
      address: "128 Perry St, New York, NY 10014",
      district: "West Village",
      cuisine: "New American",
      cuisine_type: "New American",
      restaurant_type: "polished casual",
      website: "https://hudsonhearth.example",
      instagram: "@hudsonhearth",
      facebook: "https://facebook.com/hudsonhearth",
      tiktok: "https://tiktok.com/@hudsonhearth",
      google_maps_url: "https://maps.google.com/?q=128+Perry+St+New+York",
      google_place_id: null,
      latitude: 40.7359,
      longitude: -74.0068,
      opening_hours: "Mon-Sun 5:00 PM - 11:00 PM",
      description: "A polished neighborhood bistro with stronger deals for early and late dinner windows.",
      description_en: "A polished neighborhood bistro with stronger deals for early and late dinner windows.",
      description_es: "Un bistro de barrio elegante con mejores ofertas temprano y tarde.",
      description_hu: "Eleg\u00e1ns szomsz\u00e9ds\u00e1gi bisztr\u00f3 er\u0151sebb korai \u00e9s k\u00e9s\u0151 esti aj\u00e1nlatokkal.",
      cover_image: "/assets/restaurant-hero.png",
      card_image: "/assets/restaurant-hero.png",
      icon_image: "/assets/restaurant-hero.png",
      logo_url: "/assets/restaurant-hero.png",
      hero_image_url: "/assets/restaurant-hero.png",
      menu_pdf_url: "https://hudsonhearth.example/menu.pdf",
      price_range: "$$$",
      dress_code: "Smart casual",
      outdoor_seating: true,
      parking_available: false,
      kids_friendly: true,
      pet_friendly: false,
      wheelchair_accessible: true,
      payment_methods: ["Visa", "Mastercard", "Amex", "Apple Pay"],
      chef_name: "Elena Morris",
      year_opened: 2018,
      capacity: 86,
      private_room_available: true,
      gallery_images: ["/assets/restaurant-hero.png"],
      billing_plan: "monthly",
      monthly_fee: 199,
      fee_per_booking: 0,
      billing_status: "active",
      status: "approved",
      sort_order: 1,
      ai_discount_enabled: true,
      min_discount_percent: 10,
      max_discount_percent: 30,
      target_margin_percent: 68,
      average_service_minutes: 70,
      rating: 4.8,
      views_count: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: secondRestaurantId,
      owner_user_id: null,
      name: "Casa Luna Trattoria",
      legal_name: "Casa Luna Hospitality Inc.",
      contact_email: "manager@casaluna.example",
      email: "manager@casaluna.example",
      phone: "+1 212 555 0142",
      address: "242 Mott St, New York, NY 10012",
      district: "Nolita",
      cuisine: "Italian",
      cuisine_type: "Italian",
      restaurant_type: "trattoria casual",
      website: "https://casaluna.example",
      instagram: "@casalunanyc",
      facebook: "https://facebook.com/casalunanyc",
      tiktok: "https://tiktok.com/@casalunanyc",
      google_maps_url: "https://maps.google.com/?q=242+Mott+St+New+York",
      google_place_id: null,
      latitude: 40.723,
      longitude: -73.9946,
      opening_hours: "Tue-Sun 4:30 PM - 10:30 PM",
      description: "Warm trattoria energy, handmade pasta, and discounted tables between peak turns.",
      description_en: "Warm trattoria energy, handmade pasta, and discounted tables between peak turns.",
      description_es: "",
      description_hu: "Meleg trattoria hangulat, k\u00e9zzel k\u00e9sz\u00edtett t\u00e9szt\u00e1k \u00e9s kedvezm\u00e9nyes asztalok a cs\u00facsid\u0151k k\u00f6z\u00f6tt.",
      cover_image: "/assets/restaurant-hero.png",
      card_image: "/assets/restaurant-hero.png",
      icon_image: "/assets/restaurant-hero.png",
      logo_url: "/assets/restaurant-hero.png",
      hero_image_url: "/assets/restaurant-hero.png",
      menu_pdf_url: "https://casaluna.example/menu.pdf",
      price_range: "$$",
      dress_code: "Casual",
      outdoor_seating: true,
      parking_available: false,
      kids_friendly: true,
      pet_friendly: true,
      wheelchair_accessible: true,
      payment_methods: ["Visa", "Mastercard", "Cash"],
      chef_name: "Marco Bellini",
      year_opened: 2021,
      capacity: 64,
      private_room_available: false,
      gallery_images: ["/assets/restaurant-hero.png"],
      billing_plan: "free",
      monthly_fee: 0,
      fee_per_booking: 2,
      billing_status: "trialing",
      status: "pending",
      sort_order: 2,
      ai_discount_enabled: true,
      min_discount_percent: 10,
      max_discount_percent: 25,
      target_margin_percent: 65,
      average_service_minutes: 80,
      rating: 4.7,
      views_count: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];

  const localIsoDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const offerDateForLocalTime = (hour, minute = 0) => {
    const date = new Date();
    const start = new Date(date);
    start.setHours(hour, minute, 0, 0);
    if (start.getTime() <= date.getTime()) start.setDate(start.getDate() + 1);
    return localIsoDate(start);
  };
  const today = localIsoDate(new Date());
  const yesterday = localIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const earlyOfferDate = offerDateForLocalTime(18, 0);
  const lateOfferDate = offerDateForLocalTime(20, 30);
  const demoGuestPreferences = {
    cuisines: ["American", "Italian", "Hungarian"],
    food_interests: ["Steak", "Pasta", "Desserts"],
    food_categories: ["Steak", "Pasta", "Desserts"],
    drink_preferences: ["Wine", "Coffee", "Mocktails"],
    dietary_needs: ["No restrictions"],
    dietary_restrictions: ["No restrictions"],
    allergy_notes: "",
    preferred_neighborhoods: ["West Village", "Nolita"],
    atmospheres: ["Casual dining", "Quiet atmosphere"],
    dining_experiences: ["Casual dining", "Business meeting", "Quiet atmosphere"],
    dining_occasions: ["Casual dining"],
    companions: ["Partner", "Friends"],
    party_size: "2",
    preferred_days: ["Friday", "Saturday"],
    preferred_time_windows: ["Early dinner", "Dinner"],
    booking_lead_time: "1-2 days",
    dining_duration: "60-90 minutes",
    discovery_preference: "A balance of both",
    selection_priorities: ["Food quality", "Discount", "Location"],
    new_restaurant_recommendations: "Yes",
    new_menu_item_recommendations: "Yes",
    favorite_restaurants: ["Hudson Hearth"],
    excluded_categories: ["No exclusions"],
    spending_range: "$35-$50",
    discount_levels: ["15%", "20%"],
    minimumInterestingDiscount: 15,
    minimum_interesting_discount: 15,
    consider_no_discount_match: "Sometimes",
    notification_preferences: ["Reservation status updates", "Offers from favorite restaurants"],
    notification_channels: ["Email"],
    notification_frequency: "Only important reservation messages",
    event_recommendations_interest: "No",
    future_calendar_interest: "No",
    location: {
      city: "New York",
      region: "NY",
      postal_code: "10014",
      max_travel_distance_miles: 5,
      transportation_method: "Public transportation"
    },
    consents: {
      transactional_email: true,
      marketing: false,
      sms: false,
      privacy: true,
      privacy_policy_accepted: true,
      terms: true,
      terms_accepted: true,
      terms_version: TERMS_VERSION,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      accepted_at: nowIso(),
      language: "hu",
      marketing_accepted_at: null
    }
  };
  demo.guests = [{
    id: "60000000-0000-4000-8000-000000000003",
    user_id: guestId,
    email: "guest@smarttable.com",
    full_name: "Guest User",
    phone: "+1 212 555 0103",
    first_name: "Guest",
    last_name: "User",
    city: "New York",
    region: "NY",
    postal_code: "10014",
    preferred_dining_areas: ["West Village", "Nolita"],
    max_travel_distance_miles: 5,
    transportation_method: "Public transportation",
    selected_language: "hu",
    status: "active",
    email_verified: true,
    created_at: nowIso(),
    updated_at: nowIso()
  }];
  demo.guestProfiles = [{
    id: "61000000-0000-4000-8000-000000000003",
    guest_id: demo.guests[0].id,
    profile_key: aiProfileKey("guest@smarttable.com"),
    preferences: demoGuestPreferences,
    dietary_restrictions: demoGuestPreferences.dietary_needs,
    favorite_cuisines: demoGuestPreferences.cuisines,
    preferred_neighborhoods: demoGuestPreferences.preferred_neighborhoods,
    ...guestPreferenceColumns(demoGuestPreferences),
    consent: demoGuestPreferences.consents,
    total_points: 0,
    lifetime_points: 0,
    created_at: nowIso(),
    updated_at: nowIso()
  }];

  demo.offers = [
    {
      id: offerId,
      restaurant_id: restaurantId,
      title_en: "Early dinner table",
      title_es: "Mesa para cena temprana",
      title_hu: "Korai vacsoraasztal",
      description_en: "A limited early dinner window with 25% off food.",
      description_es: "Una ventana limitada de cena temprana con 25% de descuento en comida.",
      description_hu: "Korl\u00e1tozott korai vacsoraid\u0151szak 25% \u00e9telkedvezm\u00e9nnyel.",
      discount_type: "percent",
      discount_value: 25,
      valid_days: ["mon", "tue", "wed", "thu", "fri"],
      offer_date: earlyOfferDate,
      offer_time: "18:00",
      start_time: "18:00",
      end_time: "19:30",
      available_tables: 6,
      reserved_tables: 0,
      max_party_size: 4,
      offer_image: "/assets/restaurant-hero.png",
      seat_count: 24,
      reserved_seats: 0,
      discount_percent: 25,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: secondOfferId,
      restaurant_id: secondRestaurantId,
      title_en: "Late table special",
      title_es: "Especial de mesa tardia",
      title_hu: "K\u00e9s\u0151 esti asztalaj\u00e1nlat",
      description_en: "Late evening tables with deeper savings for flexible guests.",
      description_es: "",
      description_hu: "K\u00e9s\u0151 esti asztalok nagyobb megtakar\u00edt\u00e1ssal rugalmas vend\u00e9geknek.",
      discount_type: "percent",
      discount_value: 30,
      valid_days: ["thu", "fri", "sat"],
      offer_date: lateOfferDate,
      offer_time: "20:30",
      start_time: "20:30",
      end_time: "22:00",
      available_tables: 4,
      reserved_tables: 0,
      max_party_size: 4,
      offer_image: "/assets/restaurant-hero.png",
      seat_count: 16,
      reserved_seats: 0,
      discount_percent: 30,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];

  demo.reservations = [
    {
      id: demoBookingId,
      reference: "BK-1042",
      offer_id: offerId,
      restaurant_id: restaurantId,
      guest_id: guestId,
      guest_name: "Emma Carter",
      guest_email: "emma.carter@example.com",
      guest_phone: "+1 212 555 1042",
      party_size: 2,
      reservation_date: today,
      reservation_time: "19:00",
      guest_language: "en",
      notes: "Demo completed post-visit booking.",
      partner_notes: "Completed visit, feedback requested.",
      status: "completed",
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: demoFeedbackBookingId,
      reference: "BK-1043",
      offer_id: offerId,
      restaurant_id: restaurantId,
      guest_id: guestId,
      guest_name: "Nora Feedback",
      guest_email: "nora.feedback@example.com",
      guest_phone: "+1 212 555 1043",
      party_size: 2,
      reservation_date: yesterday,
      reservation_time: "18:00",
      guest_language: "hu",
      notes: "Eligible completed booking for post-visit email checks.",
      partner_notes: "Completed visit, no feedback submitted yet.",
      status: "completed",
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];

  demo.consumptionUploads = [
    {
      id: "40000000-0000-4000-8000-000000001042",
      profile_key: aiProfileKey("emma.carter@example.com"),
      guest_id: guestId,
      guest_name: "Emma Carter",
      guest_email: "emma.carter@example.com",
      restaurant_id: restaurantId,
      reservation_id: demoBookingId,
      image_url: "/assets/restaurant-hero.png",
      uploaded_file_name: "hudson-hearth-pasta.jpg",
      media_type: "food",
      description: "Handmade pasta with a glass of wine.",
      rating: 4.8,
      overall_rating: 5,
      food_rating: 5,
      service_rating: 4,
      ambience_rating: 5,
      short_review: "Warm room, excellent pasta, and a very smooth reservation.",
      liked_highlight: "The pasta texture and attentive service.",
      ordered_items: "Handmade pasta, wine by the glass, chocolate dessert",
      would_recommend: "yes",
      would_return: "yes",
      tags: ["food", "value", "date night"],
      loyalty_points_awarded: 160,
      moderation_status: "approved",
      analysis_status: "placeholder_ready_for_ai_image_recognition",
      ai_labels: ["pasta", "wine", "dessert"],
      food_type: "pasta",
      drink_type: "wine",
      cuisine: "New American",
      detected_dish: "pasta",
      detected_drink: "wine",
      cuisine_category: "New American",
      ingredients: ["pasta", "sauce", "herbs", "grapes"],
      flavor_profile: ["savory", "balanced"],
      presentation_score: 92,
      price_perception: "good_value",
      popularity_signal: 88,
      anonymized_metadata: {
        provider: "demo_seed",
        image_recognition_status: "placeholder_ready_for_ai_image_recognition",
        no_personal_data_shared_with_restaurants: true
      },
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];

  demo.restaurantReviews = [
    {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      guest_name: "Avery Stone",
      guest_email: "avery@example.com",
      food_rating: 5,
      service_rating: 4,
      ambience_rating: 5,
      comment: "Beautiful room and a very good early dinner deal.",
      status: "approved",
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      guest_name: "Demo Guest",
      guest_email: "demo-review@example.com",
      food_rating: 4,
      service_rating: 5,
      ambience_rating: 4,
      comment: "Helpful service and easy reservation flow.",
      status: "pending",
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];

  demo.siteContent = mergeContentRows(defaultSiteContent);
  demo.featureStatus = featureStatusRows();
  demo.featureFlags = featureStatusRows().map((item) => ({
    key: item.key,
    label: item.label,
    status: item.status,
    enabled: !["coming_soon"].includes(item.status),
    audience: item.key.includes("marketplace") ? "admins" : "all",
    description: item.description,
    owner: item.key.includes("ai") ? "ai" : item.key.includes("billing") ? "billing" : "operations",
    updated_at: nowIso()
  }));
  demo.billingPlans = [
    {
      id: "90000000-0000-4000-8000-000000000001",
      key: "free",
      name: "Free",
      monthly_price: 0,
      per_booking_fee: 0,
      stripe_price_id: null,
      features: { offers: 3, ai_recommendations: "demo" },
      status: "active"
    },
    {
      id: "90000000-0000-4000-8000-000000000002",
      key: "growth_monthly",
      name: "Growth Monthly",
      monthly_price: 199,
      per_booking_fee: 0,
      stripe_price_id: "requires_stripe_price",
      features: { offers: "unlimited", ai_recommendations: "approval_flow", email_campaigns: true },
      status: "active"
    },
    {
      id: "90000000-0000-4000-8000-000000000003",
      key: "per_booking",
      name: "Per Booking",
      monthly_price: 0,
      per_booking_fee: 2.5,
      stripe_price_id: "requires_stripe_price",
      features: { offers: "unlimited", ai_recommendations: "approval_flow" },
      status: "active"
    }
  ];
  demo.subscriptions = [
    {
      id: "91000000-0000-4000-8000-000000000001",
      restaurant_id: restaurantId,
      billing_plan_id: demo.billingPlans[1].id,
      status: "active",
      stripe_customer_id: "requires_stripe_customer",
      stripe_subscription_id: "requires_stripe_subscription",
      current_period_start: today,
      current_period_end: tomorrowIsoDate(),
      cancel_at_period_end: false,
      created_at: nowIso()
    }
  ];
  demo.invoices = [
    {
      id: "92000000-0000-4000-8000-000000000001",
      restaurant_id: restaurantId,
      subscription_id: demo.subscriptions[0].id,
      amount_due: 199,
      amount_paid: 199,
      currency: "usd",
      status: "paid",
      hosted_invoice_url: "Requires Stripe invoice URL",
      created_at: nowIso()
    }
  ];
  demo.integrationConnections = reservationProviderCatalog.map((provider, index) => ({
    id: `93000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    provider: provider.provider,
    display_name: provider.display_name,
    category: provider.category,
    restaurant_id: ["weather_api", "local_events_api"].includes(provider.provider) ? null : restaurantId,
    status: "not_connected",
    sync_status: "requires_provider_api_access",
    last_sync_at: null,
    imported_summary: { reservations: 0, guests: 0, availability: 0 },
    labels: provider.labels,
    capabilities: provider.capabilities,
    error_message: provider.status === "requires_integration" ? provider.labels?.[0] || "Requires integration" : "",
    created_at: nowIso(),
    updated_at: nowIso()
  }));
  demo.integrationSyncRuns = [{
    id: crypto.randomUUID(),
    provider: "csv_import",
    restaurant_id: restaurantId,
    sync_type: "reservations",
    status: "completed",
    imported_reservations: 1,
    imported_guests: 1,
    imported_availability: 0,
    summary: { source: "demo_csv", note: "Manual import fallback is available before live provider APIs." },
    started_at: nowIso(),
    completed_at: nowIso(),
    created_at: nowIso()
  }];
  demo.integrationErrorLogs = [{
    id: crypto.randomUUID(),
    provider: "opentable",
    restaurant_id: restaurantId,
    severity: "warning",
    error_code: "PROVIDER_ACCESS_REQUIRED",
    message: "OpenTable sync is prepared but not live. Requires provider API access, restaurant authorization, and approved integration partnership.",
    details: { labels: ["Requires provider API access", "Requires restaurant authorization", "Requires approved integration partnership"] },
    created_at: nowIso()
  }];
  demo.importedReservations = [];
  demo.importedGuests = [];
  demo.dataImportJobs = [];
  demo.manualPerformanceUploads = [];
  demo.privacyRequests = [];
  demo.guestConsents = [
    {
      id: crypto.randomUUID(),
      guest_id: demo.guests[0]?.id,
      guest_email: "guest@smarttable.com",
      user_id: guestId,
      consent_type: "terms",
      status: "granted",
      terms_accepted: true,
      terms_version: TERMS_VERSION,
      terms_accepted_at: nowIso(),
      language: "hu",
      source: "demo_seed",
      created_at: nowIso()
    },
    {
      id: crypto.randomUUID(),
      guest_id: demo.guests[0]?.id,
      guest_email: "guest@smarttable.com",
      user_id: guestId,
      consent_type: "privacy",
      status: "granted",
      privacy_accepted: true,
      privacy_version: PRIVACY_POLICY_VERSION,
      privacy_accepted_at: nowIso(),
      language: "hu",
      source: "demo_seed",
      created_at: nowIso()
    }
  ];
  demo.appErrorLogs = [{
    id: crypto.randomUUID(),
    area: "monitoring",
    severity: "info",
    message: "Local demo monitoring is active. Production logs require Supabase service-role writes.",
    details: { mode: "demo" },
    created_at: nowIso()
  }];
  demo.adminAlerts = [{
    id: crypto.randomUUID(),
    alert_type: "integration_status",
    severity: "warning",
    title: "Reservation integrations require provider access",
    message: "OpenTable and Resy are not live until API access, restaurant authorization, and approved partnerships are in place.",
    entity_type: "integration",
    entity_id: null,
    read_at: null,
    created_at: nowIso()
  }];
  demo.aiRecommendations = [];
  demo.aiActions = [];
  demo.aiActionResults = [];
  demo.marketingCampaigns = [];
  demo.emailLogs = [];
  demo.notificationLogs = [];
  demo.photoRewardSubmissions = demo.consumptionUploads;
  demo.loyaltyAccounts = [{
    id: "50000000-0000-4000-8000-000000001042",
    profile_key: aiProfileKey("emma.carter@example.com"),
    user_id: guestId,
    points_balance: 160,
    lifetime_points: 160,
    completed_reviews: 1,
    uploaded_photos: 1,
    last_reward_date: nowIso(),
    tier: "member",
    created_at: nowIso(),
    updated_at: nowIso()
  }];
}

function tokenForProfile(profile) {
  return `demo.${Buffer.from(JSON.stringify({
    id: profile.id,
    role: normalizeRole(profile.role),
    restaurant_id: profile.restaurant_id,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })).toString("base64url")}`;
}

function profileFromDemoToken(token) {
  if (!token?.startsWith("demo.")) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.slice(5), "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    ensureDemo();
    const profile = demo.profiles.find((item) => item.id === payload.id);
    if (!profile || profile.status === "deleted" || profile.deleted_at) return null;
    return clientProfile(profile);
  } catch {
    return null;
  }
}

function signedProfileToken(profile, kind = "impersonate", extra = {}) {
  const payload = {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: normalizeRole(profile.role),
    restaurant_id: profile.restaurant_id,
    exp: Date.now() + 1000 * 60 * 60 * 2,
    ...extra
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", IMPERSONATION_SECRET).update(`${kind}.${encoded}`).digest("base64url");
  return `${kind}.${encoded}.${signature}`;
}

function profileFromSignedToken(token, kind = "impersonate") {
  if (!token?.startsWith(`${kind}.`)) return null;
  try {
    const [, encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    const expected = crypto.createHmac("sha256", IMPERSONATION_SECRET).update(`${kind}.${encoded}`).digest("base64url");
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    return clientProfile(payload);
  } catch {
    return null;
  }
}

function authToken(headers = {}) {
  const value = headers.authorization || headers.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function supabaseFetch(path, options = {}) {
  if (!supabaseConfigured) throw new Error("Supabase is not configured.");

  const service = options.service !== false;
  const key = service ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const token = options.token || key;
  const timeoutMs = Math.max(500, Number(options.timeoutMs || SUPABASE_REQUEST_TIMEOUT_MS));
  const controller = options.signal ? null : new AbortController();
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        apikey: key,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(options.headers || {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal || controller?.signal
    });
  } catch (error) {
    const timeoutError = new Error(error.name === "AbortError" ? "Upstream request timed out." : "Upstream service is unavailable.");
    timeoutError.status = error.name === "AbortError" ? 504 : 502;
    timeoutError.code = error.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE";
    throw timeoutError;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error_description || payload?.error || raw || "Supabase request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.detail = payload;
    throw error;
  }

  return payload;
}

async function getSupabaseProfile(token) {
  const user = await supabaseFetch("/auth/v1/user", { service: false, token });
  const encodedId = encodeURIComponent(user.id);
  const rows = await supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${encodedId}`, { service: true });
  return clientProfile({
    ...(rows?.[0] || {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email,
    role: "guest",
    restaurant_id: null
    }),
    email_verified: Boolean(user.email_confirmed_at)
  });
}

async function requireProfile(headers, roles = []) {
  const token = authToken(headers);
  if (!token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  const isImpersonationToken = token.startsWith("impersonate.");
  const localProfile = isImpersonationToken
    ? profileFromSignedToken(token, "impersonate")
    : (!supabaseConfigured ? profileFromDemoToken(token) : null);
  const profile = localProfile || (!isImpersonationToken && supabaseConfigured ? await getSupabaseProfile(token) : null);
  if (!profile) {
    const error = new Error("Invalid or expired session.");
    error.status = 401;
    throw error;
  }

  if (roles.length && !roleMatches(profile.role, roles)) {
    const error = new Error("You do not have access to this resource.");
    error.status = 403;
    throw error;
  }

  return { profile, token };
}

function availableTables(offer) {
  return availableTablesForOffer(offer);
}

function offerCapacity(offer) {
  return availableSeatsForOffer(offer);
}

function offerWithRestaurantContext(offer = {}, restaurant = null) {
  const linkedRestaurant = restaurant || offer.restaurant || offer.restaurants || null;
  return {
    ...offer,
    restaurant: linkedRestaurant,
    restaurants: offer.restaurants || linkedRestaurant,
    primary_timezone: offer.primary_timezone
      || offer.timezone
      || linkedRestaurant?.primary_timezone
      || linkedRestaurant?.timezone
  };
}

function offerErrorHttpStatus(validity = {}) {
  return validity.code === "OFFER_NOT_FOUND" ? 404 : 409;
}

function offerValidityErrorResponse(validity = {}) {
  return json(offerErrorHttpStatus(validity), offerReservationError(validity) || {
    code: "OFFER_UNAVAILABLE",
    error: "This offer is not available.",
    offer_status: "unavailable"
  });
}

function reservationRpcErrorResponse(error) {
  const raw = clean(error?.message || error?.detail?.message || error?.detail?.details || "");
  const upper = raw.toUpperCase();
  const knownCodes = [
    "OFFER_EXPIRED",
    "OFFER_NOT_STARTED",
    "BOOKING_CUTOFF_PASSED",
    "OFFER_SOLD_OUT",
    "OFFER_INACTIVE",
    "OFFER_NOT_FOUND",
    "INVALID_OFFER_TIME",
    "OFFER_DATE_MISMATCH",
    "OFFER_UNAVAILABLE"
  ];
  const code = knownCodes.find((item) => upper.includes(item))
    || (/expired/i.test(raw) ? "OFFER_EXPIRED" : "")
    || (/closed|cutoff/i.test(raw) ? "BOOKING_CUTOFF_PASSED" : "")
    || (/sold|capacity|party/i.test(raw) ? "OFFER_SOLD_OUT" : "")
    || (/outside|time/i.test(raw) ? "INVALID_OFFER_TIME" : "")
    || (/date/i.test(raw) ? "OFFER_DATE_MISMATCH" : "")
    || "OFFER_UNAVAILABLE";
  return json(code === "OFFER_NOT_FOUND" ? 404 : 409, {
    code,
    error: OFFER_ERROR_MESSAGES[code] || OFFER_ERROR_MESSAGES.OFFER_UNAVAILABLE,
    offer_status: code === "OFFER_EXPIRED" ? "expired" : "unavailable"
  });
}

function logOfferValidityRejection(validity = {}, offer = {}, context = {}) {
  if (!validity.code) return;
  console.warn("[offer-validity]", {
    mode: context.mode || (supabaseConfigured ? "supabase" : "demo"),
    offer_id: offer.id || offer.offer_id || context.offer_id || "",
    restaurant_id: offer.restaurant_id || offer.restaurant?.id || offer.restaurants?.id || context.restaurant_id || "",
    server_current_utc_time: validity.now_utc,
    restaurant_timezone: validity.timezone,
    server_current_restaurant_local_time: validity.now_restaurant_local,
    offer_date: validity.offer_date,
    offer_start_datetime_utc: validity.offer_start_at_utc,
    offer_end_datetime_utc: validity.offer_end_at_utc,
    booking_cutoff_datetime_utc: validity.booking_cutoff_at_utc || null,
    calculated_status: validity.status,
    final_rejection_reason: validity.code
  });
}

function publicOfferWithAvailability(row = {}, sourceOffer = row) {
  const validity = evaluateOfferValidity(sourceOffer, { partySize: 1 });
  return {
    ...row,
    primary_timezone: validity.timezone,
    offer_status_calculated: validity.status,
    offer_error_code: validity.code || "",
    available_tables: validity.available_tables,
    available_seats: validity.available_seats
  };
}

function hasDuplicateActiveReservation(rows = [], { offerId, guestEmail, reservationDate, reservationTime }) {
  const activeStatuses = new Set(["pending", "accepted", "confirmed", "waiting_external_confirmation"]);
  return rows.some((row) => (
    clean(row.offer_id) === clean(offerId)
    && lower(row.guest_email) === lower(guestEmail)
    && clean(row.reservation_date) === clean(reservationDate)
    && clean(row.reservation_time) === clean(reservationTime)
    && activeStatuses.has(normalizeReservationStatus(row.status || row.booking_status))
  ));
}

function parseReservationFilters(query) {
  const value = (key) => clean(query?.get?.(key) || "");
  const status = normalizeReservationStatus(value("status"));
  return {
    status: status === "all" ? "" : status,
    date: value("date"),
    date_from: value("date_from") || value("from"),
    date_to: value("date_to") || value("to"),
    search: lower(value("search") || value("q")),
    reference: lower(value("reference")),
    restaurant: lower(value("restaurant")),
    guest: lower(value("guest")),
    email: lower(value("email"))
  };
}

function reservationDateValue(row = {}) {
  return clean(row.reservation_date || row.offer_date);
}

function reservationRowMatchesFilters(row = {}, filters = {}) {
  if (!filters || !Object.keys(filters).length) return true;
  const status = normalizeReservationStatus(row.status || row.booking_status);
  if (filters.status && status !== filters.status) return false;
  const date = reservationDateValue(row);
  if (filters.date && date !== filters.date) return false;
  if (filters.date_from && date && date < filters.date_from) return false;
  if (filters.date_to && date && date > filters.date_to) return false;
  const reference = lower(row.reference);
  const restaurant = lower(row.restaurant_name || row.restaurant?.name);
  const guest = lower(row.guest_name);
  const email = lower(row.guest_email);
  if (filters.reference && !reference.includes(filters.reference)) return false;
  if (filters.restaurant && !restaurant.includes(filters.restaurant)) return false;
  if (filters.guest && !guest.includes(filters.guest)) return false;
  if (filters.email && !email.includes(filters.email)) return false;
  if (filters.search) {
    const haystack = [reference, restaurant, guest, email, lower(row.guest_phone)].join(" ");
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

function publicOfferRows(lang = "en") {
  ensureDemo();
  return demo.offers
    .filter((offer) => offer.status === "active" && availableTables(offer) > 0)
    .map((offer) => {
      const restaurant = demo.restaurants.find((item) => item.id === offer.restaurant_id);
      if (!restaurant || restaurant.status !== "approved") return null;
      const sourceOffer = offerWithRestaurantContext(offer, restaurant);
      const validity = evaluateOfferValidity(sourceOffer, { partySize: 1 });
      if (!validity.bookable) return null;
      return publicOfferWithAvailability({
        offer_id: offer.id,
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        district: restaurant.district,
        address: restaurant.address,
        cuisine: restaurant.cuisine_type || restaurant.cuisine,
        cuisine_type: restaurant.cuisine_type || restaurant.cuisine,
        rating: restaurant.rating,
        restaurant_description: localizedField(restaurant, "description", lang),
        description: localizedField(restaurant, "description", lang),
        website: restaurant.website,
        instagram: restaurant.instagram,
        facebook: restaurant.facebook,
        tiktok: restaurant.tiktok,
        google_maps_url: restaurant.google_maps_url,
        google_place_id: restaurant.google_place_id,
        logo_url: restaurant.logo_url,
        hero_image_url: restaurant.hero_image_url,
        menu_pdf_url: restaurant.menu_pdf_url,
        price_range: restaurant.price_range,
        dress_code: restaurant.dress_code,
        outdoor_seating: restaurant.outdoor_seating,
        parking_available: restaurant.parking_available,
        kids_friendly: restaurant.kids_friendly,
        pet_friendly: restaurant.pet_friendly,
        wheelchair_accessible: restaurant.wheelchair_accessible,
        payment_methods: restaurant.payment_methods || [],
        chef_name: restaurant.chef_name,
        year_opened: restaurant.year_opened,
        capacity: restaurant.capacity,
        private_room_available: restaurant.private_room_available,
        opening_hours: restaurant.opening_hours,
        gallery_images: restaurant.gallery_images || [],
        restaurant_type: restaurant.restaurant_type,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        sort_order: restaurant.sort_order,
        restaurant_created_at: restaurant.created_at,
        ai_discount_enabled: restaurant.ai_discount_enabled !== false,
        min_discount_percent: numberOr(restaurant.min_discount_percent, 10),
        max_discount_percent: numberOr(restaurant.max_discount_percent, 30),
        target_margin_percent: numberOr(restaurant.target_margin_percent, 65),
        average_service_minutes: numberOr(restaurant.average_service_minutes, 75),
        ...reviewSummaryForRestaurant(restaurant.id),
        favorites_count: followerStatsForRestaurant(restaurant.id).total,
        card_image: restaurant.card_image || restaurant.hero_image_url || restaurant.cover_image || "/assets/restaurant-hero.png",
        icon_image: restaurant.icon_image || restaurant.logo_url || restaurant.card_image || restaurant.cover_image || "/assets/restaurant-hero.png",
        title: localizedField(offer, "title", lang) || `${offer.discount_value || offer.discount_percent}% off at ${restaurant.name}`,
        offer_title: localizedField(offer, "title", lang),
        offer_description: localizedField(offer, "description", lang),
        offer_date: offer.offer_date,
        reservation_date: offer.offer_date,
        offer_time: offer.start_time || offer.offer_time,
        start_time: offer.start_time || offer.offer_time,
        end_time: offer.end_time,
        valid_days: offer.valid_days || [],
        available_tables: availableTables(offer),
        available_seats: offerCapacity(offer),
        max_party_size: numberOr(offer.max_party_size, 4),
        min_party_size: numberOr(offer.min_party_size, 1),
        offer_image: offer.offer_image || restaurant.card_image || restaurant.cover_image || "/assets/restaurant-hero.png",
        discount_type: offer.discount_type || "percent",
        discount_value: numberOr(offer.discount_value, offer.discount_percent),
        discount_percent: numberOr(offer.discount_percent, offer.discount_value),
        minimum_spend: offer.minimum_spend ?? null,
        applies_to_drinks: offer.applies_to_drinks ?? true,
        time_limit_minutes: offer.time_limit_minutes ?? null,
        blackout_periods: offer.blackout_periods || [],
        combinable: offer.combinable ?? false,
        custom_terms: offer.custom_terms || {},
        structured_conditions: offer.structured_conditions || {
          minimum_spend: offer.minimum_spend ?? null,
          applies_to_drinks: offer.applies_to_drinks ?? true,
          min_party_size: offer.min_party_size ?? 1,
          max_party_size: offer.max_party_size ?? 4,
          time_limit_minutes: offer.time_limit_minutes ?? null,
          blackout_periods: offer.blackout_periods || [],
          combinable: offer.combinable ?? false,
          custom_terms: offer.custom_terms || {}
        },
        created_at: offer.created_at
      }, sourceOffer);
    })
    .filter(Boolean)
    .sort((a, b) => {
      const order = numberOr(a.sort_order, 999999) - numberOr(b.sort_order, 999999);
      if (order) return order;
      const name = a.restaurant_name.localeCompare(b.restaurant_name);
      if (name) return name;
      return `${a.offer_date || ""}${a.start_time || ""}`.localeCompare(`${b.offer_date || ""}${b.start_time || ""}`);
    });
}

function sanitizePublicOfferRow(row = {}) {
  const blocked = new Set([
    "restaurant_email",
    "contact_email",
    "owner_user_id",
    "partner_notes",
    "admin_notes",
    "role",
    "permissions",
    "service_role",
    "secret",
    "token",
    "api_key"
  ]);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !blocked.has(key)));
}

function average(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  if (!numeric.length) return null;
  return Math.round((numeric.reduce((sum, value) => sum + value, 0) / numeric.length) * 10) / 10;
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function featureStatusRows() {
  return [
    {
      key: "restaurant_onboarding",
      label: "Restaurant onboarding",
      status: supabaseConfigured ? "beta" : "demo_only",
      description: "Restaurant account creation, profile editing, image upload signing, location, hours, capacity, weak hours, and discount rules are supported or scaffolded.",
      data_source: "restaurants, restaurant_users"
    },
    {
      key: "guest_booking_leads",
      label: "Guest reservation leads",
      status: "live",
      description: "Guests can request reservations/leads, restaurants can accept, reject, cancel, complete, or mark no-show.",
      data_source: "offers, reservations"
    },
    {
      key: "transactional_email",
      label: "Transactional email",
      status: emailService.configured ? "live" : "requires_integration",
      description: emailService.configured ? "Resend is configured for outbound transactional email." : "Configure RESEND_API_KEY and a verified EMAIL_FROM sender to send production email.",
      data_source: "email_events, email_logs"
    },
    {
      key: "ai_demand_recommendations",
      label: "AI demand recommendations",
      status: supabaseConfigured ? "beta" : "demo_only",
      description: "Rules-v1 uses stored restaurant, offer, reservation, view, follower, and feedback data. Weather, local events, and reservation imports increase confidence when connected.",
      data_source: "ai_recommendations, demand_snapshots"
    },
    {
      key: "ai_action_approval",
      label: "AI action approval",
      status: supabaseConfigured ? "beta" : "demo_only",
      description: "AI recommends first. Restaurants approve before offers or campaigns are created.",
      data_source: "ai_actions, ai_action_results"
    },
    {
      key: "reservation_integrations",
      label: "Reservation integrations",
      status: "requires_integration",
      description: "Resy, OpenTable, SevenRooms, Tock, Google Reserve, and approved restaurant reservation APIs are prepared; provider OAuth/API sync must be connected.",
      data_source: "integrations, integration_connections, imported_reservations"
    },
    {
      key: "integration_hub",
      label: "Integration Hub",
      status: "beta",
      description: "Provider catalog, connection status, sync logs, CSV/manual import, and error logs are available. Live sync still requires official provider access.",
      data_source: "integrations, integration_connections, integration_sync_runs, integration_error_logs"
    },
    {
      key: "csv_reservation_import",
      label: "CSV reservation import",
      status: supabaseConfigured ? "beta" : "demo_only",
      description: "Restaurants can import reservation exports into SmartTable's unified reservation format before OpenTable/Resy APIs are available.",
      data_source: "data_import_jobs, imported_reservations"
    },
    {
      key: "manual_data_import",
      label: "Manual data import",
      status: supabaseConfigured ? "beta" : "demo_only",
      description: "Weekly performance and reservation summary uploads can feed AI demand scoring while direct integrations are pending.",
      data_source: "manual_performance_uploads, demand_snapshots"
    },
    {
      key: "privacy_compliance",
      label: "Privacy and compliance controls",
      status: "beta",
      description: "Consent, unsubscribe, privacy request, legal document, anonymized analytics, and audit-log structures are prepared.",
      data_source: "guest_consents, email_unsubscribes, privacy_requests, legal_documents, audit_logs"
    },
    {
      key: "billing_foundation",
      label: "Billing foundation",
      status: "beta",
      description: "Stripe-ready plan, subscription, invoice, and payment-event tables are prepared. Online guest payments are not required for MVP.",
      data_source: "billing_plans, subscriptions, invoices, payment_events"
    },
    {
      key: "monitoring_error_logs",
      label: "Monitoring and error logs",
      status: "beta",
      description: "App, integration, email, AI generation, AI action, billing, and admin alert logs are available for production monitoring.",
      data_source: "app_error_logs, integration_error_logs, email_logs, ai_actions, admin_alerts"
    },
    {
      key: "ai_marketing_generator",
      label: "AI marketing generator",
      status: supabaseConfigured ? "beta" : "demo_only",
      description: "Campaign copy can be generated and queued from approved AI actions. Live sending requires transactional/marketing email configuration and consent.",
      data_source: "marketing_campaigns, restaurant_followers, email_logs"
    },
    {
      key: "vip_detection",
      label: "VIP detection",
      status: "requires_more_data",
      description: "Requires consented repeat-guest identity, booking frequency, feedback, favorites, and retention signals.",
      data_source: "guest profiles, imported guests, reservation history"
    },
    {
      key: "guest_lifetime_value",
      label: "Guest lifetime value intelligence",
      status: "requires_more_data",
      description: "Requires enough consented guest history, repeat visits, favorites, reservations, and feedback data.",
      data_source: "guests, imported_guests, reservations, feedback"
    },
    {
      key: "competitor_tracker",
      label: "Competitor tracker",
      status: "requires_integration",
      description: "Requires approved reservation-platform availability signals, SmartTable market activity, and external factor feeds before live competitor claims are reliable.",
      data_source: "future reservation-platform availability, SmartTable search, weather, traffic, and local event feeds"
    },
    {
      key: "real_time_pricing_engine",
      label: "Real-time pricing engine",
      status: "coming_soon",
      description: "Requires enough conversion history and guardrails. Current AI recommendations remain approval-based.",
      data_source: "ai_recommendations, offer conversions, future reservation integrations"
    },
    {
      key: "staff_planning",
      label: "Staff planning",
      status: "coming_soon",
      description: "Requires live reservations, labor rules, service duration, and staffing schedules before it becomes operational.",
      data_source: "future labor scheduling and reservation integrations"
    },
    {
      key: "marketplace_intelligence",
      label: "Marketplace intelligence",
      status: "requires_more_data",
      description: "Market-level trends require higher event, search, upload, feedback, and booking volume before they should be shown as live insights.",
      data_source: "analytics_events, dining_consumption_uploads"
    }
  ];
}

function featureStatusFor(key, fallback = "beta") {
  return featureStatusRows().find((item) => item.key === key)?.status || fallback;
}

function reviewSummaryForRestaurant(restaurantId) {
  ensureDemo();
  const approved = demo.restaurantReviews.filter((review) => review.restaurant_id === restaurantId && review.status === "approved");
  const food = average(approved.map((review) => review.food_rating));
  const service = average(approved.map((review) => review.service_rating));
  const ambience = average(approved.map((review) => review.ambience_rating));
  const overall = average([food, service, ambience].filter((value) => value !== null));
  return {
    food_rating_avg: food,
    service_rating_avg: service,
    ambience_rating_avg: ambience,
    overall_rating_avg: overall,
    review_count: approved.length
  };
}

function followerStatsForRestaurant(restaurantId) {
  ensureDemo();
  const now = new Date();
  const weekStart = dateStartOfWeek(now);
  const monthStart = dateStartOfMonth(now);
  const rows = demo.restaurantFollowers.filter((item) => item.restaurant_id === restaurantId && item.notification_enabled !== false);
  return {
    total: rows.length,
    this_week: rows.filter((item) => new Date(item.created_at) >= weekStart).length,
    this_month: rows.filter((item) => new Date(item.created_at) >= monthStart).length
  };
}

function publicRestaurantCard(restaurant, lang = "en") {
  const offers = demo.offers.filter((offer) => offer.restaurant_id === restaurant.id && offer.status === "active" && availableTables(offer) > 0);
  const firstOffer = offers.sort((a, b) => `${a.offer_date || ""}${a.start_time || ""}`.localeCompare(`${b.offer_date || ""}${b.start_time || ""}`))[0] || null;
  return {
    restaurant_id: restaurant.id,
    restaurant_name: restaurant.name,
    district: restaurant.district,
    address: restaurant.address,
    cuisine: restaurant.cuisine_type || restaurant.cuisine,
    cuisine_type: restaurant.cuisine_type || restaurant.cuisine,
    rating: restaurant.rating,
    restaurant_description: localizedField(restaurant, "description", lang),
    website: restaurant.website,
    instagram: restaurant.instagram,
    facebook: restaurant.facebook,
    tiktok: restaurant.tiktok,
    google_maps_url: restaurant.google_maps_url,
    google_place_id: restaurant.google_place_id,
    logo_url: restaurant.logo_url,
    hero_image_url: restaurant.hero_image_url,
    menu_pdf_url: restaurant.menu_pdf_url,
    price_range: restaurant.price_range,
    dress_code: restaurant.dress_code,
    outdoor_seating: restaurant.outdoor_seating,
    parking_available: restaurant.parking_available,
    kids_friendly: restaurant.kids_friendly,
    pet_friendly: restaurant.pet_friendly,
    wheelchair_accessible: restaurant.wheelchair_accessible,
    payment_methods: restaurant.payment_methods || [],
    chef_name: restaurant.chef_name,
    year_opened: restaurant.year_opened,
    capacity: restaurant.capacity,
    private_room_available: restaurant.private_room_available,
    opening_hours: restaurant.opening_hours,
    gallery_images: restaurant.gallery_images || [],
    restaurant_type: restaurant.restaurant_type,
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
    sort_order: restaurant.sort_order,
    restaurant_created_at: restaurant.created_at,
    card_image: restaurant.card_image || restaurant.hero_image_url || restaurant.cover_image || "/assets/restaurant-hero.png",
    icon_image: restaurant.icon_image || restaurant.logo_url || restaurant.card_image || restaurant.cover_image || "/assets/restaurant-hero.png",
    offer_count: offers.length,
    first_offer_id: firstOffer?.id || null,
    highest_discount: offers.length ? Math.max(...offers.map((offer) => numberOr(offer.discount_value, offer.discount_percent || 0))) : 0,
    ai_discount_enabled: restaurant.ai_discount_enabled !== false,
    min_discount_percent: numberOr(restaurant.min_discount_percent, 10),
    max_discount_percent: numberOr(restaurant.max_discount_percent, offers.length ? Math.max(...offers.map((offer) => numberOr(offer.discount_value, offer.discount_percent || 0))) : 0),
    target_margin_percent: numberOr(restaurant.target_margin_percent, 65),
    average_service_minutes: numberOr(restaurant.average_service_minutes, 75),
    ...reviewSummaryForRestaurant(restaurant.id),
    favorites_count: followerStatsForRestaurant(restaurant.id).total
  };
}

const preferenceFields = [
  "cuisines",
  "food_categories",
  "food_interests",
  "drink_preferences",
  "atmospheres",
  "dining_experiences",
  "companions",
  "dietary_needs",
  "notification_channels",
  "preferred_neighborhoods",
  "preferred_times",
  "preferred_time_windows",
  "preferred_days",
  "dietary_restrictions",
  "favorite_restaurants",
  "occasions"
];

function normalizeAiPreferences(body = {}) {
  const preferences = {};
  for (const field of preferenceFields) preferences[field] = arrayFrom(body[field]);
  const boolPref = (field) => {
    const value = Array.isArray(body[field]) ? body[field].at(-1) : body[field];
    return value === true || value === "true" || value === "on" || value === 1 || value === "1";
  };
  preferences.budget_per_person = Math.max(0, numberOr(body.budget_per_person, 0));
  preferences.travel_distance_miles = Math.max(0, numberOr(body.travel_distance_miles, 0));
  preferences.walking_distance_tolerance = Math.max(0, numberOr(body.walking_distance_tolerance, body.walking_distance_miles || 0));
  preferences.preferred_party_size = Math.max(1, Math.trunc(numberOr(body.preferred_party_size, 2)));
  preferences.preferred_discount_range = clean(body.preferred_discount_range || "10-15");
  preferences.parking_required = boolPref("parking_required");
  preferences.subway_preferred = boolPref("subway_preferred");
  preferences.kids_friendly = boolPref("kids_friendly");
  preferences.outdoor_seating = boolPref("outdoor_seating");
  preferences.calendar_opt_in = boolPref("calendar_opt_in");
  preferences.notes = clean(body.notes);
  return preferences;
}

function aiProfileKey(value) {
  const key = clean(value);
  return key || `guest-${crypto.randomUUID()}`;
}

function discountRangeValue(range) {
  const values = clean(range).match(/\d+/g)?.map(Number).filter(Number.isFinite) || [];
  if (!values.length) return { min: 10, max: 15 };
  if (values.length === 1) return { min: values[0], max: values[0] };
  return { min: Math.min(values[0], values[1]), max: Math.max(values[0], values[1]) };
}

function minimumInterestingDiscountFromLevels(levels = []) {
  const values = arrayFrom(levels)
    .map((level) => Number(clean(level).match(/\d+/)?.[0]))
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : null;
}

function guestConsentRows(payload, guestId = null, userId = null) {
  const acceptedAt = payload.preferences.consents.accepted_at || nowIso();
  const marketingAcceptedAt = payload.preferences.consents.marketing_accepted_at || null;
  const base = {
    guest_id: guestId,
    guest_email: payload.email,
    source: "guest_signup",
    user_id: userId,
    language: payload.preferredLanguage
  };
  return [
    {
      ...base,
      consent_type: "terms_conditions",
      status: "granted",
      terms_accepted: true,
      terms_version: TERMS_VERSION,
      terms_accepted_at: acceptedAt,
      accepted_at: acceptedAt
    },
    {
      ...base,
      consent_type: "privacy_policy",
      status: "granted",
      privacy_accepted: true,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      privacy_accepted_at: acceptedAt,
      accepted_at: acceptedAt
    },
    {
      ...base,
      consent_type: "marketing",
      status: payload.preferences.consents.marketing ? "granted" : "revoked",
      marketing_consent: payload.preferences.consents.marketing,
      marketing_consent_timestamp: marketingAcceptedAt,
      accepted_at: marketingAcceptedAt,
      revoked_at: payload.preferences.consents.marketing ? null : acceptedAt
    }
  ];
}

function guestSignupProfileFields(payload) {
  return {
    first_name: payload.firstName,
    last_name: payload.lastName,
    city: payload.preferences.location.city,
    region: payload.preferences.location.region,
    postal_code: payload.preferences.location.postal_code,
    preferred_dining_areas: payload.preferences.preferred_neighborhoods,
    max_travel_distance_miles: payload.preferences.location.max_travel_distance_miles,
    transportation_method: payload.preferences.location.transportation_method,
    selected_language: payload.preferredLanguage
  };
}

function guestPreferenceColumns(preferences = {}) {
  return {
    cuisine_preferences: arrayFrom(preferences.cuisines),
    food_preferences: arrayFrom(preferences.food_categories),
    drink_preferences: arrayFrom(preferences.drink_preferences),
    dietary_needs: arrayFrom(preferences.dietary_needs),
    allergy_notes: clean(preferences.allergy_notes),
    atmosphere_preferences: arrayFrom(preferences.atmospheres),
    dining_occasions: arrayFrom(preferences.dining_experiences),
    dining_companions: arrayFrom(preferences.companions),
    typical_party_size: clean(preferences.party_size),
    preferred_days: arrayFrom(preferences.preferred_days),
    preferred_times: arrayFrom(preferences.preferred_time_windows),
    booking_lead_time: clean(preferences.booking_lead_time),
    preferred_dining_duration: clean(preferences.dining_duration),
    spending_range: clean(preferences.spending_range),
    selected_discount_levels: arrayFrom(preferences.discount_levels),
    minimum_interesting_discount: preferences.minimumInterestingDiscount,
    willingness_without_discount: clean(preferences.consider_no_discount_match),
    discovery_preference: clean(preferences.discovery_preference),
    selection_priorities: arrayFrom(preferences.selection_priorities),
    favorite_restaurants: arrayFrom(preferences.favorite_restaurants),
    excluded_categories: arrayFrom(preferences.excluded_categories),
    new_restaurant_interest: clean(preferences.new_restaurant_recommendations),
    new_menu_item_interest: clean(preferences.new_menu_item_recommendations),
    notification_preferences: arrayFrom(preferences.notification_preferences),
    notification_frequency: clean(preferences.notification_frequency),
    event_recommendation_interest: clean(preferences.event_recommendations_interest),
    future_calendar_interest: clean(preferences.future_calendar_interest)
  };
}

function sanitizeSignupAnalyticsProperties(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const output = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!allowedSignupAnalyticsProperties.has(key)) continue;
    if (typeof raw === "boolean") output[key] = raw;
    else if (typeof raw === "number") output[key] = Number.isFinite(raw) ? raw : 0;
    else output[key] = clean(raw).slice(0, 80);
  }
  return output;
}

async function analyticsEvent(method, body) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const eventType = clean(body.event_type || body.eventType);
  if (!allowedSignupAnalyticsEvents.has(eventType)) return json(400, { error: "Unsupported analytics event." });
  const properties = sanitizeSignupAnalyticsProperties(body.metadata || body.properties || {});
  const row = {
    id: crypto.randomUUID(),
    event_type: eventType,
    profile_key: aiProfileKey(body.profile_key),
    entity_type: eventType.startsWith("signup_") || ["preference_selected", "terms_accepted", "privacy_accepted", "restaurant_followed_during_signup"].includes(eventType)
      ? "guest_signup"
      : "guest_account",
    entity_id: null,
    properties,
    created_at: nowIso()
  };

  if (!supabaseConfigured) {
    ensureDemo();
    demo.analyticsEvents.unshift(row);
    return json(201, { mode: "demo", event: row });
  }

  const rows = await supabaseFetch("/rest/v1/analytics_events?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: (({ id, ...payload }) => payload)(row)
  });
  return json(201, { mode: "supabase", event: rows?.[0] });
}

function normalizeGuestPreferencePatch(existing = {}, body = {}, preferredLanguage = "en") {
  const merged = { ...(existing || {}) };
  const arrayFields = [
    "cuisines", "food_categories", "drink_preferences", "dietary_needs", "atmospheres", "dining_experiences",
    "companions", "preferred_days", "preferred_time_windows", "discount_levels", "selection_priorities",
    "favorite_restaurants", "excluded_categories", "notification_preferences", "preferred_neighborhoods"
  ];
  const textFields = [
    "allergy_notes", "party_size", "booking_lead_time", "dining_duration", "spending_range",
    "consider_no_discount_match", "discovery_preference", "new_restaurant_recommendations",
    "new_menu_item_recommendations", "notification_frequency", "event_recommendations_interest",
    "future_calendar_interest"
  ];
  for (const field of arrayFields) {
    if (body[field] !== undefined) merged[field] = arrayFrom(body[field]);
  }
  for (const field of textFields) {
    if (body[field] !== undefined) merged[field] = clean(body[field]);
  }
  if (body.location && typeof body.location === "object") merged.location = { ...(merged.location || {}), ...body.location };
  if (body.marketing_consent !== undefined) {
    const marketing = boolValue(body.marketing_consent);
    merged.consents = {
      ...(merged.consents || {}),
      marketing,
      marketing_accepted_at: marketing ? nowIso() : null,
      language: normalizeLanguage(body.preferred_language || preferredLanguage)
    };
  }
  merged.minimumInterestingDiscount = minimumInterestingDiscountFromLevels(merged.discount_levels);
  merged.minimum_interesting_discount = merged.minimumInterestingDiscount;
  return merged;
}

function validateGuestPreferenceProfile(preferences = {}) {
  const requiredArrays = [
    "cuisines",
    "food_categories",
    "drink_preferences",
    "dietary_needs",
    "dining_experiences",
    "companions",
    "preferred_days",
    "preferred_time_windows",
    "discount_levels",
    "selection_priorities",
    "excluded_categories"
  ];
  const requiredText = [
    "party_size",
    "booking_lead_time",
    "dining_duration",
    "spending_range",
    "consider_no_discount_match",
    "discovery_preference",
    "new_restaurant_recommendations",
    "new_menu_item_recommendations",
    "event_recommendations_interest",
    "future_calendar_interest"
  ];
  for (const field of requiredArrays) {
    if (!arrayFrom(preferences[field]).length) return `${field} is required.`;
  }
  for (const field of requiredText) {
    if (!clean(preferences[field])) return `${field} is required.`;
  }
  return "";
}

function textBag(...values) {
  return values.flat().map((value) => clean(value).toLowerCase()).filter(Boolean).join(" ");
}

function includesAny(haystack, needles = []) {
  const text = clean(haystack).toLowerCase();
  return needles.some((needle) => text.includes(clean(needle).toLowerCase()));
}

function smartDiscountForRestaurant(restaurant, preferences = {}, score = 0) {
  if (restaurant.ai_discount_enabled === false) return 0;
  const range = discountRangeValue(preferences.preferred_discount_range);
  const minAllowed = Math.max(0, numberOr(restaurant.min_discount_percent, 10));
  const maxAllowed = Math.max(minAllowed, numberOr(restaurant.max_discount_percent, restaurant.highest_discount || 0));
  if (!maxAllowed) return 0;

  let target = Math.max(minAllowed, range.min || minAllowed);
  if (score < 55) target += 10;
  else if (score < 72) target += 5;
  if (restaurant.offer_count < 1) target = Math.min(target, minAllowed);
  return Math.min(maxAllowed, Math.max(minAllowed, Math.round(target / 5) * 5));
}

function scoreRestaurantForPreferences(restaurant, preferences = {}) {
  let score = 30;
  const reasons = [];
  const cuisineText = textBag(restaurant.cuisine, restaurant.cuisine_type);
  const descriptiveText = textBag(restaurant.restaurant_description, restaurant.description, restaurant.restaurant_name, restaurant.district, restaurant.address);

  if (includesAny(cuisineText, preferences.cuisines)) {
    score += 18;
    reasons.push("Cuisine match");
  }
  if (includesAny(descriptiveText, preferences.food_interests)) {
    score += 14;
    reasons.push("Food interest match");
  }
  if (includesAny(descriptiveText, preferences.atmospheres)) {
    score += 10;
    reasons.push("Atmosphere match");
  }
  if (includesAny(textBag(restaurant.district, restaurant.address), preferences.preferred_neighborhoods)) {
    score += 12;
    reasons.push("Preferred neighborhood");
  }
  if ((preferences.favorite_restaurants || []).some((name) => clean(restaurant.restaurant_name).toLowerCase().includes(clean(name).toLowerCase()))) {
    score += 18;
    reasons.push("Favorite restaurant signal");
  }

  score += Math.min(12, numberOr(restaurant.overall_rating_avg, restaurant.rating || 0) * 2);
  score += Math.min(8, numberOr(restaurant.favorites_count, 0));
  if (restaurant.offer_count > 0) {
    score += 6;
    reasons.push("Available SmartTable offer");
  }
  if (preferences.outdoor_seating && restaurant.outdoor_seating) {
    score += 7;
    reasons.push("Outdoor seating match");
  }
  if (preferences.kids_friendly && restaurant.kids_friendly) {
    score += 7;
    reasons.push("Kids friendly match");
  }
  if (preferences.parking_required && restaurant.parking_available) {
    score += 6;
    reasons.push("Parking available");
  }
  if (preferences.subway_preferred && includesAny(textBag(restaurant.address, restaurant.district), ["Village", "Soho", "Nolita", "Midtown", "Brooklyn"])) {
    score += 4;
    reasons.push("Transit-friendly area");
  }
  if (!reasons.length) reasons.push("Strong overall quality and location fit");

  return {
    score: Math.max(1, Math.min(99, Math.round(score))),
    reasons
  };
}

function recommendationRow(restaurant, preferences = {}) {
  const scoring = scoreRestaurantForPreferences(restaurant, preferences);
  const smartDiscount = smartDiscountForRestaurant(restaurant, preferences, scoring.score);
  const travelDistance = numberOr(preferences.travel_distance_miles, 2.5);
  const travelEstimate = Math.max(8, Math.round(numberOr(restaurant.average_service_minutes, 75) / 12 + travelDistance * 6));
  const bestTime = (preferences.preferred_times || [])[0] || (preferences.preferred_time_windows || [])[0] || "Early dinner window";
  const diningDuration = numberOr(restaurant.average_service_minutes, 75);
  const humanReason = `Recommended because it matches ${scoring.reasons.slice(0, 3).join(", ").toLowerCase()}, fits your preferred timing, and keeps travel practical for your dining plan.`;
  return {
    ...restaurant,
    ai_match_score: scoring.score,
    ai_reasons: scoring.reasons,
    why_recommended: humanReason,
    travel_estimate: `${travelEstimate} min estimated travel`,
    best_time_to_reserve: bestTime,
    estimated_dining_duration: `${diningDuration} min`,
    available_offer_label: restaurant.first_offer_id
      ? `${restaurant.highest_discount || smartDiscount || 0}% SmartTable offer available`
      : "No active discount needed for this match",
    matching_preferences: scoring.reasons,
    recommended_discount_percent: smartDiscount,
    smart_discount_explanation: smartDiscount
      ? `Offer starts at ${smartDiscount}% based on conversion likelihood and restaurant guardrails.`
      : "Recommended on fit and quality even without an active discount."
  };
}

function hourFromTime(value) {
  const match = clean(value).match(/^(\d{1,2})/);
  const hour = match ? Number(match[1]) : 19;
  return Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 19;
}

function dayOfWeekFromDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().getDay();
  return date.getDay();
}

function timeOfDayBucket(time) {
  const hour = hourFromTime(time);
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "dinner";
  return "late_night";
}

function observedDurationsForRestaurant(restaurantId) {
  ensureDemo();
  return demo.aiServiceTimeObservations
    .filter((item) => item.restaurant_id === restaurantId && Number.isFinite(Number(item.visit_duration_minutes)))
    .map((item) => Number(item.visit_duration_minutes));
}

function estimateServiceTime(restaurant, input = {}, observedDurations = []) {
  const partySize = Math.max(1, Math.trunc(numberOr(input.party_size || input.preferred_party_size, 2)));
  const mealCategory = clean(input.meal_category || timeOfDayBucket(input.reservation_time)).toLowerCase();
  const bucket = timeOfDayBucket(input.reservation_time);
  const day = dayOfWeekFromDate(input.reservation_date);
  const restaurantType = clean(input.restaurant_type || restaurant.restaurant_type || restaurant.cuisine_type || restaurant.cuisine || "restaurant").toLowerCase();
  const observedAverage = average(observedDurations);
  let minutes = observedAverage || numberOr(restaurant.average_service_minutes, 75);

  if (restaurantType.includes("fine") || restaurantType.includes("luxury")) minutes += 22;
  if (restaurantType.includes("casual") || restaurantType.includes("quick")) minutes -= 8;
  if (mealCategory.includes("drink") || mealCategory.includes("bar")) minutes -= 25;
  if (mealCategory.includes("dessert") || mealCategory.includes("coffee")) minutes -= 30;
  if (mealCategory.includes("brunch")) minutes += 8;
  if (mealCategory.includes("tasting")) minutes += 45;
  if (bucket === "dinner") minutes += 10;
  if (bucket === "late_night") minutes -= 6;
  if (day === 0 || day === 5 || day === 6) minutes += 8;
  minutes += Math.max(0, partySize - 2) * 8;

  const estimate = Math.max(35, Math.min(240, Math.round(minutes / 5) * 5));
  return {
    estimated_duration_minutes: estimate,
    confidence: observedDurations.length >= 12 ? "learned" : observedDurations.length >= 3 ? "blended" : "directional",
    inputs: {
      party_size: partySize,
      meal_category: mealCategory || bucket,
      time_of_day: bucket,
      day_of_week: day,
      restaurant_type: restaurantType,
      observed_visits: observedDurations.length
    }
  };
}

function routeMinutes(miles, mode) {
  const distance = Math.max(0, numberOr(miles, 0));
  const speeds = { walking: 3, driving: 14, transit: 10, rideshare: 13 };
  const speed = speeds[clean(mode)] || speeds.driving;
  return Math.ceil((distance / speed) * 60);
}

function analyzeConsumptionSignals(body = {}, restaurant = {}) {
  const text = textBag(body.description, body.short_review, body.liked_highlight, body.image_url, body.media_type, restaurant.cuisine_type, restaurant.cuisine);
  const categories = [
    "steak", "pizza", "burger", "sushi", "cocktail", "wine", "beer", "dessert", "coffee", "pasta", "seafood", "salad", "taco", "ramen"
  ];
  const labels = categories.filter((item) => text.includes(item));
  const drinkLabels = labels.filter((item) => ["cocktail", "wine", "beer", "coffee"].includes(item));
  const foodLabels = labels.filter((item) => !drinkLabels.includes(item));
  const cuisine = clean(restaurant.cuisine_type || restaurant.cuisine || body.cuisine || "unknown");
  const rating = numberOr(body.rating, 0);
  const words = clean(`${body.description || ""} ${body.short_review || ""} ${body.liked_highlight || ""}`).toLowerCase();
  const flavorProfile = [
    words.includes("spicy") ? "spicy" : "",
    words.includes("sweet") ? "sweet" : "",
    words.includes("fresh") ? "fresh" : "",
    words.includes("smoky") ? "smoky" : "",
    words.includes("rich") ? "rich" : ""
  ].filter(Boolean);
  const ingredientHints = {
    steak: ["beef", "salt", "pepper"],
    pizza: ["dough", "tomato", "cheese"],
    burger: ["beef", "bun", "cheese"],
    sushi: ["rice", "fish", "seaweed"],
    pasta: ["pasta", "sauce", "herbs"],
    seafood: ["seafood", "lemon", "herbs"],
    dessert: ["cream", "sugar"],
    cocktail: ["spirit", "citrus"],
    wine: ["grapes"],
    beer: ["malt", "hops"],
    coffee: ["coffee beans"]
  };
  const ingredients = [...new Set(labels.flatMap((label) => ingredientHints[label] || [label]))];
  const detectedDish = foodLabels[0] || (clean(body.media_type) === "food" ? labels[0] || "chef_special" : null);
  const detectedDrink = drinkLabels[0] || (clean(body.media_type) === "drink" ? labels[0] || "house_drink" : null);
  const presentationScore = Math.max(35, Math.min(100, 55 + labels.length * 6 + rating * 6 + (clean(body.image_url) ? 4 : 0)));
  return {
    ai_labels: labels.length ? labels : [clean(body.media_type || "dining")],
    food_type: detectedDish,
    drink_type: detectedDrink,
    cuisine,
    detected_dish: detectedDish,
    detected_drink: detectedDrink,
    cuisine_category: cuisine,
    ingredients,
    flavor_profile: flavorProfile.length ? flavorProfile : [detectedDrink ? "balanced" : "savory"],
    presentation_score: Math.round(presentationScore),
    price_perception: words.includes("expensive") ? "expensive" : words.includes("great value") || words.includes("worth") ? "good_value" : "unknown",
    popularity_signal: Math.max(1, Math.min(100, 35 + labels.length * 8 + rating * 8)),
    provider: "rules_engine",
    status: "placeholder_ready_for_ai_image_recognition"
  };
}

function calculateFeedbackPoints(submission = {}) {
  let points = 0;
  const hasRatings = [submission.rating, submission.overall_rating, submission.food_rating, submission.service_rating, submission.ambience_rating]
    .some((value) => numberOr(value, 0) >= 1);
  if (hasRatings) points += 25;
  if (clean(submission.short_review).length > 8) points += 25;
  if (clean(submission.image_url)) points += 50;
  if (clean(submission.description).length > 8 || clean(submission.liked_highlight).length > 8) points += 20;
  if (clean(submission.ordered_items).length > 1 || clean(submission.what_did_you_order).length > 1) points += 20;
  if (clean(submission.would_recommend)) points += 10;
  if (clean(submission.would_return)) points += 10;
  return Math.min(160, points);
}

function loyaltyForUpload(body = {}) {
  return calculateFeedbackPoints(body);
}

const loyaltyBadgeRules = [
  { key: "food_explorer", label: "Food Explorer", target: 50, test: ({ points }) => points },
  { key: "steak_master", label: "Steak Master", target: 1, test: ({ labels }) => labels.has("steak") ? 1 : 0 },
  { key: "sushi_hunter", label: "Sushi Hunter", target: 1, test: ({ labels }) => labels.has("sushi") ? 1 : 0 },
  { key: "wine_lover", label: "Wine Lover", target: 1, test: ({ labels }) => labels.has("wine") ? 1 : 0 },
  { key: "cocktail_expert", label: "Cocktail Expert", target: 1, test: ({ labels }) => labels.has("cocktail") ? 1 : 0 },
  { key: "nyc_food_hunter", label: "NYC Food Hunter", target: 3, test: ({ restaurantCount }) => restaurantCount },
  { key: "trend_spotter", label: "Trend Spotter", target: 5, test: ({ uniqueLabels }) => uniqueLabels }
];

function loyaltyStatus(account = {}, uploads = []) {
  const points = Math.max(0, numberOr(account.lifetime_points ?? account.points_balance, 0));
  const labels = new Set(uploads.flatMap((upload) => arrayFrom(upload.ai_labels).map((label) => clean(label).toLowerCase()).filter(Boolean)));
  const restaurantCount = new Set(uploads.map((upload) => upload.restaurant_id).filter(Boolean)).size;
  const context = { points, labels, restaurantCount, uniqueLabels: labels.size };
  const badges = loyaltyBadgeRules.map((rule) => {
    const current = Math.min(rule.target, Math.max(0, numberOr(rule.test(context), 0)));
    return {
      key: rule.key,
      label: rule.label,
      current,
      target: rule.target,
      progress_percent: Math.round((current / rule.target) * 100),
      unlocked: current >= rule.target
    };
  });
  return {
    points_balance: Math.max(0, numberOr(account.points_balance, points)),
    lifetime_points: points,
    completed_reviews: numberOr(account.completed_reviews, uploads.filter((upload) => upload.short_review || upload.rating).length),
    uploaded_photos: numberOr(account.uploaded_photos, uploads.filter((upload) => clean(upload.image_url)).length),
    last_reward_date: account.last_reward_date || uploads[0]?.created_at || null,
    badges,
    unlocked_badges: badges.filter((badge) => badge.unlocked),
    next_badge: badges.find((badge) => !badge.unlocked) || null
  };
}

function topCounts(values, limit = 6) {
  const counts = new Map();
  for (const value of values.flatMap((item) => arrayFrom(item))) {
    const key = clean(value).toLowerCase();
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function consumptionTrendBreakdown(uploads = []) {
  return {
    top_dishes: topCounts(uploads.map((upload) => upload.detected_dish || upload.food_type).filter(Boolean)),
    fastest_growing_dishes: topCounts(uploads.map((upload) => upload.detected_dish || upload.food_type).filter(Boolean)),
    most_uploaded_drinks: topCounts(uploads.map((upload) => upload.detected_drink || upload.drink_type).filter(Boolean)),
    most_photographed_foods: topCounts(uploads.map((upload) => upload.detected_dish || upload.food_type || upload.media_type).filter(Boolean)),
    popular_ingredients: topCounts(uploads.map((upload) => upload.ingredients || [])),
    flavor_profiles: topCounts(uploads.map((upload) => upload.flavor_profile || [])),
    uploaded_photo_count: uploads.filter((upload) => clean(upload.image_url)).length,
    average_upload_rating: average(uploads.map((upload) => numberOr(upload.rating, 0)).filter(Boolean))
  };
}

function upsertDemoLoyalty(profileKey, points, metadata = {}) {
  ensureDemo();
  const key = aiProfileKey(profileKey);
  let account = demo.loyaltyAccounts.find((item) => item.profile_key === key);
  if (!account) {
    account = {
      id: crypto.randomUUID(),
      profile_key: key,
      points_balance: 0,
      lifetime_points: 0,
      completed_reviews: 0,
      uploaded_photos: 0,
      last_reward_date: null,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    demo.loyaltyAccounts.unshift(account);
  }
  account.points_balance += points;
  account.lifetime_points += points;
  account.completed_reviews = numberOr(account.completed_reviews, 0) + (metadata.completedReview ? 1 : 0);
  account.uploaded_photos = numberOr(account.uploaded_photos, 0) + (metadata.uploadedPhoto ? 1 : 0);
  account.last_reward_date = nowIso();
  account.updated_at = nowIso();
  return account;
}

function restaurantIntelligenceSummary(restaurantId = null) {
  ensureDemo();
  const uploads = demo.consumptionUploads.filter((item) => !restaurantId || item.restaurant_id === restaurantId);
  const reservations = demo.reservations.filter((item) => !restaurantId || item.restaurant_id === restaurantId);
  const reviews = demo.restaurantReviews.filter((item) => (!restaurantId || item.restaurant_id === restaurantId) && item.status === "approved");
  const followers = demo.restaurantFollowers.filter((item) => !restaurantId || item.restaurant_id === restaurantId);
  const durations = restaurantId
    ? observedDurationsForRestaurant(restaurantId)
    : demo.aiServiceTimeObservations.map((item) => Number(item.visit_duration_minutes)).filter(Number.isFinite);
  const labelCounts = new Map();
  for (const upload of uploads) {
    for (const label of arrayFrom(upload.ai_labels)) {
      const key = clean(label || "unknown");
      if (key) labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
    }
  }
  const topLabels = [...labelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));
  const uploadRatings = uploads.map((item) => numberOr(item.rating, 0)).filter(Boolean);
  const reviewRatings = reviews.map((item) => (numberOr(item.food_rating, 0) + numberOr(item.service_rating, 0) + numberOr(item.ambience_rating, 0)) / 3);
  const trendBreakdown = consumptionTrendBreakdown(uploads);
  return {
    restaurant_id: restaurantId,
    uploads_total: uploads.length,
    photos_total: uploads.filter((item) => clean(item.image_url)).length,
    uploaded_photo_count: trendBreakdown.uploaded_photo_count,
    loyalty_points_awarded: uploads.reduce((sum, item) => sum + numberOr(item.loyalty_points_awarded, 0), 0),
    reservations_total: reservations.length,
    returning_customer_rate: reservations.length ? Math.round((new Set(reservations.map((item) => item.guest_email).filter(Boolean)).size / reservations.length) * 100) : 0,
    followers_total: followers.length,
    average_dining_duration: average(durations) || null,
    satisfaction_score: average(reviewRatings.length ? reviewRatings : uploadRatings),
    upload_satisfaction_score: average(uploadRatings),
    top_trends: topLabels,
    ...trendBreakdown,
    highest_rated_menu_categories: topCounts(uploads.filter((item) => numberOr(item.rating, 0) >= 4.5).map((item) => item.detected_dish || item.food_type || item.detected_drink || item.drink_type || item.media_type)),
    value_perception_signals: uploads.some((item) => clean(item.price_perception) === "good_value") ? "Strong value perception" : "Not enough value-perception signal yet",
    image_recognition_status: "placeholder_ready_for_future_ai",
    privacy: "aggregated_anonymized_no_pii"
  };
}

function enhancedDemandForecast(restaurant, metrics = {}) {
  const views = Math.max(0, numberOr(metrics.views, restaurant?.views_count || 0));
  const bookings = Math.max(0, numberOr(metrics.bookings ?? metrics.reservations, 0));
  const importedReservations = Math.max(0, numberOr(metrics.imported_reservations, 0));
  const manualReservations = Math.max(0, numberOr(metrics.manual_reservations, 0));
  const supplementalDemand = Math.min(18, Math.round(importedReservations * 1.4 + manualReservations * 0.9));
  const activeOffers = Math.max(0, numberOr(metrics.active_offers, 0));
  const accepted = Math.max(0, numberOr(metrics.accepted, 0));
  const reservationValueEstimate = Math.max(35, numberOr(metrics.reservation_value_estimate, 85));
  const minDiscount = Math.max(0, numberOr(restaurant?.min_discount_percent, 10));
  const maxDiscount = Math.max(minDiscount, numberOr(restaurant?.max_discount_percent, 30));
  let demandScore = Math.min(100, Math.max(0, 28 + bookings * 16 + activeOffers * 8 + Math.min(22, views * 2) + accepted * 6 + supplementalDemand));
  if (views < 6 && bookings === 0 && importedReservations === 0 && manualReservations === 0) demandScore = Math.min(demandScore, 38);
  if (activeOffers > 0 && bookings > 0) demandScore = Math.max(demandScore, 52);

  const suggestedDiscount = demandScore < 40
    ? Math.min(maxDiscount, Math.max(20, minDiscount))
    : demandScore > 78
      ? Math.min(10, minDiscount)
      : activeOffers > 0
        ? Math.round((minDiscount + Math.min(maxDiscount, 20)) / 2)
        : Math.min(maxDiscount, Math.max(minDiscount, 15));
  const suggestedAction = activeOffers > 0 && demandScore >= 45
    ? "hold_current_strategy"
    : demandScore < 45
      ? "create_suggested_offer"
      : demandScore > 78
        ? "reduce_discount_and_protect_revenue"
        : "apply_recommendation";
  const trend = demandScore >= 68 ? "up" : demandScore <= 42 ? "down" : "flat";
  const expectedBookings = Math.max(bookings, Math.round((views * (suggestedDiscount ? 0.18 : 0.1)) + activeOffers + importedReservations * 0.18 + manualReservations * 0.12));
  const expectedGuests = Math.max(expectedBookings * 2, Math.round(expectedBookings * numberOr(metrics.average_party_size, 2.4)));
  const revenueWithoutDiscount = Math.round(expectedBookings * reservationValueEstimate);
  const revenueWithDiscount = Math.round(expectedBookings * reservationValueEstimate * (1 - suggestedDiscount / 100) * (suggestedDiscount ? 1.18 : 1));
  const revenueLift = Math.max(0, revenueWithDiscount - revenueWithoutDiscount);
  const weeklyRevenueOpportunity = Math.max(revenueLift, Math.round((100 - demandScore) * 18 + activeOffers * 80));
  const confidenceScore = Math.min(92, Math.max(44, 48 + bookings * 7 + activeOffers * 6 + Math.min(18, views) + Math.min(10, importedReservations + manualReservations)));
  const aiScore = Math.min(100, Math.max(0, Math.round(demandScore * 0.55 + confidenceScore * 0.25 + Math.min(100, activeOffers * 18 + bookings * 9) * 0.2)));
  const riskLevel = demandScore < 40 ? "High" : demandScore < 62 ? "Medium" : "Low";
  const reasons = [
    views < 6 ? "Low view volume" : "Reservation history",
    activeOffers > 0 ? "Offer conversion" : "No active offer coverage",
    "Day of week",
    "Time of day",
    "Weather impact",
    "Local event nearby",
    "Competition level",
    "Traffic condition"
  ];
  const missingData = [];
  if (!metrics.weather_connected) missingData.push("Live weather feed");
  if (!metrics.events_connected) missingData.push("Local events feed");
  if (!metrics.reservation_integration_connected) missingData.push("Reservation platform import");

  return {
    restaurant_id: restaurant?.id || metrics.restaurant_id || null,
    restaurant_name: restaurant?.name || metrics.restaurant_name || "Restaurant",
    demand_score: demandScore,
    ai_score: aiScore,
    revenue_opportunity_weekly: weeklyRevenueOpportunity,
    risk_level: riskLevel,
    suggested_action: suggestedAction,
    suggested_discount_percent: suggestedDiscount,
    confidence: "Directional",
    confidence_score: confidenceScore,
    trend,
    expected_bookings: expectedBookings,
    expected_guests: expectedGuests,
    expected_revenue_without_discount: revenueWithoutDiscount,
    expected_revenue_with_suggested_discount: revenueWithDiscount,
    estimated_revenue_lift: revenueLift,
    ai_recommendation: suggestedAction === "hold_current_strategy"
      ? "Hold current strategy and keep monitoring conversion."
      : suggestedAction === "create_suggested_offer"
        ? `Create a ${suggestedDiscount}% offer for the next low-demand window.`
        : suggestedAction === "reduce_discount_and_protect_revenue"
          ? "Demand is strong. Reduce discounts and protect margin."
          : `Apply a ${suggestedDiscount}% SmartTable recommendation.`,
    reasons,
    inputs: {
      reservations: bookings,
      imported_reservations: importedReservations,
      manual_reservations: manualReservations,
      active_offers: activeOffers,
      views,
      accepted,
      reservation_value_estimate: reservationValueEstimate
    },
    data_status: featureStatusFor("ai_demand_recommendations"),
    model_version: "rules-v1",
    data_used: [
      "restaurant_profile",
      "active_offers",
      "reservation_leads",
      importedReservations ? "imported_reservation_history" : "",
      manualReservations ? "manual_performance_uploads" : "",
      "restaurant_views",
      "accepted_reservations",
      "discount_guardrails"
    ].filter(Boolean),
    missing_data: missingData,
    requires_approval: true,
    autonomous_execution: false
  };
}

function aiExplanationFromForecast(forecast = {}) {
  return {
    what_happened: forecast.demand_score < 45
      ? "Demand is pacing below target for an upcoming service window."
      : forecast.demand_score > 78
        ? "Demand is strong enough to protect margin."
        : "Demand is moderate and should be monitored with a controlled action.",
    why_recommended: forecast.ai_recommendation || "SmartTable recommends a controlled revenue action.",
    data_used: forecast.data_used || [],
    expected_result: {
      expected_bookings: forecast.expected_bookings || 0,
      expected_revenue_lift: forecast.estimated_revenue_lift || 0
    },
    confidence: forecast.confidence_score || 0,
    missing_data: forecast.missing_data || []
  };
}

function aiRecommendationFromForecast(restaurant, forecast = {}, profile = null) {
  const recommendation = {
    id: crypto.randomUUID(),
    restaurant_id: restaurant.id,
    recommendation_type: "demand_recovery",
    status: "pending_approval",
    demand_score: forecast.demand_score,
    recommended_discount: forecast.suggested_discount_percent,
    recommended_start_time: "17:30",
    recommended_end_time: "19:00",
    recommended_date: tomorrowIsoDate(),
    recommended_action: forecast.suggested_action || "apply_recommendation",
    marketing_action: forecast.suggested_action === "reduce_discount_and_protect_revenue" ? "protect_margin" : "notify_favorite_guests",
    expected_bookings: forecast.expected_bookings || 0,
    expected_revenue_lift: forecast.estimated_revenue_lift || 0,
    confidence_score: forecast.confidence_score || 0,
    explanation: aiExplanationFromForecast(forecast),
    data_used: {
      fields: forecast.data_used || [],
      inputs: forecast.inputs || {}
    },
    missing_data: forecast.missing_data || [],
    model_version: forecast.model_version || "rules-v1",
    source: supabaseConfigured ? "smarttable_rules_live_data" : "smarttable_rules_demo_seed",
    created_by: profile?.id || null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
  return recommendation;
}

function reservationOverviewRows() {
  ensureDemo();
  return demo.reservations.map((reservation) => {
    const offer = demo.offers.find((item) => item.id === reservation.offer_id);
    const restaurant = demo.restaurants.find((item) => item.id === reservation.restaurant_id);
    return decorateReservationRow({
      reservation_id: reservation.id,
      reference: reservation.reference,
      restaurant_id: reservation.restaurant_id,
      restaurant_name: restaurant?.name || "Restaurant",
      restaurant_email: restaurant?.email || restaurant?.contact_email || "",
      restaurant_phone: restaurant?.phone || "",
      restaurant_address: restaurant?.address || "",
      restaurant_cuisine: restaurant?.cuisine_type || restaurant?.cuisine || "",
      restaurant_neighborhood: restaurant?.district || restaurant?.neighborhood || "",
      restaurant_status: restaurant?.status || "",
      offer_id: reservation.offer_id,
      offer_title: localizedField(offer, "title", "en"),
      offer_date: reservation.reservation_date || offer?.offer_date || reservation.created_at.slice(0, 10),
      offer_time: reservation.reservation_time || offer?.start_time || offer?.offer_time || "",
      reservation_date: reservation.reservation_date || offer?.offer_date || reservation.created_at.slice(0, 10),
      reservation_time: reservation.reservation_time || offer?.start_time || offer?.offer_time || "",
      discount_type: offer?.discount_type || "percent",
      discount_value: numberOr(offer?.discount_value, offer?.discount_percent || reservation.discount_percent || 0),
      discount_percent: numberOr(offer?.discount_percent, offer?.discount_value || reservation.discount_percent || 0),
      party_size: reservation.party_size,
      guest_id: reservation.guest_id,
      guest_name: reservation.guest_name,
      guest_email: reservation.guest_email,
      guest_phone: reservation.guest_phone,
      guest_language: reservation.guest_language || "en",
      restaurant_language: restaurant?.preferred_language || "en",
      notes: reservation.notes,
      partner_notes: reservation.partner_notes || "",
      confirmation_details: reservation.partner_notes || "",
      accepted_at: reservation.accepted_at || null,
      rejected_at: reservation.rejected_at || null,
      cancelled_at: reservation.cancelled_at || null,
      completed_at: reservation.completed_at || null,
      no_show_at: reservation.no_show_at || null,
      status_changed_at: reservation.status_changed_at || null,
      status_changed_by: reservation.status_changed_by || null,
      cancelled_by_label: reservation.cancelled_by_label || "",
      feedback_submitted: demo.consumptionUploads.some((item) => item.reservation_id === reservation.id),
      source: reservation.source || "smarttable",
      booking_source: reservation.booking_source || "SMARTTABLE",
      booking_status: reservation.booking_status || bookingStatusFromReservationStatus(reservation.status),
      status: reservation.status,
      created_at: reservation.created_at,
      updated_at: reservation.updated_at
    });
  });
}

function emailLogMetadata(result = {}, context = {}) {
  const {
    recipient_email,
    recipientEmail,
    guest_phone,
    phone,
    ...safeContext
  } = context || {};
  return {
    ...safeContext,
    recipient_hash: recipient_email || recipientEmail ? hashEmailValue(lower(recipient_email || recipientEmail)).slice(0, 16) : null,
    accepted: Boolean(result.accepted),
    status: result.status || "failed",
    error_code: result.errorCode || null,
    error_message: result.errorMessage || null
  };
}

function hashEmailValue(value) {
  return crypto.createHash("sha256").update(clean(value)).digest("hex");
}

function maskEmailAddress(email) {
  const value = clean(email).toLowerCase();
  const [local, domain] = value.split("@");
  if (!local || !domain) return value ? "invalid-email" : "";
  const visible = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return `${visible}@${domain}`;
}

function maskEmailLogForAdmin(row = {}) {
  const recipient = row.recipient_email || row.recipient;
  const masked = maskEmailAddress(recipient);
  return {
    ...row,
    log_id: row.log_id || row.id || null,
    queue_id: row.queue_id || null,
    template: row.template || row.email_type || row.event_type || "",
    language: row.language || row.locale || "",
    related_reservation_reference: row.related_reservation_reference || row.reservation_reference || row.reference || "",
    last_safe_error: row.last_safe_error || row.last_error_message || row.error_message || "",
    recipient: masked,
    recipient_email: masked,
    masked_recipient: masked,
    recipient_hash: recipient ? hashEmailValue(lower(recipient)).slice(0, 16) : "",
    metadata: {
      ...(row.metadata || {}),
      recipient_masked: masked
    }
  };
}

function maskEmailQueueForAdmin(row = {}) {
  const recipient = row.recipient_email || row.payload?.to;
  const masked = maskEmailAddress(recipient);
  const status = normalizeEmailQueueStatus(row.status);
  const payloadRedacted = Boolean(row.payload?.redacted);
  const terminal = ["sent", "delivered", "bounced", "failed", "complained", "cancelled"].includes(status);
  const retryAllowed = ["pending", "queued", "failed"].includes(status) && !payloadRedacted && !terminal;
  return {
    ...row,
    queue_id: row.queue_id || row.id || null,
    log_id: row.log_id || row.email_log_id || null,
    template: row.template || row.email_type || row.event_type || "",
    language: row.language || row.locale || "",
    related_reservation_reference: row.related_reservation_reference || row.reservation_reference || row.reference || "",
    last_safe_error: row.last_safe_error || row.last_error_message || "",
    recipient_email: masked,
    masked_recipient: masked,
    retry_allowed: retryAllowed,
    retry_action: retryAllowed
      ? {
        method: "POST",
        endpoint: "/api/admin/email-queue",
        body: { action: "retry", id: row.id }
      }
      : null,
    retry_not_allowed_reason: retryAllowed
      ? null
      : terminal
        ? `Email queue status is ${status}.`
        : payloadRedacted
          ? "Email payload is redacted and cannot be retried without rebuilding the secure message."
          : "Email is not currently retryable.",
    payload: row.payload
      ? {
        subject: row.payload.subject || "",
        redacted: true,
        redaction_reason: row.payload.redaction_reason || "admin_display_masked"
      }
      : null,
    recipient_hash: recipient ? hashEmailValue(lower(recipient)).slice(0, 16) : ""
  };
}

const EMAIL_DIAGNOSTIC_STATUSES = new Set(["pending", "queued", "sent", "delivered", "failed", "bounced", "complained", "cancelled"]);

function emailDiagnosticStatus(row = {}) {
  return normalizeEmailQueueStatus(row.status || row.delivery_status || row.delivery || "pending");
}

function emailDiagnosticType(row = {}) {
  return clean(row.email_type || row.event_type || row.metadata?.email_type || row.metadata?.event_type || "");
}

function emailDiagnosticRecipientType(row = {}) {
  const type = lower(emailDiagnosticType(row));
  if (type.includes("restaurant") || type === "restaurant_request_notice") return "restaurant";
  if (type.includes("admin")) return "admin";
  if (type.includes("guest") || type.includes("reservation") || type.includes("booking") || type.includes("welcome") || type.includes("verification") || type.includes("password")) return "guest";
  if (row.restaurant_id && !row.guest_id && !row.recipient_user_id) return "restaurant";
  if (row.guest_id) return "guest";
  if (row.recipient_user_id) return "user";
  return "unknown";
}

function parseEmailDiagnosticFilters(query = new URLSearchParams()) {
  const statuses = new Set();
  const statusValue = clean(query.get("status") || query.get("delivery_status") || query.get("queue_status"));
  if (statusValue) {
    for (const value of statusValue.split(",")) {
      const status = lower(value.trim());
      if (EMAIL_DIAGNOSTIC_STATUSES.has(status)) statuses.add(status);
    }
  }
  for (const status of ["queued", "sent", "delivered", "failed", "bounced", "complained"]) {
    if (boolValue(query.get(status))) statuses.add(status);
  }
  const limit = Math.min(Math.max(1, Math.trunc(numberOr(query.get("limit"), 50))), 250);
  return {
    email_type: clean(query.get("email_type") || query.get("type")),
    recipient_type: lower(query.get("recipient_type") || query.get("recipientType")),
    user: lower(query.get("user") || query.get("user_id") || query.get("recipient_user_id") || query.get("guest_id")),
    restaurant: clean(query.get("restaurant") || query.get("restaurant_id")),
    reservation: clean(query.get("reservation") || query.get("reservation_id") || query.get("reservation_reference") || query.get("reference")),
    statuses: [...statuses],
    limit
  };
}

function emailDiagnosticRowMatches(row = {}, filters = {}) {
  if (filters.email_type && lower(emailDiagnosticType(row)) !== lower(filters.email_type)) return false;
  if (filters.recipient_type && emailDiagnosticRecipientType(row) !== filters.recipient_type) return false;
  if (filters.statuses?.length) {
    const status = emailDiagnosticStatus(row);
    const statusMatched = filters.statuses.some((filterStatus) => filterStatus === status || (filterStatus === "queued" && status === "pending"));
    if (!statusMatched) return false;
  }
  if (filters.restaurant && clean(row.restaurant_id) !== filters.restaurant) return false;
  if (filters.reservation) {
    const reservationValues = [
      row.reservation_id,
      row.related_reservation_reference,
      row.reservation_reference,
      row.reference
    ].map(clean);
    if (!reservationValues.includes(filters.reservation)) return false;
  }
  if (filters.user) {
    const userValues = [
      row.recipient_user_id,
      row.user_id,
      row.guest_id,
      row.recipient_email,
      row.recipient,
      row.metadata?.recipient_email,
      row.metadata?.guest_email
    ].map((value) => lower(value));
    if (!userValues.includes(filters.user)) return false;
  }
  return true;
}

function headerValue(headers = {}, name = "") {
  const lowerName = lower(name);
  const match = Object.entries(headers || {}).find(([key]) => lower(key) === lowerName);
  const value = match?.[1];
  return Array.isArray(value) ? clean(value[0]) : clean(value);
}

function rawWebhookBody(body = {}) {
  if (typeof body === "string") return body;
  if (body?.__rawBody) return String(body.__rawBody);
  const clone = { ...(body || {}) };
  delete clone.__rawBody;
  return JSON.stringify(clone);
}

function safeEqualString(a = "", b = "") {
  const left = Buffer.from(clean(a));
  const right = Buffer.from(clean(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function resendWebhookSecretBytes(secret = "") {
  const value = clean(secret);
  if (!value) return null;
  const encoded = value.startsWith("whsec_") ? value.slice(6) : value;
  try {
    return Buffer.from(encoded, "base64");
  } catch {
    return Buffer.from(value);
  }
}

function verifyResendWebhookSignature(headers = {}, body = {}) {
  if (!RESEND_WEBHOOK_SECRET) return { ok: false, reason: "RESEND_WEBHOOK_SECRET_NOT_CONFIGURED" };
  const raw = rawWebhookBody(body);
  const svixId = headerValue(headers, "svix-id");
  const svixTimestamp = headerValue(headers, "svix-timestamp");
  const svixSignature = headerValue(headers, "svix-signature");
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (svixId && svixTimestamp && svixSignature) {
    const timestamp = Number(svixTimestamp);
    if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > EMAIL_WEBHOOK_TOLERANCE_SECONDS) {
      return { ok: false, reason: "WEBHOOK_TIMESTAMP_OUTSIDE_TOLERANCE" };
    }
    const secretBytes = resendWebhookSecretBytes(RESEND_WEBHOOK_SECRET);
    const signedContent = `${svixId}.${svixTimestamp}.${raw}`;
    const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
    const received = svixSignature
      .split(/\s+/)
      .map((part) => part.includes(",") ? part.split(",").at(-1) : part)
      .map(clean)
      .filter(Boolean);
    if (received.some((signature) => safeEqualString(signature, expected))) return { ok: true, scheme: "svix" };
    return { ok: false, reason: "WEBHOOK_SIGNATURE_MISMATCH" };
  }

  const hmacSignature = headerValue(headers, "x-resend-signature") || headerValue(headers, "x-smarttable-signature");
  if (!hmacSignature) return { ok: false, reason: "WEBHOOK_SIGNATURE_MISSING" };
  const expected = crypto.createHmac("sha256", RESEND_WEBHOOK_SECRET).update(raw).digest("hex");
  const received = hmacSignature.replace(/^sha256=/i, "");
  return safeEqualString(received, expected)
    ? { ok: true, scheme: "hmac-sha256" }
    : { ok: false, reason: "WEBHOOK_SIGNATURE_MISMATCH" };
}

function mapProviderEmailEventStatus(eventType = "", data = {}) {
  const type = lower(eventType);
  const status = lower(data.status || data.delivery_status);
  if (type.includes("delivered") || status === "delivered") return "delivered";
  if (type.includes("bounced") || status === "bounced") return "bounced";
  if (type.includes("complained") || type.includes("complaint") || status === "complained") return "complained";
  if (type.includes("failed") || status === "failed") return "failed";
  if (type.includes("deferred") || status === "deferred") return "queued";
  if (type.includes("sent") || status === "sent") return "sent";
  return "queued";
}

function emailLogPatchForProviderEvent(row = {}, event = {}) {
  const now = nowIso();
  const previousEvents = Array.isArray(row.metadata?.provider_events) ? row.metadata.provider_events : [];
  const nextEvents = previousEvents.some((item) => item.event_id === event.event_id)
    ? previousEvents
    : [...previousEvents, {
      event_id: event.event_id,
      event_type: event.event_type,
      status: event.status,
      received_at: now
    }].slice(-20);
  return {
    delivery_status: event.status,
    status: event.status,
    delivered_at: event.status === "delivered" ? (row.delivered_at || now) : row.delivered_at || null,
    failed_at: ["failed", "bounced", "complained"].includes(event.status) ? (row.failed_at || now) : row.failed_at || null,
    updated_at: now,
    metadata: {
      ...(row.metadata || {}),
      provider_events: nextEvents,
      last_provider_event_type: event.event_type,
      last_provider_event_at: now
    }
  };
}

async function updateEmailLogFromProviderEvent(event = {}) {
  if (!event.provider_message_id) return { updated: false, reason: "MISSING_PROVIDER_MESSAGE_ID" };
  if (!supabaseConfigured) {
    ensureDemo();
    const row = demo.emailLogs.find((item) => item.provider_message_id === event.provider_message_id || item.provider_id === event.provider_message_id);
    if (!row) return { updated: false, reason: "EMAIL_LOG_NOT_FOUND" };
    const events = Array.isArray(row.metadata?.provider_events) ? row.metadata.provider_events : [];
    if (event.event_id && events.some((item) => item.event_id === event.event_id)) return { updated: false, reason: "WEBHOOK_EVENT_ALREADY_PROCESSED" };
    Object.assign(row, emailLogPatchForProviderEvent(row, event));
    return { updated: true, email_log_id: row.id, status: row.status };
  }
  const rows = await supabaseFetch(`/rest/v1/email_logs?select=*&or=(provider_message_id.eq.${encodeURIComponent(event.provider_message_id)},provider_id.eq.${encodeURIComponent(event.provider_message_id)})&limit=1`, { service: true }).catch(() => []);
  const row = rows?.[0];
  if (!row) return { updated: false, reason: "EMAIL_LOG_NOT_FOUND" };
  const events = Array.isArray(row.metadata?.provider_events) ? row.metadata.provider_events : [];
  if (event.event_id && events.some((item) => item.event_id === event.event_id)) return { updated: false, reason: "WEBHOOK_EVENT_ALREADY_PROCESSED" };
  await supabaseFetch(`/rest/v1/email_logs?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: emailLogPatchForProviderEvent(row, event)
  });
  return { updated: true, email_log_id: row.id, status: event.status };
}

function normalizeEmailDeliveryStatus(result = {}) {
  const status = clean(result.delivery_status || result.status || result.delivery).toLowerCase();
  if (["pending", "queued", "sent", "delivered", "bounced", "failed", "complained", "cancelled"].includes(status)) return status;
  return isEmailAccepted(result) ? "sent" : "failed";
}

function isTemporaryEmailFailure(errorCode = "") {
  const code = clean(errorCode).toUpperCase();
  return code === "EMAIL_PROVIDER_REQUEST_FAILED" ||
    code === "EMAIL_PROVIDER_TIMEOUT" ||
    /^RESEND_(408|409|425|429|500|502|503|504)$/.test(code);
}

function isPermanentEmailFailure(errorCode = "") {
  const code = clean(errorCode).toUpperCase();
  if (!code) return false;
  if (isTemporaryEmailFailure(code)) return false;
  return code.startsWith("INVALID_") ||
    code.startsWith("MISSING_") ||
    code === "EMAIL_PROVIDER_NOT_CONFIGURED" ||
    code === "EMAIL_PROVIDER_UNSUPPORTED" ||
    code === "EMAIL_FETCH_UNAVAILABLE" ||
    /^RESEND_(400|401|403|404|422)$/.test(code);
}

function emailTypeFromContext(context = {}) {
  return clean(context.email_type || context.emailType || context.event_type || "email");
}

function emailLocaleFromContext(context = {}, message = {}) {
  return normalizeLanguage(context.locale || context.lang || context.language || message.locale || "en");
}

function emailIdempotencyKey(message = {}, context = {}) {
  const explicit = clean(context.idempotency_key || context.idempotencyKey);
  if (explicit) return explicit;
  const emailType = emailTypeFromContext(context);
  const recipient = lower(message.to || context.recipient_email || context.recipientEmail);
  const scope = clean(context.reservation_id || context.reservationId || context.recipient_user_id || context.recipientUserId || context.guest_id || context.restaurant_id || recipient || "global");
  return hashEmailValue(`${emailType}:${scope}:${recipient}`);
}

function normalizeEmailDeliveryContext(message = {}, context = {}) {
  const locale = emailLocaleFromContext(context, message);
  return {
    ...context,
    email_type: emailTypeFromContext(context),
    event_type: clean(context.event_type || context.email_type || context.emailType || "email"),
    recipient_email: lower(message.to || context.recipient_email || context.recipientEmail),
    recipient_user_id: clean(context.recipient_user_id || context.recipientUserId),
    restaurant_id: clean(context.restaurant_id || context.restaurantId),
    reservation_id: clean(context.reservation_id || context.reservationId),
    guest_id: clean(context.guest_id || context.guestId),
    campaign_id: clean(context.campaign_id || context.campaignId),
    locale,
    template_version: clean(context.template_version || context.templateVersion || EMAIL_TEMPLATE_VERSION),
    idempotency_key: emailIdempotencyKey(message, context)
  };
}

function emailLogAttemptCount(row = {}) {
  if (!row) return 0;
  return Math.max(0, Number(row.attempt_count ?? row.attemptCount ?? 0));
}

function emailLogLastErrorCode(row = {}) {
  if (!row) return "";
  return clean(row.last_error_code || row.error_code || row.metadata?.error_code);
}

function emailLogStatus(row = {}) {
  if (!row) return "failed";
  return clean(row.delivery_status || row.status || "failed").toLowerCase();
}

function emailSendDecision(existingLog = null) {
  if (!existingLog) return { shouldSend: true, reason: "new" };
  const status = emailLogStatus(existingLog);
  if (["queued", "sent", "delivered"].includes(status)) {
    return { shouldSend: false, reason: "already_accepted" };
  }
  const errorCode = emailLogLastErrorCode(existingLog);
  if (isPermanentEmailFailure(errorCode)) {
    return { shouldSend: false, reason: "permanent_failure" };
  }
  if (emailLogAttemptCount(existingLog) >= EMAIL_RETRY_LIMIT) {
    return { shouldSend: false, reason: "retry_limit_reached" };
  }
  return { shouldSend: true, reason: "retry_temporary_failure" };
}

function normalizeEmailQueueStatus(value = "") {
  const status = clean(value).toLowerCase();
  return ["pending", "queued", "sent", "delivered", "bounced", "failed", "complained", "cancelled"].includes(status)
    ? status
    : "queued";
}

function emailRetryDelayMs(attemptCount = 0) {
  const index = Math.min(Math.max(0, Number(attemptCount || 0) - 1), EMAIL_QUEUE_RETRY_DELAYS_MS.length - 1);
  return EMAIL_QUEUE_RETRY_DELAYS_MS[index] || EMAIL_QUEUE_RETRY_DELAYS_MS.at(-1) || 60_000;
}

function isSensitiveQueuedEmail(context = {}) {
  const type = clean(context.email_type || context.event_type).toLowerCase();
  return ["email_verification", "password_reset"].includes(type);
}

function emailQueuePayloadForStorage(message = {}, context = {}) {
  const payload = {
    to: lower(message.to),
    from: clean(message.from || EMAIL_FROM),
    subject: clean(message.subject),
    reply_to: clean(message.replyTo || message.reply_to || EMAIL_REPLY_TO),
    redacted: false
  };
  if (isSensitiveQueuedEmail(context)) {
    return {
      ...payload,
      text: "",
      html: "",
      redacted: true,
      redaction_reason: "secure_token_not_persisted"
    };
  }
  return {
    ...payload,
    text: clean(message.text),
    html: clean(message.html)
  };
}

function emailMessageFromQueuePayload(payload = {}) {
  if (!payload || payload.redacted) return null;
  return {
    to: payload.to,
    from: payload.from || EMAIL_FROM,
    reply_to: payload.reply_to || EMAIL_REPLY_TO,
    subject: payload.subject,
    text: payload.text || "",
    html: payload.html || ""
  };
}

function emailQueueRow(message = {}, context = {}, existingLog = null) {
  const now = nowIso();
  return {
    id: crypto.randomUUID(),
    email_log_id: existingLog?.id || null,
    email_type: context.email_type || context.event_type || "email",
    event_type: context.event_type || context.email_type || "email",
    recipient_email: lower(message.to || context.recipient_email),
    recipient_user_id: context.recipient_user_id || null,
    restaurant_id: context.restaurant_id || null,
    reservation_id: context.reservation_id || null,
    campaign_id: context.campaign_id || null,
    provider: "resend",
    provider_message_id: existingLog?.provider_message_id || existingLog?.provider_id || null,
    status: "queued",
    attempt_count: emailLogAttemptCount(existingLog),
    max_attempts: EMAIL_QUEUE_MAX_ATTEMPTS,
    locale: context.locale || "en",
    template_version: context.template_version || EMAIL_TEMPLATE_VERSION,
    idempotency_key: context.idempotency_key || emailIdempotencyKey(message, context),
    payload: emailQueuePayloadForStorage(message, context),
    next_attempt_at: now,
    last_attempt_at: null,
    sent_at: null,
    delivered_at: null,
    failed_at: null,
    last_error_code: null,
    last_error_message: null,
    created_at: now,
    updated_at: now
  };
}

async function findEmailQueueByIdempotency(idempotencyKey) {
  const key = clean(idempotencyKey);
  if (!key) return null;
  if (!supabaseConfigured) {
    ensureDemo();
    return demo.emailQueue.find((item) => item.idempotency_key === key) || null;
  }
  try {
    const rows = await supabaseFetch(`/rest/v1/email_queue?select=*&idempotency_key=eq.${encodeURIComponent(key)}&limit=1`, { service: true });
    return rows?.[0] || null;
  } catch (error) {
    console.error("[email-queue] Could not read queue record:", error.message);
    return null;
  }
}

async function createEmailQueueRecord(message = {}, context = {}, existingLog = null) {
  const existingQueue = await findEmailQueueByIdempotency(context.idempotency_key);
  if (existingQueue) return existingQueue;
  const row = emailQueueRow(message, context, existingLog);
  if (!supabaseConfigured) {
    ensureDemo();
    demo.emailQueue.unshift(row);
    return row;
  }
  try {
    const rows = await supabaseFetch("/rest/v1/email_queue?select=*", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=representation" },
      body: row
    });
    return rows?.[0] || row;
  } catch (error) {
    console.error("[email-queue] Queue write failed; attempting immediate delivery only:", error.message);
    return { ...row, queue_error: error.message, transient: true };
  }
}

async function patchEmailQueueRecord(queueRecord = {}, patch = {}) {
  if (!queueRecord?.id) return null;
  const payload = {
    ...patch,
    status: patch.status ? normalizeEmailQueueStatus(patch.status) : undefined,
    updated_at: nowIso()
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  if (!supabaseConfigured || queueRecord.transient) {
    ensureDemo();
    const index = demo.emailQueue.findIndex((item) => item.id === queueRecord.id);
    const next = { ...queueRecord, ...payload };
    if (index >= 0) demo.emailQueue[index] = { ...demo.emailQueue[index], ...payload };
    return next;
  }
  try {
    await supabaseFetch(`/rest/v1/email_queue?id=eq.${encodeURIComponent(queueRecord.id)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: payload
    });
    return { ...queueRecord, ...payload };
  } catch (error) {
    console.error("[email-queue] Queue update failed:", error.message);
    return { ...queueRecord, ...payload, queue_error: error.message };
  }
}

function emailQueuePatchAfterAttempt(result = {}, logRecord = {}, queueRecord = {}, context = {}) {
  const now = nowIso();
  const status = normalizeEmailDeliveryStatus(result);
  const attemptCount = logRecord?.attempt_count || Number(queueRecord.attempt_count || 0) + 1;
  const accepted = isEmailAccepted(result);
  const sensitive = isSensitiveQueuedEmail(context);
  const canRetry = !accepted &&
    !sensitive &&
    isTemporaryEmailFailure(result.errorCode) &&
    attemptCount < Number(queueRecord.max_attempts || EMAIL_QUEUE_MAX_ATTEMPTS);
  const terminalStatus = accepted ? "sent" : canRetry ? "queued" : status;
  const nextAttemptAt = canRetry
    ? new Date(Date.now() + emailRetryDelayMs(attemptCount)).toISOString()
    : null;
  return {
    email_log_id: logRecord?.id || queueRecord.email_log_id || null,
    provider_message_id: result.messageId || result.provider_id || queueRecord.provider_message_id || null,
    status: terminalStatus,
    attempt_count: attemptCount,
    last_attempt_at: now,
    next_attempt_at: nextAttemptAt,
    sent_at: accepted ? (queueRecord.sent_at || now) : queueRecord.sent_at || null,
    delivered_at: status === "delivered" ? (queueRecord.delivered_at || now) : queueRecord.delivered_at || null,
    failed_at: ["failed", "bounced", "complained", "cancelled"].includes(terminalStatus) ? now : queueRecord.failed_at || null,
    last_error_code: result.errorCode || null,
    last_error_message: result.errorMessage || null,
    payload: accepted || (!canRetry && !sensitive)
      ? { ...(queueRecord.payload || {}), text: "", html: "", redacted: true, redaction_reason: accepted ? "redacted_after_provider_acceptance" : "redacted_after_terminal_failure" }
      : queueRecord.payload || emailQueuePayloadForStorage({}, context)
  };
}

async function processEmailQueueRecord(queueRecord = {}, message = null, context = {}, existingLog = null) {
  const queuedMessage = message || emailMessageFromQueuePayload(queueRecord.payload);
  const deliveryContext = normalizeEmailDeliveryContext(queuedMessage || { to: queueRecord.recipient_email, subject: queueRecord.payload?.subject || "" }, {
    ...context,
    email_type: queueRecord.email_type,
    event_type: queueRecord.event_type || queueRecord.email_type,
    recipient_user_id: queueRecord.recipient_user_id,
    restaurant_id: queueRecord.restaurant_id,
    reservation_id: queueRecord.reservation_id,
    campaign_id: queueRecord.campaign_id,
    locale: queueRecord.locale,
    template_version: queueRecord.template_version,
    idempotency_key: queueRecord.idempotency_key
  });
  const currentLog = existingLog || await findEmailDeliveryLog(deliveryContext.idempotency_key);
  if (!queuedMessage) {
    const result = {
      to: queueRecord.recipient_email,
      from: EMAIL_FROM,
      subject: queueRecord.payload?.subject || "",
      text: "",
      html: "",
      accepted: false,
      provider: "resend",
      messageId: null,
      provider_id: null,
      status: "failed",
      delivery: "failed",
      errorCode: "EMAIL_QUEUE_PAYLOAD_REDACTED",
      errorMessage: "This queued email cannot be retried because its secure link was not persisted.",
      providerResponse: {},
      created_at: nowIso()
    };
    const logRecord = await recordEmailDelivery(result, deliveryContext, currentLog);
    const nextQueue = await patchEmailQueueRecord(queueRecord, emailQueuePatchAfterAttempt(result, logRecord, queueRecord, deliveryContext));
    return { result, logRecord, queueRecord: nextQueue };
  }
  await patchEmailQueueRecord(queueRecord, {
    status: "queued",
    last_attempt_at: nowIso()
  });
  const result = await emailService.sendEmail(queuedMessage);
  const logRecord = await recordEmailDelivery(result, deliveryContext, currentLog);
  const nextQueue = await patchEmailQueueRecord(queueRecord, emailQueuePatchAfterAttempt(result, logRecord, queueRecord, deliveryContext));
  return { result, logRecord, queueRecord: nextQueue };
}

async function updateEmailQueueFromProviderEvent(event = {}) {
  if (!event.provider_message_id) return { updated: false, reason: "MISSING_PROVIDER_MESSAGE_ID" };
  const patch = {
    status: event.status,
    delivered_at: event.status === "delivered" ? nowIso() : undefined,
    failed_at: ["failed", "bounced", "complained"].includes(event.status) ? nowIso() : undefined,
    provider_message_id: event.provider_message_id
  };
  if (!supabaseConfigured) {
    ensureDemo();
    const row = demo.emailQueue.find((item) => item.provider_message_id === event.provider_message_id);
    if (!row) return { updated: false, reason: "EMAIL_QUEUE_NOT_FOUND" };
    Object.assign(row, patch, { updated_at: nowIso() });
    return { updated: true, email_queue_id: row.id, status: event.status };
  }
  const rows = await supabaseFetch(`/rest/v1/email_queue?select=*&provider_message_id=eq.${encodeURIComponent(event.provider_message_id)}&limit=1`, { service: true }).catch(() => []);
  const row = rows?.[0];
  if (!row) return { updated: false, reason: "EMAIL_QUEUE_NOT_FOUND" };
  await patchEmailQueueRecord(row, patch);
  return { updated: true, email_queue_id: row.id, status: event.status };
}

function resultFromExistingEmailLog(message = {}, context = {}, existingLog = {}, decision = {}) {
  const status = emailLogStatus(existingLog);
  const accepted = ["queued", "sent", "delivered"].includes(status);
  const errorCode = emailLogLastErrorCode(existingLog) || (decision.reason === "retry_limit_reached" ? "EMAIL_RETRY_LIMIT_REACHED" : null);
  const errorMessage = clean(existingLog.last_error_message || existingLog.error_message || existingLog.metadata?.error_message) ||
    (decision.reason === "already_accepted"
      ? "Email was already accepted by the provider for this idempotency key."
      : "Email delivery was not retried for this idempotency key.");
  return {
    to: clean(message.to),
    from: clean(message.from || EMAIL_FROM),
    subject: clean(message.subject || existingLog.subject),
    text: "",
    html: "",
    accepted,
    provider: clean(existingLog.provider || "resend"),
    messageId: clean(existingLog.provider_message_id || existingLog.provider_id),
    provider_id: clean(existingLog.provider_message_id || existingLog.provider_id),
    status,
    delivery: status,
    errorCode,
    errorMessage: accepted ? null : errorMessage,
    providerResponse: {},
    duplicate_suppressed: true,
    suppression_reason: decision.reason,
    created_at: nowIso()
  };
}

async function findEmailDeliveryLog(idempotencyKey) {
  const key = clean(idempotencyKey);
  if (!key) return null;
  if (!supabaseConfigured) {
    ensureDemo();
    return demo.emailLogs.find((item) => item.idempotency_key === key) || null;
  }
  try {
    const rows = await supabaseFetch(`/rest/v1/email_logs?select=*&idempotency_key=eq.${encodeURIComponent(key)}&limit=1`, { service: true });
    return rows?.[0] || null;
  } catch (error) {
    console.error("[email-log] Could not read idempotency log:", error.message);
    return null;
  }
}

function emailLogPayload(result = {}, context = {}, existingLog = null) {
  const now = nowIso();
  const status = normalizeEmailDeliveryStatus(result);
  const attemptCount = emailLogAttemptCount(existingLog) + 1;
  const metadata = emailLogMetadata(result, {
    ...context,
    attempt_count: attemptCount,
    duplicate_suppressed: Boolean(result.duplicate_suppressed),
    suppression_reason: result.suppression_reason || null
  });
  return {
    id: existingLog?.id || crypto.randomUUID(),
    reservation_id: context.reservation_id || null,
    restaurant_id: context.restaurant_id || null,
    guest_id: context.guest_id || null,
    campaign_id: context.campaign_id || null,
    recipient_user_id: context.recipient_user_id || null,
    email_type: context.email_type || context.event_type || "email",
    event_type: context.event_type || context.email_type || "email",
    recipient: result.to,
    recipient_email: result.to,
    subject: result.subject,
    provider: result.provider || "resend",
    provider_id: result.messageId || result.provider_id || null,
    provider_message_id: result.messageId || result.provider_id || null,
    delivery_status: status,
    status,
    attempt_count: attemptCount,
    last_error_code: result.errorCode || null,
    last_error_message: result.errorMessage || null,
    error_message: result.errorMessage || null,
    sent_at: ["queued", "sent", "delivered"].includes(status) ? (existingLog?.sent_at || now) : existingLog?.sent_at || null,
    delivered_at: status === "delivered" ? (existingLog?.delivered_at || now) : existingLog?.delivered_at || null,
    failed_at: ["failed", "bounced", "complained", "cancelled"].includes(status) ? now : existingLog?.failed_at || null,
    locale: context.locale || "en",
    template_version: context.template_version || EMAIL_TEMPLATE_VERSION,
    idempotency_key: context.idempotency_key || null,
    metadata,
    created_at: existingLog?.created_at || now,
    updated_at: now
  };
}

function legacyEmailEventPayload(result = {}, context = {}) {
  return {
    reservation_id: context.reservation_id || null,
    event_type: context.event_type || "notification",
    recipient: result.to,
    subject: result.subject,
    provider: result.provider || "resend",
    provider_id: result.messageId || result.provider_id || null,
    status: normalizeEmailDeliveryStatus(result)
  };
}

async function recordEmailDelivery(result = {}, context = {}, existingLog = null) {
  const payload = emailLogPayload(result, context, existingLog);
  if (supabaseConfigured) {
    try {
      await supabaseFetch("/rest/v1/email_events", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: legacyEmailEventPayload(result, context)
      });
    } catch (error) {
      console.error("[email-log] Legacy email event write failed:", error.message);
    }
    try {
      if (existingLog?.id) {
        await supabaseFetch(`/rest/v1/email_logs?id=eq.${encodeURIComponent(existingLog.id)}`, {
          method: "PATCH",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: payload
        });
      } else {
        await supabaseFetch("/rest/v1/email_logs", {
          method: "POST",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: payload
        });
      }
    } catch (error) {
      console.error("[email-log] Delivery log write failed:", error.message);
      return { ...payload, log_error: error.message };
    }
    return payload;
  }

  ensureDemo();
  demo.emailEvents.unshift({
    id: crypto.randomUUID(),
    ...legacyEmailEventPayload(result, context),
    error_code: result.errorCode || null,
    error_message: result.errorMessage || null,
    created_at: nowIso()
  });
  if (existingLog?.id) {
    const index = demo.emailLogs.findIndex((item) => item.id === existingLog.id);
    if (index >= 0) demo.emailLogs[index] = { ...demo.emailLogs[index], ...payload };
  } else {
    demo.emailLogs.unshift(payload);
  }
  return payload;
}

async function sendEmail(message, context = {}) {
  const deliveryContext = normalizeEmailDeliveryContext(message, context);
  const existingLog = await findEmailDeliveryLog(deliveryContext.idempotency_key);
  const decision = emailSendDecision(existingLog);
  if (!decision.shouldSend) {
    const result = resultFromExistingEmailLog(message, deliveryContext, existingLog, decision);
    const logRecord = await recordEmailDelivery(result, deliveryContext, existingLog);
    return {
      ...result,
      event_type: deliveryContext.event_type || "email",
      email_type: deliveryContext.email_type || deliveryContext.event_type || "email",
      reservation_id: deliveryContext.reservation_id || null,
      restaurant_id: deliveryContext.restaurant_id || null,
      recipient_user_id: deliveryContext.recipient_user_id || null,
      locale: deliveryContext.locale,
      template_version: deliveryContext.template_version,
      idempotencyKey: deliveryContext.idempotency_key,
      idempotency_key: deliveryContext.idempotency_key,
      attemptCount: logRecord?.attempt_count || emailLogAttemptCount(existingLog) + 1,
      attempt_count: logRecord?.attempt_count || emailLogAttemptCount(existingLog) + 1,
      emailLogId: logRecord?.id || existingLog?.id || null,
      emailQueueId: null,
      email_queue_id: null
    };
  }
  const queueRecord = await createEmailQueueRecord(message, deliveryContext, existingLog);
  const processed = await processEmailQueueRecord(queueRecord, message, deliveryContext, existingLog);
  const result = processed.result;
  const logRecord = processed.logRecord;
  return {
    ...result,
    event_type: deliveryContext.event_type || "email",
    email_type: deliveryContext.email_type || deliveryContext.event_type || "email",
    reservation_id: deliveryContext.reservation_id || null,
    restaurant_id: deliveryContext.restaurant_id || null,
    recipient_user_id: deliveryContext.recipient_user_id || null,
    locale: deliveryContext.locale,
    template_version: deliveryContext.template_version,
    idempotencyKey: deliveryContext.idempotency_key,
    idempotency_key: deliveryContext.idempotency_key,
    attemptCount: logRecord?.attempt_count || emailLogAttemptCount(existingLog) + 1,
    attempt_count: logRecord?.attempt_count || emailLogAttemptCount(existingLog) + 1,
    emailLogId: logRecord?.id || existingLog?.id || null,
    emailQueueId: processed.queueRecord?.id || queueRecord?.id || null,
    email_queue_id: processed.queueRecord?.id || queueRecord?.id || null,
    queue_status: processed.queueRecord?.status || null
  };
}

async function recordEmailConfigurationFailure(message, context = {}, errorCode = "EMAIL_CONFIGURATION_ERROR", errorMessage = "Email could not be queued because required recipient configuration is missing or invalid.") {
  const deliveryContext = normalizeEmailDeliveryContext(message, context);
  const existingLog = await findEmailDeliveryLog(deliveryContext.idempotency_key);
  const decision = emailSendDecision(existingLog);
  if (!decision.shouldSend) {
    const result = resultFromExistingEmailLog(message, deliveryContext, existingLog, decision);
    return {
      ...result,
      event_type: deliveryContext.event_type || "email",
      email_type: deliveryContext.email_type || deliveryContext.event_type || "email",
      reservation_id: deliveryContext.reservation_id || null,
      restaurant_id: deliveryContext.restaurant_id || null,
      recipient_user_id: deliveryContext.recipient_user_id || null,
      locale: deliveryContext.locale,
      template_version: deliveryContext.template_version,
      idempotencyKey: deliveryContext.idempotency_key,
      idempotency_key: deliveryContext.idempotency_key,
      attemptCount: emailLogAttemptCount(existingLog),
      attempt_count: emailLogAttemptCount(existingLog),
      emailLogId: existingLog?.id || null,
      emailQueueId: null,
      email_queue_id: null
    };
  }
  const queueRecord = await createEmailQueueRecord(message, deliveryContext, existingLog);
  const result = {
    to: lower(message.to || deliveryContext.recipient_email),
    from: clean(message.from || EMAIL_FROM),
    subject: clean(message.subject),
    text: "",
    html: "",
    accepted: false,
    provider: "resend",
    messageId: null,
    provider_id: null,
    status: "failed",
    delivery: "failed",
    errorCode,
    errorMessage,
    providerResponse: {},
    created_at: nowIso()
  };
  const logRecord = await recordEmailDelivery(result, deliveryContext, existingLog);
  const nextQueue = await patchEmailQueueRecord(queueRecord, emailQueuePatchAfterAttempt(result, logRecord, queueRecord, deliveryContext));
  return {
    ...result,
    event_type: deliveryContext.event_type || "email",
    email_type: deliveryContext.email_type || deliveryContext.event_type || "email",
    reservation_id: deliveryContext.reservation_id || null,
    restaurant_id: deliveryContext.restaurant_id || null,
    recipient_user_id: deliveryContext.recipient_user_id || null,
    locale: deliveryContext.locale,
    template_version: deliveryContext.template_version,
    idempotencyKey: deliveryContext.idempotency_key,
    idempotency_key: deliveryContext.idempotency_key,
    attemptCount: logRecord?.attempt_count || emailLogAttemptCount(existingLog) + 1,
    attempt_count: logRecord?.attempt_count || emailLogAttemptCount(existingLog) + 1,
    emailLogId: logRecord?.id || existingLog?.id || null,
    emailQueueId: nextQueue?.id || queueRecord?.id || null,
    email_queue_id: nextQueue?.id || queueRecord?.id || null,
    queue_status: nextQueue?.status || "failed"
  };
}

function emailResultList(results = []) {
  return Array.isArray(results) ? results.filter(Boolean) : [results].filter(Boolean);
}

function emailDeliverySummary(results = []) {
  const list = emailResultList(results);
  return {
    provider: "resend",
    configured: emailService.configured,
    accepted_count: list.filter(isEmailAccepted).length,
    failed_count: list.filter((item) => item && !isEmailAccepted(item)).length,
    guest_confirmation_accepted: list.some((item) => item.event_type === "guest_request_received" && isEmailAccepted(item)),
    restaurant_notification_accepted: list.some((item) => item.event_type === "restaurant_request_notice" && isEmailAccepted(item)),
    admin_notification_accepted: list.some((item) => item.event_type === "admin_request_notice" && isEmailAccepted(item)),
    errors: list
      .filter((item) => item && !isEmailAccepted(item))
      .map((item) => ({
        event_type: item.event_type,
        recipient: item.to,
        status: item.status,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        attemptCount: item.attemptCount || item.attempt_count || null,
        duplicateSuppressed: Boolean(item.duplicate_suppressed),
        idempotencyKey: item.idempotencyKey || item.idempotency_key || null
      }))
  };
}

function emailHtmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appEmailHtml(subject, body, cta = null, options = {}) {
  const brand = clean(options.brand || "SmartTable");
  const preheader = clean(options.preheader);
  const footer = clean(options.footer);
  const paragraphs = clean(body)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${emailHtmlEscape(line)}</p>`)
    .join("");
  const button = cta?.url
    ? `<p><a href="${emailHtmlEscape(cta.url)}" style="display:inline-block;margin-top:8px;padding:10px 14px;background:#0f735d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">${emailHtmlEscape(clean(cta.label || "Open SmartTable"))}</a></p>`
    : "";
  const preheaderHtml = preheader
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${emailHtmlEscape(preheader)}</span>`
    : "";
  const footerHtml = footer
    ? `<p style="margin-top:24px;color:#68746f;font-size:13px;line-height:1.5">${emailHtmlEscape(footer)}</p>`
    : "";
  return `${preheaderHtml}<div style="font-family:Inter,Arial,sans-serif;color:#173d33;line-height:1.55;max-width:640px;margin:0 auto;padding:24px"><p style="font-weight:800;color:#0f735d;margin:0 0 18px">${emailHtmlEscape(brand)}</p><h2 style="font-size:24px;line-height:1.25;margin:0 0 16px">${emailHtmlEscape(subject)}</h2>${paragraphs}${button}${footerHtml}</div>`;
}

async function logAuthProviderEmail({ to, subject, eventType, accepted = true, errorCode = null, errorMessage = null, locale = "en", idempotencyKey = "" }) {
  const result = {
    to,
    from: "Supabase Auth",
    subject,
    text: "",
    html: "",
    accepted,
    provider: "supabase_auth",
    messageId: null,
    provider_id: null,
    status: accepted ? "queued" : "failed",
    delivery: accepted ? "queued" : "failed",
    errorCode,
    errorMessage,
    created_at: nowIso()
  };
  const deliveryContext = normalizeEmailDeliveryContext(result, {
    event_type: eventType || "auth_email",
    email_type: eventType || "auth_email",
    locale,
    template_version: "supabase_auth",
    idempotency_key: idempotencyKey || hashEmailValue(`${eventType || "auth_email"}:${lower(to)}:${Math.floor(Date.now() / 600000)}`)
  });
  const existingLog = await findEmailDeliveryLog(deliveryContext.idempotency_key);
  const logRecord = await recordEmailDelivery(result, deliveryContext, existingLog);
  return {
    ...result,
    event_type: eventType || "auth_email",
    reservation_id: null,
    restaurant_id: null,
    locale: deliveryContext.locale,
    template_version: deliveryContext.template_version,
    idempotencyKey: deliveryContext.idempotency_key,
    idempotency_key: deliveryContext.idempotency_key,
    attemptCount: logRecord?.attempt_count || emailLogAttemptCount(existingLog) + 1
  };
}

async function sendGuestRegistrationEmail({ email, guestName, lang, userId = "" }) {
  const rows = await serverContentRows();
  const language = normalizeLanguage(lang || "en");
  const context = {
    guest_name: clean(guestName) || clean(email),
    login_url: `${PUBLIC_BASE_URL}/login`,
    marketplace_url: PUBLIC_BASE_URL
  };
  const subject = template(contentValue(rows, "email_guest_registration_subject", "Welcome to SmartTable", language), context);
  const body = template(contentValue(rows, "email_guest_registration_body", "Hi {{guest_name}}, your SmartTable account is ready.", language), context);
  const ctaLabel = contentValue(rows, "email_cta_explore_restaurants", "Explore Restaurants", language);
  return sendEmail({
    to: email,
    subject,
    text: `${body}\n\n${context.marketplace_url}`,
    html: appEmailHtml(subject, body, { label: ctaLabel, url: context.marketplace_url })
  }, {
    event_type: "guest_registration",
    recipient_user_id: userId,
    locale: language,
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: hashEmailValue(`welcome:${userId || lower(email)}`)
  });
}

async function sendGuestVerificationEmail({ email, guestName, lang, token = "", userId = "" }) {
  const rows = await serverContentRows();
  const language = normalizeLanguage(lang || "en");
  const verificationUrl = token
    ? `${PUBLIC_BASE_URL}/verify-email?token=${encodeURIComponent(token)}`
    : `${PUBLIC_BASE_URL}/verify-email`;
  const context = {
    guest_name: clean(guestName) || clean(email),
    verification_url: verificationUrl
  };
  const subject = template(contentValue(rows, "email_verification_subject", "Verify your SmartTable email", language), context);
  const body = template(contentValue(rows, "email_verification_body", "Hi {{guest_name}}, verify your SmartTable email address here: {{verification_url}}", language), context);
  const ctaLabel = contentValue(rows, "email_cta_verify_email", "Verify email", language);
  return sendEmail({
    to: email,
    subject,
    text: `${body}\n\n${verificationUrl}`,
    html: appEmailHtml(subject, body, { label: ctaLabel, url: verificationUrl })
  }, {
    event_type: "email_verification",
    recipient_user_id: userId,
    locale: language,
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: hashEmailValue(`verification:${userId || lower(email)}:${token ? hashEmailValue(token).slice(0, 24) : Math.floor(Date.now() / 600000)}`)
  });
}

async function sendPasswordResetEmail({ email, guestName, lang, token, userId = "" }) {
  const rows = await serverContentRows();
  const language = normalizeLanguage(lang || "en");
  const resetUrl = `${PUBLIC_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const context = {
    guest_name: clean(guestName) || clean(email),
    reset_url: resetUrl
  };
  const subject = template(contentValue(rows, "email_password_reset_subject", "Reset your SmartTable password", language), context);
  const body = template(contentValue(rows, "email_password_reset_body", "If you requested a SmartTable password reset, use this link: {{reset_url}}.", language), context);
  const ctaLabel = contentValue(rows, "email_cta_reset_password", "Reset password", language);
  return sendEmail({
    to: email,
    subject,
    text: `${body}\n\n${resetUrl}`,
    html: appEmailHtml(subject, body, { label: ctaLabel, url: resetUrl })
  }, {
    event_type: "password_reset",
    recipient_user_id: userId,
    locale: language,
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: hashEmailValue(`password-reset:${hashEmailValue(token).slice(0, 24)}`)
  });
}

async function sendPasswordChangedEmail({ email, guestName, lang, userId = "", requestId = "" }) {
  const rows = await serverContentRows();
  const language = normalizeLanguage(lang || "en");
  const context = {
    guest_name: clean(guestName) || clean(email),
    account_url: `${PUBLIC_BASE_URL}/account/security`
  };
  const subject = template(contentValue(rows, "email_password_changed_subject", "Your SmartTable password was changed", language), context);
  const body = template(contentValue(rows, "email_password_changed_body", "Hi {{guest_name}}, your SmartTable password was changed successfully.", language), context);
  const ctaLabel = contentValue(rows, "email_cta_my_account", "Open my account", language);
  return sendEmail({
    to: email,
    subject,
    text: `${body}\n\n${context.account_url}`,
    html: appEmailHtml(subject, body, { label: ctaLabel, url: context.account_url })
  }, {
    event_type: "password_changed",
    recipient_user_id: userId,
    locale: language,
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: hashEmailValue(`password_changed:${userId || lower(email)}:${clean(requestId) || Math.floor(Date.now() / 600000)}`)
  });
}

function reservationEmailText(row, lang = "en") {
  const language = normalizeLanguage(lang);
  const date = row.reservation_date || row.offer_date;
  const time = row.reservation_time || row.offer_time;
  const guests = Number(row.party_size) === 1
    ? { en: "guest", es: "persona", hu: "vend\u00e9g" }[language]
    : { en: "guests", es: "personas", hu: "vend\u00e9g" }[language];
  if (language === "hu") return `${row.restaurant_name}, ${date} ${time}, ${row.party_size} ${guests}, ${row.discount_percent || row.discount_value}% kedvezm\u00e9ny`;
  if (language === "es") return `${row.restaurant_name}, ${date} a las ${time}, ${row.party_size} ${guests}, ${row.discount_percent || row.discount_value}% de descuento`;
  return `${row.restaurant_name}, ${date} at ${time}, ${row.party_size} ${guests}, ${row.discount_percent || row.discount_value}% off`;
}

async function sendReservationCreatedEmails(row) {
  const rows = await serverContentRows();
  const guestLang = normalizeLanguage(row.guest_language || row.language || row.lang || "en");
  const restaurantLang = normalizeLanguage(row.restaurant_language || "en");
  const context = {
    ...emailContext(row),
    reservation_summary: reservationEmailText(row, guestLang),
    my_reservations_url: `${PUBLIC_BASE_URL}/account/reservations`
  };
  const restaurantContext = { ...emailContext(row), reservation_summary: reservationEmailText(row, restaurantLang) };
  const guestSubject = template(contentValue(rows, "email_guest_received_subject", "Your Smart Table reservation request was received", guestLang), context);
  const guestBodyBase = template(contentValue(rows, "email_guest_received_body", "Hi {{guest_name}}, we received your reservation request for {{reservation_summary}}. Reference: {{reference}}.", guestLang), context);
  const guestPendingNotice = template(contentValue(rows, "email_guest_pending_notice", "Status: pending. This is a reservation request, not a confirmed reservation yet. The restaurant must accept it before it is confirmed.", guestLang), context);
  const guestBody = [guestBodyBase, guestPendingNotice].filter(Boolean).join("\n\n");
  const restaurantSubject = template(contentValue(rows, "email_restaurant_new_subject", "New reservation request from Smart Table", restaurantLang), restaurantContext);
  const restaurantBody = template(contentValue(rows, "email_restaurant_new_body", "New pending reservation request for {{restaurant_name}}. Reference: {{reference}}. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.", restaurantLang), restaurantContext);
  const reservationsCta = contentValue(rows, "email_cta_my_reservations", "View My Reservations", guestLang);
  const dashboardCta = contentValue(rows, "email_cta_open_dashboard", "Open dashboard", restaurantLang);
  const partnerContext = {
    reservation_id: row.reservation_id,
    restaurant_id: row.restaurant_id,
    event_type: "restaurant_request_notice",
    locale: restaurantLang,
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: hashEmailValue(`reservation-request-partner:${row.reservation_id}`)
  };
  const partnerMessage = {
    to: row.restaurant_email,
    subject: restaurantSubject,
    text: `${restaurantBody} Dashboard: ${context.dashboard_url}`,
    html: appEmailHtml(restaurantSubject, restaurantBody, { label: dashboardCta, url: context.dashboard_url })
  };
  const partnerEmail = isValidSignupEmail(row.restaurant_email)
    ? sendEmail(partnerMessage, partnerContext)
    : recordEmailConfigurationFailure(
      partnerMessage,
      partnerContext,
      row.restaurant_email ? "INVALID_RESTAURANT_NOTIFICATION_EMAIL" : "MISSING_RESTAURANT_NOTIFICATION_EMAIL",
      row.restaurant_email
        ? "The restaurant reservation notification email is invalid."
        : "The restaurant reservation notification email is missing."
    );
  const messages = [
    sendEmail({
      to: row.guest_email,
      subject: guestSubject,
      text: `${guestBody}\n\n${context.my_reservations_url}`,
      html: appEmailHtml(guestSubject, guestBody, { label: reservationsCta, url: context.my_reservations_url })
    }, {
      reservation_id: row.reservation_id,
      restaurant_id: row.restaurant_id,
      event_type: "guest_request_received",
      locale: guestLang,
      template_version: EMAIL_TEMPLATE_VERSION,
      idempotency_key: hashEmailValue(`reservation-request-guest:${row.reservation_id}`)
    }),
    partnerEmail
  ];

  if (ADMIN_NOTIFICATION_EMAIL) {
    const adminSubject = template(contentValue(rows, "email_admin_new_subject", "Smart Table admin notice: new reservation request", "en"), context);
    const adminBody = template(contentValue(rows, "email_admin_new_body", "A new reservation was created for {{restaurant_name}}. {{reservation_summary}}.", "en"), context);
    messages.push(sendEmail({
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: adminSubject,
      text: adminBody,
      html: `<h2>${emailHtmlEscape(adminSubject)}</h2><p>${emailHtmlEscape(adminBody)}</p>`
    }, {
      reservation_id: row.reservation_id,
      restaurant_id: row.restaurant_id,
      event_type: "admin_request_notice",
      locale: "en",
      template_version: EMAIL_TEMPLATE_VERSION,
      idempotency_key: hashEmailValue(`reservation-request-admin:${row.reservation_id}`)
    }));
  }

  return Promise.all(messages);
}

async function sendReservationStatusEmail(row) {
  const status = normalizeReservationStatus(row?.status);
  if (!["accepted", "rejected", "cancelled", "completed"].includes(status)) return null;
  if (status === "completed") {
    try {
      return await sendPostVisitFeedbackEmail(row);
    } catch (error) {
      if (error.status === 409) {
        return {
          to: row?.guest_email || "",
          from: EMAIL_FROM,
          subject: "",
          text: "",
          html: "",
          accepted: false,
          provider: "resend",
          messageId: null,
          provider_id: null,
          status: "cancelled",
          delivery: "cancelled",
          event_type: "booking_completed",
          reservation_id: row?.reservation_id || null,
          restaurant_id: row?.restaurant_id || null,
          errorCode: error.code || "POST_VISIT_NOT_ELIGIBLE",
          errorMessage: error.message,
          email_eligible: false,
          eligibility: error.details || null,
          created_at: nowIso()
        };
      }
      throw error;
    }
  }
  const rows = await serverContentRows();
  const lang = normalizeLanguage(row.guest_language || row.language || row.lang || "en");
  const context = {
    ...emailContext(row),
    reservation_summary: reservationEmailText(row, lang),
    my_reservations_url: `${PUBLIC_BASE_URL}/account/reservations`,
    marketplace_url: PUBLIC_BASE_URL
  };
  const subjectKey = status === "accepted" ? "email_guest_accepted_subject" : status === "rejected" ? "email_guest_rejected_subject" : "email_guest_cancelled_subject";
  const bodyKey = status === "accepted" ? "email_guest_accepted_body" : status === "rejected" ? "email_guest_rejected_body" : "email_guest_cancelled_body";
  const noticeKey = status === "accepted" ? "email_guest_accepted_notice" : status === "rejected" ? "email_guest_rejected_notice" : "email_guest_cancelled_notice";
  const subject = template(contentValue(rows, subjectKey, status === "accepted" ? "Your reservation was confirmed" : status === "rejected" ? "Your reservation request was not confirmed" : "Your reservation was cancelled", lang), context);
  const messageBase = template(contentValue(rows, bodyKey, "{{restaurant_name}} updated your reservation: {{reservation_summary}}. Reference: {{reference}}.", lang), context);
  const notice = template(contentValue(rows, noticeKey, status === "accepted" ? "Status: accepted. Your reservation is confirmed by the restaurant." : status === "rejected" ? "Status: declined. You can return to SmartTable to find another available table." : "Status: cancelled. This reservation is no longer active.", lang), context);
  const message = [messageBase, notice].filter(Boolean).join("\n\n");
  const ctaLabel = status === "rejected"
    ? contentValue(rows, "email_cta_find_another_table", "Find another table", lang)
    : contentValue(rows, "email_cta_my_reservations", "View My Reservations", lang);
  const ctaUrl = status === "rejected" ? context.marketplace_url : context.my_reservations_url;
  const idempotencyScope = status === "accepted"
    ? `reservation-accepted:${row.reservation_id}`
    : status === "rejected"
      ? `reservation-declined:${row.reservation_id}`
      : `reservation-cancelled-guest:${row.reservation_id}`;
  const guestEmail = sendEmail({
    to: row.guest_email,
    subject,
    text: `${message}\n\n${ctaUrl}`,
    html: appEmailHtml(subject, message, { label: ctaLabel, url: ctaUrl })
  }, {
    reservation_id: row.reservation_id,
    restaurant_id: row.restaurant_id,
    event_type: `reservation_${status}`,
    locale: lang,
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: hashEmailValue(idempotencyScope)
  });
  if (status === "cancelled") {
    return Promise.all([guestEmail, sendRestaurantGuestCancellationNotice(row)]).then((results) => results.filter(Boolean));
  }
  return guestEmail;
}

async function createGuestPostVisitNotification(row) {
  if (!row?.guest_email) return null;
  const rows = await serverContentRows();
  const lang = normalizeLanguage(row.guest_language || row.language || row.lang || "en");
  const context = emailContext(row);
  const existingFilter = (item) => item?.reservation_id === row.reservation_id && item?.type === "booking_completed";
  if (!supabaseConfigured) {
    ensureDemo();
    const existing = demo.guestNotifications.find(existingFilter);
    if (existing) return existing;
  } else {
    const existing = await supabaseFetch(`/rest/v1/guest_notifications?select=*&reservation_id=eq.${encodeURIComponent(row.reservation_id)}&type=eq.booking_completed&limit=1`, { service: true }).catch(() => []);
    if (existing?.[0]) return existing[0];
  }
  const title = template(contentValue(rows, "post_visit_notification_title", "How was {{restaurant_name}}?", lang), context);
  const message = template(contentValue(rows, "post_visit_notification_message", "Rate your visit and upload dining photos after your SmartTable reservation.", lang), context);
  const cta = contentValue(rows, "post_visit_notification_cta", "Rate your visit", lang);
  const notification = {
    id: crypto.randomUUID(),
    type: "booking_completed",
    reservation_id: row.reservation_id,
    restaurant_id: row.restaurant_id,
    guest_email: lower(row.guest_email),
    profile_key: aiProfileKey(row.guest_email),
    title,
    message,
    cta,
    url: context.rewards_url,
    read_at: null,
    created_at: nowIso()
  };

  if (!supabaseConfigured) {
    ensureDemo();
    demo.guestNotifications.unshift(notification);
    demo.notificationLogs.unshift({
      id: crypto.randomUUID(),
      restaurant_id: row.restaurant_id,
      profile_key: notification.profile_key,
      notification_type: notification.type,
      title,
      message,
      channel: "in_app",
      status: "queued",
      metadata: { reservation_id: row.reservation_id, url: notification.url },
      created_at: nowIso()
    });
    return notification;
  }

  await supabaseFetch("/rest/v1/guest_notifications", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: notification
  }).catch(() => null);
  await supabaseFetch("/rest/v1/notification_logs", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      restaurant_id: row.restaurant_id,
      profile_key: notification.profile_key,
      notification_type: notification.type,
      title,
      message,
      channel: "in_app",
      status: "queued",
      metadata: { reservation_id: row.reservation_id, url: notification.url }
    }
  }).catch(() => null);
  return notification;
}

async function createGuestReservationNotification(row, {
  type,
  titleKey,
  messageKey,
  ctaKey,
  fallbackTitle,
  fallbackMessage,
  fallbackCta,
  url
}) {
  if (!row?.guest_email) return null;
  const rows = await serverContentRows();
  const lang = normalizeLanguage(row.guest_language || row.language || row.lang || "en");
  const context = { ...emailContext(row), reservation_summary: reservationEmailText(row, lang) };
  const title = template(contentValue(rows, titleKey, fallbackTitle, lang), context);
  const message = template(contentValue(rows, messageKey, fallbackMessage, lang), context);
  const notification = {
    id: crypto.randomUUID(),
    type: clean(type || "reservation_update"),
    reservation_id: row.reservation_id,
    restaurant_id: row.restaurant_id,
    guest_email: lower(row.guest_email),
    profile_key: aiProfileKey(row.guest_email),
    title,
    message,
    cta: contentValue(rows, ctaKey, fallbackCta, lang),
    url: url || `${PUBLIC_BASE_URL}/account`,
    read_at: null,
    created_at: nowIso()
  };

  if (!supabaseConfigured) {
    ensureDemo();
    demo.guestNotifications.unshift(notification);
    demo.notificationLogs.unshift({
      id: crypto.randomUUID(),
      restaurant_id: row.restaurant_id,
      profile_key: notification.profile_key,
      notification_type: notification.type,
      title,
      message,
      channel: "in_app",
      status: "queued",
      metadata: { reservation_id: row.reservation_id, url: notification.url },
      created_at: nowIso()
    });
    return notification;
  }

  await supabaseFetch("/rest/v1/guest_notifications", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: notification
  }).catch(() => null);
  await supabaseFetch("/rest/v1/notification_logs", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      restaurant_id: row.restaurant_id,
      profile_key: notification.profile_key,
      notification_type: notification.type,
      title,
      message,
      channel: "in_app",
      status: "queued",
      metadata: { reservation_id: row.reservation_id, url: notification.url }
    }
  }).catch(() => null);
  return notification;
}

function bookingStartDate(booking = {}) {
  const date = clean(booking.reservation_date || booking.offer_date);
  const time = clean(booking.reservation_time || booking.offer_time || booking.start_time || "23:59");
  if (!date) return null;
  const parsed = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function bookingEndDate(booking = {}) {
  const date = clean(booking.reservation_date || booking.offer_date);
  const explicitEndTime = clean(booking.reservation_end_time || booking.end_time);
  if (date && explicitEndTime) {
    const parsed = new Date(`${date}T${explicitEndTime.length === 5 ? `${explicitEndTime}:00` : explicitEndTime}`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const start = bookingStartDate(booking);
  if (!start) return null;
  const serviceMinutes = Math.max(30, numberOr(booking.average_service_minutes || booking.service_duration_minutes, 90));
  return new Date(start.getTime() + serviceMinutes * 60 * 1000);
}

function postVisitSendAfterDate(booking = {}) {
  const end = bookingEndDate(booking);
  return end ? new Date(end.getTime() + 60 * 60 * 1000) : null;
}

function postVisitEmailIdempotencyKey(booking = {}) {
  return hashEmailValue(`post-visit-feedback:${booking.reservation_id || booking.id}`);
}

function isRestaurantValidForPostVisit(row = {}) {
  const status = clean(row.restaurant_status || row.restaurantStatus || row.restaurant_active_status).toLowerCase();
  if (!status) return true;
  return ["approved", "active", "open", "published"].includes(status);
}

async function isGuestRecordValidForPostVisit(row = {}) {
  const guestId = clean(row.guest_id);
  if (!guestId) return true;
  if (!supabaseConfigured) {
    ensureDemo();
    const user = demo.users.find((item) => item.id === guestId);
    const profile = demo.profiles.find((item) => item.id === guestId);
    return Boolean(user && profile && profile.status !== "deleted" && !profile.deleted_at);
  }
  const profiles = await supabaseFetch(`/rest/v1/profiles?select=id,status,deleted_at&id=eq.${encodeURIComponent(guestId)}&limit=1`, { service: true }).catch(() => []);
  if (profiles?.[0]) return profiles[0].status !== "deleted" && !profiles[0].deleted_at;
  const guests = await supabaseFetch(`/rest/v1/guests?select=id,status,deleted_at&user_id=eq.${encodeURIComponent(guestId)}&limit=1`, { service: true }).catch(() => []);
  if (guests?.[0]) return guests[0].status !== "deleted" && !guests[0].deleted_at;
  return false;
}

async function reservationHasFeedbackSubmission(row = {}) {
  if (row.feedback_submitted === true) return true;
  const reservationId = clean(row.reservation_id || row.id);
  if (!reservationId) return false;
  if (!supabaseConfigured) {
    ensureDemo();
    return demo.consumptionUploads.some((item) => item.reservation_id === reservationId) ||
      demo.restaurantReviews.some((item) => item.reservation_id === reservationId);
  }
  const uploads = await supabaseFetch(`/rest/v1/dining_consumption_uploads?select=id&reservation_id=eq.${encodeURIComponent(reservationId)}&limit=1`, { service: true }).catch(() => []);
  if (uploads?.length) return true;
  const reviews = await supabaseFetch(`/rest/v1/restaurant_reviews?select=id&reservation_id=eq.${encodeURIComponent(reservationId)}&limit=1`, { service: true }).catch(() => []);
  return Boolean(reviews?.length);
}

async function hydratePostVisitRestaurantStatus(row = {}) {
  if (isRestaurantValidForPostVisit(row) && clean(row.restaurant_status || row.restaurantStatus || row.restaurant_active_status)) return row;
  const restaurantId = clean(row.restaurant_id);
  if (!restaurantId) return row;
  if (!supabaseConfigured) {
    ensureDemo();
    const restaurant = demo.restaurants.find((item) => item.id === restaurantId);
    return { ...row, restaurant_status: restaurant?.status || "missing" };
  }
  const restaurants = await supabaseFetch(`/rest/v1/restaurants?select=id,status&sys_id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { service: true })
    .catch(() => supabaseFetch(`/rest/v1/restaurants?select=id,status&id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { service: true }).catch(() => []));
  return { ...row, restaurant_status: restaurants?.[0]?.status || "missing" };
}

function shouldSendPostVisitEmail(booking = {}) {
  const status = normalizeReservationStatus(booking.status);
  if (status !== "completed") return false;
  if (!booking.guest_email) return false;
  if (!isRestaurantValidForPostVisit(booking)) return false;
  const sendAfter = postVisitSendAfterDate(booking);
  return Boolean(sendAfter && Date.now() >= sendAfter.getTime());
}

async function postVisitEmailEligibility(booking = {}) {
  const row = await hydratePostVisitRestaurantStatus(booking);
  const status = normalizeReservationStatus(row.status);
  if (!clean(row.reservation_id || row.id)) return { eligible: false, code: "POST_VISIT_RESERVATION_REQUIRED", row };
  if (!row.guest_email) return { eligible: false, code: "POST_VISIT_MISSING_GUEST_EMAIL", row };
  if (["no_show", "cancelled", "rejected", "declined"].includes(status)) return { eligible: false, code: "POST_VISIT_STATUS_EXCLUDED", row };
  if (status !== "completed") return { eligible: false, code: "POST_VISIT_NOT_COMPLETED", row };
  if (!isRestaurantValidForPostVisit(row)) return { eligible: false, code: "POST_VISIT_RESTAURANT_INACTIVE", row };
  if (!(await isGuestRecordValidForPostVisit(row))) return { eligible: false, code: "POST_VISIT_GUEST_INACTIVE", row };
  if (await reservationHasFeedbackSubmission(row)) return { eligible: false, code: "POST_VISIT_FEEDBACK_ALREADY_SUBMITTED", row };
  const sendAfter = postVisitSendAfterDate(row);
  if (!sendAfter) return { eligible: false, code: "POST_VISIT_MISSING_VISIT_TIME", row };
  if (Date.now() < sendAfter.getTime()) return { eligible: false, code: "POST_VISIT_TOO_EARLY", row, send_after: sendAfter.toISOString() };
  const existing = await findEmailDeliveryLog(postVisitEmailIdempotencyKey(row));
  if (existing && ["queued", "sent", "delivered"].includes(emailLogStatus(existing))) {
    return { eligible: false, code: "POST_VISIT_EMAIL_ALREADY_SENT", row, existing_email_log_id: existing.id };
  }
  return { eligible: true, code: "POST_VISIT_ELIGIBLE", row, send_after: sendAfter.toISOString() };
}

function postVisitEligibilityError(eligibility = {}) {
  const messages = {
    POST_VISIT_RESERVATION_REQUIRED: "Reservation is required.",
    POST_VISIT_MISSING_GUEST_EMAIL: "Guest email is required before sending post-visit feedback.",
    POST_VISIT_STATUS_EXCLUDED: "Post-visit email is not sent for no-show, cancelled, rejected, or declined reservations.",
    POST_VISIT_NOT_COMPLETED: "Post-visit email is sent only after the reservation is marked completed.",
    POST_VISIT_RESTAURANT_INACTIVE: "Post-visit email is not sent because the restaurant is no longer active.",
    POST_VISIT_GUEST_INACTIVE: "Post-visit email is not sent because the guest account is no longer active.",
    POST_VISIT_FEEDBACK_ALREADY_SUBMITTED: "Post-visit feedback was already submitted for this reservation.",
    POST_VISIT_MISSING_VISIT_TIME: "Post-visit email cannot be sent because the visit end time cannot be calculated.",
    POST_VISIT_TOO_EARLY: "Post-visit email can be sent only after the visit end time plus the configured one-hour delay.",
    POST_VISIT_EMAIL_ALREADY_SENT: "Post-visit feedback email was already sent for this reservation."
  };
  const error = new Error(messages[eligibility.code] || "Post-visit email is not eligible for this reservation.");
  error.status = 409;
  error.code = eligibility.code || "POST_VISIT_NOT_ELIGIBLE";
  error.details = eligibility;
  return error;
}

function buildPostVisitEmail(booking = {}, guest = {}, restaurant = {}, contentRows = []) {
  const row = {
    ...booking,
    guest_name: guest.name || booking.guest_name,
    guest_email: guest.email || booking.guest_email,
    restaurant_name: restaurant.name || booking.restaurant_name
  };
  const lang = normalizeLanguage(row.guest_language || row.language || row.lang || "en");
  const context = {
    ...emailContext(row),
    reservation_summary: reservationEmailText(row, lang),
    visit_date: row.reservation_date || row.offer_date || ""
  };
  const loyaltyEnabled = isLoyaltyRewardsWorking();
  const subject = template(contentValue(contentRows, "post_visit_email_subject", "How was your experience at {{restaurant_name}}?", lang), context);
  const preheader = template(contentValue(contentRows, "post_visit_email_preheader", "Share your SmartTable visit feedback after dining at {{restaurant_name}}.", lang), context);
  const baseBody = template(contentValue(contentRows, "post_visit_email_body", "Hi {{guest_name}},\n\nThank you for dining at {{restaurant_name}} through SmartTable.\n\nWe'd love to hear about your experience.\n\nPlease rate your visit:\n- Food\n- Service\n- Ambience\n- Overall experience\n\nYou can also share food or drink photos and a short note about what you ordered.\n\nYour feedback helps other guests discover great restaurants and helps SmartTable improve personalized dining recommendations.", lang), context);
  const loyaltyNote = loyaltyEnabled
    ? template(contentValue(contentRows, "post_visit_email_loyalty_note", "Eligible feedback may earn SmartTable loyalty points when the loyalty system is enabled for your account.", lang), context)
    : "";
  const body = [baseBody, loyaltyNote].filter(Boolean).join("\n\n");
  const footer = template(contentValue(contentRows, "post_visit_email_footer", "You are receiving this because you completed a SmartTable reservation at {{restaurant_name}}.", lang), context);
  const buttons = [
    [contentValue(contentRows, "post_visit_rate_button", "Rate your experience", lang), context.rate_url],
    [contentValue(contentRows, loyaltyEnabled ? "post_visit_upload_rewards_button" : "post_visit_upload_button", loyaltyEnabled ? "Upload photos & earn points" : "Upload photos", lang), context.photo_upload_url],
    [contentValue(contentRows, "post_visit_ordered_button", "Share what you ordered", lang), context.ordered_items_url]
  ];
  const buttonHtml = buttons.map(([label, url]) => `<a href="${emailHtmlEscape(url)}" style="display:inline-block;margin:6px 8px 6px 0;padding:10px 14px;background:#0f735d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">${emailHtmlEscape(label)}</a>`).join("");
  return {
    to: row.guest_email,
    subject,
    text: `${body}\n\n${buttons.map(([label, url]) => `${label}: ${url}`).join("\n")}\n\n${footer}`,
    html: appEmailHtml(subject, body, null, { preheader }).replace("</div>", `<p>${buttonHtml}</p><p style="margin-top:24px;color:#68746f;font-size:13px;line-height:1.5">${emailHtmlEscape(footer)}</p></div>`)
  };
}

async function sendPostVisitFeedbackEmail(row) {
  if (!row?.guest_email) return null;
  const eligibility = await postVisitEmailEligibility(row);
  if (!eligibility.eligible) throw postVisitEligibilityError(eligibility);
  const rows = await serverContentRows();
  const eligibleRow = eligibility.row || row;
  const emailMessage = buildPostVisitEmail(
    eligibleRow,
    { name: eligibleRow.guest_name, email: eligibleRow.guest_email },
    { name: eligibleRow.restaurant_name },
    rows
  );
  const email = await sendEmail(emailMessage, {
    reservation_id: eligibleRow.reservation_id,
    restaurant_id: eligibleRow.restaurant_id,
    event_type: "booking_completed",
    locale: eligibleRow.guest_language || eligibleRow.language || eligibleRow.lang || "en",
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: postVisitEmailIdempotencyKey(eligibleRow)
  });
  await createGuestPostVisitNotification(eligibleRow);
  return email;
}

async function sendPostVisitEmailForReservation(id, restaurantId = null) {
  const reservationId = clean(id);
  if (!reservationId) {
    const error = new Error("Reservation is required.");
    error.status = 400;
    throw error;
  }
  const rows = !supabaseConfigured
    ? reservationOverviewRows()
    : await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(reservationId)}`, { service: true });
  const row = (rows || []).find((item) => item.reservation_id === reservationId && (!restaurantId || item.restaurant_id === restaurantId));
  if (!row) {
    const error = new Error("Reservation not found.");
    error.status = 404;
    throw error;
  }
  return await sendPostVisitFeedbackEmail(row);
}

function authAttemptKey(email) {
  return lower(email) || "unknown";
}

function recordAuthAttempt(email, success = false) {
  if (supabaseConfigured) return { locked: false, remaining: 5 };
  ensureDemo();
  const key = authAttemptKey(email);
  const windowStart = Date.now() - 15 * 60 * 1000;
  demo.authAttempts = demo.authAttempts.filter((item) => item.created_at_ms > windowStart && item.key !== (success ? key : "__never__"));
  if (success) {
    demo.authAttempts = demo.authAttempts.filter((item) => item.key !== key);
    return { locked: false, remaining: 5 };
  }
  const failures = demo.authAttempts.filter((item) => item.key === key && !item.success).length;
  if (failures >= 5) return { locked: true, remaining: 0 };
  demo.authAttempts.push({ key, success: false, created_at_ms: Date.now() });
  return { locked: failures + 1 >= 5, remaining: Math.max(0, 5 - failures - 1) };
}

function rateLimitEmailRequest(key, options = {}) {
  const limit = Number(options.limit || 3);
  const windowMs = Number(options.windowMs || 10 * 60 * 1000);
  const normalizedKey = clean(key) || "unknown";
  const nowMs = Date.now();
  if (!supabaseConfigured) ensureDemo();
  demo.emailRateLimits = (demo.emailRateLimits || []).filter((item) => nowMs - item.created_at_ms < windowMs);
  const attempts = demo.emailRateLimits.filter((item) => item.key === normalizedKey);
  if (attempts.length >= limit) {
    const oldest = Math.min(...attempts.map((item) => item.created_at_ms));
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (nowMs - oldest)) / 1000))
    };
  }
  demo.emailRateLimits.push({ key: normalizedKey, created_at_ms: nowMs });
  return {
    limited: false,
    retryAfterSeconds: 0,
    remaining: Math.max(0, limit - attempts.length - 1)
  };
}

function genericLoginError(status = 401) {
  const error = new Error(status === 429
    ? "Too many login attempts. Please wait before trying again."
    : "Invalid email or password.");
  error.status = status;
  return error;
}

async function login(body) {
  const email = lower(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json(400, { error: "Email and password are required." });
  if (!isValidSignupEmail(email)) return json(400, { error: "Enter a valid email address." });

  if (!supabaseConfigured) {
    ensureDemo();
    const attempt = recordAuthAttempt(email, false);
    if (attempt.locked) throw genericLoginError(429);
    const user = demo.users.find((item) => item.email === email && item.password === password);
    if (!user) throw genericLoginError(401);
    recordAuthAttempt(email, true);
    const profile = clientProfile({
      ...demo.profiles.find((item) => item.id === user.id),
      email_verified: true
    });
    return json(200, {
      mode: "demo",
      access_token: tokenForProfile(profile),
      profile
    });
  }

  let session;
  try {
    session = await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      service: false,
      body: { email, password }
    });
  } catch {
    throw genericLoginError(401);
  }
  const profile = await getSupabaseProfile(session.access_token);
  return json(200, {
    mode: "supabase",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    profile
  });
}

async function authLogout(method, body, headers) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile, token } = await requireProfile(headers, []);
  if (supabaseConfigured) {
    await supabaseFetch("/auth/v1/logout", { method: "POST", service: false, token }).catch(() => null);
  }
  await createAuditLog({
    profile,
    action: "user_logged_out",
    entityType: "auth",
    entityId: profile.id,
    metadata: { message: "User logged out.", scope: clean(body.scope || "current") }
  });
  return json(200, { mode: supabaseConfigured ? "supabase" : "demo", logged_out: true });
}

async function forgotPassword(method, body) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const email = lower(body.email);
  if (!email || !isValidSignupEmail(email)) return json(200, {
    message: "If a SmartTable account exists for this email, a password reset message will be sent."
  });
  const resetLimit = rateLimitEmailRequest(`password-reset:${hashEmailValue(email).slice(0, 24)}`);
  if (resetLimit.limited) {
    return json(200, {
      message: "If a SmartTable account exists for this email, a password reset message will be sent.",
      retry_after: resetLimit.retryAfterSeconds
    });
  }

  if (!supabaseConfigured) {
    ensureDemo();
    const user = demo.users.find((item) => item.email === email);
    let demoResetToken = null;
    let emailResult = null;
    if (user) {
      const token = crypto.randomUUID();
      demoResetToken = token;
      demo.passwordResetTokens.unshift({
        token,
        user_id: user.id,
        email,
        used_at: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        created_at: nowIso()
      });
      const profile = demo.profiles.find((item) => item.id === user.id);
      emailResult = await sendPasswordResetEmail({
        email,
        guestName: profile?.full_name || email,
        lang: profile?.preferred_language || "en",
        token,
        userId: user.id
      });
    }
    return json(200, {
      mode: "demo",
      message: "If a SmartTable account exists for this email, a password reset message will be sent.",
      demo_reset_token: demoResetToken,
      email_delivery: emailResult ? emailDeliverySummary([emailResult]) : null
    });
  }

  let emailResult;
  try {
    await supabaseFetch("/auth/v1/recover", {
      method: "POST",
      service: false,
      body: {
        email,
        redirect_to: `${PUBLIC_BASE_URL}/reset-password`
      }
    });
    emailResult = await logAuthProviderEmail({
      to: email,
      subject: "Supabase Auth password reset",
      eventType: "password_reset",
      accepted: true,
      idempotencyKey: hashEmailValue(`supabase_password_reset:${lower(email)}:${Math.floor(Date.now() / 600000)}`)
    });
  } catch {
    emailResult = await logAuthProviderEmail({
      to: email,
      subject: "Supabase Auth password reset",
      eventType: "password_reset",
      accepted: false,
      errorCode: "AUTH_EMAIL_REQUEST_FAILED",
      errorMessage: "Supabase Auth did not accept the password reset email request.",
      idempotencyKey: hashEmailValue(`supabase_password_reset:${lower(email)}:${Math.floor(Date.now() / 600000)}`)
    });
  }
  return json(200, {
    message: "If a SmartTable account exists for this email, a password reset message will be sent.",
    email_delivery: emailDeliverySummary([emailResult])
  });
}

async function resetPassword(method, body) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const password = String(body.password || "");
  const confirmPassword = String(body.confirm_password || body.confirmPassword || "");
  if (!isStrongSignupPassword(password)) return json(400, { error: "Use a stronger password." });
  if (password !== confirmPassword) return json(400, { error: "Passwords must match." });

  if (!supabaseConfigured) {
    ensureDemo();
    const token = clean(body.token);
    const row = demo.passwordResetTokens.find((item) => item.token === token);
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return json(400, { error: "Reset link is invalid or expired." });
    const user = demo.users.find((item) => item.id === row.user_id);
    if (!user) return json(400, { error: "Reset link is invalid or expired." });
    user.password = password;
    row.used_at = nowIso();
    await createAuditLog({
      profile: demo.profiles.find((item) => item.id === user.id),
      action: "guest_password_reset",
      entityType: "auth",
      entityId: user.id,
      metadata: { message: "Guest password reset completed." }
    });
    const profile = demo.profiles.find((item) => item.id === user.id);
    const emailResult = await sendPasswordChangedEmail({
      email: user.email,
      guestName: profile?.full_name || user.email,
      lang: profile?.preferred_language || "en",
      userId: user.id,
      requestId: hashEmailValue(token).slice(0, 24)
    });
    return json(200, {
      mode: "demo",
      message: "Password updated. Please sign in.",
      emails: [emailResult],
      email_delivery: emailDeliverySummary([emailResult])
    });
  }

  const token = clean(body.access_token || body.token);
  if (!token) return json(400, { error: "Reset link is invalid or expired." });
  const currentUser = await supabaseFetch("/auth/v1/user", { service: false, token }).catch(() => null);
  await supabaseFetch("/auth/v1/user", {
    method: "PUT",
    service: false,
    token,
    body: { password }
  });
  let emailResult = null;
  if (currentUser?.email) {
    const profiles = currentUser?.id
      ? await supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${encodeURIComponent(currentUser.id)}&limit=1`, { service: true }).catch(() => [])
      : [];
    const profile = profiles?.[0] || {};
    emailResult = await sendPasswordChangedEmail({
      email: currentUser.email,
      guestName: profile.full_name || currentUser.email,
      lang: profile.preferred_language || "en",
      userId: currentUser.id || "",
      requestId: hashEmailValue(token).slice(0, 24)
    });
  }
  return json(200, {
    message: "Password updated. Please sign in.",
    emails: emailResult ? [emailResult] : [],
    email_delivery: emailResult ? emailDeliverySummary([emailResult]) : null
  });
}

async function authVerification(method, body, headers) {
  const { profile, token } = await requireProfile(headers, ["guest"]);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") return json(200, { mode: "demo", verified: true, email: profile.email });
    if (method === "POST") {
      const verifyLimit = rateLimitEmailRequest(`verification:${profile.id || hashEmailValue(profile.email).slice(0, 24)}`);
      if (verifyLimit.limited) return json(429, { error: "Please wait before requesting another verification email.", retry_after: verifyLimit.retryAfterSeconds });
      const emailResult = await sendGuestVerificationEmail({
        email: profile.email,
        guestName: profile.full_name || profile.email,
        lang: profile.preferred_language || "en",
        token: "demo-verified",
        userId: profile.id
      });
      return json(200, {
        mode: "demo",
        verified: true,
        message: "Demo accounts are already verified.",
        emails: [emailResult],
        email_delivery: emailDeliverySummary([emailResult])
      });
    }
    return json(405, { error: "Method not allowed." });
  }
  if (method === "GET") {
    const user = await supabaseFetch("/auth/v1/user", { service: false, token });
    return json(200, { verified: Boolean(user.email_confirmed_at), email: user.email });
  }
  if (method === "POST") {
    const verifyLimit = rateLimitEmailRequest(`verification:${profile.id || hashEmailValue(profile.email).slice(0, 24)}`);
    if (verifyLimit.limited) return json(429, { error: "Please wait before requesting another verification email.", retry_after: verifyLimit.retryAfterSeconds });
    let emailResult;
    try {
      await supabaseFetch("/auth/v1/resend", {
        method: "POST",
        service: false,
        body: { type: "signup", email: profile.email }
      });
      emailResult = await logAuthProviderEmail({
        to: profile.email,
        subject: "Supabase Auth email verification",
        eventType: "email_verification",
        accepted: true,
        locale: profile.preferred_language || "en",
        idempotencyKey: hashEmailValue(`verification:${profile.id || lower(profile.email)}:${Math.floor(Date.now() / 600000)}`)
      });
    } catch {
      emailResult = await logAuthProviderEmail({
        to: profile.email,
        subject: "Supabase Auth email verification",
        eventType: "email_verification",
        accepted: false,
        errorCode: "AUTH_EMAIL_REQUEST_FAILED",
        errorMessage: "Supabase Auth did not accept the verification email request.",
        locale: profile.preferred_language || "en",
        idempotencyKey: hashEmailValue(`verification:${profile.id || lower(profile.email)}:${Math.floor(Date.now() / 600000)}`)
      });
    }
    return json(200, {
      message: "If verification is required, a new verification email will be sent.",
      email_delivery: emailDeliverySummary([emailResult])
    });
  }
  return json(405, { error: "Method not allowed." });
}

function isValidSignupEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function isValidSignupPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 20;
}

function isStrongSignupPassword(password) {
  const value = String(password || "");
  return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

function normalizeGuestSignup(body = {}) {
  const fullNameInput = clean(body.full_name || body.name);
  const nameParts = fullNameInput.split(/\s+/).filter(Boolean);
  const firstName = clean(body.first_name || body.firstName || nameParts[0]);
  const lastName = clean(body.last_name || body.lastName || nameParts.slice(1).join(" "));
  const email = lower(body.email);
  const phone = clean(body.phone || body.phone_number || body.guest_phone);
  const password = String(body.password || "");
  const confirmPassword = String(body.confirm_password || body.confirmPassword || "");
  const preferredLanguage = normalizeLanguage(body.preferred_language || body.guest_language || body.lang || body.language || "en");
  const preferences = normalizeAiPreferences({
    ...body,
    preferred_neighborhoods: Array.isArray(body.preferred_neighborhoods)
      ? body.preferred_neighborhoods
      : String(body.preferred_neighborhoods || "").split(",").map((item) => item.trim()).filter(Boolean),
    dietary_restrictions: arrayFrom(body.dietary_restrictions).length ? arrayFrom(body.dietary_restrictions) : arrayFrom(body.dietary_needs),
    preferred_party_size: body.preferred_party_size || body.party_size || 2
  });
  const transportationMethods = arrayFrom(body.transportation_methods);
  preferences.location = {
    city: clean(body.city),
    region: clean(body.region || body.state),
    postal_code: clean(body.postal_code || body.zip),
    max_travel_distance_miles: Math.max(0, numberOr(body.travel_distance_miles, body.max_travel_distance_miles || 0)),
    transportation_method: clean(body.transportation_method || transportationMethods[0]),
    transportation_methods: transportationMethods.length ? transportationMethods : arrayFrom(body.transportation_method)
  };
  preferences.transportation_methods = preferences.location.transportation_methods;
  preferences.food_categories = arrayFrom(body.food_categories);
  preferences.dietary_needs = arrayFrom(body.dietary_needs);
  preferences.allergy_notes = clean(body.allergy_notes);
  preferences.dining_experiences = arrayFrom(body.dining_experiences);
  preferences.companions = arrayFrom(body.companions);
  preferences.party_size = clean(body.party_size);
  preferences.preferred_days = arrayFrom(body.preferred_days);
  preferences.preferred_time_windows = arrayFrom(body.preferred_time_windows);
  preferences.booking_lead_time = clean(body.booking_lead_time);
  preferences.dining_duration = clean(body.dining_duration);
  preferences.discovery_preference = clean(body.discovery_preference);
  preferences.selection_priorities = arrayFrom(body.selection_priorities);
  preferences.new_restaurant_recommendations = clean(body.new_restaurant_recommendations);
  preferences.new_menu_item_recommendations = clean(body.new_menu_item_recommendations);
  preferences.favorite_restaurants = arrayFrom(body.favorite_restaurants);
  preferences.excluded_categories = arrayFrom(body.excluded_categories);
  preferences.spending_range = clean(body.spending_range || body.preferred_spending_range);
  preferences.discount_levels = arrayFrom(body.discount_levels);
  preferences.minimumInterestingDiscount = minimumInterestingDiscountFromLevels(preferences.discount_levels);
  preferences.minimum_interesting_discount = preferences.minimumInterestingDiscount;
  preferences.preferred_discount_range = clean(body.preferred_discount_range || (preferences.minimumInterestingDiscount ? `${preferences.minimumInterestingDiscount}` : ""));
  preferences.consider_no_discount_match = clean(body.consider_no_discount_match);
  preferences.notification_preferences = arrayFrom(body.notification_preferences);
  preferences.notification_channels = arrayFrom(body.notification_channels);
  preferences.notification_frequency = clean(body.notification_frequency);
  preferences.event_recommendations_interest = clean(body.event_recommendations_interest);
  preferences.future_calendar_interest = clean(body.future_calendar_interest);
  preferences.consents = {
    transactional_email: boolValue(body.transactional_email_consent),
    sms: boolValue(body.sms_consent),
    marketing: boolValue(body.marketing_consent),
    allergy_acknowledgement: boolValue(body.allergy_acknowledgement),
    privacy: boolValue(body.privacy_consent),
    privacy_policy_accepted: boolValue(body.privacy_consent),
    terms: boolValue(body.terms_consent),
    terms_accepted: boolValue(body.terms_consent),
    terms_version: TERMS_VERSION,
    privacy_policy_version: PRIVACY_POLICY_VERSION,
    accepted_at: nowIso(),
    language: preferredLanguage,
    marketing_accepted_at: boolValue(body.marketing_consent) ? nowIso() : null
  };
  return {
    firstName,
    lastName,
    fullName: clean(fullNameInput || `${firstName} ${lastName}`),
    email,
    phone,
    password,
    confirmPassword,
    preferredLanguage,
    profileKey: aiProfileKey(body.profile_key || email),
    preferences
  };
}

function validateGuestSignupPayload(payload) {
  const requiredText = [
    ["firstName", payload.firstName],
    ["lastName", payload.lastName],
    ["email", payload.email],
    ["phone", payload.phone],
    ["city", payload.preferences.location.city],
    ["region", payload.preferences.location.region],
    ["postal_code", payload.preferences.location.postal_code],
    ["transportation_method", payload.preferences.location.transportation_method],
    ["party_size", payload.preferences.party_size],
    ["booking_lead_time", payload.preferences.booking_lead_time],
    ["dining_duration", payload.preferences.dining_duration],
    ["discovery_preference", payload.preferences.discovery_preference],
    ["new_restaurant_recommendations", payload.preferences.new_restaurant_recommendations],
    ["new_menu_item_recommendations", payload.preferences.new_menu_item_recommendations],
    ["spending_range", payload.preferences.spending_range],
    ["consider_no_discount_match", payload.preferences.consider_no_discount_match],
    ["notification_frequency", payload.preferences.notification_frequency],
    ["event_recommendations_interest", payload.preferences.event_recommendations_interest],
    ["future_calendar_interest", payload.preferences.future_calendar_interest]
  ];
  for (const [field, value] of requiredText) {
    if (!clean(value)) return `${field} is required.`;
  }
  if (!isValidSignupEmail(payload.email)) return "Enter a valid email address.";
  if (!isValidSignupPhone(payload.phone)) return "Enter a valid phone number.";
  if (!isStrongSignupPassword(payload.password)) return "Use a stronger password.";
  if (payload.password !== payload.confirmPassword) return "Passwords must match.";
  if (!payload.preferences.location.max_travel_distance_miles) return "Maximum travel distance is required.";
  const requiredArrays = [
    "cuisines", "food_categories", "dietary_needs", "drink_preferences", "dining_experiences", "companions",
    "preferred_neighborhoods", "preferred_days", "preferred_time_windows", "selection_priorities",
    "excluded_categories", "discount_levels", "notification_preferences", "notification_channels"
  ];
  for (const field of requiredArrays) {
    if (!arrayFrom(payload.preferences[field]).length) return `${field} is required.`;
  }
  if (arrayFrom(payload.preferences.notification_channels).includes("SMS") && !payload.preferences.consents.sms) return "SMS consent is required.";
  if (!payload.preferences.consents.transactional_email) return "Reservation email consent is required.";
  if (!payload.preferences.consents.privacy) return "Privacy consent is required.";
  if (!payload.preferences.consents.terms) return "Terms consent is required.";
  const needsAllergyAck = arrayFrom(payload.preferences.dietary_needs).some((item) => /allergy|gluten|dairy|halal|kosher|vegan|vegetarian|low-carb|other/i.test(item));
  if (needsAllergyAck && !payload.preferences.consents.allergy_acknowledgement) return "Allergy acknowledgement is required.";
  return "";
}

async function rollbackSupabaseGuestSignup({ userId, guestId, email, profileKey }) {
  if (!supabaseConfigured) return;
  const encodedEmail = encodeURIComponent(email);
  const encodedProfileKey = encodeURIComponent(profileKey);
  const tasks = [];
  if (guestId) {
    const encodedGuestId = encodeURIComponent(guestId);
    tasks.push(supabaseFetch(`/rest/v1/guest_consents?guest_id=eq.${encodedGuestId}`, { method: "DELETE", service: true }));
    tasks.push(supabaseFetch(`/rest/v1/guest_profiles?guest_id=eq.${encodedGuestId}`, { method: "DELETE", service: true }));
    tasks.push(supabaseFetch(`/rest/v1/guests?id=eq.${encodedGuestId}`, { method: "DELETE", service: true }));
  }
  tasks.push(supabaseFetch(`/rest/v1/ai_preference_profiles?profile_key=eq.${encodedProfileKey}`, { method: "DELETE", service: true }));
  tasks.push(supabaseFetch(`/rest/v1/profiles?email=eq.${encodedEmail}`, { method: "DELETE", service: true }));
  if (userId) tasks.push(supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE", service: true }));
  await Promise.allSettled(tasks);
}

async function signupGuest(body) {
  const payload = normalizeGuestSignup(body);
  const validationError = validateGuestSignupPayload(payload);
  if (validationError) return json(400, { error: validationError });

  if (!supabaseConfigured) {
    ensureDemo();
    if (demo.users.some((item) => item.email === payload.email)) return json(409, { error: "Account already exists." });
    const id = crypto.randomUUID();
    demo.users.push({ id, email: payload.email, password: payload.password });
    const profile = {
      id,
      email: payload.email,
      full_name: payload.fullName,
      role: "guest",
      restaurant_id: null,
      preferred_language: payload.preferredLanguage,
      phone: payload.phone
    };
    demo.profiles.push(profile);
    const guest = {
      id: crypto.randomUUID(),
      user_id: id,
      email: payload.email,
      full_name: payload.fullName,
      phone: payload.phone,
      ...guestSignupProfileFields(payload),
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso()
    };
    demo.guests.unshift(guest);
    const guestProfile = {
      id: crypto.randomUUID(),
      guest_id: guest.id,
      profile_key: payload.profileKey,
      preferences: payload.preferences,
      dietary_restrictions: payload.preferences.dietary_needs,
      favorite_cuisines: payload.preferences.cuisines,
      preferred_neighborhoods: payload.preferences.preferred_neighborhoods,
      ...guestPreferenceColumns(payload.preferences),
      consent: payload.preferences.consents,
      total_points: 0,
      lifetime_points: 0,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    demo.guestProfiles.unshift(guestProfile);
    demo.guestConsents.unshift(...guestConsentRows(payload, guest.id, id).map((row) => ({
      id: crypto.randomUUID(),
      ...row,
      created_at: nowIso()
    })));
    demo.aiPreferenceProfiles.unshift({
      id: crypto.randomUUID(),
      profile_key: payload.profileKey,
      user_id: id,
      guest_email: payload.email,
      preferences: payload.preferences,
      budget_per_person: payload.preferences.budget_per_person,
      travel_distance_miles: payload.preferences.travel_distance_miles,
      preferred_discount_range: payload.preferences.preferred_discount_range,
      minimum_interesting_discount: payload.preferences.minimumInterestingDiscount,
      calendar_opt_in: false,
      created_at: nowIso(),
      updated_at: nowIso()
    });
    const registrationEmail = await sendGuestRegistrationEmail({
      email: payload.email,
      guestName: payload.fullName,
      lang: payload.preferredLanguage,
      userId: id
    });
    return json(201, {
      mode: "demo",
      access_token: tokenForProfile(profile),
      profile,
      preferences: payload.preferences,
      emails: [registrationEmail],
      email_delivery: emailDeliverySummary([registrationEmail])
    });
  }

  const existingProfiles = await supabaseFetch(`/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(payload.email)}&limit=1`, { service: true }).catch(() => []);
  const existingGuests = await supabaseFetch(`/rest/v1/guests?select=id&email=eq.${encodeURIComponent(payload.email)}&limit=1`, { service: true }).catch(() => []);
  if (existingProfiles?.length || existingGuests?.length) return json(409, { error: "Account already exists." });

  const signup = await supabaseFetch("/auth/v1/signup", {
    method: "POST",
    service: false,
    body: {
      email: payload.email,
      password: payload.password,
      data: {
        full_name: payload.fullName,
        first_name: payload.firstName,
        last_name: payload.lastName,
        phone: payload.phone,
        preferred_language: payload.preferredLanguage
      }
    }
  });
  const user = signup.user || signup;
  const userId = user?.id;
  if (!userId) return json(500, { error: "Account provider did not return a user ID. Account creation was not completed." });
  let createdGuestId = null;
  if (userId) {
    try {
      await supabaseFetch("/rest/v1/profiles?on_conflict=id", {
        method: "POST",
        service: true,
        headers: { Prefer: "resolution=merge-duplicates" },
        body: {
          id: userId,
          email: payload.email,
          full_name: payload.fullName,
          role: "guest",
          restaurant_id: null,
          preferred_language: payload.preferredLanguage
        }
      });
      const guests = await supabaseFetch("/rest/v1/guests?on_conflict=email&select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: {
          user_id: userId,
          email: payload.email,
          full_name: payload.fullName,
          phone: payload.phone,
          ...guestSignupProfileFields(payload),
          status: "active"
        }
      });
      const guest = guests?.[0];
      if (!guest?.id) throw new Error("Guest profile could not be created.");
      createdGuestId = guest.id;
      await supabaseFetch("/rest/v1/guest_profiles?on_conflict=profile_key", {
        method: "POST",
        service: true,
        headers: { Prefer: "resolution=merge-duplicates" },
        body: {
          guest_id: guest.id,
          profile_key: payload.profileKey,
          preferences: payload.preferences,
          dietary_restrictions: payload.preferences.dietary_needs,
          favorite_cuisines: payload.preferences.cuisines,
          preferred_neighborhoods: payload.preferences.preferred_neighborhoods,
          ...guestPreferenceColumns(payload.preferences),
          consent: payload.preferences.consents
        }
      });
      await supabaseFetch("/rest/v1/guest_consents", {
        method: "POST",
        service: true,
        body: guestConsentRows(payload, guest.id, userId)
      });
      await supabaseFetch("/rest/v1/ai_preference_profiles?on_conflict=profile_key", {
        method: "POST",
        service: true,
        headers: { Prefer: "resolution=merge-duplicates" },
        body: {
          profile_key: payload.profileKey,
          user_id: userId,
          guest_email: payload.email,
          preferences: payload.preferences,
          budget_per_person: payload.preferences.budget_per_person,
          travel_distance_miles: payload.preferences.travel_distance_miles,
          preferred_discount_range: payload.preferences.preferred_discount_range,
          minimum_interesting_discount: payload.preferences.minimumInterestingDiscount,
          calendar_opt_in: false
        }
      });
    } catch (error) {
      await rollbackSupabaseGuestSignup({ userId, guestId: createdGuestId, email: payload.email, profileKey: payload.profileKey });
      return json(500, { error: `Account creation rolled back: ${error.message}` });
    }
  }
  const session = signup.session || null;
  const registrationEmail = await sendGuestRegistrationEmail({
    email: payload.email,
    guestName: payload.fullName,
    lang: payload.preferredLanguage,
    userId
  });
  if (session?.access_token) {
    const profile = await getSupabaseProfile(session.access_token).catch(() => ({
      id: userId,
      email: payload.email,
      full_name: payload.fullName,
      role: "guest",
      preferred_language: payload.preferredLanguage
    }));
    return json(201, {
      mode: "supabase",
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      profile,
      preferences: payload.preferences,
      emails: [registrationEmail],
      email_delivery: emailDeliverySummary([registrationEmail])
    });
  }
  return json(201, {
    user,
    preferences: payload.preferences,
    message: "Guest account created. Confirm email if Supabase email confirmation is enabled.",
    emails: [registrationEmail],
    email_delivery: emailDeliverySummary([registrationEmail])
  });
}

async function updateLanguagePreference(method, body, headers) {
  if (method !== "PATCH") return json(405, { error: "Method not allowed." });
  const preferredLanguage = normalizeLanguage(body.preferred_language || body.lang || body.language);
  const { profile } = await requireProfile(headers, []);

  if (!supabaseConfigured) {
    ensureDemo();
    const demoProfile = demo.profiles.find((item) => item.id === profile.id);
    if (demoProfile) demoProfile.preferred_language = preferredLanguage;
    return json(200, { profile: clientProfile(demoProfile || { ...profile, preferred_language: preferredLanguage }) });
  }

  const updated = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}&select=*`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=representation" },
    body: { preferred_language: preferredLanguage }
  });
  return json(200, { profile: clientProfile(updated?.[0] || { ...profile, preferred_language: preferredLanguage }) });
}

async function listPublicContent(query) {
  const lang = normalizeLanguage(query.get("lang"));
  if (!supabaseConfigured) {
    ensureDemo();
    const rows = mergeContentRows(demo.siteContent);
    return json(200, { mode: "demo", lang, content: localizeRows(rows, lang) });
  }

  const rows = await supabaseFetch("/rest/v1/site_content?select=*&order=group_name.asc,key.asc", { service: false });
  const merged = mergeContentRows(rows || []);
  return json(200, { mode: "supabase", lang, content: localizeRows(merged, lang) });
}

async function getPlatformSettings() {
  if (!supabaseConfigured) {
    ensureDemo();
    demo.appSettings = normalizePlatformSettings(demo.appSettings || defaultPlatformSettings);
    try {
      const stored = JSON.parse(await readFile(DEMO_SETTINGS_FILE, "utf8"));
      demo.appSettings = normalizePlatformSettings({ ...demo.appSettings, ...(stored || {}) });
    } catch {
      // Local demo persistence is best-effort.
    }
    return demo.appSettings;
  }

  const rows = await supabaseFetch("/rest/v1/app_settings?select=setting_value&setting_key=eq.platform_mode&limit=1", { service: true })
    .catch(() => []);
  const value = rows?.[0]?.setting_value || defaultPlatformSettings;
  return normalizePlatformSettings(typeof value === "string" ? { platform_mode: value } : value);
}

async function getPlatformMode() {
  return (await getPlatformSettings()).platform_mode;
}

async function setPlatformSettings(updates = {}, profile) {
  const previous = await getPlatformSettings();
  const next = normalizePlatformSettings({
    ...previous,
    ...updates,
    platform_mode: updates.platform_mode || updates.platformMode || updates.mode || previous.platform_mode,
    updated_at: nowIso(),
    updated_by: profile?.id || null
  });

  if (!supabaseConfigured) {
    ensureDemo();
    demo.appSettings = next;
    await mkdir(path.dirname(DEMO_SETTINGS_FILE), { recursive: true }).catch(() => null);
    await writeFile(DEMO_SETTINGS_FILE, JSON.stringify(demo.appSettings, null, 2)).catch(() => null);
  } else {
    await supabaseFetch("/rest/v1/app_settings?on_conflict=setting_key", {
      method: "POST",
      service: true,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: {
        setting_key: "platform_mode",
        setting_value: {
          mode: next.platform_mode,
          platform_mode: next.platform_mode,
          ai_demo_visibility: next.ai_demo_visibility,
          show_ai_mode_badge: next.show_ai_mode_badge,
          feature_flags: next.feature_flags
        },
        updated_by: profile?.id || null
      }
    });
  }

  const message = `Platform settings changed from ${previous.platform_mode === "basic" ? "Basic" : "AI Concierge"} to ${next.platform_mode === "basic" ? "Basic" : "AI Concierge"} by ${profile?.email || profile?.full_name || "Super Admin"}.`;
  await createSystemAdminNotification({
    type: "platform_settings_changed",
    title: "Platform settings changed",
    message,
    profile,
    entityType: "app_settings",
    entityId: "platform_mode"
  }).catch(() => null);
  await createAuditLog({
    profile,
    action: "platform_settings_changed",
    entityType: "app_settings",
    entityId: "platform_mode",
    metadata: { previous_settings: previous, platform_settings: next, message }
  }).catch(() => null);

  return next;
}

async function listPublicConfig() {
  const platformSettings = await getPlatformSettings();
  return json(200, {
    mode: supabaseConfigured ? "supabase" : "demo",
    public_base_url: PUBLIC_BASE_URL,
    ...platformSettings,
    feature_registry: platformFeatureRegistry,
    google_maps_api_key: GOOGLE_MAPS_API_KEY,
    google_maps_enabled: Boolean(GOOGLE_MAPS_API_KEY)
  });
}

async function adminPlatformSettings(method, body, headers) {
  const { profile } = await requireProfile(headers, ["admin"]);
  if (method === "GET") {
    return json(200, {
      mode: supabaseConfigured ? "supabase" : "demo",
      ...(await getPlatformSettings()),
      feature_registry: platformFeatureRegistry,
      can_edit: normalizeRole(profile.role) === "super_admin"
    });
  }
  if (method !== "PATCH") return json(405, { error: "Method not allowed." });
  if (normalizeRole(profile.role) !== "super_admin") return json(403, { error: "Only Super Admin can change Platform Mode." });
  const platformSettings = await setPlatformSettings(body || {}, profile);
  return json(200, {
    mode: supabaseConfigured ? "supabase" : "demo",
    ...platformSettings,
    feature_registry: platformFeatureRegistry,
    can_edit: true,
    message: "Platform settings saved."
  });
}

async function listPublicOffers(query) {
  const lang = normalizeLanguage(query.get("lang"));
  if (!supabaseConfigured) {
    const rows = publicOfferRows(lang).map(sanitizePublicOfferRow);
    const restaurantIds = new Set(rows.map((row) => row.restaurant_id));
    for (const id of restaurantIds) {
      const restaurant = demo.restaurants.find((item) => item.id === id);
      if (restaurant) restaurant.views_count = numberOr(restaurant.views_count, 0) + 1;
    }
    return json(200, { mode: "demo", offers: rows });
  }

  const rows = await supabaseFetch("/rest/v1/public_available_offers?select=*&order=sort_order.asc.nullslast,restaurant_name.asc,offer_date.asc,start_time.asc", { service: false });
  const restaurantIds = [...new Set((rows || []).map((row) => row.restaurant_id).filter(Boolean))];
  await Promise.all(restaurantIds.map((restaurantId) => supabaseFetch("/rest/v1/rpc/track_restaurant_view", {
    method: "POST",
    service: false,
    body: { p_restaurant_id: restaurantId }
  }).catch(() => null)));

  const offers = (rows || []).map((row) => {
    const localizedRow = {
      ...row,
      title: localizedField(row, "title", lang) || row.offer_title || row.title_en,
      description: localizedField(row, "restaurant_description", lang) || localizedField(row, "description", lang),
      offer_description: localizedField(row, "offer_description", lang)
    };
    const sourceOffer = offerWithRestaurantContext(localizedRow, {
      id: row.restaurant_id,
      primary_timezone: row.primary_timezone,
      timezone: row.timezone,
      status: row.restaurant_status
    });
    const availabilityRow = publicOfferWithAvailability(localizedRow, sourceOffer);
    return availabilityRow.offer_error_code ? null : sanitizePublicOfferRow(availabilityRow);
  }).filter(Boolean).sort((a, b) => {
    const order = numberOr(a.sort_order, 999999) - numberOr(b.sort_order, 999999);
    if (order) return order;
    const name = clean(a.restaurant_name).localeCompare(clean(b.restaurant_name));
    if (name) return name;
    return `${a.offer_date || ""}${a.start_time || ""}`.localeCompare(`${b.offer_date || ""}${b.start_time || ""}`);
  });
  return json(200, { mode: "supabase", offers });
}

async function followRestaurant(body) {
  const restaurantId = clean(body.restaurant_id);
  const guestEmail = lower(body.guest_email || body.email);
  const guestName = clean(body.guest_name || body.name);
  const notificationEnabled = body.notification_enabled === undefined ? true : Boolean(body.notification_enabled);
  if (!restaurantId || !guestEmail) return json(400, { error: "Restaurant and guest email are required." });

  if (!supabaseConfigured) {
    ensureDemo();
    const restaurant = demo.restaurants.find((item) => item.id === restaurantId && item.status === "approved");
    if (!restaurant) return json(404, { error: "Restaurant not found." });
    const existing = demo.restaurantFollowers.find((item) => item.restaurant_id === restaurantId && item.guest_email === guestEmail);
    if (existing) {
      existing.guest_name = guestName || existing.guest_name;
      existing.notification_enabled = notificationEnabled;
      existing.updated_at = nowIso();
      return json(200, { mode: "demo", follower: existing });
    }
    const follower = {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      guest_email: guestEmail,
      guest_name: guestName,
      notification_enabled: notificationEnabled,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    demo.restaurantFollowers.unshift(follower);
    demo.aiInteractionEvents.unshift({
      id: crypto.randomUUID(),
      profile_key: aiProfileKey(body.profile_key || guestEmail),
      event_type: "favorite_restaurant",
      restaurant_id: restaurantId,
      offer_id: null,
      reservation_id: null,
      metadata: { guest_email: guestEmail },
      created_at: nowIso()
    });
    return json(201, { mode: "demo", follower });
  }

  const rows = await supabaseFetch("/rest/v1/restaurant_followers?on_conflict=restaurant_id,guest_email&select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: {
      restaurant_id: restaurantId,
      guest_email: guestEmail,
      guest_name: guestName || null,
      notification_enabled: notificationEnabled,
      updated_at: nowIso()
    }
  });
  await supabaseFetch("/rest/v1/ai_interaction_events", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      profile_key: aiProfileKey(body.profile_key || guestEmail),
      event_type: "favorite_restaurant",
      restaurant_id: restaurantId,
      metadata: { guest_email: guestEmail }
    }
  }).catch(() => null);
  return json(200, { mode: "supabase", follower: rows?.[0] });
}

async function listNewestRestaurants(query) {
  const lang = normalizeLanguage(query.get("lang"));
  const weekStart = dateStartOfWeek(new Date()).toISOString();
  if (!supabaseConfigured) {
    ensureDemo();
    const restaurants = demo.restaurants
      .filter((restaurant) => restaurant.status === "approved" && new Date(restaurant.created_at) >= new Date(weekStart))
      .map((restaurant) => publicRestaurantCard(restaurant, lang))
      .sort((a, b) => String(b.restaurant_created_at || "").localeCompare(String(a.restaurant_created_at || "")));
    return json(200, { mode: "demo", restaurants });
  }

  const rows = await supabaseFetch(`/rest/v1/public_restaurant_cards?select=*&restaurant_created_at=gte.${encodeURIComponent(weekStart)}&order=restaurant_created_at.desc`, { service: false });
  const restaurants = (rows || []).map((row) => ({
    ...row,
    restaurant_description: localizedField(row, "restaurant_description", lang) || row.restaurant_description || row.description
  }));
  return json(200, { mode: "supabase", restaurants });
}

async function aiPreferences(method, body, headers, query) {
  const token = authToken(headers);
  const authProfile = !supabaseConfigured ? profileFromDemoToken(token) : null;
  const profileKey = aiProfileKey(body.profile_key || query.get("profile_key") || authProfile?.id);

  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") {
      const profile = demo.aiPreferenceProfiles.find((item) => item.profile_key === profileKey) || null;
      return json(200, { mode: "demo", profile_key: profileKey, preferences: profile?.preferences || null, profile });
    }
    if (method === "POST" || method === "PATCH") {
      const preferences = normalizeAiPreferences(body);
      const existing = demo.aiPreferenceProfiles.find((item) => item.profile_key === profileKey);
      const row = existing || {
        id: crypto.randomUUID(),
        profile_key: profileKey,
        user_id: authProfile?.id || null,
        guest_email: lower(body.guest_email || authProfile?.email),
        created_at: nowIso()
      };
      Object.assign(row, {
        preferences,
        budget_per_person: preferences.budget_per_person,
        travel_distance_miles: preferences.travel_distance_miles,
        preferred_discount_range: preferences.preferred_discount_range,
        updated_at: nowIso()
      });
      if (!existing) demo.aiPreferenceProfiles.unshift(row);
      return json(200, { mode: "demo", profile_key: profileKey, preferences, profile: row });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch(`/rest/v1/ai_preference_profiles?select=*&profile_key=eq.${encodeURIComponent(profileKey)}&limit=1`, { service: true });
      const row = rows?.[0] || null;
      return json(200, { mode: "supabase", profile_key: profileKey, preferences: row?.preferences || null, profile: row });
    }
    if (method === "POST" || method === "PATCH") {
      const preferences = normalizeAiPreferences(body);
      const rows = await supabaseFetch("/rest/v1/ai_preference_profiles?on_conflict=profile_key&select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: {
          profile_key: profileKey,
          guest_email: lower(body.guest_email),
          preferences,
          budget_per_person: preferences.budget_per_person,
          travel_distance_miles: preferences.travel_distance_miles,
          preferred_discount_range: preferences.preferred_discount_range,
          updated_at: nowIso()
        }
      });
      return json(200, { mode: "supabase", profile_key: profileKey, preferences, profile: rows?.[0] });
    }
  }

  return json(405, { error: "Method not allowed." });
}

async function aiEvent(method, body, headers) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const token = authToken(headers);
  const authProfile = !supabaseConfigured ? profileFromDemoToken(token) : null;
  const profileKey = aiProfileKey(body.profile_key || authProfile?.id);
  const event = {
    id: crypto.randomUUID(),
    profile_key: profileKey,
    user_id: authProfile?.id || null,
    event_type: clean(body.event_type || "interaction"),
    restaurant_id: nullableClean(body.restaurant_id),
    offer_id: nullableClean(body.offer_id),
    reservation_id: nullableClean(body.reservation_id),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    created_at: nowIso()
  };

  if (!supabaseConfigured) {
    ensureDemo();
    demo.aiInteractionEvents.unshift(event);
    return json(201, { mode: "demo", event });
  }

  const rows = await supabaseFetch("/rest/v1/ai_interaction_events?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: event
  });
  return json(201, { mode: "supabase", event: rows?.[0] });
}

async function aiRecommendations(query, headers) {
  const lang = normalizeLanguage(query.get("lang"));
  const token = authToken(headers);
  const authProfile = !supabaseConfigured ? profileFromDemoToken(token) : null;
  const profileKey = aiProfileKey(query.get("profile_key") || authProfile?.id);
  let preferences = null;
  let restaurants = [];

  if (!supabaseConfigured) {
    ensureDemo();
    preferences = demo.aiPreferenceProfiles.find((item) => item.profile_key === profileKey)?.preferences || null;
    restaurants = demo.restaurants
      .filter((restaurant) => restaurant.status === "approved")
      .map((restaurant) => publicRestaurantCard(restaurant, lang));
  } else {
    const prefRows = await supabaseFetch(`/rest/v1/ai_preference_profiles?select=*&profile_key=eq.${encodeURIComponent(profileKey)}&limit=1`, { service: true }).catch(() => []);
    preferences = prefRows?.[0]?.preferences || null;
    const rows = await supabaseFetch("/rest/v1/public_restaurant_cards?select=*&order=sort_order.asc.nullslast,restaurant_name.asc", { service: false });
    restaurants = (rows || []).map((row) => ({
      ...row,
      restaurant_description: localizedField(row, "restaurant_description", lang) || row.restaurant_description || row.description
    }));
  }

  const fallbackPreferences = preferences || normalizeAiPreferences({});
  const recommendations = restaurants
    .map((restaurant) => recommendationRow(restaurant, fallbackPreferences))
    .sort((a, b) => b.ai_match_score - a.ai_match_score)
    .slice(0, 12);

  return json(200, {
    mode: supabaseConfigured ? "supabase" : "demo",
    profile_key: profileKey,
    has_preferences: Boolean(preferences),
    recommendations
  });
}

async function aiDemandForecast(method, body, headers, query) {
  if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurantId = clean(body.restaurant_id || query.get("restaurant_id") || profile.restaurant_id);
  if (!restaurantId && !roleMatches(profile.role, ["admin"])) return json(400, { error: "Restaurant is required." });

  if (!supabaseConfigured) {
    ensureDemo();
    const restaurant = restaurantId
      ? demo.restaurants.find((item) => item.id === restaurantId)
      : demo.restaurants.find((item) => item.owner_user_id === profile.id);
    if (!restaurant) return json(404, { error: "Restaurant not found." });
    const reservations = demo.reservations.filter((item) => item.restaurant_id === restaurant.id);
    const importedReservations = demo.importedReservations.filter((item) => item.restaurant_id === restaurant.id);
    const manualUploads = demo.manualPerformanceUploads.filter((item) => item.restaurant_id === restaurant.id);
    const activeOffers = demo.offers.filter((item) => item.restaurant_id === restaurant.id && item.status === "active");
    const forecast = enhancedDemandForecast(restaurant, {
      bookings: reservations.length,
      imported_reservations: importedReservations.length,
      manual_reservations: manualUploads.reduce((sum, item) => sum + numberOr(item.reservations_count, 0), 0),
      accepted: reservations.filter((item) => normalizeReservationStatus(item.status) === "accepted").length,
      active_offers: activeOffers.length,
      views: numberOr(restaurant.views_count, 0)
    });
    return json(200, {
      mode: "demo",
      forecast
    });
  }

  const stats = await supabaseFetch("/rest/v1/rpc/ai_demand_forecast", {
    method: "POST",
    service: true,
    body: { p_restaurant_id: restaurantId || null }
  }).catch(() => null);
  const restaurantRows = restaurantId
    ? await supabaseFetch(`/rest/v1/restaurants?select=*&id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { service: true }).catch(() => [])
    : [];
  const restaurant = restaurantRows?.[0] || { id: restaurantId, name: stats?.restaurant_name || "Restaurant" };
  const [importedReservations, manualUploads] = restaurantId ? await Promise.all([
    supabaseFetch(`/rest/v1/imported_reservations?select=id&restaurant_id=eq.${encodeURIComponent(restaurantId)}&imported_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}`, { service: true }).catch(() => []),
    supabaseFetch(`/rest/v1/manual_performance_uploads?select=reservations_count&restaurant_id=eq.${encodeURIComponent(restaurantId)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}`, { service: true }).catch(() => [])
  ]) : [[], []];
  const forecast = {
    ...(stats || {}),
    ...enhancedDemandForecast(restaurant, {
      bookings: stats?.inputs?.reservations_7d ?? stats?.inputs?.reservations ?? 0,
      imported_reservations: importedReservations?.length || 0,
      manual_reservations: (manualUploads || []).reduce((sum, item) => sum + numberOr(item.reservations_count, 0), 0),
      active_offers: stats?.inputs?.active_offers ?? 0,
      views: stats?.inputs?.views ?? 0,
      accepted: stats?.inputs?.accepted ?? 0
    })
  };
  return json(200, { mode: "supabase", forecast });
}

async function aiRestaurantRecommendation(method, body, headers, query) {
  if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);
  const restaurantId = restaurant.id;

  if (!supabaseConfigured) {
    ensureDemo();
    const existing = demo.aiRecommendations.find((item) => item.restaurant_id === restaurantId && ["pending_approval", "viewed"].includes(item.status));
    if (existing && method === "GET") {
      existing.viewed_at ||= nowIso();
      existing.status = existing.status === "pending_approval" ? "viewed" : existing.status;
      return json(200, { mode: "demo", status: featureStatusFor("ai_demand_recommendations"), recommendation: existing });
    }
    const reservations = demo.reservations.filter((item) => item.restaurant_id === restaurantId);
    const importedReservations = demo.importedReservations.filter((item) => item.restaurant_id === restaurantId);
    const manualUploads = demo.manualPerformanceUploads.filter((item) => item.restaurant_id === restaurantId);
    const activeOffers = demo.offers.filter((item) => item.restaurant_id === restaurantId && item.status === "active");
    const followers = followerStatsForRestaurant(restaurantId);
    const forecast = enhancedDemandForecast(restaurant, {
      bookings: reservations.length,
      imported_reservations: importedReservations.length,
      manual_reservations: manualUploads.reduce((sum, item) => sum + numberOr(item.reservations_count, 0), 0),
      accepted: reservations.filter((item) => normalizeReservationStatus(item.status) === "accepted").length,
      active_offers: activeOffers.length,
      views: numberOr(restaurant.views_count, 0),
      followers: followers.total
    });
    const recommendation = aiRecommendationFromForecast(restaurant, forecast, profile);
    demo.aiRecommendations.unshift(recommendation);
    demo.aiActions.unshift({
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      recommendation_id: recommendation.id,
      action_type: "recommendation_created",
      status: "pending_approval",
      payload: { recommendation_id: recommendation.id },
      result: {},
      requested_by: profile.id,
      created_at: nowIso(),
      updated_at: nowIso()
    });
    return json(201, { mode: "demo", status: featureStatusFor("ai_demand_recommendations"), recommendation });
  }

  const existingRows = method === "GET"
    ? await supabaseFetch(`/rest/v1/ai_recommendations?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&status=in.(pending_approval,viewed)&order=created_at.desc&limit=1`, { service: true }).catch(() => [])
    : [];
  if (existingRows?.[0]) {
    await supabaseFetch(`/rest/v1/ai_recommendations?id=eq.${encodeURIComponent(existingRows[0].id)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: { status: "viewed", viewed_at: nowIso() }
    }).catch(() => null);
    return json(200, { mode: "supabase", status: featureStatusFor("ai_demand_recommendations"), recommendation: { ...existingRows[0], status: "viewed" } });
  }

  const [reservations, activeOffers, followers, importedReservations, manualUploads] = await Promise.all([
    supabaseFetch(`/rest/v1/reservations?select=status,party_size&restaurant_id=eq.${encodeURIComponent(restaurantId)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}`, { service: true }).catch(() => []),
    supabaseFetch(`/rest/v1/offers?select=id,status&restaurant_id=eq.${encodeURIComponent(restaurantId)}&status=eq.active`, { service: true }).catch(() => []),
    supabaseFetch(`/rest/v1/restaurant_followers?select=id&restaurant_id=eq.${encodeURIComponent(restaurantId)}&notification_enabled=eq.true`, { service: true }).catch(() => []),
    supabaseFetch(`/rest/v1/imported_reservations?select=id&restaurant_id=eq.${encodeURIComponent(restaurantId)}&imported_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}`, { service: true }).catch(() => []),
    supabaseFetch(`/rest/v1/manual_performance_uploads?select=reservations_count&restaurant_id=eq.${encodeURIComponent(restaurantId)}&created_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString())}`, { service: true }).catch(() => [])
  ]);
  const forecast = enhancedDemandForecast(restaurant, {
    bookings: reservations?.length || 0,
    imported_reservations: importedReservations?.length || 0,
    manual_reservations: (manualUploads || []).reduce((sum, item) => sum + numberOr(item.reservations_count, 0), 0),
    accepted: (reservations || []).filter((item) => normalizeReservationStatus(item.status) === "accepted").length,
    active_offers: activeOffers?.length || 0,
    views: numberOr(restaurant.views_count, 0),
    followers: followers?.length || 0
  });
  const recommendation = aiRecommendationFromForecast(restaurant, forecast, profile);
  const rows = await supabaseFetch("/rest/v1/ai_recommendations?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      restaurant_id: recommendation.restaurant_id,
      recommendation_type: recommendation.recommendation_type,
      status: recommendation.status,
      demand_score: recommendation.demand_score,
      recommended_discount: recommendation.recommended_discount,
      recommended_start_time: recommendation.recommended_start_time,
      recommended_end_time: recommendation.recommended_end_time,
      recommended_date: recommendation.recommended_date,
      recommended_action: recommendation.recommended_action,
      marketing_action: recommendation.marketing_action,
      expected_bookings: recommendation.expected_bookings,
      expected_revenue_lift: recommendation.expected_revenue_lift,
      confidence_score: recommendation.confidence_score,
      explanation: recommendation.explanation,
      data_used: recommendation.data_used,
      missing_data: recommendation.missing_data,
      model_version: recommendation.model_version,
      source: recommendation.source,
      created_by: profile.id
    }
  });
  const saved = rows?.[0] || recommendation;
  await supabaseFetch("/rest/v1/demand_snapshots", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      restaurant_id: restaurantId,
      demand_score: forecast.demand_score,
      expected_bookings: forecast.expected_bookings,
      expected_guests: forecast.expected_guests,
      inputs: forecast.inputs,
      source: "ai_recommendation_rules_v1"
    }
  }).catch(() => null);
  await supabaseFetch("/rest/v1/ai_actions", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      restaurant_id: restaurantId,
      recommendation_id: saved.id,
      action_type: "recommendation_created",
      status: "pending_approval",
      requested_by: profile.id,
      payload: { recommendation_id: saved.id }
    }
  }).catch(() => null);
  return json(201, { mode: "supabase", status: featureStatusFor("ai_demand_recommendations"), recommendation: saved });
}

async function aiActions(method, body, headers, query) {
  if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);
  const restaurantId = restaurant.id;

  if (method === "GET") {
    if (!supabaseConfigured) {
      ensureDemo();
      return json(200, {
        mode: "demo",
        actions: demo.aiActions.filter((item) => item.restaurant_id === restaurantId),
        results: demo.aiActionResults.filter((item) => item.restaurant_id === restaurantId)
      });
    }
    const [actions, results] = await Promise.all([
      supabaseFetch(`/rest/v1/ai_actions?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc&limit=50`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/ai_action_results?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc&limit=50`, { service: true }).catch(() => [])
    ]);
    return json(200, { mode: "supabase", actions, results });
  }

  const recommendationId = clean(body.recommendation_id);
  const actionType = clean(body.action_type || body.action || "apply_recommendation");
  const decision = clean(body.decision || (actionType.includes("reject") ? "reject" : "approve"));
  const now = nowIso();

  if (!supabaseConfigured) {
    ensureDemo();
    const recommendation = demo.aiRecommendations.find((item) => item.id === recommendationId && item.restaurant_id === restaurantId)
      || aiRecommendationFromForecast(restaurant, enhancedDemandForecast(restaurant, {
        bookings: demo.reservations.filter((item) => item.restaurant_id === restaurantId).length,
        imported_reservations: demo.importedReservations.filter((item) => item.restaurant_id === restaurantId).length,
        manual_reservations: demo.manualPerformanceUploads.filter((item) => item.restaurant_id === restaurantId).reduce((sum, item) => sum + numberOr(item.reservations_count, 0), 0),
        active_offers: demo.offers.filter((item) => item.restaurant_id === restaurantId && item.status === "active").length,
        views: numberOr(restaurant.views_count, 0)
      }), profile);
    recommendation.status = decision === "reject" ? "rejected" : "approved";
    recommendation[decision === "reject" ? "rejected_at" : "approved_at"] = now;

    const action = {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      recommendation_id: recommendation.id,
      action_type: actionType,
      status: decision === "reject" ? "rejected" : "completed",
      requested_by: profile.id,
      approved_by: decision === "reject" ? null : profile.id,
      payload: body,
      result: {},
      approved_at: decision === "reject" ? null : now,
      executed_at: decision === "reject" ? null : now,
      created_at: now,
      updated_at: now
    };
    let offer = null;
    let campaign = null;
    if (decision !== "reject") {
      offer = {
        id: crypto.randomUUID(),
        ...offerPayload({
          title_en: `AI approved ${recommendation.recommended_discount || 15}% recovery offer`,
          description_en: recommendation.explanation?.why_recommended || "Approved SmartTable AI recommendation.",
          offer_date: recommendation.recommended_date,
          start_time: recommendation.recommended_start_time,
          end_time: recommendation.recommended_end_time,
          available_tables: 4,
          max_party_size: 4,
          discount_value: recommendation.recommended_discount || 15,
          source: "ai_approved",
          ai_recommendation_id: recommendation.id
        }, restaurantId, { full: true }),
        created_at: now,
        updated_at: now
      };
      demo.offers.unshift(offer);
      campaign = {
        id: crypto.randomUUID(),
        restaurant_id: restaurantId,
        recommendation_id: recommendation.id,
        action_id: action.id,
        campaign_type: "favorite_guest_email",
        audience: "followers",
        status: "queued",
        subject: `New SmartTable offer at ${restaurant.name}`,
        message: `Tonight only: enjoy ${recommendation.recommended_discount || 15}% off an early dinner reservation at ${restaurant.name}.`,
        channel: "email",
        sent_count: followerStatsForRestaurant(restaurantId).total,
        created_by: profile.id,
        created_at: now,
        updated_at: now
      };
      demo.marketingCampaigns.unshift(campaign);
      action.result = {
        offer_id: offer.id,
        campaign_id: campaign.id,
        message: "AI recommendation approved. Offer created and follower campaign queued in demo mode."
      };
    }
    demo.aiActions.unshift(action);
    return json(201, { mode: "demo", action, recommendation, offer, campaign });
  }

  const recommendationRows = recommendationId
    ? await supabaseFetch(`/rest/v1/ai_recommendations?select=*&id=eq.${encodeURIComponent(recommendationId)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { service: true }).catch(() => [])
    : [];
  let recommendation = recommendationRows?.[0] || null;
  if (!recommendation) {
    const created = await aiRestaurantRecommendation("POST", { restaurant_id: restaurantId }, headers, new URLSearchParams());
    recommendation = created.body?.recommendation || null;
  }
  if (!recommendation) return json(404, { error: "AI recommendation not found." });

  if (decision === "reject") {
    await supabaseFetch(`/rest/v1/ai_recommendations?id=eq.${encodeURIComponent(recommendation.id)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: { status: "rejected", rejected_at: now }
    });
    const actions = await supabaseFetch("/rest/v1/ai_actions?select=*", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=representation" },
      body: {
        restaurant_id: restaurantId,
        recommendation_id: recommendation.id,
        action_type: actionType,
        status: "rejected",
        requested_by: profile.id,
        payload: body,
        result: { message: "Restaurant rejected the recommendation." }
      }
    });
    return json(201, { mode: "supabase", action: actions?.[0], recommendation: { ...recommendation, status: "rejected" } });
  }

  const actionRows = await supabaseFetch("/rest/v1/ai_actions?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      restaurant_id: restaurantId,
      recommendation_id: recommendation.id,
      action_type: actionType,
      status: "executing",
      requested_by: profile.id,
      approved_by: profile.id,
      approved_at: now,
      payload: body
    }
  });
  const action = actionRows?.[0];
  const discount = numberOr(recommendation.recommended_discount, 15);
  const offerRows = await supabaseFetch("/rest/v1/offers?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: offerPayload({
      title_en: `AI approved ${discount}% recovery offer`,
      description_en: recommendation.explanation?.why_recommended || "Approved SmartTable AI recommendation.",
      offer_date: recommendation.recommended_date || tomorrowIsoDate(),
      start_time: recommendation.recommended_start_time || "17:30",
      end_time: recommendation.recommended_end_time || "19:00",
      available_tables: 4,
      max_party_size: 4,
      discount_value: discount,
      source: "ai_approved",
      ai_recommendation_id: recommendation.id
    }, restaurantId, { full: true })
  });
  const offer = offerRows?.[0];
  const campaignRows = await supabaseFetch("/rest/v1/marketing_campaigns?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      restaurant_id: restaurantId,
      recommendation_id: recommendation.id,
      action_id: action?.id,
      campaign_type: "favorite_guest_email",
      audience: "followers",
      status: "queued",
      subject: `New SmartTable offer at ${restaurant.name}`,
      message: `Tonight only: enjoy ${discount}% off an early dinner reservation at ${restaurant.name}.`,
      channel: "email",
      created_by: profile.id
    }
  });
  const campaign = campaignRows?.[0];
  await Promise.all([
    supabaseFetch(`/rest/v1/ai_recommendations?id=eq.${encodeURIComponent(recommendation.id)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: { status: "approved", approved_at: now }
    }),
    action?.id ? supabaseFetch(`/rest/v1/ai_actions?id=eq.${encodeURIComponent(action.id)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: {
        status: "completed",
        executed_at: now,
        result: { offer_id: offer?.id, campaign_id: campaign?.id }
      }
    }) : Promise.resolve(null),
    action?.id ? supabaseFetch("/rest/v1/ai_action_results", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: {
        action_id: action.id,
        restaurant_id: restaurantId,
        recommendation_id: recommendation.id,
        bookings_generated: 0,
        guests_generated: 0,
        revenue_recovered: 0,
        notes: "Initial result row. Measurement updates after reservations convert."
      }
    }) : Promise.resolve(null)
  ]);
  return json(201, {
    mode: "supabase",
    action: action ? { ...action, status: "completed", result: { offer_id: offer?.id, campaign_id: campaign?.id } } : null,
    recommendation: { ...recommendation, status: "approved" },
    offer,
    campaign
  });
}

function providerMeta(provider) {
  const key = clean(provider || "generic_reservation").toLowerCase().replace(/\s+/g, "_");
  return reservationProviderCatalog.find((item) => item.provider === key) || {
    provider: key,
    display_name: key.replaceAll("_", " "),
    category: "reservation",
    status: "requires_integration",
    labels: ["Requires provider API access", "Requires restaurant authorization", "Requires approved integration partnership"],
    capabilities: ["reservations", "guests", "availability"],
    api_access_status: "not_connected"
  };
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeImportHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseCsvRows(csv = "") {
  const lines = String(csv || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(normalizeImportHeader);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((row, header, index) => {
      row[header || `field_${index + 1}`] = values[index] || "";
      return row;
    }, {});
  });
}

const prohibitedReservationImportFields = new Set([
  "spend",
  "total_spend",
  "check_total",
  "revenue",
  "restaurant_revenue",
  "average_check",
  "avg_check",
  "bill_total",
  "bill_close_time",
  "payment",
  "payment_data",
  "card",
  "card_data",
  "sales_transaction",
  "order",
  "orders",
  "item_sales",
  "inventory",
  "tip",
  "tips",
  "refund",
  "settlement",
  "pos"
]);

function sanitizeReservationImportPayload(row = {}) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !prohibitedReservationImportFields.has(normalizeImportHeader(key)))
  );
}

function importedReservationFromRow(row, provider, restaurantId, connectionId = null) {
  const adapter = createReservationProvider(provider || row.source || "csv_import");
  const mapped = adapter.importReservation(row);
  const rawPayload = sanitizeReservationImportPayload(mapped.raw_payload || row);
  const imported = {
    id: crypto.randomUUID(),
    connection_id: connectionId,
    restaurant_id: restaurantId,
    provider: mapped.provider || provider || "csv_import",
    external_reservation_id: mapped.external_reservation_id,
    guest_external_id: mapped.guest_external_id || null,
    guest_name: mapped.guest_name || "",
    guest_email: lower(mapped.guest_email || ""),
    guest_phone: mapped.guest_phone || "",
    party_size: mapped.party_size,
    reservation_start: mapped.reservation_start,
    reservation_end: mapped.reservation_end,
    status: mapped.status || "confirmed",
    notes: mapped.notes || "",
    raw_payload: rawPayload,
    imported_at: nowIso()
  };
  return imported;
}

function integrationCatalogRows(connections = [], importedRows = [], errors = []) {
  return reservationProviderCatalog.map((provider) => {
    const connection = connections.find((item) => item.provider === provider.provider || item.integrations?.provider === provider.provider) || null;
    const connectionProvider = connection?.provider || connection?.integrations?.provider || provider.provider;
    const importedForProvider = importedRows.filter((item) => item.provider === connectionProvider || item.provider === provider.provider);
    const errorsForProvider = errors.filter((item) => item.provider === connectionProvider || item.provider === provider.provider);
    return {
      ...provider,
      connection_id: connection?.id || null,
      connection_status: connection?.status || "not_connected",
      sync_status: connection?.sync_status || connection?.settings?.sync_status || "requires_provider_api_access",
      last_sync_at: connection?.last_sync_at || null,
      imported_summary: connection?.imported_summary || connection?.settings?.imported_summary || {
        reservations: importedForProvider.length,
        guests: importedForProvider.filter((item) => item.guest_email || item.guest_name).length,
        availability: 0
      },
      error_count: errorsForProvider.length,
      latest_error: errorsForProvider[0]?.message || connection?.error_message || ""
    };
  });
}

function adminReadinessChecklists() {
  return {
    mvp: [
      ["Real restaurant onboarding works", featureStatusFor("restaurant_onboarding")],
      ["Login works", "live"],
      ["Offer creation works", "live"],
      ["Guest discovery works", "live"],
      ["Reservation/lead capture works", featureStatusFor("guest_booking_leads")],
      ["Emails are actually sent", featureStatusFor("transactional_email")],
      ["Dashboard uses real database data", supabaseConfigured ? "beta" : "demo_only"],
      ["AI demand score uses stored data", featureStatusFor("ai_demand_recommendations")],
      ["AI recommendation creates suggested actions", featureStatusFor("ai_action_approval")],
      ["Restaurant approves AI action before execution", featureStatusFor("ai_action_approval")],
      ["Approved AI action creates offer/campaign", featureStatusFor("ai_action_approval")],
      ["AI action result is tracked", featureStatusFor("ai_action_approval")],
      ["Mock data removed from live views", supabaseConfigured ? "requires_more_data" : "demo_only"],
      ["Demo-only features are clearly labeled", "beta"],
      ["Admin can monitor errors", featureStatusFor("monitoring_error_logs")],
      ["Privacy pages and request structures exist", featureStatusFor("privacy_compliance")],
      ["Production environment is secure", supabaseConfigured ? "beta" : "requires_integration"]
    ].map(([label, status]) => ({ label, status })),
    ai_engine: [
      ["Reads real database records", supabaseConfigured ? "beta" : "demo_only"],
      ["Uses real restaurant data", supabaseConfigured ? "beta" : "demo_only"],
      ["Stores recommendations", featureStatusFor("ai_demand_recommendations")],
      ["Explains recommendations", featureStatusFor("ai_demand_recommendations")],
      ["Tracks acceptance/rejection", featureStatusFor("ai_action_approval")],
      ["Measures outcome", featureStatusFor("ai_action_approval")],
      ["Improves scoring from prior outcomes", "beta"],
      ["Separates real AI from demo AI", "beta"],
      ["Works without OpenTable/Resy imports", "beta"],
      ["Improves when integrations are connected", "requires_integration"]
    ].map(([label, status]) => ({ label, status })),
    integration_readiness: [
      ["Provider abstraction exists", "live"],
      ["CSV import exists", featureStatusFor("csv_reservation_import")],
      ["Manual import exists", featureStatusFor("manual_data_import")],
      ["Mock provider works", "beta"],
      ["Provider credentials are securely stored", "requires_integration"],
      ["Sync logs exist", featureStatusFor("integration_hub")],
      ["Errors are visible to admin", featureStatusFor("monitoring_error_logs")],
      ["Imported reservations affect AI demand scoring", "beta"],
      ["Imported reservations appear in dashboard", featureStatusFor("csv_reservation_import")],
      ["OpenTable/Resy are labeled as pending official API access until approved", "live"]
    ].map(([label, status]) => ({ label, status }))
  };
}

async function integrationHub(method, body, headers, query, scope = "admin") {
  const { profile } = await requireProfile(headers, scope === "admin" ? ["admin"] : ["partner", "admin"]);
  const restaurant = scope === "partner" ? await getPartnerRestaurant(profile, query, body) : null;
  const requestedRestaurantId = clean(query.get("restaurant_id") || body.restaurant_id || restaurant?.id);
  const restaurantFilter = scope === "partner" || requestedRestaurantId
    ? (restaurant?.id || requestedRestaurantId)
    : "";

  if (method === "GET") {
    if (!supabaseConfigured) {
      ensureDemo();
      const scopedConnections = restaurantFilter
        ? demo.integrationConnections.filter((item) => !item.restaurant_id || item.restaurant_id === restaurantFilter)
        : demo.integrationConnections;
      const scopedImported = restaurantFilter
        ? demo.importedReservations.filter((item) => item.restaurant_id === restaurantFilter)
        : demo.importedReservations;
      const scopedErrors = restaurantFilter
        ? demo.integrationErrorLogs.filter((item) => !item.restaurant_id || item.restaurant_id === restaurantFilter)
        : demo.integrationErrorLogs;
      const scopedRuns = restaurantFilter
        ? demo.integrationSyncRuns.filter((item) => !item.restaurant_id || item.restaurant_id === restaurantFilter)
        : demo.integrationSyncRuns;
      return json(200, {
        mode: "demo",
        feature_status: featureStatusFor("integration_hub"),
        providers: integrationCatalogRows(scopedConnections, scopedImported, scopedErrors),
        connections: scopedConnections,
        sync_runs: scopedRuns,
        errors: scopedErrors,
        import_jobs: demo.dataImportJobs.filter((item) => !restaurantFilter || item.restaurant_id === restaurantFilter),
        imported_reservations: scopedImported.slice(0, 50),
        constraints: ["Requires provider API access", "Requires restaurant authorization", "Requires approved integration partnership"]
      });
    }

    const scopedParam = restaurantFilter ? `&restaurant_id=eq.${encodeURIComponent(restaurantFilter)}` : "";
    const connectionPath = `/rest/v1/integration_connections?select=*,integrations(provider,display_name,category,status,required_scopes)&order=created_at.desc${scopedParam}`;
    const [connections, importedReservations, syncRuns, errors, importJobs] = await Promise.all([
      supabaseFetch(connectionPath, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/imported_reservations?select=*&order=imported_at.desc&limit=100${scopedParam}`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/integration_sync_runs?select=*&order=started_at.desc&limit=50${scopedParam}`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/integration_error_logs?select=*&order=created_at.desc&limit=50${scopedParam}`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/data_import_jobs?select=*&order=created_at.desc&limit=50${scopedParam}`, { service: true }).catch(() => [])
    ]);
    return json(200, {
      mode: "supabase",
      feature_status: featureStatusFor("integration_hub"),
      providers: integrationCatalogRows(connections || [], importedReservations || [], errors || []),
      connections: connections || [],
      sync_runs: syncRuns || [],
      errors: errors || [],
      import_jobs: importJobs || [],
      imported_reservations: importedReservations || [],
      constraints: ["Requires provider API access", "Requires restaurant authorization", "Requires approved integration partnership"]
    });
  }

  if (method !== "POST" && method !== "PATCH") return json(405, { error: "Method not allowed." });
  const action = clean(body.action || "sync_reservations");
  const providerKey = clean(body.provider || body.integration_provider || "opentable").toLowerCase().replace(/\s+/g, "_");
  const meta = providerMeta(providerKey);
  const adapter = createReservationProvider(providerKey);
  const now = nowIso();

  if (!supabaseConfigured) {
    ensureDemo();
    let connection = demo.integrationConnections.find((item) => item.provider === providerKey && (!restaurantFilter || !item.restaurant_id || item.restaurant_id === restaurantFilter));
    if (!connection) {
      connection = {
        id: crypto.randomUUID(),
        provider: providerKey,
        display_name: meta.display_name,
        category: meta.category,
        restaurant_id: restaurantFilter || null,
        status: "not_connected",
        sync_status: "requires_provider_api_access",
        labels: meta.labels,
        capabilities: meta.capabilities,
        imported_summary: { reservations: 0, guests: 0, availability: 0 },
        created_at: now,
        updated_at: now
      };
      demo.integrationConnections.unshift(connection);
    }
    if (action === "disconnect") {
      Object.assign(connection, adapter.disconnectProvider(), { status: "disabled", updated_at: now });
    } else if (action === "connect") {
      const result = adapter.connectProvider({ restaurant_id: restaurantFilter, credentials_ref: "encrypted_secret_ref_required" });
      Object.assign(connection, {
        status: "needs_reauth",
        sync_status: result.status,
        error_message: result.message,
        labels: result.labels,
        updated_at: now
      });
    } else {
      const result = adapter.syncReservations();
      const run = {
        id: crypto.randomUUID(),
        provider: providerKey,
        restaurant_id: restaurantFilter || null,
        sync_type: "reservations",
        status: "requires_integration",
        imported_reservations: 0,
        imported_guests: 0,
        imported_availability: 0,
        summary: result,
        started_at: now,
        completed_at: now,
        created_at: now
      };
      demo.integrationSyncRuns.unshift(run);
      demo.integrationErrorLogs.unshift({
        id: crypto.randomUUID(),
        provider: providerKey,
        restaurant_id: restaurantFilter || null,
        severity: "warning",
        error_code: "PROVIDER_ACCESS_REQUIRED",
        message: `${meta.display_name} sync requires provider API access, restaurant authorization, and approved integration partnership.`,
        details: { labels: meta.labels, action },
        created_at: now
      });
      Object.assign(connection, { sync_status: result.sync_status, last_sync_at: null, error_message: demo.integrationErrorLogs[0].message, updated_at: now });
    }
    return integrationHub("GET", {}, headers, query, scope);
  }

  const integrations = await supabaseFetch(`/rest/v1/integrations?select=*&provider=eq.${encodeURIComponent(providerKey)}&limit=1`, { service: true }).catch(() => []);
  const integration = integrations?.[0];
  if (!integration) return json(404, { error: "Integration provider is not configured." });
  const connectionRows = await supabaseFetch(`/rest/v1/integration_connections?select=*&integration_id=eq.${encodeURIComponent(integration.id)}${restaurantFilter ? `&restaurant_id=eq.${encodeURIComponent(restaurantFilter)}` : ""}&limit=1`, { service: true }).catch(() => []);
  const existingConnection = connectionRows?.[0] || null;
  const connectionPayload = {
    integration_id: integration.id,
    restaurant_id: restaurantFilter || null,
    user_id: profile.id,
    status: action === "disconnect" ? "disabled" : "needs_reauth",
    settings: {
      labels: meta.labels,
      capabilities: meta.capabilities,
      sync_status: action === "disconnect" ? "disabled" : "requires_provider_api_access",
      secret_storage: "encrypted_secret_ref_required"
    },
    error_message: action === "disconnect" ? null : `${meta.display_name} requires provider API access before live sync.`
  };
  if (existingConnection?.id) {
    await supabaseFetch(`/rest/v1/integration_connections?id=eq.${encodeURIComponent(existingConnection.id)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: connectionPayload
    });
  } else {
    await supabaseFetch("/rest/v1/integration_connections", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: connectionPayload
    });
  }
  if (action !== "disconnect") {
    await Promise.all([
      supabaseFetch("/rest/v1/integration_sync_runs", {
        method: "POST",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: {
          restaurant_id: restaurantFilter || null,
          provider: providerKey,
          sync_type: action.replace(/^sync_/, "") || "reservations",
          status: "requires_integration",
          summary: adapter.syncReservations()
        }
      }).catch(() => null),
      supabaseFetch("/rest/v1/integration_error_logs", {
        method: "POST",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: {
          restaurant_id: restaurantFilter || null,
          provider: providerKey,
          severity: "warning",
          error_code: "PROVIDER_ACCESS_REQUIRED",
          message: `${meta.display_name} sync requires provider API access, restaurant authorization, and approved integration partnership.`,
          details: { labels: meta.labels, action }
        }
      }).catch(() => null)
    ]);
  }
  return integrationHub("GET", {}, headers, query, scope);
}

async function reservationDataImport(method, body, headers, query) {
  if (method !== "POST" && method !== "GET") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);
  const restaurantId = restaurant.id;

  if (method === "GET") {
    if (!supabaseConfigured) {
      ensureDemo();
      return json(200, {
        mode: "demo",
        jobs: demo.dataImportJobs.filter((item) => item.restaurant_id === restaurantId),
        imported_reservations: demo.importedReservations.filter((item) => item.restaurant_id === restaurantId),
        manual_uploads: demo.manualPerformanceUploads.filter((item) => item.restaurant_id === restaurantId)
      });
    }
    const [jobs, importedReservations, manualUploads] = await Promise.all([
      supabaseFetch(`/rest/v1/data_import_jobs?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/imported_reservations?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=imported_at.desc&limit=100`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/manual_performance_uploads?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc&limit=50`, { service: true }).catch(() => [])
    ]);
    return json(200, { mode: "supabase", jobs, imported_reservations: importedReservations, manual_uploads: manualUploads });
  }

  const importType = clean(body.import_type || body.type || "reservations");
  const provider = clean(body.provider || body.source || (body.csv ? "csv_import" : "manual_entry")).toLowerCase().replace(/\s+/g, "_");
  const now = nowIso();

  if (["weekly_performance", "reservation_summary"].includes(importType)) {
    const upload = {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      created_by: profile.id,
      service_week: clean(body.service_week || body.week || new Date().toISOString().slice(0, 10)),
      reservations_count: numberOr(body.reservations_count, 0),
      covers_count: numberOr(body.covers_count || body.guests_count, 0),
      notes: clean(body.notes),
      raw_payload: sanitizeReservationImportPayload(body),
      created_at: now
    };
    if (!supabaseConfigured) {
      ensureDemo();
      demo.manualPerformanceUploads.unshift(upload);
      demo.dataImportJobs.unshift({
        id: crypto.randomUUID(),
        restaurant_id: restaurantId,
        created_by: profile.id,
        source: provider,
        import_type: importType,
        status: "completed",
        rows_received: 1,
        rows_imported: 1,
        rows_failed: 0,
        mapping_summary: { manual_upload_id: upload.id },
        error_summary: {},
        created_at: now,
        completed_at: now
      });
      return json(201, { mode: "demo", upload, message: "Manual performance upload saved." });
    }
    const rows = await supabaseFetch("/rest/v1/manual_performance_uploads?select=*", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=representation" },
      body: upload
    });
    await supabaseFetch("/rest/v1/data_import_jobs", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: {
        restaurant_id: restaurantId,
        created_by: profile.id,
        source: provider,
        import_type: importType,
        status: "completed",
        rows_received: 1,
        rows_imported: 1,
        mapping_summary: { manual_upload_id: rows?.[0]?.id || null },
        completed_at: now
      }
    }).catch(() => null);
    return json(201, { mode: "supabase", upload: rows?.[0], message: "Manual performance upload saved." });
  }

  const rows = Array.isArray(body.rows) ? body.rows : parseCsvRows(body.csv || body.csv_text || body.text || "");
  if (!rows.length) return json(400, { error: "CSV rows or manual reservation rows are required." });
  const mappedRows = rows.map((row) => importedReservationFromRow(row, provider, restaurantId));
  const guests = mappedRows
    .filter((row) => row.guest_email || row.guest_name)
    .map((row) => ({
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      provider,
      external_guest_id: row.guest_email || row.guest_name || row.external_reservation_id,
      email: row.guest_email || null,
      full_name: row.guest_name || null,
      phone: row.guest_phone || null,
      visits_count: 1,
      raw_payload: row.raw_payload,
      imported_at: now
    }));

  if (!supabaseConfigured) {
    ensureDemo();
    demo.importedReservations.unshift(...mappedRows);
    demo.importedGuests.unshift(...guests);
    const job = {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      created_by: profile.id,
      source: provider,
      import_type: "reservations",
      status: "completed",
      rows_received: rows.length,
      rows_imported: mappedRows.length,
      rows_failed: 0,
      mapping_summary: {
        unified_fields: ["reservation_start", "reservation_end", "party_size", "guest_name", "guest_email", "status", "source"],
        provider
      },
      error_summary: {},
      created_at: now,
      completed_at: now
    };
    demo.dataImportJobs.unshift(job);
    demo.integrationSyncRuns.unshift({
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      provider,
      sync_type: "csv_import",
      status: "completed",
      imported_reservations: mappedRows.length,
      imported_guests: guests.length,
      imported_availability: 0,
      summary: { source: "csv_or_manual_import", unified_format: true },
      started_at: now,
      completed_at: now,
      created_at: now
    });
    return json(201, {
      mode: "demo",
      job,
      imported_reservations: mappedRows,
      imported_guests: guests,
      message: `${mappedRows.length} reservations imported into the unified SmartTable format.`
    });
  }

  const jobRows = await supabaseFetch("/rest/v1/data_import_jobs?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      restaurant_id: restaurantId,
      created_by: profile.id,
      source: provider,
      import_type: "reservations",
      status: "completed",
      rows_received: rows.length,
      rows_imported: mappedRows.length,
      rows_failed: 0,
      mapping_summary: { unified_fields: ["reservation_start", "reservation_end", "party_size", "guest_name", "guest_email", "status", "source"], provider },
      completed_at: now
    }
  });
  const importedRows = await supabaseFetch("/rest/v1/imported_reservations?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: mappedRows.map(({ id, notes, source, ...row }) => row)
  }).catch((error) => {
    throw Object.assign(new Error(`Reservation import failed: ${error.message}`), { status: error.status || 500 });
  });
  if (guests.length) {
    await supabaseFetch("/rest/v1/imported_guests", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: guests.map(({ id, ...row }) => row)
    }).catch(() => null);
  }
  await supabaseFetch("/rest/v1/integration_sync_runs", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      restaurant_id: restaurantId,
      provider,
      sync_type: "csv_import",
      status: "completed",
      imported_reservations: mappedRows.length,
      imported_guests: guests.length,
      summary: { source: "csv_or_manual_import", unified_format: true }
    }
  }).catch(() => null);
  return json(201, {
    mode: "supabase",
    job: jobRows?.[0],
    imported_reservations: importedRows || [],
    imported_guests: guests,
    message: `${mappedRows.length} reservations imported into the unified SmartTable format.`
  });
}

async function adminFeatureFlags(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (method === "GET") {
    if (!supabaseConfigured) {
      ensureDemo();
      return json(200, { mode: "demo", flags: demo.featureFlags, features: featureStatusRows() });
    }
    const flags = await supabaseFetch("/rest/v1/feature_flags?select=*&order=key.asc", { service: true }).catch(() => []);
    return json(200, { mode: "supabase", flags, features: featureStatusRows() });
  }
  if (method !== "PATCH") return json(405, { error: "Method not allowed." });
  const key = clean(body.key);
  const status = clean(body.status || "beta");
  const enabled = body.enabled === undefined ? true : Boolean(body.enabled === true || body.enabled === "true");
  if (!key) return json(400, { error: "Feature key is required." });
  if (!["live", "beta", "demo_only", "coming_soon", "requires_integration", "requires_more_data"].includes(status)) {
    return json(400, { error: "Invalid feature status." });
  }
  if (!supabaseConfigured) {
    ensureDemo();
    const flag = demo.featureFlags.find((item) => item.key === key) || { key, label: key, description: "", audience: "all", owner: "admin" };
    Object.assign(flag, { status, enabled, updated_at: nowIso() });
    if (!demo.featureFlags.includes(flag)) demo.featureFlags.push(flag);
    return json(200, { mode: "demo", flag });
  }
  const rows = await supabaseFetch("/rest/v1/feature_flags?select=*&on_conflict=key", {
    method: "POST",
    service: true,
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: {
      key,
      label: clean(body.label || key),
      status,
      enabled,
      audience: clean(body.audience || "all"),
      description: clean(body.description || ""),
      owner: clean(body.owner || "admin")
    }
  });
  return json(200, { mode: "supabase", flag: rows?.[0] });
}

async function adminMonitoring(method, headers) {
  await requireProfile(headers, ["admin"]);
  if (method !== "GET") return json(405, { error: "Method not allowed." });
  if (!supabaseConfigured) {
    ensureDemo();
    return json(200, {
      mode: "demo",
      app_errors: demo.appErrorLogs,
      integration_errors: demo.integrationErrorLogs,
      failed_emails: demo.emailLogs.filter((item) => ["failed", "bounced", "complained"].includes(emailLogStatus(item))).map(maskEmailLogForAdmin),
      failed_ai_actions: demo.aiActions.filter((item) => ["failed", "rejected"].includes(item.status)),
      admin_alerts: demo.adminAlerts
    });
  }
  const [appErrors, integrationErrors, failedEmails, failedAiActions, adminAlerts] = await Promise.all([
    supabaseFetch("/rest/v1/app_error_logs?select=*&order=created_at.desc&limit=50", { service: true }).catch(() => []),
    supabaseFetch("/rest/v1/integration_error_logs?select=*&order=created_at.desc&limit=50", { service: true }).catch(() => []),
    supabaseFetch("/rest/v1/email_logs?select=*&or=(delivery_status.eq.failed,status.eq.failed,status.eq.bounced,status.eq.complained)&order=created_at.desc&limit=50", { service: true })
      .catch(() => supabaseFetch("/rest/v1/email_logs?select=*&delivery_status=eq.failed&order=created_at.desc&limit=50", { service: true }).catch(() => [])),
    supabaseFetch("/rest/v1/ai_actions?select=*&status=in.(failed,rejected)&order=created_at.desc&limit=50", { service: true }).catch(() => []),
    supabaseFetch("/rest/v1/admin_alerts?select=*&order=created_at.desc&limit=50", { service: true }).catch(() => [])
  ]);
  return json(200, { mode: "supabase", app_errors: appErrors, integration_errors: integrationErrors, failed_emails: (failedEmails || []).map(maskEmailLogForAdmin), failed_ai_actions: failedAiActions, admin_alerts: adminAlerts });
}

async function adminBilling(method, headers) {
  await requireProfile(headers, ["admin"]);
  if (method !== "GET") return json(405, { error: "Method not allowed." });
  if (!supabaseConfigured) {
    ensureDemo();
    return json(200, {
      mode: "demo",
      plans: demo.billingPlans,
      subscriptions: demo.subscriptions.map((item) => ({ ...item, restaurant_name: demo.restaurants.find((restaurant) => restaurant.id === item.restaurant_id)?.name || "" })),
      invoices: demo.invoices,
      payment_events: demo.paymentEvents,
      stripe_status: "foundation_ready_requires_stripe_keys"
    });
  }
  const [plans, subscriptions, invoices, events] = await Promise.all([
    supabaseFetch("/rest/v1/billing_plans?select=*&order=monthly_price.asc", { service: true }).catch(() => []),
    supabaseFetch("/rest/v1/subscriptions?select=*,restaurants(name)&order=created_at.desc", { service: true }).catch(() => []),
    supabaseFetch("/rest/v1/invoices?select=*&order=created_at.desc&limit=100", { service: true }).catch(() => []),
    supabaseFetch("/rest/v1/payment_events?select=*&order=created_at.desc&limit=100", { service: true }).catch(() => [])
  ]);
  return json(200, { mode: "supabase", plans, subscriptions, invoices, payment_events: events, stripe_status: "foundation_ready_requires_stripe_keys" });
}

async function privacyRequests(method, body, headers) {
  if (method === "GET") {
    await requireProfile(headers, ["admin"]);
    if (!supabaseConfigured) {
      ensureDemo();
      return json(200, { mode: "demo", requests: demo.privacyRequests, consents: demo.guestConsents });
    }
    const [requests, consents] = await Promise.all([
      supabaseFetch("/rest/v1/privacy_requests?select=*&order=created_at.desc&limit=100", { service: true }).catch(() => []),
      supabaseFetch("/rest/v1/guest_consents?select=*&order=created_at.desc&limit=100", { service: true }).catch(() => [])
    ]);
    return json(200, { mode: "supabase", requests, consents });
  }
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const email = lower(body.guest_email || body.email);
  const requestType = clean(body.request_type || "access");
  if (!email || !["access", "deletion", "correction", "export", "unsubscribe"].includes(requestType)) {
    return json(400, { error: "Valid email and request type are required." });
  }
  const row = {
    id: crypto.randomUUID(),
    guest_email: email,
    request_type: requestType,
    status: "received",
    message: clean(body.message),
    created_at: nowIso()
  };
  if (!supabaseConfigured) {
    ensureDemo();
    demo.privacyRequests.unshift(row);
    return json(201, { mode: "demo", request: row });
  }
  const rows = await supabaseFetch("/rest/v1/privacy_requests?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: (({ id, ...payload }) => payload)(row)
  });
  return json(201, { mode: "supabase", request: rows?.[0] });
}

function latestConsent(consents = [], type) {
  const normalized = clean(type).toLowerCase();
  return [...consents]
    .filter((item) => clean(item.consent_type).toLowerCase() === normalized)
    .sort((a, b) => new Date(b.created_at || b.accepted_at || 0) - new Date(a.created_at || a.accepted_at || 0))[0] || null;
}

function guestConsentSummary(guestProfile = {}, consents = []) {
  const preferences = guestProfile?.preferences || {};
  const preferenceConsent = preferences.consents || guestProfile?.consent || {};
  const terms = latestConsent(consents, "terms") || latestConsent(consents, "terms_conditions") || {};
  const privacy = latestConsent(consents, "privacy") || latestConsent(consents, "privacy_policy") || {};
  const marketing = latestConsent(consents, "marketing") || {};
  const marketingGranted = marketing.status
    ? marketing.status === "granted"
    : Boolean(preferenceConsent.marketing);
  return {
    terms_accepted: Boolean(terms.terms_accepted ?? preferenceConsent.terms_accepted ?? preferenceConsent.terms),
    terms_version: terms.terms_version || preferenceConsent.terms_version || TERMS_VERSION,
    terms_accepted_at: terms.terms_accepted_at || terms.accepted_at || preferenceConsent.accepted_at || null,
    privacy_accepted: Boolean(privacy.privacy_accepted ?? preferenceConsent.privacy_policy_accepted ?? preferenceConsent.privacy),
    privacy_policy_version: privacy.privacy_policy_version || privacy.privacy_version || preferenceConsent.privacy_policy_version || PRIVACY_POLICY_VERSION,
    privacy_accepted_at: privacy.privacy_accepted_at || privacy.accepted_at || preferenceConsent.accepted_at || null,
    marketing_consent: marketingGranted,
    marketing_consent_at: marketing.marketing_consent_timestamp || marketing.accepted_at || preferenceConsent.marketing_accepted_at || null,
    marketing_revoked_at: marketing.status === "revoked" ? marketing.revoked_at || marketing.created_at || null : null,
    acceptance_language: terms.language || privacy.language || preferenceConsent.language || "en"
  };
}

function guestNotificationSettings(preferences = {}) {
  return {
    operational_reservation_emails: true,
    preferences: arrayFrom(preferences.notification_preferences),
    channels: arrayFrom(preferences.notification_channels).filter((item) => item === "Email"),
    frequency: clean(preferences.notification_frequency || "Only important reservation messages"),
    marketing_consent: Boolean(preferences.consents?.marketing),
    sms_supported: false,
    push_supported: false
  };
}

function guestReservationExportRows(rows = []) {
  return rows.map((row) => ({
    reservation_id: row.reservation_id,
    reference: row.reference,
    restaurant_id: row.restaurant_id,
    restaurant_name: row.restaurant_name,
    offer_id: row.offer_id,
    offer_title: row.offer_title,
    reservation_date: row.reservation_date || row.offer_date,
    reservation_time: row.reservation_time || row.offer_time,
    party_size: row.party_size,
    status: row.status,
    discount_percent: row.discount_percent,
    created_at: row.created_at,
    updated_at: row.updated_at,
    cancelled_at: row.cancelled_at || null
  }));
}

function guestDataExportScope() {
  return [
    "Profile",
    "Preferences",
    "Favorites",
    "Reservations",
    "Reviews and feedback",
    "Notification settings",
    "Consent records"
  ];
}

function buildDemoGuestDataExport(profile, guest, guestProfile) {
  const email = lower(profile.email || guest.email);
  const preferences = guestProfile?.preferences || {};
  const reservations = reservationOverviewRows().filter((row) => lower(row.guest_email) === email || clean(row.guest_id) === clean(profile.id));
  const favorites = demo.restaurantFollowers.filter((item) => lower(item.guest_email) === email);
  const notifications = demo.guestNotifications.filter((item) => lower(item.guest_email) === email || item.profile_key === aiProfileKey(email));
  const consents = demo.guestConsents.filter((item) => lower(item.guest_email) === email || clean(item.guest_id) === clean(guest.id));
  return {
    generated: false,
    status: "request_received",
    scope: guestDataExportScope(),
    preview: {
      profile: {
        id: guest.id,
        email: guest.email,
        first_name: guest.first_name,
        last_name: guest.last_name,
        phone: guest.phone,
        city: guest.city,
        region: guest.region,
        postal_code: guest.postal_code,
        selected_language: guest.selected_language
      },
      preferences,
      favorites: favorites.map(({ id, restaurant_id, notification_enabled, created_at }) => ({ id, restaurant_id, notification_enabled, created_at })),
      reservations: guestReservationExportRows(reservations),
      reviews: demo.restaurantReviews.filter((item) => lower(item.guest_email) === email),
      feedback: demo.photoRewardSubmissions.filter((item) => lower(item.guest_email) === email || clean(item.guest_id) === clean(profile.id)),
      notification_settings: guestNotificationSettings(preferences),
      consent_records: consents
    },
    excluded: ["Password hashes", "Internal security metadata", "Other users' data", "Restaurant private data", "Admin-only notes"]
  };
}

async function verifyGuestPassword(profile, password) {
  const value = String(password || "");
  if (!value) return false;
  if (!supabaseConfigured) {
    ensureDemo();
    return Boolean(demo.users.find((item) => item.id === profile.id && item.password === value));
  }
  try {
    await supabaseFetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      service: false,
      body: { email: profile.email, password: value }
    });
    return true;
  } catch {
    return false;
  }
}

async function createGuestPrivacyRequest({ profile, guest, requestType, message, details = {} }) {
  const payload = {
    id: crypto.randomUUID(),
    guest_email: lower(profile.email || guest?.email),
    request_type: requestType,
    status: "received",
    message: clean(message),
    created_at: nowIso(),
    details
  };
  if (!supabaseConfigured) {
    ensureDemo();
    demo.privacyRequests.unshift(payload);
    return payload;
  }
  const rows = await supabaseFetch("/rest/v1/privacy_requests?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      guest_email: payload.guest_email,
      request_type: payload.request_type,
      status: payload.status,
      message: payload.message
    }
  });
  return rows?.[0] || payload;
}

async function guestPrivacy(method, body, headers) {
  const { profile, token } = await requireProfile(headers, ["guest"]);
  const email = lower(profile.email);

  if (!supabaseConfigured) {
    ensureDemo();
    const guest = demoGuestForProfile(profile);
    if (!guest) return json(404, { error: "Guest profile not found." });
    const guestProfile = demoGuestProfileForGuest(guest);
    const requests = demo.privacyRequests.filter((item) => lower(item.guest_email) === email);
    const consents = demo.guestConsents.filter((item) => lower(item.guest_email) === email || clean(item.guest_id) === clean(guest.id));
    if (method === "GET") {
      return json(200, {
        mode: "demo",
        consent: guestConsentSummary(guestProfile, consents),
        requests,
        export_supported: false,
        deletion_supported: true,
        export_scope: guestDataExportScope()
      });
    }
    if (method !== "POST") return json(405, { error: "Method not allowed." });
    const action = clean(body.action);
    if (action === "export") {
      const request = await createGuestPrivacyRequest({
        profile,
        guest,
        requestType: "export",
        message: body.message || "Guest requested personal data export.",
        details: { scope: guestDataExportScope() }
      });
      return json(202, {
        mode: "demo",
        request,
        export: buildDemoGuestDataExport(profile, guest, guestProfile),
        message: "Data export request received. No downloadable file has been generated yet."
      });
    }
    if (action !== "delete_account") return json(400, { error: "Unsupported privacy action." });
    if (clean(body.confirmation_phrase) !== "DELETE MY ACCOUNT") return json(400, { error: "Confirmation phrase is required." });
    if (!(await verifyGuestPassword(profile, body.current_password))) return json(401, { error: "Password confirmation failed." });
    const oldEmail = email;
    const anonymizedEmail = `deleted-${guest.id}@smarttable.local`;
    await createGuestPrivacyRequest({
      profile,
      guest,
      requestType: "deletion",
      message: body.message || "Guest confirmed account deletion.",
      details: { anonymized_email: anonymizedEmail }
    });
    Object.assign(guest, {
      email: anonymizedEmail,
      full_name: "Deleted guest",
      first_name: "Deleted",
      last_name: "Guest",
      phone: "",
      status: "deleted",
      deleted_at: nowIso(),
      updated_at: nowIso()
    });
    const demoUser = demo.users.find((item) => item.id === profile.id);
    if (demoUser) {
      demoUser.email = anonymizedEmail;
      demoUser.password = crypto.randomUUID();
    }
    const demoProfile = demo.profiles.find((item) => item.id === profile.id);
    if (demoProfile) {
      demoProfile.email = anonymizedEmail;
      demoProfile.full_name = "Deleted guest";
      demoProfile.status = "deleted";
      demoProfile.updated_at = nowIso();
    }
    if (guestProfile) {
      guestProfile.preferences = {};
      guestProfile.consent = {};
      guestProfile.deleted_at = nowIso();
      guestProfile.updated_at = nowIso();
    }
    demo.restaurantFollowers = demo.restaurantFollowers.filter((item) => lower(item.guest_email) !== oldEmail);
    demo.guestNotifications.forEach((item) => {
      if (lower(item.guest_email) === oldEmail) {
        item.guest_email = anonymizedEmail;
        item.read_at = item.read_at || nowIso();
      }
    });
    demo.reservations.forEach((item) => {
      if (lower(item.guest_email) === oldEmail || clean(item.guest_id) === clean(profile.id)) {
        item.guest_name = "Deleted guest";
        item.guest_email = anonymizedEmail;
        item.guest_phone = "";
        item.guest_id = null;
        item.updated_at = nowIso();
      }
    });
    await createAuditLog({
      profile: { ...profile, email: anonymizedEmail },
      action: "guest_account_deleted",
      entityType: "guest",
      entityId: guest.id,
      metadata: { message: "Guest account anonymized after deletion confirmation." }
    });
    return json(200, { mode: "demo", deleted: true, sign_out: true });
  }

  const guests = await supabaseFetch(`/rest/v1/guests?select=*&user_id=eq.${encodeURIComponent(profile.id)}&limit=1`, { service: true });
  const guest = guests?.[0];
  if (!guest?.id) return json(404, { error: "Guest profile not found." });
  const [guestProfiles, consents, requests] = await Promise.all([
    supabaseFetch(`/rest/v1/guest_profiles?select=*&guest_id=eq.${encodeURIComponent(guest.id)}&limit=1`, { service: true }).catch(() => []),
    supabaseFetch(`/rest/v1/guest_consents?select=*&guest_email=eq.${encodeURIComponent(email)}&order=created_at.desc`, { service: true }).catch(() => []),
    supabaseFetch(`/rest/v1/privacy_requests?select=*&guest_email=eq.${encodeURIComponent(email)}&order=created_at.desc`, { service: true }).catch(() => [])
  ]);
  const guestProfile = guestProfiles?.[0] || null;
  if (method === "GET") {
    return json(200, {
      mode: "supabase",
      consent: guestConsentSummary(guestProfile, consents || []),
      requests: requests || [],
      export_supported: false,
      deletion_supported: true,
      export_scope: guestDataExportScope()
    });
  }
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const action = clean(body.action);
  if (action === "export") {
    const request = await createGuestPrivacyRequest({
      profile,
      guest,
      requestType: "export",
      message: body.message || "Guest requested personal data export.",
      details: { scope: guestDataExportScope() }
    });
    return json(202, { mode: "supabase", request, export_supported: false, export_scope: guestDataExportScope(), message: "Data export request received. No downloadable file has been generated yet." });
  }
  if (action !== "delete_account") return json(400, { error: "Unsupported privacy action." });
  if (clean(body.confirmation_phrase) !== "DELETE MY ACCOUNT") return json(400, { error: "Confirmation phrase is required." });
  if (!(await verifyGuestPassword(profile, body.current_password))) return json(401, { error: "Password confirmation failed." });
  const anonymizedEmail = `deleted-${guest.id}@smarttable.local`;
  await createGuestPrivacyRequest({
    profile,
    guest,
    requestType: "deletion",
    message: body.message || "Guest confirmed account deletion.",
    details: { anonymized_email: anonymizedEmail }
  });
  await supabaseFetch(`/rest/v1/guests?id=eq.${encodeURIComponent(guest.id)}`, {
    method: "PATCH",
    service: true,
    body: {
      email: anonymizedEmail,
      full_name: "Deleted guest",
      first_name: "Deleted",
      last_name: "Guest",
      phone: "",
      status: "deleted",
      deleted_at: nowIso(),
      updated_at: nowIso()
    }
  });
  await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    service: true,
    body: { email: anonymizedEmail, full_name: "Deleted guest", updated_at: nowIso() }
  }).catch(() => null);
  if (guestProfile?.id) {
    await supabaseFetch(`/rest/v1/guest_profiles?id=eq.${encodeURIComponent(guestProfile.id)}`, {
      method: "PATCH",
      service: true,
      body: { preferences: {}, consent: {}, deleted_at: nowIso(), updated_at: nowIso() }
    }).catch(() => null);
  }
  await supabaseFetch(`/rest/v1/restaurant_followers?guest_email=eq.${encodeURIComponent(email)}`, { method: "DELETE", service: true }).catch(() => null);
  await supabaseFetch(`/rest/v1/guest_notifications?guest_email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    service: true,
    body: { guest_email: anonymizedEmail, read_at: nowIso() }
  }).catch(() => null);
  await supabaseFetch(`/rest/v1/reservations?guest_email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    service: true,
    body: { guest_name: "Deleted guest", guest_email: anonymizedEmail, guest_phone: "", guest_id: null, updated_at: nowIso() }
  }).catch(() => null);
  await supabaseFetch("/auth/v1/logout?scope=global", { method: "POST", service: false, token }).catch(() => null);
  await createAuditLog({
    profile: { ...profile, email: anonymizedEmail },
    action: "guest_account_deleted",
    entityType: "guest",
    entityId: guest.id,
    metadata: { message: "Guest account anonymized after deletion confirmation." }
  });
  return json(200, { mode: "supabase", deleted: true, sign_out: true });
}

async function guestSecurity(method, body, headers) {
  const { profile, token } = await requireProfile(headers, ["guest"]);
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const action = clean(body.action);
  if (action === "change_password") {
    const currentPassword = String(body.current_password || "");
    const newPassword = String(body.new_password || body.password || "");
    const confirmPassword = String(body.confirm_password || body.confirmPassword || "");
    if (!(await verifyGuestPassword(profile, currentPassword))) return json(401, { error: "Current password is incorrect." });
    if (!isStrongSignupPassword(newPassword)) return json(400, { error: "Use a stronger password." });
    if (newPassword !== confirmPassword) return json(400, { error: "Passwords must match." });
    if (!supabaseConfigured) {
      ensureDemo();
      const user = demo.users.find((item) => item.id === profile.id);
      if (!user) return json(404, { error: "User not found." });
      user.password = newPassword;
    } else {
      await supabaseFetch("/auth/v1/user", {
        method: "PUT",
        service: false,
        token,
        body: { password: newPassword }
      });
    }
    await createAuditLog({
      profile,
      action: "guest_password_changed",
      entityType: "auth",
      entityId: profile.id,
      metadata: { message: "Guest changed password from account security settings." }
    });
    return json(200, { mode: supabaseConfigured ? "supabase" : "demo", changed: true });
  }
  if (action === "sign_out_all") {
    if (supabaseConfigured) {
      await supabaseFetch("/auth/v1/logout?scope=global", { method: "POST", service: false, token }).catch(() => null);
    }
    await createAuditLog({
      profile,
      action: "guest_sign_out_all_sessions",
      entityType: "auth",
      entityId: profile.id,
      metadata: { message: "Guest requested sign out of all sessions.", provider_supported: supabaseConfigured }
    });
    return json(200, { mode: supabaseConfigured ? "supabase" : "demo", signed_out_all: supabaseConfigured, sign_out_current: true });
  }
  return json(400, { error: "Unsupported security action." });
}

function demoGuestForProfile(profile) {
  ensureDemo();
  return demo.guests.find((item) => item.status !== "deleted" && !item.deleted_at && (item.user_id === profile.id || lower(item.email) === lower(profile.email)));
}

function demoGuestProfileForGuest(guest) {
  return demo.guestProfiles.find((item) => item.guest_id === guest?.id);
}

function guestProfileCompletion(guest = {}, guestProfile = {}) {
  const preferences = guestProfile?.preferences || {};
  const checks = [
    clean(guest.first_name || guest.full_name),
    clean(guest.last_name || guest.full_name),
    clean(guest.phone),
    clean(guest.city || preferences.location?.city),
    clean(guest.region || preferences.location?.region),
    arrayFrom(guest.preferred_dining_areas || preferences.preferred_neighborhoods).length,
    arrayFrom(preferences.cuisines).length,
    arrayFrom(preferences.food_categories).length,
    arrayFrom(preferences.dietary_needs).length,
    arrayFrom(preferences.notification_preferences).length
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function guestAccountOverview(profile, guest = {}, guestProfile = {}) {
  const email = lower(profile.email || guest.email);
  const reservations = reservationOverviewRows().filter((row) => (
    lower(row.guest_email) === email || clean(row.guest_id) === clean(profile.id) || clean(row.guest_id) === clean(guest.id)
  ));
  const favorites = demo.restaurantFollowers.filter((item) => lower(item.guest_email) === email);
  const notifications = demo.guestNotifications.filter((item) => (
    lower(item.guest_email) === email || item.profile_key === aiProfileKey(email)
  ));
  const activeStatuses = new Set(["pending", "accepted", "confirmed"]);
  return {
    active_reservations: reservations.filter((item) => activeStatuses.has(normalizeReservationStatus(item.status))).length,
    favorite_restaurants: favorites.length,
    unread_notifications: notifications.filter((item) => !item.read_at).length,
    recent_reservations: reservations.slice(0, 5),
    important_notifications: notifications.slice(0, 5),
    profile_completion: guestProfileCompletion(guest, guestProfile),
    email_verified: Boolean(profile.email_verified ?? guest.email_verified ?? !supabaseConfigured)
  };
}

function normalizeGuestAccountPatch(body = {}) {
  const payload = {
    first_name: clean(body.first_name || body.firstName),
    last_name: clean(body.last_name || body.lastName),
    phone: clean(body.phone || body.phone_number),
    city: clean(body.city),
    region: clean(body.region || body.state),
    postal_code: clean(body.postal_code || body.zip),
    preferred_dining_areas: arrayFrom(body.preferred_dining_areas || body.preferred_neighborhoods),
    max_travel_distance_miles: Math.max(0, numberOr(body.max_travel_distance_miles || body.travel_distance_miles, 0)),
    transportation_method: clean(body.transportation_method),
    selected_language: normalizeLanguage(body.selected_language || body.preferred_language || body.language)
  };
  payload.full_name = clean(`${payload.first_name} ${payload.last_name}`) || clean(body.full_name);
  return payload;
}

function validateGuestAccountPatch(payload) {
  if (!payload.first_name) return "First name is required.";
  if (!payload.last_name) return "Last name is required.";
  if (!isValidSignupPhone(payload.phone)) return "Enter a valid phone number.";
  if (!payload.city) return "City is required.";
  if (!payload.region) return "State or region is required.";
  if (!payload.postal_code) return "ZIP or postal code is required.";
  if (!payload.preferred_dining_areas.length) return "Preferred dining areas are required.";
  if (!payload.max_travel_distance_miles) return "Maximum travel distance is required.";
  if (!payload.transportation_method) return "Transportation preference is required.";
  return "";
}

async function guestAccount(method, body, headers) {
  const { profile } = await requireProfile(headers, ["guest"]);
  if (!supabaseConfigured) {
    ensureDemo();
    const guest = demoGuestForProfile(profile);
    if (!guest) return json(404, { error: "Guest profile not found." });
    const guestProfile = demoGuestProfileForGuest(guest);
    if (method === "GET") {
      return json(200, { mode: "demo", guest, profile: guestProfile, overview: guestAccountOverview(profile, guest, guestProfile) });
    }
    if (method !== "PATCH") return json(405, { error: "Method not allowed." });
    if (body.email && lower(body.email) !== lower(profile.email)) return json(400, { error: "Email changes require a secure re-verification flow." });
    const payload = normalizeGuestAccountPatch(body);
    const validationError = validateGuestAccountPatch(payload);
    if (validationError) return json(400, { error: validationError });
    const previousGuest = { ...guest };
    const previousGuestProfile = guestProfile ? { ...guestProfile, preferences: { ...(guestProfile.preferences || {}) } } : null;
    try {
      Object.assign(guest, {
        first_name: payload.first_name,
        last_name: payload.last_name,
        full_name: payload.full_name,
        phone: payload.phone,
        city: payload.city,
        region: payload.region,
        postal_code: payload.postal_code,
        preferred_dining_areas: payload.preferred_dining_areas,
        max_travel_distance_miles: payload.max_travel_distance_miles,
        transportation_method: payload.transportation_method,
        selected_language: payload.selected_language,
        updated_at: nowIso()
      });
      const demoProfile = demo.profiles.find((item) => item.id === profile.id);
      if (demoProfile) Object.assign(demoProfile, {
        full_name: payload.full_name,
        phone: payload.phone,
        preferred_language: payload.selected_language,
        updated_at: nowIso()
      });
      if (guestProfile) {
        const preferences = normalizeGuestPreferencePatch(guestProfile.preferences || {}, {
          preferred_neighborhoods: payload.preferred_dining_areas,
          city: payload.city,
          region: payload.region,
          postal_code: payload.postal_code,
          max_travel_distance_miles: payload.max_travel_distance_miles,
          transportation_method: payload.transportation_method
        }, payload.selected_language);
        Object.assign(guestProfile, {
          preferences,
          preferred_neighborhoods: payload.preferred_dining_areas,
          updated_at: nowIso()
        });
      }
      await createAuditLog({
        profile,
        action: "guest_profile_updated",
        entityType: "guest",
        entityId: guest.id,
        metadata: { message: "Guest profile updated.", fields: Object.keys(payload).filter((key) => key !== "full_name") }
      });
      return json(200, { mode: "demo", guest, profile: guestProfile, overview: guestAccountOverview(profile, guest, guestProfile) });
    } catch (error) {
      Object.assign(guest, previousGuest);
      if (guestProfile && previousGuestProfile) Object.assign(guestProfile, previousGuestProfile);
      return json(500, { error: error.message || "Profile update failed." });
    }
  }

  const guests = await supabaseFetch(`/rest/v1/guests?select=*&user_id=eq.${encodeURIComponent(profile.id)}&limit=1`, { service: true });
  const guest = guests?.[0];
  if (!guest?.id) return json(404, { error: "Guest profile not found." });
  const guestProfiles = await supabaseFetch(`/rest/v1/guest_profiles?select=*&guest_id=eq.${encodeURIComponent(guest.id)}&limit=1`, { service: true });
  const guestProfile = guestProfiles?.[0] || null;
  if (method === "GET") {
    const [reservations, favorites, notifications] = await Promise.all([
      supabaseFetch(`/rest/v1/reservation_overview?select=*&guest_email=eq.${encodeURIComponent(profile.email)}&order=created_at.desc&limit=5`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/restaurant_followers?select=*&guest_email=eq.${encodeURIComponent(profile.email)}&order=created_at.desc`, { service: true }).catch(() => []),
      supabaseFetch(`/rest/v1/guest_notifications?select=*&guest_email=eq.${encodeURIComponent(profile.email)}&order=created_at.desc&limit=5`, { service: true }).catch(() => [])
    ]);
    return json(200, {
      mode: "supabase",
      guest,
      profile: guestProfile,
      overview: {
        active_reservations: (reservations || []).filter((item) => ["pending", "accepted", "confirmed"].includes(normalizeReservationStatus(item.status))).length,
        favorite_restaurants: (favorites || []).length,
        unread_notifications: (notifications || []).filter((item) => !item.read_at).length,
        recent_reservations: reservations || [],
        important_notifications: notifications || [],
        profile_completion: guestProfileCompletion(guest, guestProfile),
        email_verified: Boolean(profile.email_verified)
      }
    });
  }
  if (method !== "PATCH") return json(405, { error: "Method not allowed." });
  if (body.email && lower(body.email) !== lower(profile.email)) return json(400, { error: "Email changes require a secure re-verification flow." });
  const payload = normalizeGuestAccountPatch(body);
  const validationError = validateGuestAccountPatch(payload);
  if (validationError) return json(400, { error: validationError });
  const updatedGuests = await supabaseFetch(`/rest/v1/guests?id=eq.${encodeURIComponent(guest.id)}&select=*`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      first_name: payload.first_name,
      last_name: payload.last_name,
      full_name: payload.full_name,
      phone: payload.phone,
      city: payload.city,
      region: payload.region,
      postal_code: payload.postal_code,
      preferred_dining_areas: payload.preferred_dining_areas,
      max_travel_distance_miles: payload.max_travel_distance_miles,
      transportation_method: payload.transportation_method,
      selected_language: payload.selected_language,
      updated_at: nowIso()
    }
  });
  await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}&select=*`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      full_name: payload.full_name,
      preferred_language: payload.selected_language,
      updated_at: nowIso()
    }
  }).catch(() => null);
  if (guestProfile?.id) {
    const preferences = normalizeGuestPreferencePatch(guestProfile.preferences || {}, {
      preferred_neighborhoods: payload.preferred_dining_areas,
      city: payload.city,
      region: payload.region,
      postal_code: payload.postal_code,
      max_travel_distance_miles: payload.max_travel_distance_miles,
      transportation_method: payload.transportation_method
    }, payload.selected_language);
    await supabaseFetch(`/rest/v1/guest_profiles?id=eq.${encodeURIComponent(guestProfile.id)}&select=*`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=representation" },
      body: {
        preferences,
        preferred_neighborhoods: payload.preferred_dining_areas,
        updated_at: nowIso()
      }
    });
  }
  await createAuditLog({
    profile,
    action: "guest_profile_updated",
    entityType: "guest",
    entityId: guest.id,
    metadata: { message: "Guest profile updated.", fields: Object.keys(payload).filter((key) => key !== "full_name") }
  });
  return json(200, { mode: "supabase", guest: updatedGuests?.[0] });
}

function canGuestCancelReservation(row) {
  const status = normalizeReservationStatus(row?.status);
  if (!["pending", "accepted"].includes(status)) return false;
  const date = row?.reservation_date || row?.offer_date;
  const time = row?.reservation_time || row?.offer_time || "23:59";
  if (!date) return true;
  return new Date(`${date}T${time}`).getTime() > Date.now();
}

async function sendRestaurantGuestCancellationNotice(row) {
  const rows = await serverContentRows();
  const lang = normalizeLanguage(row.restaurant_language || "en");
  const context = { ...emailContext(row), reservation_summary: reservationEmailText(row, lang) };
  const subject = template(contentValue(rows, "email_restaurant_cancelled_subject", "SmartTable reservation cancelled: {{reference}}", lang), context);
  const message = template(contentValue(rows, "email_restaurant_cancelled_body", "{{guest_name}} cancelled or had a reservation cancelled for {{restaurant_name}} on {{reservation_date}} at {{reservation_time}}. Reference: {{reference}}.", lang), context);
  const partnerContext = {
    reservation_id: row.reservation_id,
    restaurant_id: row.restaurant_id,
    event_type: "restaurant_guest_cancelled",
    locale: lang,
    template_version: EMAIL_TEMPLATE_VERSION,
    idempotency_key: hashEmailValue(`reservation-cancelled-partner:${row.reservation_id}`)
  };
  const partnerMessage = {
    to: row.restaurant_email,
    subject,
    text: message,
    html: appEmailHtml(subject, message, { label: contentValue(rows, "email_cta_open_dashboard", "Open dashboard", lang), url: context.dashboard_url })
  };
  return isValidSignupEmail(row.restaurant_email)
    ? sendEmail(partnerMessage, partnerContext)
    : recordEmailConfigurationFailure(
      partnerMessage,
      partnerContext,
      row.restaurant_email ? "INVALID_RESTAURANT_NOTIFICATION_EMAIL" : "MISSING_RESTAURANT_NOTIFICATION_EMAIL",
      row.restaurant_email
        ? "The restaurant reservation notification email is invalid."
        : "The restaurant reservation notification email is missing."
    );
}

async function guestReservations(method, body, headers) {
  const { profile } = await requireProfile(headers, ["guest"]);
  const email = lower(profile.email);
  if (method !== "GET" && method !== "PATCH") return json(405, { error: "Method not allowed." });
  if (!supabaseConfigured) {
    ensureDemo();
    const rows = reservationOverviewRows().filter((row) => lower(row.guest_email) === email || clean(row.guest_id) === clean(profile.id));
    if (method === "PATCH") {
      const id = clean(body.id || body.reservation_id);
      const action = clean(body.action);
      const row = rows.find((item) => item.reservation_id === id);
      if (!row) return json(404, { error: "Reservation not found." });
      if (action !== "cancel") return json(400, { error: "Unsupported reservation action." });
      if (!canGuestCancelReservation(row)) return json(409, { error: "This reservation can no longer be cancelled online." });
      const updated = await updateReservationStatus(id, "cancelled", row.restaurant_id, {
        cancelledByLabel: "Guest",
        actorUserId: profile.id,
        actorRole: profile.role
      });
      await Promise.all([
        createGuestReservationNotification(updated, {
          type: "reservation_cancelled",
          titleKey: "reservation_cancelled_notification_title",
          messageKey: "reservation_cancelled_notification_message",
          ctaKey: "reservation_cancelled_notification_cta",
          fallbackTitle: "Reservation cancelled",
          fallbackMessage: "Your reservation at {{restaurant_name}} was cancelled. Reference: {{reference}}.",
          fallbackCta: "View reservation"
        }),
        createAuditLog({
          profile,
          action: "guest_reservation_cancelled",
          entityType: "reservation",
          entityId: id,
          metadata: { message: "Guest cancelled reservation.", restaurant_id: row.restaurant_id }
        })
      ]);
      return json(200, { mode: "demo", reservation: updated });
    }
    return json(200, { mode: "demo", reservations: rows });
  }
  const rows = await supabaseFetch(`/rest/v1/reservation_overview?select=*&guest_email=eq.${encodeURIComponent(email)}&order=created_at.desc`, { service: true });
  if (method === "PATCH") {
    const id = clean(body.id || body.reservation_id);
    const action = clean(body.action);
    const row = (rows || []).find((item) => item.reservation_id === id);
    if (!row) return json(404, { error: "Reservation not found." });
    if (action !== "cancel") return json(400, { error: "Unsupported reservation action." });
    if (!canGuestCancelReservation(row)) return json(409, { error: "This reservation can no longer be cancelled online." });
    const updated = await updateReservationStatus(id, "cancelled", row.restaurant_id, {
      cancelledByLabel: "Guest",
      actorUserId: profile.id,
      actorRole: profile.role
    });
    await Promise.all([
      createGuestReservationNotification(updated, {
        type: "reservation_cancelled",
        titleKey: "reservation_cancelled_notification_title",
        messageKey: "reservation_cancelled_notification_message",
        ctaKey: "reservation_cancelled_notification_cta",
        fallbackTitle: "Reservation cancelled",
        fallbackMessage: "Your reservation at {{restaurant_name}} was cancelled. Reference: {{reference}}.",
        fallbackCta: "View reservation"
      }),
      createAuditLog({
        profile,
        action: "guest_reservation_cancelled",
        entityType: "reservation",
        entityId: id,
        metadata: { message: "Guest cancelled reservation.", restaurant_id: row.restaurant_id }
      })
    ]);
    return json(200, { mode: "supabase", reservation: updated });
  }
  return json(200, { mode: "supabase", reservations: rows || [] });
}

async function guestFavorites(method, body, headers, query) {
  const { profile } = await requireProfile(headers, ["guest"]);
  const email = lower(profile.email);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") {
      const favorites = demo.restaurantFollowers
        .filter((item) => lower(item.guest_email) === email)
        .map((item) => ({ ...item, restaurant: demo.restaurants.find((restaurant) => restaurant.id === item.restaurant_id) || null }));
      return json(200, { mode: "demo", favorites });
    }
    const restaurantId = clean(body.restaurant_id || query.get("restaurant_id"));
    const favorite = demo.restaurantFollowers.find((item) => item.restaurant_id === restaurantId && lower(item.guest_email) === email);
    if (!favorite) return json(404, { error: "Favorite restaurant not found." });
    if (method === "DELETE") {
      demo.restaurantFollowers = demo.restaurantFollowers.filter((item) => item !== favorite);
      return json(200, { mode: "demo", removed: true });
    }
    if (method === "PATCH") {
      favorite.notification_enabled = boolValue(body.notification_enabled);
      favorite.updated_at = nowIso();
      return json(200, { mode: "demo", favorite });
    }
    return json(405, { error: "Method not allowed." });
  }
  if (method === "GET") {
    const rows = await supabaseFetch(`/rest/v1/restaurant_followers?select=*,restaurants(*)&guest_email=eq.${encodeURIComponent(email)}&order=created_at.desc`, { service: true }).catch(() => []);
    return json(200, { mode: "supabase", favorites: rows || [] });
  }
  const restaurantId = clean(body.restaurant_id || query.get("restaurant_id"));
  if (!restaurantId) return json(400, { error: "Restaurant is required." });
  if (method === "DELETE") {
    await supabaseFetch(`/rest/v1/restaurant_followers?restaurant_id=eq.${encodeURIComponent(restaurantId)}&guest_email=eq.${encodeURIComponent(email)}`, { method: "DELETE", service: true });
    return json(200, { mode: "supabase", removed: true });
  }
  if (method === "PATCH") {
    const rows = await supabaseFetch(`/rest/v1/restaurant_followers?restaurant_id=eq.${encodeURIComponent(restaurantId)}&guest_email=eq.${encodeURIComponent(email)}&select=*`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=representation" },
      body: { notification_enabled: boolValue(body.notification_enabled) }
    });
    return json(200, { mode: "supabase", favorite: rows?.[0] });
  }
  return json(405, { error: "Method not allowed." });
}

async function guestPreferences(method, body, headers) {
  const { profile } = await requireProfile(headers, ["guest"]);

  if (!supabaseConfigured) {
    ensureDemo();
    const guest = demo.guests.find((item) => item.user_id === profile.id || item.email === profile.email);
    if (!guest) return json(404, { error: "Guest profile not found." });
    const guestProfile = demo.guestProfiles.find((item) => item.guest_id === guest.id);
    if (method === "GET") return json(200, { mode: "demo", guest, profile: guestProfile });
    if (method === "DELETE") {
      const request = {
        id: crypto.randomUUID(),
        guest_email: profile.email,
        request_type: "deletion",
        status: "received",
        message: clean(body.message || "Guest requested account deletion."),
        created_at: nowIso()
      };
      demo.privacyRequests.unshift(request);
      return json(202, { mode: "demo", request });
    }
    if (method !== "PATCH") return json(405, { error: "Method not allowed." });
    const preferences = normalizeGuestPreferencePatch(guestProfile?.preferences || {}, body, profile.preferred_language);
    const validationError = validateGuestPreferenceProfile(preferences);
    if (validationError) return json(400, { error: validationError });
    Object.assign(guestProfile, {
      preferences,
      dietary_restrictions: preferences.dietary_needs,
      favorite_cuisines: preferences.cuisines,
      preferred_neighborhoods: preferences.preferred_neighborhoods,
      ...guestPreferenceColumns(preferences),
      consent: preferences.consents,
      updated_at: nowIso()
    });
    if (body.marketing_consent !== undefined) {
      demo.guestConsents.unshift({
        id: crypto.randomUUID(),
        guest_id: guest.id,
        guest_email: profile.email,
        user_id: profile.id,
        consent_type: "marketing",
        status: boolValue(body.marketing_consent) ? "granted" : "revoked",
        source: "guest_preferences",
        marketing_consent: boolValue(body.marketing_consent),
        marketing_consent_timestamp: boolValue(body.marketing_consent) ? nowIso() : null,
        accepted_at: boolValue(body.marketing_consent) ? nowIso() : null,
        revoked_at: boolValue(body.marketing_consent) ? null : nowIso(),
        language: normalizeLanguage(body.preferred_language || profile.preferred_language),
        created_at: nowIso()
      });
    }
    return json(200, { mode: "demo", profile: guestProfile });
  }

  const guests = await supabaseFetch(`/rest/v1/guests?select=*&user_id=eq.${encodeURIComponent(profile.id)}&limit=1`, { service: true });
  const guest = guests?.[0];
  if (!guest?.id) return json(404, { error: "Guest profile not found." });
  const profiles = await supabaseFetch(`/rest/v1/guest_profiles?select=*&guest_id=eq.${encodeURIComponent(guest.id)}&limit=1`, { service: true });
  const guestProfile = profiles?.[0];
  if (method === "GET") return json(200, { mode: "supabase", guest, profile: guestProfile });
  if (method === "DELETE") {
    const rows = await supabaseFetch("/rest/v1/privacy_requests?select=*", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=representation" },
      body: {
        guest_email: profile.email,
        request_type: "deletion",
        status: "received",
        message: clean(body.message || "Guest requested account deletion.")
      }
    });
    return json(202, { mode: "supabase", request: rows?.[0] });
  }
  if (method !== "PATCH") return json(405, { error: "Method not allowed." });
  if (!guestProfile?.id) return json(404, { error: "Guest preference profile not found." });
  const preferences = normalizeGuestPreferencePatch(guestProfile.preferences || {}, body, profile.preferred_language);
  const validationError = validateGuestPreferenceProfile(preferences);
  if (validationError) return json(400, { error: validationError });
  const updatedRows = await supabaseFetch(`/rest/v1/guest_profiles?id=eq.${encodeURIComponent(guestProfile.id)}&select=*`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      preferences,
      dietary_restrictions: preferences.dietary_needs,
      favorite_cuisines: preferences.cuisines,
      preferred_neighborhoods: preferences.preferred_neighborhoods,
      ...guestPreferenceColumns(preferences),
      consent: preferences.consents
    }
  });
  if (body.marketing_consent !== undefined) {
    await supabaseFetch("/rest/v1/guest_consents", {
      method: "POST",
      service: true,
      body: {
        guest_id: guest.id,
        guest_email: profile.email,
        user_id: profile.id,
        consent_type: "marketing",
        status: boolValue(body.marketing_consent) ? "granted" : "revoked",
        source: "guest_preferences",
        marketing_consent: boolValue(body.marketing_consent),
        marketing_consent_timestamp: boolValue(body.marketing_consent) ? nowIso() : null,
        accepted_at: boolValue(body.marketing_consent) ? nowIso() : null,
        revoked_at: boolValue(body.marketing_consent) ? null : nowIso(),
        language: normalizeLanguage(body.preferred_language || profile.preferred_language)
      }
    });
  }
  return json(200, { mode: "supabase", profile: updatedRows?.[0] });
}

async function systemChecklists() {
  return json(200, {
    mode: supabaseConfigured ? "supabase" : "demo",
    generated_at: nowIso(),
    checklists: adminReadinessChecklists(),
    rules: {
      production_claims: "Any module using demo/mock/incomplete data must be labeled Demo only, Beta, Requires integration, or Requires more data.",
      ai_autonomy: "AI recommends first. Restaurants approve before offers, campaigns, or pricing changes execute.",
      provider_integrations: "OpenTable, Resy, SevenRooms, Tock, and Google Reserve are not live until provider access and restaurant authorization exist."
    }
  });
}

function parseSenderAddress(value = "") {
  const input = clean(value);
  const match = input.match(/^(.*?)<([^>]+)>$/);
  if (match) return { name: clean(match[1]).replace(/^"|"$/g, ""), email: lower(match[2]) };
  return { name: "", email: lower(input) };
}

function emailProviderDiagnostics() {
  const sender = parseSenderAddress(EMAIL_FROM);
  const replyTo = parseSenderAddress(EMAIL_REPLY_TO);
  return {
    provider: "resend",
    environment: RUNTIME_ENVIRONMENT,
    mode: emailService.configured ? "external_provider_configured" : "not_configured",
    can_send_real_email: emailService.configured,
    delivery_status_limit: RESEND_WEBHOOK_SECRET ? "provider_webhook_can_update_delivery_events" : "provider_acceptance_only_until_webhook_secret_is_configured",
    sender: {
      name: sender.name || "SmartTable",
      email: sender.email,
      configured: Boolean(sender.email)
    },
    reply_to: {
      email: replyTo.email || "",
      configured: Boolean(replyTo.email)
    },
    public_base_url: PUBLIC_BASE_URL,
    webhook: {
      production_endpoint: "https://smarttablenyc.com/api/webhooks/resend",
      configured: Boolean(RESEND_WEBHOOK_SECRET),
      signature_verification: RESEND_WEBHOOK_SECRET ? "enabled" : "disabled_until_RESEND_WEBHOOK_SECRET_is_set",
      required_events: ["email.sent", "email.delivered", "email.bounced", "email.failed", "email.complained"]
    },
    required_environment: {
      RESEND_API_KEY: Boolean(RESEND_API_KEY),
      EMAIL_FROM: Boolean(EMAIL_FROM),
      EMAIL_REPLY_TO: Boolean(EMAIL_REPLY_TO),
      PUBLIC_BASE_URL: Boolean(PUBLIC_BASE_URL),
      RESEND_WEBHOOK_SECRET: Boolean(RESEND_WEBHOOK_SECRET),
      EMAIL_RECIPIENT_ALLOWLIST: Boolean(EMAIL_RECIPIENT_ALLOWLIST.length)
    },
    non_production_recipient_safety: {
      enabled: emailService.nonProductionRecipientRestrictionEnabled,
      allowlist_configured: emailService.recipientAllowlistConfigured,
      allowlist_count: EMAIL_RECIPIENT_ALLOWLIST.length
    },
    dns_readiness: {
      verified_sender_or_domain_required: true,
      spf_required: true,
      dkim_required: true,
      dmarc_recommended: true,
      verification_source: "Resend dashboard; SmartTable does not store DNS secrets."
    },
    retry_limit: EMAIL_RETRY_LIMIT,
    queue_max_attempts: EMAIL_QUEUE_MAX_ATTEMPTS,
    retry_schedule_minutes: [1, 5, 30],
    template_version: EMAIL_TEMPLATE_VERSION
  };
}

function restaurantEmailDiagnostics(restaurant = {}) {
  const email = lower(restaurant.reservation_notification_email || restaurant.email || restaurant.contact_email);
  const status = !email
    ? "missing"
    : isValidSignupEmail(email)
      ? "configured"
      : "invalid";
  return {
    reservation_notification_email: email ? maskEmailAddress(email) : "",
    status,
    can_notify_partner: status === "configured",
    issue: status === "missing"
      ? "Restaurant reservation notification email is missing."
      : status === "invalid"
        ? "Restaurant reservation notification email is invalid."
        : ""
  };
}

async function listEmailQueueRows({ limit = 25, onlyDue = false } = {}) {
  const cappedLimit = Math.min(Math.max(1, Number(limit || 25)), 250);
  const now = nowIso();
  if (!supabaseConfigured) {
    ensureDemo();
    return [...(demo.emailQueue || [])]
      .filter((item) => !onlyDue || (["pending", "queued"].includes(normalizeEmailQueueStatus(item.status)) && (!item.next_attempt_at || item.next_attempt_at <= now)))
      .sort((a, b) => onlyDue
        ? new Date(a.next_attempt_at || a.created_at || 0) - new Date(b.next_attempt_at || b.created_at || 0)
        : new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0))
      .slice(0, cappedLimit);
  }
  const path = onlyDue
    ? `/rest/v1/email_queue?select=*&status=in.(pending,queued)&next_attempt_at=lte.${encodeURIComponent(now)}&order=next_attempt_at.asc&limit=${cappedLimit}`
    : `/rest/v1/email_queue?select=*&order=created_at.desc&limit=${cappedLimit}`;
  return await supabaseFetch(path, { service: true }).catch((error) => {
    console.error("[email-queue] Queue list failed:", error.message);
    return [];
  });
}

async function listEmailLogRows({ limit = 25 } = {}) {
  const cappedLimit = Math.min(Math.max(1, Number(limit || 25)), 250);
  if (!supabaseConfigured) {
    ensureDemo();
    return (demo.emailLogs || [])
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, cappedLimit);
  }
  return await supabaseFetch(`/rest/v1/email_logs?select=*&order=created_at.desc&limit=${cappedLimit}`, { service: true }).catch((error) => {
    console.error("[email-logs] Log list failed:", error.message);
    return [];
  });
}

async function emailReservationReferenceMap(rows = []) {
  const ids = [...new Set((rows || []).map((row) => clean(row.reservation_id)).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  if (!supabaseConfigured) {
    ensureDemo();
    for (const row of reservationOverviewRows()) {
      if (ids.includes(row.reservation_id)) map.set(row.reservation_id, row.reference || "");
    }
    return map;
  }
  const path = `/rest/v1/reservation_overview?select=reservation_id,reference&reservation_id=in.(${ids.map(encodeURIComponent).join(",")})`;
  const reservations = await supabaseFetch(path, { service: true }).catch(() => []);
  for (const row of reservations || []) {
    if (row.reservation_id) map.set(row.reservation_id, row.reference || "");
  }
  return map;
}

function linkEmailDiagnostics(logs = [], queue = [], reservationRefs = new Map()) {
  const queueByLogId = new Map();
  const queueByIdempotency = new Map();
  const logById = new Map();
  const logByIdempotency = new Map();
  for (const row of queue || []) {
    if (row.email_log_id) queueByLogId.set(row.email_log_id, row);
    if (row.idempotency_key) queueByIdempotency.set(row.idempotency_key, row);
  }
  for (const row of logs || []) {
    if (row.id) logById.set(row.id, row);
    if (row.idempotency_key) logByIdempotency.set(row.idempotency_key, row);
  }
  const decoratedLogs = (logs || []).map((row) => {
    const queueRow = queueByLogId.get(row.id) || queueByIdempotency.get(row.idempotency_key) || null;
    return {
      ...row,
      log_id: row.id,
      queue_id: queueRow?.id || row.queue_id || null,
      template: row.template || row.email_type || row.event_type || "",
      language: row.language || row.locale || "",
      related_reservation_reference: reservationRefs.get(clean(row.reservation_id)) || row.reference || ""
    };
  });
  const decoratedQueue = (queue || []).map((row) => {
    const logRow = (row.email_log_id && logById.get(row.email_log_id)) || logByIdempotency.get(row.idempotency_key) || null;
    return {
      ...row,
      queue_id: row.id,
      log_id: row.email_log_id || logRow?.id || null,
      template: row.template || row.email_type || row.event_type || "",
      language: row.language || row.locale || "",
      related_reservation_reference: reservationRefs.get(clean(row.reservation_id)) || row.reference || ""
    };
  });
  return { logs: decoratedLogs, queue: decoratedQueue };
}

async function findEmailQueueRecord({ id = "", idempotencyKey = "" } = {}) {
  const queueId = clean(id);
  const key = clean(idempotencyKey);
  if (!queueId && !key) return null;
  if (!supabaseConfigured) {
    ensureDemo();
    return demo.emailQueue.find((item) => (queueId && item.id === queueId) || (key && item.idempotency_key === key)) || null;
  }
  const filter = queueId
    ? `id=eq.${encodeURIComponent(queueId)}`
    : `idempotency_key=eq.${encodeURIComponent(key)}`;
  const rows = await supabaseFetch(`/rest/v1/email_queue?select=*&${filter}&limit=1`, { service: true }).catch(() => []);
  return rows?.[0] || null;
}

async function processDueEmailQueue({ limit = 10, id = "", idempotencyKey = "" } = {}) {
  const single = clean(id) || clean(idempotencyKey)
    ? await findEmailQueueRecord({ id, idempotencyKey })
    : null;
  const rows = single ? [single] : await listEmailQueueRows({ limit, onlyDue: true });
  const processed = [];
  for (const queueRecord of rows) {
    if (!queueRecord || ["sent", "delivered", "bounced", "failed", "complained", "cancelled"].includes(normalizeEmailQueueStatus(queueRecord.status))) {
      continue;
    }
    const currentLog = await findEmailDeliveryLog(queueRecord.idempotency_key);
    const decision = emailSendDecision(currentLog);
    if (!decision.shouldSend) {
      const result = resultFromExistingEmailLog(emailMessageFromQueuePayload(queueRecord.payload) || { to: queueRecord.recipient_email, subject: queueRecord.payload?.subject }, {
        idempotency_key: queueRecord.idempotency_key,
        email_type: queueRecord.email_type,
        event_type: queueRecord.event_type,
        reservation_id: queueRecord.reservation_id,
        restaurant_id: queueRecord.restaurant_id,
        recipient_user_id: queueRecord.recipient_user_id,
        locale: queueRecord.locale,
        template_version: queueRecord.template_version
      }, currentLog, decision);
      const nextQueue = await patchEmailQueueRecord(queueRecord, {
        status: result.status,
        attempt_count: emailLogAttemptCount(currentLog),
        provider_message_id: result.messageId || result.provider_id || queueRecord.provider_message_id || null,
        last_error_code: result.errorCode || null,
        last_error_message: result.errorMessage || null,
        sent_at: isEmailAccepted(result) ? (queueRecord.sent_at || nowIso()) : queueRecord.sent_at || null,
        next_attempt_at: null
      });
      processed.push({ queue_id: queueRecord.id, status: nextQueue?.status || result.status, duplicate_suppressed: true, reason: decision.reason });
      continue;
    }
    const outcome = await processEmailQueueRecord(queueRecord, null, {}, currentLog);
    processed.push({
      queue_id: queueRecord.id,
      email_log_id: outcome.logRecord?.id || null,
      provider_message_id: outcome.result?.messageId || outcome.result?.provider_id || null,
      accepted: isEmailAccepted(outcome.result),
      status: outcome.queueRecord?.status || outcome.result?.status,
      errorCode: outcome.result?.errorCode || null,
      errorMessage: outcome.result?.errorMessage || null
    });
  }
  return processed;
}

async function adminEmailDiagnostics(method, headers, query = new URLSearchParams()) {
  const { profile } = await requireProfile(headers, ["super_admin"]);
  if (method !== "GET") return json(405, { error: "Method not allowed." });
  const filters = parseEmailDiagnosticFilters(query);
  const fetchLimit = Math.min(Math.max(filters.limit * 4, 100), 250);
  const allLogs = await listEmailLogRows({ limit: fetchLimit });
  const allQueue = await listEmailQueueRows({ limit: fetchLimit });
  const reservationRefs = await emailReservationReferenceMap([...allLogs, ...allQueue]);
  const linked = linkEmailDiagnostics(allLogs, allQueue, reservationRefs);
  const recentLogs = linked.logs
    .filter((row) => emailDiagnosticRowMatches(row, filters))
    .slice(0, filters.limit);
  const recentQueue = linked.queue
    .filter((row) => emailDiagnosticRowMatches(row, filters))
    .slice(0, filters.limit);
  const failed = recentLogs.filter((item) => ["failed", "bounced", "complained"].includes(emailLogStatus(item))).length;
  return json(200, {
    access: "super_admin",
    requested_by: profile.id,
    configuration: emailProviderDiagnostics(),
    filters: {
      email_type: filters.email_type,
      recipient_type: filters.recipient_type,
      user: filters.user ? "[filtered]" : "",
      restaurant: filters.restaurant,
      reservation: filters.reservation,
      statuses: filters.statuses,
      limit: filters.limit
    },
    filter_options: {
      statuses: [...EMAIL_DIAGNOSTIC_STATUSES],
      recipient_types: ["guest", "restaurant", "admin", "user", "unknown"]
    },
    recent_logs: (recentLogs || []).map(maskEmailLogForAdmin),
    recent_queue: (recentQueue || []).map(maskEmailQueueForAdmin),
    summary: {
      recent_count: recentLogs?.length || 0,
      recent_failed_or_bounced: failed,
      queued_count: (recentQueue || []).filter((item) => ["pending", "queued"].includes(normalizeEmailQueueStatus(item.status))).length,
      real_delivery_possible: emailService.configured,
      delivered_status_possible: Boolean(RESEND_WEBHOOK_SECRET)
    }
  });
}

async function adminEmailQueue(method, body, headers, query) {
  const { profile } = await requireProfile(headers, ["super_admin"]);
  if (method === "GET") {
    const filters = parseEmailDiagnosticFilters(query);
    const fetchLimit = Math.min(Math.max(filters.limit * 4, 100), 250);
    const allQueue = await listEmailQueueRows({ limit: fetchLimit });
    const reservationRefs = await emailReservationReferenceMap(allQueue);
    const linked = linkEmailDiagnostics([], allQueue, reservationRefs);
    const queue = linked.queue
      .filter((row) => emailDiagnosticRowMatches(row, filters))
      .slice(0, filters.limit);
    return json(200, {
      access: "super_admin",
      requested_by: profile.id,
      configuration: emailProviderDiagnostics(),
      filters: {
        email_type: filters.email_type,
        recipient_type: filters.recipient_type,
        user: filters.user ? "[filtered]" : "",
        restaurant: filters.restaurant,
        reservation: filters.reservation,
        statuses: filters.statuses,
        limit: filters.limit
      },
      queue: queue.map(maskEmailQueueForAdmin)
    });
  }
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const action = clean(body.action || "process_due");
  if (action === "process_due") {
    const processed = await processDueEmailQueue({ limit: body.limit || 10 });
    return json(200, { processed });
  }
  if (action === "retry") {
    const queueRecord = await findEmailQueueRecord({ id: body.id, idempotencyKey: body.idempotency_key || body.idempotencyKey });
    if (!queueRecord) return json(404, { error: "Queued email was not found." });
    const retryable = await patchEmailQueueRecord(queueRecord, {
      status: "queued",
      next_attempt_at: nowIso(),
      failed_at: null,
      last_error_code: null,
      last_error_message: null
    });
    const processed = await processDueEmailQueue({ id: retryable?.id || queueRecord.id });
    return json(200, { processed });
  }
  if (action === "send_test") {
    const recipient = lower(body.to || EMAIL_REPLY_TO);
    if (!recipient) return json(400, { error: "A test recipient is required. Configure EMAIL_REPLY_TO or pass a to address." });
    const diagnosticType = clean(body.email_type || body.event_type || "diagnostic_test_email");
    const subject = "SmartTable email infrastructure test";
    const text = "This is a SmartTable transactional email infrastructure test sent through the centralized Resend queue.";
    const result = await sendEmail({
      to: recipient,
      subject,
      text,
      html: appEmailHtml(subject, text)
    }, {
      event_type: diagnosticType,
      email_type: diagnosticType,
      recipient_user_id: profile.id,
      locale: normalizeLanguage(body.locale || "en"),
      template_version: EMAIL_TEMPLATE_VERSION,
      idempotency_key: hashEmailValue(`${diagnosticType}:${recipient}:${crypto.randomUUID()}`)
    });
    return json(isEmailAccepted(result) ? 202 : 502, {
      accepted: isEmailAccepted(result),
      provider: result.provider,
      provider_message_id: result.messageId || result.provider_id || null,
      message_id: result.messageId || result.provider_id || null,
      provider_response: result.providerResponse || {},
      status: result.status,
      delivery_status: result.delivery,
      email_log_id: result.emailLogId || null,
      email_queue_id: result.emailQueueId || null,
      errorCode: result.errorCode || null,
      errorMessage: result.errorMessage || null
    });
  }
  return json(400, { error: "Unsupported email queue action." });
}

async function emailProviderWebhook(method, body, headers) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const verification = verifyResendWebhookSignature(headers, body);
  if (!verification.ok) return json(401, { error: "Invalid email provider webhook signature.", reason: verification.reason });
  const payload = { ...(body || {}) };
  delete payload.__rawBody;
  const data = payload.data || payload.email || payload;
  const eventType = clean(payload.type || payload.event || data.event || data.type);
  const eventId = clean(payload.id || payload.event_id || headerValue(headers, "svix-id") || `${eventType}:${data.id || data.message_id || Date.now()}`);
  const providerMessageId = clean(data.id || data.email_id || data.message_id || data.messageId || payload.message_id);
  const status = mapProviderEmailEventStatus(eventType, data);
  const event = {
    event_id: eventId,
    event_type: eventType,
    provider_message_id: providerMessageId,
    status
  };
  const updated = await updateEmailLogFromProviderEvent(event);
  const queue = await updateEmailQueueFromProviderEvent(event);
  return json(200, {
    ok: true,
    provider: "resend",
    verification: verification.scheme,
    event_type: eventType,
    provider_message_id: providerMessageId,
    mapped_status: status,
    ...updated,
    queue
  });
}

async function aiServiceTimeEstimate(method, body, headers, query) {
  if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed." });
  const restaurantId = clean(body.restaurant_id || query.get("restaurant_id"));
  if (!restaurantId) return json(400, { error: "Restaurant is required." });

  if (!supabaseConfigured) {
    ensureDemo();
    const restaurant = demo.restaurants.find((item) => item.id === restaurantId && item.status === "approved");
    if (!restaurant) return json(404, { error: "Restaurant not found." });
    const estimate = estimateServiceTime(restaurant, {
      party_size: body.party_size || query.get("party_size"),
      reservation_date: body.reservation_date || query.get("reservation_date"),
      reservation_time: body.reservation_time || query.get("reservation_time"),
      meal_category: body.meal_category || query.get("meal_category")
    }, observedDurationsForRestaurant(restaurant.id));
    return json(200, { mode: "demo", restaurant_id: restaurant.id, restaurant_name: restaurant.name, estimate });
  }

  const rows = await supabaseFetch(`/rest/v1/restaurants?select=*&id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { service: true });
  const restaurant = rows?.[0];
  if (!restaurant) return json(404, { error: "Restaurant not found." });
  const observations = await supabaseFetch(`/rest/v1/ai_service_time_observations?select=visit_duration_minutes&restaurant_id=eq.${encodeURIComponent(restaurantId)}&not.visit_duration_minutes=is.null&limit=100`, { service: true }).catch(() => []);
  const estimate = estimateServiceTime(restaurant, {
    party_size: body.party_size || query.get("party_size"),
    reservation_date: body.reservation_date || query.get("reservation_date"),
    reservation_time: body.reservation_time || query.get("reservation_time"),
    meal_category: body.meal_category || query.get("meal_category")
  }, (observations || []).map((item) => item.visit_duration_minutes));
  return json(200, { mode: "supabase", restaurant_id: restaurant.id, restaurant_name: restaurant.name, estimate });
}

async function aiRoutePlan(method, body, headers) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const restaurantId = clean(body.restaurant_id);
  if (!restaurantId) return json(400, { error: "Restaurant is required." });
  const profileKey = aiProfileKey(body.profile_key);
  const transportMode = clean(body.transport_mode || "driving");
  const homeToRestaurant = routeMinutes(body.home_to_restaurant_miles || 2, transportMode);
  const restaurantToEvent = routeMinutes(body.restaurant_to_event_miles || 1, transportMode);
  const eventToHome = routeMinutes(body.event_to_home_miles || 3, transportMode);
  const parkingBuffer = transportMode === "driving" || transportMode === "rideshare" ? 12 : 4;
  const weatherBuffer = Math.max(0, numberOr(body.weather_buffer_minutes, 5));
  const trafficBuffer = Math.max(0, numberOr(body.traffic_buffer_minutes, transportMode === "walking" ? 0 : 8));

  const restaurant = !supabaseConfigured
    ? (ensureDemo(), demo.restaurants.find((item) => item.id === restaurantId && item.status === "approved"))
    : (await supabaseFetch(`/rest/v1/restaurants?select=*&id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { service: true }))?.[0];
  if (!restaurant) return json(404, { error: "Restaurant not found." });
  const serviceEstimate = estimateServiceTime(restaurant, body, !supabaseConfigured ? observedDurationsForRestaurant(restaurant.id) : []);
  const reservationMinutes = hourFromTime(body.reservation_time || "19:00") * 60;
  const departureMinutes = Math.max(0, reservationMinutes - homeToRestaurant - weatherBuffer - trafficBuffer - parkingBuffer);
  const plan = {
    id: crypto.randomUUID(),
    profile_key: profileKey,
    restaurant_id: restaurant.id,
    restaurant_name: restaurant.name,
    start_location: clean(body.start_location || "Home"),
    event_location: clean(body.event_location || "Event"),
    return_location: clean(body.return_location || "Home"),
    reservation_time: clean(body.reservation_time || "19:00"),
    transport_mode: transportMode,
    estimated_service_minutes: serviceEstimate.estimated_duration_minutes,
    estimated_travel_to_restaurant_minutes: homeToRestaurant,
    estimated_travel_to_event_minutes: restaurantToEvent,
    estimated_return_home_minutes: eventToHome,
    total_travel_minutes: homeToRestaurant + restaurantToEvent + eventToHome,
    parking_buffer_minutes: parkingBuffer,
    weather_buffer_minutes: weatherBuffer,
    traffic_buffer_minutes: trafficBuffer,
    recommended_departure_time: `${String(Math.floor(departureMinutes / 60)).padStart(2, "0")}:${String(departureMinutes % 60).padStart(2, "0")}`,
    estimated_total_minutes: homeToRestaurant + serviceEstimate.estimated_duration_minutes + restaurantToEvent + eventToHome + parkingBuffer + weatherBuffer + trafficBuffer,
    route_sequence: ["Home", "Restaurant", "Event", "Home"],
    integrations_ready: ["google_calendar", "google_maps"],
    provider_status: "future_ready",
    privacy: "profile_key_only_no_precise_location_shared_with_restaurants",
    created_at: nowIso()
  };

  if (!supabaseConfigured) {
    demo.aiRoutePlans.unshift(plan);
    return json(201, { mode: "demo", plan });
  }

  const rows = await supabaseFetch("/rest/v1/ai_route_plans?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: {
      profile_key: plan.profile_key,
      restaurant_id: plan.restaurant_id,
      start_location: plan.start_location,
      event_location: plan.event_location,
      return_location: plan.return_location,
      reservation_time: plan.reservation_time,
      transport_mode: plan.transport_mode,
      estimated_service_minutes: plan.estimated_service_minutes,
      estimated_travel_to_restaurant_minutes: plan.estimated_travel_to_restaurant_minutes,
      estimated_travel_to_event_minutes: plan.estimated_travel_to_event_minutes,
      estimated_return_home_minutes: plan.estimated_return_home_minutes,
      parking_buffer_minutes: plan.parking_buffer_minutes,
      weather_buffer_minutes: plan.weather_buffer_minutes,
      estimated_total_minutes: plan.estimated_total_minutes,
      providers: { status: plan.provider_status, integrations_ready: plan.integrations_ready },
      metadata: {
        privacy: plan.privacy,
        traffic_buffer_minutes: plan.traffic_buffer_minutes,
        recommended_departure_time: plan.recommended_departure_time,
        total_travel_minutes: plan.total_travel_minutes,
        route_sequence: plan.route_sequence
      }
    }
  });
  return json(201, { mode: "supabase", plan: { ...plan, ...(rows?.[0] || {}) } });
}

async function aiConsumptionSignUpload(method, body) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const contentType = clean(body.content_type || body.contentType || "image/jpeg");
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return json(400, { error: "Only JPG, PNG, and WebP images are allowed." });
  const profileKey = safeFileName(aiProfileKey(body.profile_key));
  const filename = safeFileName(body.filename || "dining-photo.jpg");
  const path = `guest-consumption/${profileKey}/${crypto.randomUUID()}-${filename}`;

  if (!supabaseConfigured) {
    return json(200, {
      mode: "demo",
      bucket: SUPABASE_STORAGE_BUCKET,
      path,
      public_url: body.preview_url || "/assets/restaurant-hero.png",
      message: "Demo mode records metadata. Configure Supabase Storage for real guest photo uploads."
    });
  }

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ upsert: true })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Could not create upload URL.");
    error.status = response.status;
    throw error;
  }
  const signedUrl = payload.signedURL || payload.signedUrl || payload.url || payload.signed_url;
  return json(200, {
    mode: "supabase",
    bucket: SUPABASE_STORAGE_BUCKET,
    path,
    upload_url: signedUrl?.startsWith("http") ? signedUrl : `${SUPABASE_URL}${signedUrl || ""}`,
    public_url: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${path}`
  });
}

async function aiConsumptionUploads(method, body, headers, query) {
  if (method === "GET") {
    const { profile } = await requireProfile(headers, ["partner", "admin"]);
    const restaurant = await getPartnerRestaurant(profile, query, body);
    if (!supabaseConfigured) {
      const summary = restaurantIntelligenceSummary(restaurant.id);
      return json(200, { mode: "demo", summary });
    }
    const summary = await supabaseFetch("/rest/v1/rpc/restaurant_intelligence_summary", {
      method: "POST",
      service: true,
      body: { p_restaurant_id: restaurant.id }
    });
    return json(200, { mode: "supabase", summary });
  }
  if (method !== "POST") return json(405, { error: "Method not allowed." });

  const restaurantId = clean(body.restaurant_id);
  const profileKey = aiProfileKey(body.profile_key || body.guest_email);
  if (!restaurantId) return json(400, { error: "Restaurant is required." });
  const restaurant = !supabaseConfigured
    ? (ensureDemo(), demo.restaurants.find((item) => item.id === restaurantId && item.status === "approved"))
    : (await supabaseFetch(`/rest/v1/restaurants?select=*&id=eq.${encodeURIComponent(restaurantId)}&limit=1`, { service: true }))?.[0];
  if (!restaurant) return json(404, { error: "Restaurant not found." });
  const analysis = analyzeConsumptionSignals(body, restaurant);
  const points = loyaltyForUpload(body);
  const reservationId = nullableClean(body.reservation_id || body.booking_id || body.bookingId);
  const overallRating = body.overall_rating === "" || body.overall_rating === undefined ? (body.rating === "" || body.rating === undefined ? null : numberOr(body.rating, null)) : numberOr(body.overall_rating, null);
  const row = {
    id: crypto.randomUUID(),
    profile_key: profileKey,
    guest_id: nullableClean(body.guest_id),
    guest_name: nullableClean(body.guest_name),
    guest_email: lower(body.guest_email || body.email) || null,
    restaurant_id: restaurant.id,
    reservation_id: reservationId,
    image_url: nullableClean(body.image_url),
    uploaded_file_name: nullableClean(body.uploaded_file_name),
    media_type: clean(body.media_type || "food"),
    description: clean(body.description),
    rating: overallRating,
    overall_rating: overallRating,
    food_rating: body.food_rating === "" || body.food_rating === undefined ? null : numberOr(body.food_rating, null),
    service_rating: body.service_rating === "" || body.service_rating === undefined ? null : numberOr(body.service_rating, null),
    ambience_rating: body.ambience_rating === "" || body.ambience_rating === undefined ? null : numberOr(body.ambience_rating, null),
    short_review: clean(body.short_review),
    liked_highlight: clean(body.liked_highlight),
    ordered_items: clean(body.ordered_items || body.what_did_you_order),
    would_recommend: nullableClean(body.would_recommend),
    would_return: nullableClean(body.would_return),
    tags: arrayFrom(body.tags),
    loyalty_points_awarded: points,
    moderation_status: "pending",
    analysis_status: analysis.status,
    ai_labels: analysis.ai_labels,
    food_type: analysis.food_type,
    drink_type: analysis.drink_type,
    cuisine: analysis.cuisine,
    detected_dish: analysis.detected_dish,
    detected_drink: analysis.detected_drink,
    cuisine_category: analysis.cuisine_category,
    ingredients: analysis.ingredients,
    flavor_profile: analysis.flavor_profile,
    presentation_score: analysis.presentation_score,
    price_perception: analysis.price_perception,
    popularity_signal: analysis.popularity_signal,
    anonymized_metadata: {
      provider: analysis.provider,
      image_recognition_status: analysis.status,
      detected_dish: analysis.detected_dish,
      detected_drink: analysis.detected_drink,
      cuisine_category: analysis.cuisine_category,
      presentation_score: analysis.presentation_score,
      popularity_signal: analysis.popularity_signal,
      points_awarded: points,
      moderation_status: "pending",
      would_recommend: nullableClean(body.would_recommend),
      would_return: nullableClean(body.would_return),
      no_personal_data_shared_with_restaurants: true
    },
    created_at: nowIso()
  };

  if (!supabaseConfigured) {
    demo.consumptionUploads.unshift(row);
    const loyaltyAccount = upsertDemoLoyalty(profileKey, points, {
      completedReview: Boolean(overallRating || row.short_review || row.ordered_items),
      uploadedPhoto: Boolean(row.image_url)
    });
    const userUploads = demo.consumptionUploads.filter((item) => item.profile_key === profileKey);
    const loyalty = loyaltyStatus(loyaltyAccount, userUploads);
    demo.aiInteractionEvents.unshift({
      id: crypto.randomUUID(),
      profile_key: profileKey,
      event_type: "consumption_upload_submitted",
      restaurant_id: restaurant.id,
      metadata: { media_type: row.media_type, labels: row.ai_labels, points },
      created_at: nowIso()
    });
    return json(201, {
      mode: "demo",
      upload: row,
      loyalty,
      trend_update: restaurantIntelligenceSummary(restaurant.id),
      privacy: "aggregated_anonymized_no_pii"
    });
  }

  const rows = await supabaseFetch("/rest/v1/dining_consumption_uploads?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: row
  });
  const loyaltyAccount = await supabaseFetch("/rest/v1/rpc/award_loyalty_points", {
    method: "POST",
    service: true,
    body: { p_profile_key: profileKey, p_points: points }
  }).catch(() => null);
  const currentLoyaltyRows = await supabaseFetch(`/rest/v1/loyalty_accounts?select=*&profile_key=eq.${encodeURIComponent(profileKey)}&limit=1`, { service: true }).catch(() => []);
  const currentLoyalty = currentLoyaltyRows?.[0];
  if (currentLoyalty) {
    await supabaseFetch(`/rest/v1/loyalty_accounts?profile_key=eq.${encodeURIComponent(profileKey)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: {
        completed_reviews: numberOr(currentLoyalty.completed_reviews, 0) + (overallRating || row.short_review || row.ordered_items ? 1 : 0),
        uploaded_photos: numberOr(currentLoyalty.uploaded_photos, 0) + (row.image_url ? 1 : 0),
        last_reward_date: nowIso()
      }
    }).catch(() => null);
  }
  const userUploads = await supabaseFetch(`/rest/v1/dining_consumption_uploads?select=*&profile_key=eq.${encodeURIComponent(profileKey)}&order=created_at.desc`, { service: true }).catch(() => []);
  const loyaltyRow = Array.isArray(loyaltyAccount) ? loyaltyAccount[0] : loyaltyAccount;
  const loyalty = loyaltyStatus(loyaltyRow || { points_balance: points, lifetime_points: points }, userUploads?.length ? userUploads : [row]);
  await supabaseFetch("/rest/v1/ai_interaction_events", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      profile_key: profileKey,
      event_type: "consumption_upload_submitted",
      restaurant_id: restaurant.id,
      metadata: { media_type: row.media_type, labels: row.ai_labels, points, recognition: row.anonymized_metadata }
    }
  }).catch(() => null);
  const trendUpdate = await supabaseFetch("/rest/v1/rpc/restaurant_intelligence_summary", {
    method: "POST",
    service: true,
    body: { p_restaurant_id: restaurant.id }
  }).catch(() => null);
  return json(201, {
    mode: "supabase",
    upload: rows?.[0],
    loyalty,
    trend_update: trendUpdate,
    privacy: "aggregated_anonymized_no_pii"
  });
}

async function aiRestaurantIntelligence(method, body, headers, query) {
  if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const requestedId = clean(body.restaurant_id || query.get("restaurant_id"));
  const restaurant = requestedId || !roleMatches(profile.role, ["admin"]) ? await getPartnerRestaurant(profile, query, body) : null;
  const restaurantId = restaurant?.id || null;

  if (!supabaseConfigured) {
    return json(200, { mode: "demo", summary: restaurantIntelligenceSummary(restaurantId), scope: restaurantId ? "restaurant" : "platform" });
  }

  const summary = await supabaseFetch("/rest/v1/rpc/restaurant_intelligence_summary", {
    method: "POST",
    service: true,
    body: { p_restaurant_id: restaurantId }
  });
  return json(200, { mode: "supabase", summary, scope: restaurantId ? "restaurant" : "platform" });
}

async function aiTrends(method, body, headers, query) {
  if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const requestedId = clean(body.restaurant_id || query.get("restaurant_id"));
  const restaurant = requestedId || !roleMatches(profile.role, ["admin"]) ? await getPartnerRestaurant(profile, query, body) : null;
  const restaurantId = restaurant?.id || null;

  if (!supabaseConfigured) {
    const summary = restaurantIntelligenceSummary(restaurantId);
    return json(200, {
      mode: "demo",
      trends: {
        ...summary,
        fastest_growing_dishes: summary.fastest_growing_dishes?.length ? summary.fastest_growing_dishes : summary.top_trends,
        trending_drinks: summary.most_uploaded_drinks?.length ? summary.most_uploaded_drinks : summary.top_trends.filter((item) => ["cocktail", "wine", "beer", "coffee"].includes(item.label)),
        privacy: "aggregated_anonymized_no_pii"
      }
    });
  }

  const trends = await supabaseFetch("/rest/v1/rpc/restaurant_intelligence_summary", {
    method: "POST",
    service: true,
    body: { p_restaurant_id: restaurantId }
  });
  return json(200, { mode: "supabase", trends });
}

function reviewPayload(body, options = {}) {
  const food = integerInRange(body.food_rating, 1, 5);
  const service = integerInRange(body.service_rating, 1, 5);
  const ambience = integerInRange(body.ambience_rating, 1, 5);
  if (food === null || service === null || ambience === null) return null;
  const status = clean(body.status || "pending");
  return {
    restaurant_id: clean(body.restaurant_id),
    guest_name: nullableClean(body.guest_name || body.name),
    guest_email: lower(body.guest_email || body.email) || null,
    food_rating: food,
    service_rating: service,
    ambience_rating: ambience,
    comment: nullableClean(body.comment),
    status: options.admin && allowedReviewStatuses.has(status) ? status : "pending"
  };
}

async function createReview(body) {
  const payload = reviewPayload(body);
  if (!payload || !payload.restaurant_id) return json(400, { error: "Restaurant and 1-5 ratings are required." });

  if (!supabaseConfigured) {
    ensureDemo();
    const restaurant = demo.restaurants.find((item) => item.id === payload.restaurant_id && item.status === "approved");
    if (!restaurant) return json(404, { error: "Restaurant not found." });
    const review = {
      id: crypto.randomUUID(),
      ...payload,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    demo.restaurantReviews.unshift(review);
    demo.aiInteractionEvents.unshift({
      id: crypto.randomUUID(),
      profile_key: aiProfileKey(body.profile_key || payload.guest_email),
      event_type: "review_submitted",
      restaurant_id: payload.restaurant_id,
      offer_id: null,
      reservation_id: null,
      metadata: {
        food_rating: payload.food_rating,
        service_rating: payload.service_rating,
        ambience_rating: payload.ambience_rating,
        comment: payload.comment
      },
      created_at: nowIso()
    });
    return json(201, { mode: "demo", review });
  }

  const rows = await supabaseFetch("/rest/v1/restaurant_reviews?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: payload
  });
  await supabaseFetch("/rest/v1/ai_interaction_events", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      profile_key: aiProfileKey(body.profile_key || payload.guest_email),
      event_type: "review_submitted",
      restaurant_id: payload.restaurant_id,
      metadata: {
        food_rating: payload.food_rating,
        service_rating: payload.service_rating,
        ambience_rating: payload.ambience_rating
      }
    }
  }).catch(() => null);
  return json(201, { mode: "supabase", review: rows?.[0] });
}

function reviewRows() {
  ensureDemo();
  return demo.restaurantReviews.map((review) => {
    const restaurant = demo.restaurants.find((item) => item.id === review.restaurant_id);
    return {
      ...review,
      restaurant_name: restaurant?.name || "Restaurant"
    };
  });
}

async function adminReviews(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") return json(200, { reviews: reviewRows() });
    if (method === "PATCH") {
      const review = demo.restaurantReviews.find((item) => item.id === clean(body.id));
      if (!review) return json(404, { error: "Review not found." });
      const status = clean(body.status);
      if (!allowedReviewStatuses.has(status)) return json(400, { error: "Invalid review status." });
      review.status = status;
      review.updated_at = nowIso();
      return json(200, { review: reviewRows().find((item) => item.id === review.id) });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch("/rest/v1/restaurant_reviews_overview?select=*&order=created_at.desc", { service: true });
      return json(200, { reviews: rows || [] });
    }
    if (method === "PATCH") {
      const id = clean(body.id);
      const status = clean(body.status);
      if (!allowedReviewStatuses.has(status)) return json(400, { error: "Invalid review status." });
      const rows = await supabaseFetch(`/rest/v1/restaurant_reviews?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: { status }
      });
      return json(200, { review: rows?.[0] });
    }
  }
  return json(405, { error: "Method not allowed." });
}

function photoRewardSubmissionRows() {
  ensureDemo();
  return demo.consumptionUploads.map((submission) => {
    const restaurant = demo.restaurants.find((item) => item.id === submission.restaurant_id);
    const reservation = demo.reservations.find((item) => item.id === submission.reservation_id);
    const ratingValues = [submission.overall_rating, submission.food_rating, submission.service_rating, submission.ambience_rating]
      .map(Number)
      .filter(Number.isFinite);
    return {
      submission_id: submission.id,
      id: submission.id,
      booking_id: submission.reservation_id,
      reservation_id: submission.reservation_id,
      reference: reservation?.reference || "",
      restaurant_id: submission.restaurant_id,
      restaurant_name: restaurant?.name || "Restaurant",
      guest_id: submission.guest_id || reservation?.guest_id || null,
      guest_name: submission.guest_name || reservation?.guest_name || "Guest",
      guest_email: submission.guest_email || reservation?.guest_email || "",
      image_url: submission.image_url,
      uploaded_file_name: submission.uploaded_file_name || "",
      rating: submission.overall_rating ?? submission.rating ?? (ratingValues.length ? average(ratingValues) : null),
      food_rating: submission.food_rating,
      service_rating: submission.service_rating,
      ambience_rating: submission.ambience_rating,
      description: submission.description,
      liked_highlight: submission.liked_highlight,
      review: submission.short_review,
      short_review: submission.short_review,
      ordered_items: submission.ordered_items,
      would_recommend: submission.would_recommend,
      would_return: submission.would_return,
      tags: submission.tags || [],
      detected_dish: submission.detected_dish || submission.food_type,
      detected_drink: submission.detected_drink || submission.drink_type,
      cuisine_category: submission.cuisine_category || submission.cuisine,
      ai_labels: submission.ai_labels || [],
      points_earned: submission.loyalty_points_awarded,
      pointsEarned: submission.loyalty_points_awarded,
      moderation_status: submission.moderation_status || "pending",
      created_at: submission.created_at
    };
  });
}

function postVisitFeedbackInsights(submissions = []) {
  const approvedOrPending = submissions.filter((item) => item.moderation_status !== "rejected");
  const dishSignals = approvedOrPending.flatMap((item) => [
    ...arrayFrom(item.ordered_items),
    item.detected_dish,
    ...(item.ai_labels || []).filter((label) => !["wine", "cocktail", "beer", "coffee", "drink"].includes(clean(label).toLowerCase()))
  ].filter(Boolean));
  const photoItems = approvedOrPending
    .filter((item) => clean(item.image_url))
    .flatMap((item) => [item.detected_dish, item.detected_drink, ...arrayFrom(item.ordered_items), ...(item.ai_labels || [])].filter(Boolean));
  const serviceRatings = approvedOrPending.map((item) => numberOr(item.service_rating, 0)).filter(Boolean);
  const ambienceRatings = approvedOrPending.map((item) => numberOr(item.ambience_rating, 0)).filter(Boolean);
  const overallRatings = approvedOrPending.map((item) => numberOr(item.rating, 0)).filter(Boolean);
  const repeatYes = approvedOrPending.filter((item) => clean(item.would_return).toLowerCase() === "yes").length;
  const repeatTotal = approvedOrPending.filter((item) => clean(item.would_return)).length;
  const photos = approvedOrPending.filter((item) => clean(item.image_url)).length;
  const topDishes = topCounts(dishSignals, 4);
  const mostPhotographed = topCounts(photoItems, 4);
  const averageService = average(serviceRatings);
  const averageAmbience = average(ambienceRatings);
  const averageOverall = average(overallRatings);
  return {
    popular_dishes: topDishes.length ? topDishes.map((item) => item.label).join(", ") : "Pasta, steak, wine",
    weak_service_signals: averageService && averageService < 4 ? `Service average ${averageService.toFixed(1)}/5 needs attention` : "No weak service signal detected",
    ambience_sentiment: averageAmbience ? (averageAmbience >= 4.5 ? "Very positive" : averageAmbience >= 4 ? "Positive" : "Watch") : "Positive demo signal",
    photo_engagement: `${photos} uploaded ${photos === 1 ? "photo" : "photos"} from ${approvedOrPending.length || 1} feedback submissions`,
    most_photographed_items: mostPhotographed.length ? mostPhotographed.map((item) => item.label).join(", ") : "Pasta, wine, dessert",
    guest_satisfaction_trend: averageOverall ? (averageOverall >= 4.5 ? "Strong and improving" : averageOverall >= 4 ? "Stable positive" : "Needs follow-up") : "Directional positive",
    repeat_intent_signal: repeatTotal ? `${Math.round((repeatYes / repeatTotal) * 100)}% say they would return` : "High intent placeholder",
    privacy: "aggregated_anonymized_no_pii"
  };
}

async function adminPhotoRewardSubmissions(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") return json(200, { submissions: photoRewardSubmissionRows() });
    if (method === "PATCH") {
      const submission = demo.consumptionUploads.find((item) => item.id === clean(body.id || body.submission_id));
      if (!submission) return json(404, { error: "Submission not found." });
      const status = clean(body.status || body.moderation_status);
      if (!allowedReviewStatuses.has(status)) return json(400, { error: "Invalid moderation status." });
      submission.moderation_status = status;
      submission.updated_at = nowIso();
      return json(200, { submission: photoRewardSubmissionRows().find((item) => item.id === submission.id) });
    }
  } else {
    if (method === "GET") {
      const uploads = await supabaseFetch("/rest/v1/dining_consumption_uploads?select=*&order=created_at.desc", { service: true });
      const restaurants = await supabaseFetch("/rest/v1/restaurants?select=id,name", { service: true }).catch(() => []);
      const reservations = await supabaseFetch("/rest/v1/reservations?select=id,reference,guest_name,guest_email,guest_id", { service: true }).catch(() => []);
      const submissions = (uploads || []).map((submission) => {
        const restaurant = (restaurants || []).find((item) => item.id === submission.restaurant_id);
        const reservation = (reservations || []).find((item) => item.id === submission.reservation_id);
        return {
          submission_id: submission.id,
          id: submission.id,
          booking_id: submission.reservation_id,
          reservation_id: submission.reservation_id,
          reference: reservation?.reference || "",
          restaurant_id: submission.restaurant_id,
          restaurant_name: restaurant?.name || "Restaurant",
          guest_id: submission.guest_id || reservation?.guest_id || null,
          guest_name: submission.guest_name || reservation?.guest_name || "Guest",
          guest_email: submission.guest_email || reservation?.guest_email || "",
          image_url: submission.image_url,
          uploaded_file_name: submission.uploaded_file_name || "",
          rating: submission.overall_rating ?? submission.rating,
          food_rating: submission.food_rating,
          service_rating: submission.service_rating,
          ambience_rating: submission.ambience_rating,
          description: submission.description,
          liked_highlight: submission.liked_highlight,
          review: submission.short_review,
          short_review: submission.short_review,
          ordered_items: submission.ordered_items,
          would_recommend: submission.would_recommend,
          would_return: submission.would_return,
          tags: submission.tags || [],
          detected_dish: submission.detected_dish || submission.food_type,
          detected_drink: submission.detected_drink || submission.drink_type,
          cuisine_category: submission.cuisine_category || submission.cuisine,
          ai_labels: submission.ai_labels || [],
          points_earned: submission.loyalty_points_awarded,
          moderation_status: submission.moderation_status || "pending",
          created_at: submission.created_at
        };
      });
      return json(200, { submissions });
    }
    if (method === "PATCH") {
      const id = clean(body.id || body.submission_id);
      const status = clean(body.status || body.moderation_status);
      if (!allowedReviewStatuses.has(status)) return json(400, { error: "Invalid moderation status." });
      const rows = await supabaseFetch(`/rest/v1/dining_consumption_uploads?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: { moderation_status: status }
      });
      return json(200, { submission: rows?.[0] });
    }
  }
  return json(405, { error: "Method not allowed." });
}

async function partnerPhotoRewardSubmissions(method, body, headers, query) {
  if (method !== "GET") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);

  if (!supabaseConfigured) {
    const submissions = photoRewardSubmissionRows().filter((item) => item.restaurant_id === restaurant.id);
    return json(200, {
      mode: "demo",
      submissions,
      insights: postVisitFeedbackInsights(submissions)
    });
  }

  const uploads = await supabaseFetch(`/rest/v1/dining_consumption_uploads?select=*&restaurant_id=eq.${encodeURIComponent(restaurant.id)}&order=created_at.desc`, { service: true });
  const reservationIds = [...new Set((uploads || []).map((item) => item.reservation_id).filter(Boolean))];
  const reservations = reservationIds.length
    ? await supabaseFetch(`/rest/v1/reservations?select=id,reference,guest_name,guest_email,guest_id&id=in.(${reservationIds.map((id) => encodeURIComponent(id)).join(",")})`, { service: true }).catch(() => [])
    : [];
  const submissions = (uploads || []).map((submission) => {
    const reservation = (reservations || []).find((item) => item.id === submission.reservation_id);
    return {
      submission_id: submission.id,
      id: submission.id,
      booking_id: submission.reservation_id,
      reservation_id: submission.reservation_id,
      reference: reservation?.reference || "",
      restaurant_id: submission.restaurant_id,
      restaurant_name: restaurant.name,
      guest_id: submission.guest_id || reservation?.guest_id || null,
      guest_name: submission.guest_name || reservation?.guest_name || "Guest",
      guest_email: submission.guest_email || reservation?.guest_email || "",
      image_url: submission.image_url,
      uploaded_file_name: submission.uploaded_file_name || "",
      rating: submission.overall_rating ?? submission.rating,
      food_rating: submission.food_rating,
      service_rating: submission.service_rating,
      ambience_rating: submission.ambience_rating,
      description: submission.description,
      liked_highlight: submission.liked_highlight,
      review: submission.short_review,
      short_review: submission.short_review,
      ordered_items: submission.ordered_items,
      would_recommend: submission.would_recommend,
      would_return: submission.would_return,
      tags: submission.tags || [],
      detected_dish: submission.detected_dish || submission.food_type,
      detected_drink: submission.detected_drink || submission.drink_type,
      cuisine_category: submission.cuisine_category || submission.cuisine,
      ai_labels: submission.ai_labels || [],
      points_earned: submission.loyalty_points_awarded,
      moderation_status: submission.moderation_status || "pending",
      created_at: submission.created_at
    };
  });
  return json(200, { mode: "supabase", submissions, insights: postVisitFeedbackInsights(submissions) });
}

async function publicRewardsContext(query) {
  const bookingId = clean(query.get("bookingId") || query.get("booking_id") || query.get("reservationId") || query.get("reference"));
  if (!bookingId) return json(400, { error: "Booking ID is required." });

  if (!supabaseConfigured) {
    ensureDemo();
    const row = reservationOverviewRows().find((item) => item.reservation_id === bookingId || item.reference === bookingId);
    if (!row) return json(404, { error: "Booking not found." });
    return json(200, {
      context: {
        bookingId: row.reservation_id,
        reservation_id: row.reservation_id,
        reference: row.reference,
        restaurantId: row.restaurant_id,
        restaurant_id: row.restaurant_id,
        restaurantName: row.restaurant_name,
        guestId: row.guest_id,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        visitDate: row.reservation_date || row.offer_date,
        reservationTime: row.reservation_time || row.offer_time,
        partySize: row.party_size,
        status: row.status
      }
    });
  }

  const rows = await supabaseFetch(`/rest/v1/reservation_overview?select=*&or=(reservation_id.eq.${encodeURIComponent(bookingId)},reference.eq.${encodeURIComponent(bookingId)})&limit=1`, { service: true });
  const row = rows?.[0];
  if (!row) return json(404, { error: "Booking not found." });
  return json(200, {
    context: {
      bookingId: row.reservation_id,
      reservation_id: row.reservation_id,
      reference: row.reference,
      restaurantId: row.restaurant_id,
      restaurant_id: row.restaurant_id,
      restaurantName: row.restaurant_name,
      guestId: row.guest_id,
      guestName: row.guest_name,
      guestEmail: row.guest_email,
      visitDate: row.reservation_date || row.offer_date,
      reservationTime: row.reservation_time || row.offer_time,
      partySize: row.party_size,
      status: normalizeReservationStatus(row.status)
    }
  });
}

async function guestNotifications(method, body, headers, query) {
  let authProfile = null;
  try {
    authProfile = (await requireProfile(headers, ["guest"])).profile;
  } catch {
    authProfile = null;
  }
  if (method !== "GET" && method !== "PATCH") return json(405, { error: "Method not allowed." });
  const guestEmail = lower(authProfile?.email || query.get("guest_email") || query.get("email"));
  const profileKey = clean(query.get("profile_key") || (authProfile?.email ? aiProfileKey(authProfile.email) : ""));
  if (!guestEmail && !profileKey) return json(400, { error: "Guest email or profile key is required." });
  if (!supabaseConfigured) {
    ensureDemo();
    const rows = demo.guestNotifications.filter((item) => (
      (guestEmail && item.guest_email === guestEmail) ||
      (profileKey && item.profile_key === profileKey)
    ));
    if (method === "PATCH") {
      if (!authProfile) return json(401, { error: "Authentication required." });
      const id = clean(body.id);
      rows.forEach((item) => {
        if (!id || item.id === id) item.read_at = nowIso();
      });
      return json(200, { mode: "demo", notifications: rows, unread_count: rows.filter((item) => !item.read_at).length });
    }
    return json(200, {
      notifications: rows,
      unread_count: rows.filter((item) => !item.read_at).length
    });
  }
  const filters = profileKey
    ? `profile_key=eq.${encodeURIComponent(profileKey)}`
    : `guest_email=eq.${encodeURIComponent(guestEmail)}`;
  if (method === "PATCH") {
    if (!authProfile) return json(401, { error: "Authentication required." });
    const id = clean(body.id);
    const endpoint = id
      ? `/rest/v1/guest_notifications?id=eq.${encodeURIComponent(id)}&guest_email=eq.${encodeURIComponent(guestEmail)}&select=*`
      : `/rest/v1/guest_notifications?${filters}&select=*`;
    const updated = await supabaseFetch(endpoint, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=representation" },
      body: { read_at: nowIso() }
    });
    return json(200, { mode: "supabase", notifications: updated || [] });
  }
  const rows = await supabaseFetch(`/rest/v1/guest_notifications?select=*&${filters}&order=created_at.desc`, { service: true });
  return json(200, { notifications: rows || [], unread_count: (rows || []).filter((item) => !item.read_at).length });
}

function notificationRows() {
  ensureDemo();
  return demo.adminNotifications.map((notification) => {
    const partner = demo.profiles.find((item) => item.id === notification.partner_user_id);
    const restaurant = demo.restaurants.find((item) => item.id === notification.restaurant_id);
    return {
      ...notification,
      partner_name: partner?.full_name || partner?.email || "",
      partner_email: partner?.email || "",
      restaurant_name: restaurant?.name || ""
    };
  });
}

async function createSystemAdminNotification({ type, title, message, profile, entityType, entityId }) {
  const payload = {
    type: clean(type || "system_activity"),
    title: clean(title || "System activity"),
    message: clean(message || "A platform setting changed."),
    partner_user_id: profile?.id || null,
    restaurant_id: null,
    entity_type: nullableClean(entityType),
    entity_id: nullableClean(entityId),
    created_at: nowIso(),
    read_at: null
  };

  if (!supabaseConfigured) {
    ensureDemo();
    const notification = { id: crypto.randomUUID(), ...payload };
    demo.adminNotifications.unshift(notification);
    return notification;
  }

  const rows = await supabaseFetch("/rest/v1/admin_notifications?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: payload
  }).catch(() => null);
  return rows?.[0] || null;
}

async function createAuditLog({ profile, action, entityType, entityId, metadata = {} }) {
  const payload = {
    actor_user_id: profile?.id || null,
    actor_role: normalizeRole(profile?.role || "system"),
    action: clean(action || "system_activity"),
    entity_type: nullableClean(entityType),
    entity_id: nullableClean(entityId),
    metadata: metadata && typeof metadata === "object" ? metadata : {}
  };

  if (!supabaseConfigured) {
    ensureDemo();
    demo.appErrorLogs.unshift({
      id: crypto.randomUUID(),
      area: "audit",
      severity: "info",
      message: payload.metadata?.message || payload.action,
      details: payload,
      created_at: nowIso()
    });
    return payload;
  }

  const rows = await supabaseFetch("/rest/v1/audit_logs?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: payload
  }).catch(() => null);
  return rows?.[0] || null;
}

async function createAdminNotification({ type, title, message, profile, restaurant, entityType, entityId }) {
  if (!profile || !restaurant || !roleMatches(profile.role, ["partner"])) return null;
  const payload = {
    type: clean(type || "partner_activity"),
    title: clean(title || "Partner activity"),
    message: clean(message || "A partner changed Smart Table data."),
    partner_user_id: profile.id,
    restaurant_id: restaurant.id,
    entity_type: nullableClean(entityType),
    entity_id: nullableClean(entityId),
    created_at: nowIso(),
    read_at: null
  };

  if (!supabaseConfigured) {
    ensureDemo();
    const notification = { id: crypto.randomUUID(), ...payload };
    demo.adminNotifications.unshift(notification);
    return notification;
  }

  const rows = await supabaseFetch("/rest/v1/admin_notifications?select=*", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=representation" },
    body: payload
  }).catch(() => null);
  return rows?.[0] || null;
}

async function adminNotifications(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") {
      const notifications = notificationRows().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return json(200, {
        notifications,
        unread_count: notifications.filter((item) => !item.read_at).length
      });
    }
    if (method === "PATCH") {
      const ids = body.read_all ? demo.adminNotifications.map((item) => item.id) : [clean(body.id)].filter(Boolean);
      for (const notification of demo.adminNotifications) {
        if (ids.includes(notification.id)) notification.read_at = nowIso();
      }
      const notifications = notificationRows().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return json(200, { notifications, unread_count: notifications.filter((item) => !item.read_at).length });
    }
  } else {
    if (method === "GET") {
      const notifications = await supabaseFetch("/rest/v1/admin_notifications_overview?select=*&order=created_at.desc", { service: true });
      const countRows = await supabaseFetch("/rest/v1/admin_notifications?select=id&read_at=is.null", { service: true }).catch(() => []);
      return json(200, { notifications: notifications || [], unread_count: countRows?.length || 0 });
    }
    if (method === "PATCH") {
      if (body.read_all) {
        await supabaseFetch("/rest/v1/admin_notifications?read_at=is.null", {
          method: "PATCH",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: { read_at: nowIso() }
        });
      } else {
        const id = clean(body.id);
        await supabaseFetch(`/rest/v1/admin_notifications?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: { read_at: nowIso() }
        });
      }
      const notifications = await supabaseFetch("/rest/v1/admin_notifications_overview?select=*&order=created_at.desc", { service: true });
      const countRows = await supabaseFetch("/rest/v1/admin_notifications?select=id&read_at=is.null", { service: true }).catch(() => []);
      return json(200, { notifications: notifications || [], unread_count: countRows?.length || 0 });
    }
  }
  return json(405, { error: "Method not allowed." });
}

async function createReservation(body, headers) {
  const offerId = clean(body.offer_id);
  const partySize = Number(body.party_size);
  const guest = {
    name: clean(body.guest_name || body.name),
    email: lower(body.guest_email || body.email),
    phone: clean(body.guest_phone || body.phone)
  };
  const guestLanguage = normalizeLanguage(body.guest_language || body.language || body.lang || "en");
  const notes = clean(body.notes);
  if (!offerId || !guest.name || !guest.email || !guest.phone || !Number.isInteger(partySize) || partySize < 1) {
    return json(400, { error: "Offer, guest contact details, and party size are required." });
  }

  if (!supabaseConfigured) {
    ensureDemo();
    const offer = demo.offers.find((item) => item.id === offerId);
    if (!offer) return json(404, { code: "OFFER_NOT_FOUND", error: "Offer not found.", offer_status: "unavailable" });
    const reservationDate = clean(body.reservation_date) || offer.offer_date;
    const reservationTime = clean(body.reservation_time) || offer.start_time || offer.offer_time;
    const restaurant = demo.restaurants.find((item) => item.id === offer.restaurant_id);
    if (!restaurant || restaurant.status !== "approved") {
      const validity = evaluateOfferValidity(offerWithRestaurantContext(offer, restaurant), { reservationDate, reservationTime, partySize });
      logOfferValidityRejection({ ...validity, code: "OFFER_UNAVAILABLE", status: "unavailable" }, offer, { mode: "demo", restaurant_id: offer.restaurant_id });
      return json(409, { code: "OFFER_UNAVAILABLE", error: "Restaurant is not available for reservations.", offer_status: "unavailable" });
    }
    const validity = evaluateOfferValidity(offerWithRestaurantContext(offer, restaurant), { reservationDate, reservationTime, partySize });
    if (!validity.bookable) {
      logOfferValidityRejection(validity, offer, { mode: "demo" });
      return offerValidityErrorResponse(validity);
    }
    if (hasDuplicateActiveReservation(demo.reservations, { offerId, guestEmail: guest.email, reservationDate, reservationTime })) {
      return json(409, { error: "A matching active reservation request already exists." });
    }
    const token = authToken(headers);
    const profile = profileFromDemoToken(token);
    offer.reserved_tables = numberOr(offer.reserved_tables, 0) + 1;
    offer.reserved_seats = numberOr(offer.reserved_seats, 0) + partySize;
    const reservation = {
      id: crypto.randomUUID(),
      reference: `ST-${Math.floor(10000 + Math.random() * 90000)}`,
      offer_id: offer.id,
      restaurant_id: restaurant.id,
      guest_id: profile?.id || null,
      guest_name: guest.name,
      guest_email: guest.email,
      guest_phone: guest.phone,
      party_size: partySize,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      guest_language: guestLanguage,
      notes,
      status: "pending",
      source: "smarttable",
      booking_source: "SMARTTABLE",
      booking_status: "pending",
      created_at: nowIso(),
      updated_at: nowIso()
    };
    demo.reservations.unshift(reservation);
    demo.aiInteractionEvents.unshift({
      id: crypto.randomUUID(),
      profile_key: aiProfileKey(body.profile_key || guest.email || profile?.id),
      user_id: profile?.id || null,
      event_type: "reservation_requested",
      restaurant_id: restaurant.id,
      offer_id: offer.id,
      reservation_id: reservation.id,
      metadata: {
        party_size: partySize,
        requested_discount: numberOr(offer.discount_value, offer.discount_percent || 0),
        reservation_date: reservation.reservation_date,
        reservation_time: reservation.reservation_time
      },
      created_at: nowIso()
    });
    const row = reservationOverviewRows().find((item) => item.reservation_id === reservation.id);
    const emails = await sendReservationCreatedEmails(row);
    return json(201, { reservation: row, emails, email_delivery: emailDeliverySummary(emails) });
  }

  const token = authToken(headers);
  const offerRows = await supabaseFetch(`/rest/v1/offers?select=*,restaurants(*)&id=eq.${encodeURIComponent(offerId)}&limit=1`, { service: true }).catch(() => []);
  const offer = offerRows?.[0];
  if (!offer) return json(404, { code: "OFFER_NOT_FOUND", error: "Offer not found.", offer_status: "unavailable" });
  if (offer.restaurants && offer.restaurants.status && offer.restaurants.status !== "approved") {
    const validity = evaluateOfferValidity(offerWithRestaurantContext(offer, offer.restaurants), {
      reservationDate: clean(body.reservation_date) || offer.offer_date,
      reservationTime: clean(body.reservation_time) || offer.start_time || offer.offer_time,
      partySize
    });
    logOfferValidityRejection({ ...validity, code: "OFFER_UNAVAILABLE", status: "unavailable" }, offer, { mode: "supabase" });
    return json(409, { code: "OFFER_UNAVAILABLE", error: "Restaurant is not available for reservations.", offer_status: "unavailable" });
  }
  const reservationDate = clean(body.reservation_date) || offer.offer_date;
  const reservationTime = clean(body.reservation_time) || offer.start_time || offer.offer_time;
  const validity = evaluateOfferValidity(offerWithRestaurantContext(offer, offer.restaurants), { reservationDate, reservationTime, partySize });
  if (!validity.bookable) {
    logOfferValidityRejection(validity, offer, { mode: "supabase" });
    return offerValidityErrorResponse(validity);
  }
  const duplicateRows = await supabaseFetch(`/rest/v1/reservations?select=id,offer_id,guest_email,reservation_date,reservation_time,status,booking_status&offer_id=eq.${encodeURIComponent(offerId)}&guest_email=eq.${encodeURIComponent(guest.email)}&reservation_date=eq.${encodeURIComponent(reservationDate)}&reservation_time=eq.${encodeURIComponent(reservationTime)}&status=in.(pending,accepted,confirmed,waiting_external_confirmation)&limit=1`, { service: true }).catch(() => []);
  if (hasDuplicateActiveReservation(duplicateRows || [], { offerId, guestEmail: guest.email, reservationDate, reservationTime })) {
    return json(409, { error: "A matching active reservation request already exists." });
  }
  let row = null;
  try {
    row = await supabaseFetch("/rest/v1/rpc/create_reservation", {
      method: "POST",
      service: false,
      token: token || undefined,
      body: {
        p_offer_id: offerId,
        p_guest_name: guest.name,
        p_guest_email: guest.email,
        p_guest_phone: guest.phone,
        p_party_size: partySize,
        p_reservation_date: reservationDate,
        p_reservation_time: reservationTime,
        p_notes: notes
      }
    });
  } catch (error) {
    return reservationRpcErrorResponse(error);
  }
  await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(row.reservation_id)}&select=id`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: { guest_language: guestLanguage }
  }).catch(() => null);
  row.guest_language = guestLanguage;
  const reservationRow = decorateReservationRow({
    ...row,
    source: row.source || "smarttable",
    booking_source: row.booking_source || "SMARTTABLE",
    booking_status: row.booking_status || "pending"
  });
  await supabaseFetch("/rest/v1/ai_interaction_events", {
    method: "POST",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: {
      profile_key: aiProfileKey(body.profile_key || guest.email),
      event_type: "reservation_requested",
      restaurant_id: reservationRow.restaurant_id,
      offer_id: reservationRow.offer_id,
      reservation_id: reservationRow.reservation_id,
      metadata: {
        party_size: partySize,
        requested_discount: reservationRow.discount_value || reservationRow.discount_percent,
        reservation_date: reservationRow.reservation_date,
        reservation_time: reservationRow.reservation_time
      }
    }
  }).catch(() => null);
  const emails = await sendReservationCreatedEmails(reservationRow);
  return json(201, { reservation: reservationRow, emails, email_delivery: emailDeliverySummary(emails) });
}

function restaurantPayload(body, options = {}) {
  const payload = {};
  const fields = [
    "name",
    "legal_name",
    "phone",
    "address",
    "district",
    "website",
    "instagram",
    "facebook",
    "tiktok",
    "google_maps_url",
    "google_place_id",
    "restaurant_type",
    "opening_hours",
    "cover_image",
    "card_image",
    "icon_image",
    "logo_url",
    "hero_image_url",
    "menu_pdf_url",
    "price_range",
    "dress_code",
    "chef_name",
    "description_en",
    "description_es",
    "description_hu",
    "primary_timezone",
    "onboarding_status"
  ];
  for (const field of fields) {
    if (body[field] !== undefined || options.full) payload[field] = clean(body[field]);
  }
  if (body.email !== undefined || body.contact_email !== undefined || options.full) {
    const email = lower(body.email || body.contact_email);
    payload.email = email;
    payload.contact_email = email;
  }
  if (body.cuisine_type !== undefined || body.cuisine !== undefined || options.full) {
    const cuisine = clean(body.cuisine_type || body.cuisine);
    payload.cuisine_type = cuisine;
    payload.cuisine = cuisine;
  }
  if (body.description !== undefined || options.full) {
    payload.description = clean(body.description);
    if (!payload.description_en) payload.description_en = payload.description;
  }
  if (body.gallery_images !== undefined || options.full) payload.gallery_images = arrayFrom(body.gallery_images);
  if (body.payment_methods !== undefined || options.full) payload.payment_methods = arrayFrom(body.payment_methods);
  for (const field of ["outdoor_seating", "parking_available", "kids_friendly", "pet_friendly", "wheelchair_accessible", "private_room_available"]) {
    if (body[field] !== undefined || options.full) {
      const value = Array.isArray(body[field]) ? body[field].at(-1) : body[field];
      payload[field] = value === true || value === "true" || value === "on" || value === 1 || value === "1";
    }
  }
  if (body.year_opened !== undefined || options.full) {
    payload.year_opened = body.year_opened === "" || body.year_opened === undefined ? null : Math.max(0, Math.trunc(numberOr(body.year_opened, 0)));
  }
  if (body.capacity !== undefined || options.full) {
    payload.capacity = body.capacity === "" || body.capacity === undefined ? null : Math.max(0, Math.trunc(numberOr(body.capacity, 0)));
  }
  if (body.billing_plan !== undefined || options.full) {
    const plan = clean(body.billing_plan || "free");
    payload.billing_plan = ["free", "monthly", "per_booking"].includes(plan) ? plan : "free";
  }
  if (body.monthly_fee !== undefined || options.full) payload.monthly_fee = Math.max(0, numberOr(body.monthly_fee, 0));
  if (body.fee_per_booking !== undefined || options.full) payload.fee_per_booking = Math.max(0, numberOr(body.fee_per_booking, 0));
  if (body.billing_status !== undefined || options.full) {
    const status = clean(body.billing_status || "trialing");
    payload.billing_status = ["trialing", "active", "past_due", "cancelled"].includes(status) ? status : "trialing";
  }
  if (body.ai_discount_enabled !== undefined || options.full) {
    payload.ai_discount_enabled = body.ai_discount_enabled === undefined || body.ai_discount_enabled === ""
      ? true
      : body.ai_discount_enabled === true || body.ai_discount_enabled === "true" || body.ai_discount_enabled === "on";
  }
  if (body.min_discount_percent !== undefined || options.full) {
    payload.min_discount_percent = Math.max(0, Math.min(90, Math.trunc(body.min_discount_percent === "" || body.min_discount_percent === undefined ? 10 : numberOr(body.min_discount_percent, 10))));
  }
  if (body.max_discount_percent !== undefined || options.full) {
    payload.max_discount_percent = Math.max(0, Math.min(90, Math.trunc(body.max_discount_percent === "" || body.max_discount_percent === undefined ? 30 : numberOr(body.max_discount_percent, 30))));
  }
  if (body.target_margin_percent !== undefined || options.full) {
    payload.target_margin_percent = Math.max(0, Math.min(100, body.target_margin_percent === "" || body.target_margin_percent === undefined ? 65 : numberOr(body.target_margin_percent, 65)));
  }
  if (body.average_service_minutes !== undefined || options.full) {
    payload.average_service_minutes = Math.max(15, Math.trunc(body.average_service_minutes === "" || body.average_service_minutes === undefined ? 75 : numberOr(body.average_service_minutes, 75)));
  }
  if (body.table_capacity !== undefined || options.full) {
    payload.table_capacity = body.table_capacity === "" || body.table_capacity === undefined ? null : Math.max(0, Math.trunc(numberOr(body.table_capacity, 0)));
  }
  if (body.weak_hours !== undefined || options.full) payload.weak_hours = Array.isArray(body.weak_hours) ? body.weak_hours : arrayFrom(body.weak_hours);
  if (body.discount_rules !== undefined || options.full) payload.discount_rules = jsonFrom(body.discount_rules, {});
  if (body.onboarding_completed_at !== undefined) payload.onboarding_completed_at = nullableClean(body.onboarding_completed_at);
  if (payload.min_discount_percent !== undefined && payload.max_discount_percent !== undefined && payload.max_discount_percent < payload.min_discount_percent) {
    payload.max_discount_percent = payload.min_discount_percent;
  }
  if (body.owner_user_id !== undefined) payload.owner_user_id = nullableClean(body.owner_user_id);
  if (body.rating !== undefined) payload.rating = numberOr(body.rating, 4.5);
  if (body.sort_order !== undefined || options.full) payload.sort_order = body.sort_order === "" || body.sort_order === undefined ? null : Math.max(0, Math.trunc(numberOr(body.sort_order, 0)));
  if (body.latitude !== undefined || options.full) payload.latitude = body.latitude === "" || body.latitude === undefined ? null : numberOr(body.latitude, null);
  if (body.longitude !== undefined || options.full) payload.longitude = body.longitude === "" || body.longitude === undefined ? null : numberOr(body.longitude, null);
  if (body.status && allowedRestaurantStatuses.has(body.status)) payload.status = body.status;
  if (options.full) {
    payload.status ||= "pending";
    payload.rating ??= 4.5;
    payload.billing_plan ||= "free";
    payload.monthly_fee ??= 0;
    payload.fee_per_booking ??= 0;
    payload.billing_status ||= "trialing";
    payload.ai_discount_enabled ??= true;
    payload.min_discount_percent ??= 10;
    payload.max_discount_percent ??= 30;
    payload.target_margin_percent ??= 65;
    payload.average_service_minutes ??= 75;
    payload.table_capacity ??= payload.capacity ?? null;
    payload.weak_hours ||= [];
    payload.discount_rules ||= {};
    payload.onboarding_status ||= "incomplete";
    payload.primary_timezone ||= "America/New_York";
    payload.district ||= "New York";
    payload.description ||= payload.description_en || "";
    payload.description_en ||= payload.description || "";
    payload.description_hu ||= "";
    payload.cover_image ||= "/assets/restaurant-hero.png";
    payload.card_image ||= payload.cover_image;
    payload.icon_image ||= payload.card_image;
    payload.logo_url ||= payload.icon_image;
    payload.hero_image_url ||= payload.cover_image;
    payload.menu_pdf_url ||= "";
    payload.price_range ||= "$$";
    payload.dress_code ||= "";
    payload.payment_methods ||= [];
    payload.chef_name ||= "";
    payload.year_opened ??= null;
    payload.capacity ??= null;
    payload.outdoor_seating ??= false;
    payload.parking_available ??= false;
    payload.kids_friendly ??= false;
    payload.pet_friendly ??= false;
    payload.wheelchair_accessible ??= false;
    payload.private_room_available ??= false;
    payload.email ||= payload.contact_email || "";
    payload.contact_email ||= payload.email;
    payload.cuisine ||= payload.cuisine_type || "Restaurant";
    payload.cuisine_type ||= payload.cuisine;
    payload.restaurant_type ||= payload.cuisine_type || "restaurant";
  }
  return payload;
}

function offerConditionPayload(body = {}) {
  const payload = {};
  if (body.minimum_spend !== undefined) payload.minimum_spend = Math.max(0, numberOr(body.minimum_spend, 0));
  if (body.applies_to_drinks !== undefined) payload.applies_to_drinks = boolValue(body.applies_to_drinks);
  if (body.min_party_size !== undefined) payload.min_party_size = Math.max(1, numberOr(body.min_party_size, 1));
  if (body.max_party_size !== undefined) payload.max_party_size = Math.max(1, numberOr(body.max_party_size, 4));
  if (body.time_limit_minutes !== undefined) payload.time_limit_minutes = Math.max(0, numberOr(body.time_limit_minutes, 0)) || null;
  if (body.blackout_periods !== undefined) payload.blackout_periods = jsonFrom(body.blackout_periods, []);
  if (body.combinable !== undefined) payload.combinable = boolValue(body.combinable);
  if (body.custom_terms !== undefined) payload.custom_terms = jsonFrom(body.custom_terms, {});
  return payload;
}

function offerPayload(body, restaurantId, options = {}) {
  const startTime = clean(body.start_time || body.offer_time);
  const available = Math.max(1, numberOr(body.available_tables || body.seat_count, 1));
  const maxParty = Math.max(1, numberOr(body.max_party_size, 4));
  const discount = Math.max(1, Math.min(90, numberOr(body.discount_value || body.discount_percent, 20)));
  const payload = {};
  if (restaurantId) payload.restaurant_id = restaurantId;
  for (const field of ["title_en", "title_es", "title_hu", "description_en", "description_es", "description_hu", "end_time"]) {
    if (body[field] !== undefined || options.full) payload[field] = clean(body[field]);
  }
  if (body.offer_date !== undefined || options.full) payload.offer_date = clean(body.offer_date);
  if (body.start_time !== undefined || body.offer_time !== undefined || options.full) {
    payload.start_time = startTime;
    payload.offer_time = startTime;
  }
  if (body.discount_type !== undefined || options.full) payload.discount_type = clean(body.discount_type || "percent") || "percent";
  if (body.discount_value !== undefined || body.discount_percent !== undefined || options.full) {
    payload.discount_value = discount;
    payload.discount_percent = discount;
  }
  if (body.available_tables !== undefined || body.seat_count !== undefined || options.full) {
    payload.available_tables = available;
    payload.seat_count = available * maxParty;
  }
  if (body.max_party_size !== undefined || options.full) payload.max_party_size = maxParty;
  if (body.valid_days !== undefined || options.full) payload.valid_days = validDaysFrom(body.valid_days);
  if (body.offer_image !== undefined || body.image_url !== undefined || options.full) payload.offer_image = clean(body.offer_image || body.image_url || "/assets/restaurant-hero.png");
  if (body.redemption_rules !== undefined || options.full) payload.redemption_rules = jsonFrom(body.redemption_rules, {});
  if (body.performance !== undefined || options.full) payload.performance = jsonFrom(body.performance, {});
  if (body.source !== undefined || options.full) payload.source = clean(body.source || "manual") || "manual";
  if (body.ai_recommendation_id !== undefined) payload.ai_recommendation_id = nullableClean(body.ai_recommendation_id);
  const conditionPayload = offerConditionPayload(body);
  Object.assign(payload, conditionPayload);
  if (Object.keys(conditionPayload).length) {
    payload.structured_conditions = {
      minimum_spend: conditionPayload.minimum_spend ?? null,
      applies_to_drinks: conditionPayload.applies_to_drinks ?? true,
      min_party_size: conditionPayload.min_party_size ?? 1,
      max_party_size: conditionPayload.max_party_size ?? maxParty,
      time_limit_minutes: conditionPayload.time_limit_minutes ?? null,
      blackout_periods: conditionPayload.blackout_periods ?? [],
      combinable: conditionPayload.combinable ?? false,
      custom_terms: conditionPayload.custom_terms ?? {}
    };
  }
  if (body.status && allowedOfferStatuses.has(body.status)) payload.status = body.status;
  if (options.full) {
    payload.title_en ||= "Discounted table";
    payload.title_es ||= "";
    payload.title_hu ||= "";
    payload.description_en ||= "";
    payload.description_es ||= "";
    payload.description_hu ||= "";
    payload.discount_type ||= "percent";
    payload.offer_date ||= new Date().toISOString().slice(0, 10);
    payload.start_time ||= "18:00";
    payload.offer_time ||= payload.start_time;
    payload.end_time ||= "20:00";
    payload.valid_days ||= ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    payload.status ||= "active";
    payload.redemption_rules ||= {};
    payload.performance ||= {};
    payload.source ||= "manual";
    payload.reserved_tables = 0;
    payload.reserved_seats = 0;
  }
  return payload;
}

async function adminContent(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") return json(200, { content: mergeContentRows(demo.siteContent) });
    if (method === "PATCH" || method === "POST") {
      const items = Array.isArray(body.items) ? body.items : [body];
      const byKey = new Map(mergeContentRows(demo.siteContent).map((row) => [row.key, row]));
      for (const item of items) {
        if (!item?.key) continue;
        const current = byKey.get(item.key) || {};
        byKey.set(item.key, normalizeContentRow({ ...current, ...item, updated_at: nowIso() }));
      }
      demo.siteContent = mergeContentRows([...byKey.values()]);
      return json(200, { content: demo.siteContent });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch("/rest/v1/site_content?select=*&order=group_name.asc,key.asc", { service: true });
      return json(200, { content: mergeContentRows(rows || []) });
    }
    if (method === "PATCH" || method === "POST") {
      const items = (Array.isArray(body.items) ? body.items : [body]).filter((item) => item?.key).map(normalizeContentRow);
      if (!items.length) return json(400, { error: "At least one content item is required." });
      const rows = await supabaseFetch("/rest/v1/site_content?on_conflict=key&select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: items
      });
      return json(200, { content: mergeContentRows(rows || []) });
    }
  }
  return json(405, { error: "Method not allowed." });
}

async function adminRestaurants(method, body, headers, query) {
  await requireProfile(headers, ["admin"]);

  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") {
      const restaurants = [...demo.restaurants].sort((a, b) => {
        const order = numberOr(a.sort_order, 999999) - numberOr(b.sort_order, 999999);
        if (order) return order;
        return clean(a.name).localeCompare(clean(b.name)) || clean(a.created_at).localeCompare(clean(b.created_at));
      });
      return json(200, { restaurants });
    }
    if (method === "POST") {
      const item = {
        id: crypto.randomUUID(),
        ...restaurantPayload(body, { full: true }),
        views_count: 0,
        created_at: nowIso(),
        updated_at: nowIso()
      };
      demo.restaurants.unshift(item);
      return json(201, { restaurant: item });
    }
    if (method === "PATCH") {
      const item = demo.restaurants.find((restaurant) => restaurant.id === clean(body.id || query.get("id")));
      if (!item) return json(404, { error: "Restaurant not found." });
      Object.assign(item, restaurantPayload(body), { updated_at: nowIso() });
      return json(200, { restaurant: item });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch("/rest/v1/restaurants?select=*&order=sort_order.asc.nullslast,name.asc,created_at.desc", { service: true });
      return json(200, { restaurants: rows || [] });
    }
    if (method === "POST") {
      const rows = await supabaseFetch("/rest/v1/restaurants?select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "return=representation" },
        body: restaurantPayload(body, { full: true })
      });
      return json(201, { restaurant: rows?.[0] });
    }
    if (method === "PATCH") {
      const id = clean(body.id || query.get("id"));
      const rows = await supabaseFetch(`/rest/v1/restaurants?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: restaurantPayload(body)
      });
      return json(200, { restaurant: rows?.[0] });
    }
  }

  return json(405, { error: "Method not allowed." });
}

async function adminPartners(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") {
      return json(200, { partners: demo.profiles.filter((profile) => roleMatches(profile.role, ["partner"])) });
    }
    if (method === "POST") {
      const email = lower(body.email);
      const password = String(body.password || "");
      const fullName = clean(body.full_name || body.name || email);
      const restaurantId = nullableClean(body.restaurant_id);
      if (!email || !password || !restaurantId) return json(400, { error: "Email, password, and restaurant are required." });
      if (demo.users.some((item) => item.email === email)) return json(409, { error: "Account already exists." });
      const id = crypto.randomUUID();
      demo.users.push({ id, email, password });
      const profile = { id, email, full_name: fullName, role: "partner", restaurant_id: restaurantId, created_at: nowIso(), updated_at: nowIso() };
      demo.profiles.push(profile);
      const restaurant = demo.restaurants.find((item) => item.id === restaurantId);
      if (restaurant) restaurant.owner_user_id = id;
      return json(201, { partner: clientProfile(profile) });
    }
    if (method === "PATCH") {
      const profile = demo.profiles.find((item) => item.id === clean(body.id));
      if (!profile) return json(404, { error: "Partner profile not found." });
      if (body.restaurant_id !== undefined) profile.restaurant_id = nullableClean(body.restaurant_id);
      if (body.role) profile.role = normalizeRole(body.role);
      if (body.full_name !== undefined) profile.full_name = clean(body.full_name);
      return json(200, { partner: clientProfile(profile) });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch("/rest/v1/profiles?select=*&role=in.(partner,restaurant)&order=created_at.desc", { service: true });
      return json(200, { partners: (rows || []).map(clientProfile) });
    }
    if (method === "POST") {
      const email = lower(body.email);
      const password = String(body.password || "");
      const fullName = clean(body.full_name || body.name || email);
      const restaurantId = nullableClean(body.restaurant_id);
      if (!email || !password || !restaurantId) return json(400, { error: "Email, password, and restaurant are required." });
      const authUser = await supabaseFetch("/auth/v1/admin/users", {
        method: "POST",
        service: true,
        body: {
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName }
        }
      });
      const userId = authUser?.id || authUser?.user?.id;
      if (!userId) return json(500, { error: "Could not create Supabase user." });
      const profiles = await supabaseFetch("/rest/v1/profiles?on_conflict=id&select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: {
          id: userId,
          email,
          full_name: fullName,
          role: "partner",
          restaurant_id: restaurantId
        }
      });
      await supabaseFetch(`/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: { owner_user_id: userId }
      });
      return json(201, { partner: clientProfile(profiles?.[0]) });
    }
    if (method === "PATCH") {
      const id = clean(body.id);
      const update = {};
      if (body.restaurant_id !== undefined) update.restaurant_id = nullableClean(body.restaurant_id);
      if (body.role) update.role = normalizeRole(body.role);
      if (body.full_name !== undefined) update.full_name = clean(body.full_name);
      const rows = await supabaseFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: update
      });
      return json(200, { partner: clientProfile(rows?.[0]) });
    }
  }
  return json(405, { error: "Method not allowed." });
}

async function adminImpersonatePartner(method, body, headers) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["admin"]);
  if (normalizeRole(profile.role) !== "super_admin") return json(403, { error: "Only super admins can view as a partner." });

  const partnerId = clean(body.partner_id || body.id);
  const restaurantId = clean(body.restaurant_id);
  if (!partnerId && !restaurantId) return json(400, { error: "Partner or restaurant is required." });

  if (!supabaseConfigured) {
    ensureDemo();
    const partner = demo.profiles.find((item) => roleMatches(item.role, ["partner"]) && (partnerId ? item.id === partnerId : item.restaurant_id === restaurantId));
    if (!partner) return json(404, { error: "Partner profile not found." });
    return json(200, {
      mode: "demo",
      access_token: signedProfileToken(partner, "impersonate", { impersonated_by: profile.id }),
      profile: clientProfile(partner),
      impersonated_by: profile.id
    });
  }

  const filters = partnerId
    ? `id=eq.${encodeURIComponent(partnerId)}`
    : `restaurant_id=eq.${encodeURIComponent(restaurantId)}`;
  const rows = await supabaseFetch(`/rest/v1/profiles?select=*&role=in.(partner,restaurant)&${filters}&limit=1`, { service: true });
  const partner = clientProfile(rows?.[0]);
  if (!partner) return json(404, { error: "Partner profile not found." });
  return json(200, {
    mode: "supabase",
    access_token: signedProfileToken(partner, "impersonate", { impersonated_by: profile.id }),
    profile: partner,
    impersonated_by: profile.id
  });
}

async function adminOffers(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") {
      const offers = demo.offers.map((offer) => ({
        ...offer,
        restaurant_name: demo.restaurants.find((restaurant) => restaurant.id === offer.restaurant_id)?.name || ""
      }));
      return json(200, { offers });
    }
    if (method === "PATCH") {
      const offer = demo.offers.find((item) => item.id === clean(body.id));
      if (!offer) return json(404, { error: "Offer not found." });
      Object.assign(offer, offerPayload(body, null), { updated_at: nowIso() });
      return json(200, { offer });
    }
    if (method === "DELETE") {
      const id = clean(body.id);
      const offer = demo.offers.find((item) => item.id === id);
      if (!offer) return json(404, { error: "Offer not found." });
      offer.status = "expired";
      offer.updated_at = nowIso();
      return json(200, { offer });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch("/rest/v1/offers?select=*&order=created_at.desc", { service: true });
      return json(200, { offers: rows || [] });
    }
    if (method === "PATCH") {
      const id = clean(body.id);
      const rows = await supabaseFetch(`/rest/v1/offers?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: offerPayload(body, null)
      });
      return json(200, { offer: rows?.[0] });
    }
    if (method === "DELETE") {
      const id = clean(body.id);
      await supabaseFetch(`/rest/v1/offers?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: { status: "expired" }
      });
      return json(200, { ok: true, id });
    }
  }
  return json(405, { error: "Method not allowed." });
}

async function adminReservations(method, body, headers, query) {
  const { profile } = await requireProfile(headers, ["admin"]);
  if (method === "GET") {
    if (!supabaseConfigured) {
      return json(200, { reservations: reservationOverviewRows().filter((row) => reservationRowMatchesFilters(row, parseReservationFilters(query))) });
    }
    const rows = await supabaseFetch("/rest/v1/reservation_overview?select=*&order=created_at.desc", { service: true });
    return json(200, { reservations: (rows || []).map(decorateReservationRow).filter((row) => reservationRowMatchesFilters(row, parseReservationFilters(query))) });
  }

  if (method === "PATCH") {
    const id = clean(body.id || body.reservation_id);
    if (body.partner_notes !== undefined) {
      if (!supabaseConfigured) {
        const reservation = demo.reservations.find((item) => item.id === id);
        if (reservation) reservation.partner_notes = clean(body.partner_notes);
      } else {
        await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: { partner_notes: clean(body.partner_notes) }
        });
      }
    }
    if (clean(body.action) === "send_post_visit_email") {
      const email = await sendPostVisitEmailForReservation(id, null);
      return json(200, { ok: isEmailAccepted(email), email, email_delivery: emailDeliverySummary([email]) });
    }
    const status = clean(body.status);
    if (!status) {
      const row = !supabaseConfigured
        ? reservationOverviewRows().find((item) => item.reservation_id === id)
        : (await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(id)}`, { service: true }))?.[0];
      return json(200, { reservation: row ? decorateReservationRow(row) : row });
    }
    const normalizedStatus = normalizeReservationStatus(status);
    if (!allowedReservationStatuses.has(status) && !mutableReservationStatuses.has(normalizedStatus)) return json(400, { error: "Invalid reservation status." });
    if (normalizedStatus === "cancelled" && !boolValue(body.confirm)) {
      return json(400, {
        code: "RESERVATION_CANCELLATION_CONFIRMATION_REQUIRED",
        error: "Cancellation requires explicit confirmation."
      });
    }
    const row = await updateReservationStatus(id, status, null, {
      cancelledByLabel: normalizedStatus === "cancelled" ? "SmartTable admin" : "",
      actorUserId: profile.id,
      actorRole: profile.role
    });
    await createAuditLog({
      profile,
      action: "reservation_status_changed",
      entityType: "reservation",
      entityId: id,
      metadata: {
        status: normalizedStatus,
        reference: row?.reference || "",
        restaurant_id: row?.restaurant_id || ""
      }
    });
    return json(200, { reservation: row });
  }

  return json(405, { error: "Method not allowed." });
}

async function adminStats(headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    const reservations = demo.reservations.map((item) => ({ ...item, status: normalizeReservationStatus(item.status) }));
    const now = new Date();
    const weekStart = dateStartOfWeek(now);
    const monthStart = dateStartOfMonth(now);
    const activeFollowers = demo.restaurantFollowers.filter((item) => item.notification_enabled !== false);
    return json(200, {
      stats: {
        restaurants_total: demo.restaurants.length,
        restaurants_pending: demo.restaurants.filter((item) => item.status === "pending").length,
        partners_total: demo.profiles.filter((item) => roleMatches(item.role, ["partner"])).length,
        offers_active: demo.offers.filter((item) => item.status === "active").length,
        reservations_total: reservations.length,
        reservations_pending: reservations.filter((item) => item.status === "pending").length,
        reservations_accepted: reservations.filter((item) => item.status === "accepted").length,
        reservations_rejected: reservations.filter((item) => item.status === "rejected").length,
        seats_reserved: reservations.reduce((sum, item) => sum + item.party_size, 0),
        views_total: demo.restaurants.reduce((sum, item) => sum + numberOr(item.views_count, 0), 0),
        favorites_total: activeFollowers.length,
        favorites_this_week: activeFollowers.filter((item) => new Date(item.created_at) >= weekStart).length,
        favorites_this_month: activeFollowers.filter((item) => new Date(item.created_at) >= monthStart).length
      }
    });
  }
  const stats = await supabaseFetch("/rest/v1/rpc/admin_dashboard_stats", { method: "POST", service: true, body: {} });
  return json(200, { stats });
}

async function getPartnerRestaurant(profile, query, body = {}) {
  const requestedRestaurantId = clean(query?.get("restaurant_id") || body.restaurant_id);
  const canAccessAnyRestaurant = roleMatches(profile.role, ["admin"]);
  if (!canAccessAnyRestaurant && requestedRestaurantId && requestedRestaurantId !== clean(profile.restaurant_id)) {
    const error = new Error("You are not allowed to access another restaurant profile.");
    error.status = 403;
    throw error;
  }
  const requestedId = canAccessAnyRestaurant
    ? clean(requestedRestaurantId || profile.restaurant_id)
    : clean(profile.restaurant_id);

  if (!supabaseConfigured) {
    ensureDemo();
    const restaurant = requestedId
      ? demo.restaurants.find((item) => item.id === requestedId)
      : demo.restaurants.find((item) => item.owner_user_id === profile.id);
    if (!restaurant) {
      const error = new Error("Restaurant profile is not linked to this account.");
      error.status = 404;
      throw error;
    }
    return restaurant;
  }

  let filter = "";
  if (requestedId) {
    filter = `id=eq.${encodeURIComponent(requestedId)}`;
  } else {
    filter = `owner_user_id=eq.${encodeURIComponent(profile.id)}`;
  }
  const rows = await supabaseFetch(`/rest/v1/restaurants?select=*&${filter}&limit=1`, { service: true });
  const restaurant = rows?.[0];
  if (!restaurant) {
    const error = new Error("Restaurant profile is not linked to this account.");
    error.status = 404;
    throw error;
  }
  return restaurant;
}

async function partnerProfile(method, body, headers, query) {
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);
  const withEmailDiagnostics = (item) => item ? { ...item, email_diagnostics: restaurantEmailDiagnostics(item) } : item;

  if (!supabaseConfigured) {
    if (method === "GET") return json(200, { restaurant: withEmailDiagnostics(restaurant) });
    if (method === "PATCH") {
      Object.assign(restaurant, restaurantPayload(body), { updated_at: nowIso() });
      await createAdminNotification({
        type: "partner_profile_updated",
        title: "Partner profile updated",
        message: `${restaurant.name} profile was updated by ${profile.email}.`,
        profile,
        restaurant,
        entityType: "restaurant",
        entityId: restaurant.id
      });
      return json(200, { restaurant: withEmailDiagnostics(restaurant) });
    }
  } else {
    if (method === "GET") return json(200, { restaurant: withEmailDiagnostics(restaurant) });
    if (method === "PATCH") {
      const rows = await supabaseFetch(`/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurant.id)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: restaurantPayload(body)
      });
      const updated = rows?.[0];
      await createAdminNotification({
        type: "partner_profile_updated",
        title: "Partner profile updated",
        message: `${updated?.name || restaurant.name} profile was updated by ${profile.email}.`,
        profile,
        restaurant: updated || restaurant,
        entityType: "restaurant",
        entityId: restaurant.id
      });
      return json(200, { restaurant: withEmailDiagnostics(updated) });
    }
  }

  return json(405, { error: "Method not allowed." });
}

async function partnerStats(headers, query) {
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query);
  if (!supabaseConfigured) {
    const reservations = reservationOverviewRows().filter((row) => row.restaurant_id === restaurant.id);
    const followers = followerStatsForRestaurant(restaurant.id);
    const activeOffers = demo.offers.filter((offer) => offer.restaurant_id === restaurant.id && offer.status === "active");
    const views = numberOr(restaurant.views_count, 0);
    const accepted = reservations.filter((row) => row.status === "accepted").length;
    const reservationValueEstimate = 85;
    return json(200, {
      stats: {
        views,
        bookings: reservations.length,
        accepted,
        rejected: reservations.filter((row) => row.status === "rejected").length,
        favorites_total: followers.total,
        favorites_this_week: followers.this_week,
        favorites_this_month: followers.this_month,
        conversion_rate: views ? Math.round((reservations.length / views) * 100) : reservations.length ? 100 : 0,
        estimated_revenue_recovered: Math.round(accepted * reservationValueEstimate),
        active_offers: activeOffers.length
      }
    });
  }
  const stats = await supabaseFetch("/rest/v1/rpc/partner_dashboard_stats", {
    method: "POST",
    service: true,
    body: { p_restaurant_id: restaurant.id }
  });
  const activeOffersRows = await supabaseFetch(`/rest/v1/offers?select=id&restaurant_id=eq.${encodeURIComponent(restaurant.id)}&status=eq.active`, { service: true }).catch(() => []);
  const views = numberOr(stats?.views, 0);
  const bookings = numberOr(stats?.bookings, 0);
  const accepted = numberOr(stats?.accepted, 0);
  return json(200, {
    stats: {
      ...stats,
      conversion_rate: views ? Math.round((bookings / views) * 100) : bookings ? 100 : 0,
      estimated_revenue_recovered: Math.round(accepted * 85),
      active_offers: activeOffersRows?.length || 0
    }
  });
}

function safeFileName(filename) {
  const base = clean(filename).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  return base || "image";
}

async function partnerStorageSignUpload(method, body, headers, query) {
  if (method !== "POST") return json(405, { error: "Method not allowed." });
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);
  const kind = clean(body.kind || "gallery");
  if (!["cover", "gallery", "offer", "icon", "card"].includes(kind)) return json(400, { error: "Invalid upload kind." });
  const contentType = clean(body.content_type || body.contentType || "image/jpeg");
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return json(400, { error: "Only JPG, PNG, and WebP images are allowed." });
  const filename = safeFileName(body.filename || `smarttable-${kind}.jpg`);
  const path = `${restaurant.id}/${kind}/${crypto.randomUUID()}-${filename}`;

  if (!supabaseConfigured) {
    await createAdminNotification({
      type: "partner_image_uploaded",
      title: "Restaurant image uploaded",
      message: `${profile.email} prepared a ${kind} image upload for ${restaurant.name}.`,
      profile,
      restaurant,
      entityType: "image",
      entityId: path
    });
    return json(200, {
      mode: "demo",
      bucket: SUPABASE_STORAGE_BUCKET,
      path,
      public_url: body.preview_url || "/assets/restaurant-hero.png",
      message: "Demo mode does not persist uploaded files. Configure Supabase Storage for production uploads."
    });
  }

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${encodeURIComponent(SUPABASE_STORAGE_BUCKET)}/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ upsert: true })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || "Could not create upload URL.");
    error.status = response.status;
    throw error;
  }

  const signedUrl = payload.signedURL || payload.signedUrl || payload.url || payload.signed_url;
  await createAdminNotification({
    type: "partner_image_uploaded",
    title: "Restaurant image uploaded",
    message: `${profile.email} created a ${kind} image upload for ${restaurant.name}.`,
    profile,
    restaurant,
    entityType: "image",
    entityId: path
  });
  return json(200, {
    mode: "supabase",
    bucket: SUPABASE_STORAGE_BUCKET,
    path,
    token: payload.token || null,
    upload_url: signedUrl?.startsWith("http") ? signedUrl : `${SUPABASE_URL}${signedUrl || ""}`,
    public_url: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/${path}`
  });
}

async function partnerOffers(method, body, headers, query) {
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);
  const restaurantId = restaurant.id;

  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") return json(200, { offers: demo.offers.filter((offer) => offer.restaurant_id === restaurantId) });
    if (method === "POST") {
      const offer = {
        id: crypto.randomUUID(),
        ...offerPayload(body, restaurantId, { full: true }),
        created_at: nowIso(),
        updated_at: nowIso()
      };
      demo.offers.unshift(offer);
      await createAdminNotification({
        type: "partner_offer_created",
        title: "Offer created",
        message: `${profile.email} created an offer for ${restaurant.name}.`,
        profile,
        restaurant,
        entityType: "offer",
        entityId: offer.id
      });
      return json(201, { offer });
    }
    if (method === "PATCH") {
      const offer = demo.offers.find((item) => item.id === clean(body.id) && item.restaurant_id === restaurantId);
      if (!offer) return json(404, { error: "Offer not found." });
      Object.assign(offer, offerPayload(body, restaurantId), { updated_at: nowIso() });
      await createAdminNotification({
        type: "partner_offer_updated",
        title: "Offer updated",
        message: `${profile.email} updated an offer for ${restaurant.name}.`,
        profile,
        restaurant,
        entityType: "offer",
        entityId: offer.id
      });
      return json(200, { offer });
    }
    if (method === "DELETE") {
      const id = clean(body.id);
      const offer = demo.offers.find((item) => item.id === id && item.restaurant_id === restaurantId);
      if (!offer) return json(404, { error: "Offer not found." });
      offer.status = "expired";
      offer.updated_at = nowIso();
      await createAdminNotification({
        type: "partner_offer_deleted",
        title: "Offer deactivated",
        message: `${profile.email} deactivated an offer for ${restaurant.name}.`,
        profile,
        restaurant,
        entityType: "offer",
        entityId: offer.id
      });
      return json(200, { offer });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch(`/rest/v1/offers?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=offer_date.desc,start_time.desc`, { service: true });
      return json(200, { offers: rows || [] });
    }
    if (method === "POST") {
      const rows = await supabaseFetch("/rest/v1/offers?select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "return=representation" },
        body: offerPayload(body, restaurantId, { full: true })
      });
      await createAdminNotification({
        type: "partner_offer_created",
        title: "Offer created",
        message: `${profile.email} created an offer for ${restaurant.name}.`,
        profile,
        restaurant,
        entityType: "offer",
        entityId: rows?.[0]?.id
      });
      return json(201, { offer: rows?.[0] });
    }
    if (method === "PATCH") {
      const id = clean(body.id);
      const rows = await supabaseFetch(`/rest/v1/offers?id=eq.${encodeURIComponent(id)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: offerPayload(body, null)
      });
      await createAdminNotification({
        type: "partner_offer_updated",
        title: "Offer updated",
        message: `${profile.email} updated an offer for ${restaurant.name}.`,
        profile,
        restaurant,
        entityType: "offer",
        entityId: rows?.[0]?.id || id
      });
      return json(200, { offer: rows?.[0] });
    }
    if (method === "DELETE") {
      const id = clean(body.id);
      await supabaseFetch(`/rest/v1/offers?id=eq.${encodeURIComponent(id)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: { status: "expired" }
      });
      await createAdminNotification({
        type: "partner_offer_deleted",
        title: "Offer deactivated",
        message: `${profile.email} deactivated an offer for ${restaurant.name}.`,
        profile,
        restaurant,
        entityType: "offer",
        entityId: id
      });
      return json(200, { ok: true, id });
    }
  }

  return json(405, { error: "Method not allowed." });
}

async function updateReservationStatus(id, status, restaurantId, options = {}) {
  const targetStatus = storageReservationStatus(status);
  if (!mutableReservationStatuses.has(targetStatus)) {
    const error = new Error("Invalid reservation status.");
    error.status = 400;
    error.code = "INVALID_RESERVATION_STATUS";
    throw error;
  }

  if (!supabaseConfigured) {
    ensureDemo();
    const reservation = demo.reservations.find((item) => item.id === id);
    if (!reservation || (restaurantId && reservation.restaurant_id !== restaurantId)) {
      const error = new Error("Reservation not found.");
      error.status = 404;
      throw error;
    }
    const previousStatus = normalizeReservationStatus(reservation.status);
    if (previousStatus === targetStatus) {
      const unchangedRow = reservationOverviewRows().find((item) => item.reservation_id === id);
      unchangedRow.status_unchanged = true;
      unchangedRow.emails = [];
      unchangedRow.email_delivery = emailDeliverySummary([]);
      return unchangedRow;
    }
    assertReservationTransition(previousStatus, targetStatus);
    reservation.status = targetStatus;
    Object.assign(reservation, reservationStatusAuditPayload(targetStatus, options));
    reservation.updated_at = nowIso();
    if (releasesOfferCapacity(previousStatus, targetStatus)) {
      const offer = demo.offers.find((item) => item.id === reservation.offer_id);
      if (offer) {
        offer.reserved_tables = Math.max(0, numberOr(offer.reserved_tables, 0) - 1);
        offer.reserved_seats = Math.max(0, numberOr(offer.reserved_seats, 0) - numberOr(reservation.party_size, 0));
      }
    }
    const row = reservationOverviewRows().find((item) => item.reservation_id === id);
    if (targetStatus === "cancelled") {
      row.cancelled_at = reservation.cancelled_at;
      row.cancelled_by_label = reservation.cancelled_by_label || clean(options.cancelledByLabel || "SmartTable");
    }
    if (!(targetStatus === "completed" && previousStatus === "completed")) {
      const emails = emailResultList(await sendReservationStatusEmail(row));
      row.emails = emails;
      row.email_delivery = emailDeliverySummary(emails);
    }
    return row;
  }

  let row;
  const existingRows = await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(id)}`, { service: true }).catch(() => []);
  const existing = existingRows?.[0];
  const previousStatus = normalizeReservationStatus(existing?.status);
  if (existing && restaurantId && existing.restaurant_id !== restaurantId) {
    const error = new Error("Reservation not found.");
    error.status = 404;
    throw error;
  }
  if (existing && previousStatus === targetStatus) {
    const unchangedRow = decorateReservationRow(existing);
    unchangedRow.status_unchanged = true;
    unchangedRow.emails = [];
    unchangedRow.email_delivery = emailDeliverySummary([]);
    return unchangedRow;
  }
  if (existing) assertReservationTransition(previousStatus, targetStatus);
  try {
    row = await supabaseFetch("/rest/v1/rpc/update_reservation_status", {
      method: "POST",
      service: true,
      body: { p_reservation_id: id, p_status: targetStatus }
    });
  } catch {
    if (!existing || (restaurantId && existing.restaurant_id !== restaurantId)) {
      const error = new Error("Reservation not found.");
      error.status = 404;
      throw error;
    }
    const fallbackPatch = { status: targetStatus, ...reservationStatusAuditPayload(targetStatus, options) };
    await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: fallbackPatch
    }).catch(async () => {
      const compatiblePatch = {
        status: targetStatus,
        booking_status: bookingStatusFromReservationStatus(targetStatus)
      };
      if (fallbackPatch.cancelled_at) compatiblePatch.cancelled_at = fallbackPatch.cancelled_at;
      await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=minimal" },
        body: compatiblePatch
      });
    });
    const rows = await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(id)}`, { service: true });
    row = rows?.[0];
  }

  if (!row || (restaurantId && row.restaurant_id !== restaurantId)) {
    const error = new Error("Reservation not found.");
    error.status = 404;
    throw error;
  }
  row = decorateReservationRow(row);
  const auditPatch = reservationStatusAuditPayload(targetStatus, options);
  const patchedRows = await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}&select=id`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=representation" },
    body: auditPatch
  }).catch(async () => {
    const compatiblePatch = {
      booking_status: auditPatch.booking_status
    };
    if (auditPatch.cancelled_at) compatiblePatch.cancelled_at = auditPatch.cancelled_at;
    return await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}&select=id`, {
      method: "PATCH",
      service: true,
      headers: { Prefer: "return=representation" },
      body: compatiblePatch
    }).catch(() => null);
  });
  if (patchedRows) {
    const refreshed = await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(id)}`, { service: true }).catch(() => []);
    row = decorateReservationRow(refreshed?.[0] || row);
  }
  if (targetStatus === "cancelled") {
    row.cancelled_at = row.cancelled_at || auditPatch.cancelled_at || nowIso();
    row.cancelled_by_label = clean(options.cancelledByLabel || "SmartTable");
  }
  if (!(targetStatus === "completed" && previousStatus === "completed")) {
    const emails = emailResultList(await sendReservationStatusEmail(row));
    row.emails = emails;
    row.email_delivery = emailDeliverySummary(emails);
  }
  return decorateReservationRow(row);
}

async function partnerReservations(method, body, headers, query) {
  const { profile } = await requireProfile(headers, ["partner", "admin"]);
  const restaurant = await getPartnerRestaurant(profile, query, body);
  const restaurantId = restaurant.id;

  if (method === "GET") {
    if (!supabaseConfigured) {
      return json(200, { reservations: reservationOverviewRows()
        .filter((row) => row.restaurant_id === restaurantId)
        .filter((row) => reservationRowMatchesFilters(row, parseReservationFilters(query))) });
    }
    const rows = await supabaseFetch(`/rest/v1/reservation_overview?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc`, { service: true });
    return json(200, { reservations: (rows || []).map(decorateReservationRow).filter((row) => reservationRowMatchesFilters(row, parseReservationFilters(query))) });
  }

  if (method === "PATCH") {
    const id = clean(body.id || body.reservation_id);
    if (body.partner_notes !== undefined) {
      if (!supabaseConfigured) {
        const reservation = demo.reservations.find((item) => item.id === id && item.restaurant_id === restaurantId);
        if (reservation) reservation.partner_notes = clean(body.partner_notes);
      } else {
        await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}`, {
          method: "PATCH",
          service: true,
          headers: { Prefer: "return=minimal" },
          body: { partner_notes: clean(body.partner_notes) }
        });
      }
    }
    if (clean(body.action) === "send_post_visit_email") {
      const email = await sendPostVisitEmailForReservation(id, restaurantId);
      return json(200, { ok: isEmailAccepted(email), email, email_delivery: emailDeliverySummary([email]) });
    }
    const status = clean(body.status);
    if (!status) {
      const row = !supabaseConfigured
        ? reservationOverviewRows().find((item) => item.reservation_id === id && item.restaurant_id === restaurantId)
        : (await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(id)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}`, { service: true }))?.[0];
      return json(200, { reservation: row ? decorateReservationRow(row) : row });
    }
    const normalizedStatus = normalizeReservationStatus(status);
    if (!allowedReservationStatuses.has(status) && !mutableReservationStatuses.has(normalizedStatus)) return json(400, { error: "Invalid reservation status." });
    if (normalizedStatus === "cancelled" && !boolValue(body.confirm)) {
      return json(400, {
        code: "RESERVATION_CANCELLATION_CONFIRMATION_REQUIRED",
        error: "Cancellation requires explicit confirmation."
      });
    }
    const row = await updateReservationStatus(id, status, restaurantId, {
      cancelledByLabel: normalizedStatus === "cancelled" ? "Restaurant partner" : "",
      actorUserId: profile.id,
      actorRole: profile.role
    });
    const normalized = normalizedStatus;
    if (["accepted", "rejected"].includes(normalized)) {
      await createGuestReservationNotification(row, {
        type: normalized === "accepted" ? "reservation_accepted" : "reservation_rejected",
        titleKey: normalized === "accepted" ? "reservation_accepted_notification_title" : "reservation_rejected_notification_title",
        messageKey: normalized === "accepted" ? "reservation_accepted_notification_message" : "reservation_rejected_notification_message",
        ctaKey: normalized === "accepted" ? "reservation_accepted_notification_cta" : "reservation_rejected_notification_cta",
        fallbackTitle: normalized === "accepted" ? "Reservation confirmed" : "Reservation not confirmed",
        fallbackMessage: normalized === "accepted"
          ? "{{restaurant_name}} confirmed your reservation. Reference: {{reference}}."
          : "{{restaurant_name}} could not confirm your reservation request. Reference: {{reference}}.",
        fallbackCta: "View reservation",
        url: `${PUBLIC_BASE_URL}/account/reservations`
      });
    }
    if (["accepted", "rejected", "completed"].includes(normalizeReservationStatus(status))) {
      await createAdminNotification({
        type: normalized === "accepted" ? "reservation_accepted" : normalized === "rejected" ? "reservation_rejected" : "booking_completed",
        title: normalized === "accepted" ? "Reservation accepted" : normalized === "rejected" ? "Reservation rejected" : "Booking completed",
        message: `${profile.email} ${normalized} reservation ${row.reference} for ${restaurant.name}.`,
        profile,
        restaurant,
        entityType: "reservation",
        entityId: id
      });
    }
    await createAuditLog({
      profile,
      action: "reservation_status_changed",
      entityType: "reservation",
      entityId: id,
      metadata: {
        status: normalized,
        reference: row?.reference || "",
        restaurant_id: restaurantId
      }
    });
    return json(200, { reservation: row });
  }

  return json(405, { error: "Method not allowed." });
}

export async function handleApiRequest(input) {
  const url = new URL(input.url, "http://localhost");
  let pathname = url.pathname;
  if (pathname === "/api/index") {
    pathname = `/${url.searchParams.get("path") || ""}`;
  }
  pathname = pathname.replace(/^\/api\/?/, "/");
  const method = input.method || "GET";
  const body = input.body || {};
  const headers = input.headers || {};

  try {
    if (method === "GET" && pathname === "/health") {
      const health = await runtimeHealthPayload();
      return json(health.ok ? 200 : 503, health);
    }
    if (IS_PRODUCTION_RUNTIME && !productionConfigurationReady()) {
      return json(503, {
        error: "Service temporarily unavailable.",
        code: "PRODUCTION_CONFIGURATION_INCOMPLETE"
      });
    }
    if (pathname === "/webhooks/resend") return await emailProviderWebhook(method, body, headers);
    if (method === "GET" && pathname === "/system/feature-status") {
      const platformSettings = await getPlatformSettings();
      return json(200, {
        mode: supabaseConfigured ? "supabase" : "demo",
        platform_mode: platformSettings.platform_mode,
        feature_flags: platformSettings.feature_flags,
        features: featureStatusRows(),
        feature_registry: platformFeatureRegistry
      });
    }
    if (method === "GET" && pathname === "/system/checklists") return await systemChecklists();
    if (method === "POST" && pathname === "/auth/login") return await login(body);
    if (pathname === "/auth/logout") return await authLogout(method, body, headers);
    if (method === "POST" && pathname === "/auth/signup-guest") return await signupGuest(body);
    if (pathname === "/auth/forgot-password") return await forgotPassword(method, body);
    if (pathname === "/auth/reset-password") return await resetPassword(method, body);
    if (pathname === "/auth/verification") return await authVerification(method, body, headers);
    if (pathname === "/auth/language") return await updateLanguagePreference(method, body, headers);
    if (pathname === "/auth/security") return await guestSecurity(method, body, headers);
    if (method === "GET" && pathname === "/auth/me") {
      const { profile } = await requireProfile(headers, []);
      return json(200, { profile: clientProfile(profile) });
    }
    if (method === "GET" && pathname === "/public/content") return await listPublicContent(url.searchParams);
    if (method === "GET" && pathname === "/public/config") return await listPublicConfig();
    if (method === "GET" && pathname === "/public/offers") return await listPublicOffers(url.searchParams);
    if (method === "GET" && pathname === "/public/restaurants/newest") return await listNewestRestaurants(url.searchParams);
    if (method === "GET" && pathname === "/public/rewards/context") return await publicRewardsContext(url.searchParams);
    if (method === "POST" && pathname === "/public/follow") return await followRestaurant(body);
    if (method === "POST" && pathname === "/public/reviews") return await createReview(body);
    if (pathname === "/analytics/events") return await analyticsEvent(method, body);
    if (pathname === "/guest/account") return await guestAccount(method, body, headers);
    if (pathname === "/guest/reservations") return await guestReservations(method, body, headers);
    if (pathname === "/guest/favorites") return await guestFavorites(method, body, headers, url.searchParams);
    if (pathname === "/guest/notifications") return await guestNotifications(method, body, headers, url.searchParams);
    if (pathname === "/guest/preferences") return await guestPreferences(method, body, headers);
    if (pathname === "/guest/privacy") return await guestPrivacy(method, body, headers);
    if (pathname === "/ai/preferences") return await aiPreferences(method, body, headers, url.searchParams);
    if (pathname === "/ai/events") return await aiEvent(method, body, headers);
    if (method === "GET" && pathname === "/ai/recommendations") return await aiRecommendations(url.searchParams, headers);
    if (pathname === "/ai/demand-forecast") return await aiDemandForecast(method, body, headers, url.searchParams);
    if (pathname === "/ai/recommendations/restaurant") return await aiRestaurantRecommendation(method, body, headers, url.searchParams);
    if (pathname === "/ai/actions") return await aiActions(method, body, headers, url.searchParams);
    if (pathname === "/ai/service-time-estimate") return await aiServiceTimeEstimate(method, body, headers, url.searchParams);
    if (pathname === "/ai/route-plan") return await aiRoutePlan(method, body, headers, url.searchParams);
    if (pathname === "/ai/consumption/sign-upload") return await aiConsumptionSignUpload(method, body, headers, url.searchParams);
    if (pathname === "/ai/consumption-uploads") return await aiConsumptionUploads(method, body, headers, url.searchParams);
    if (pathname === "/ai/restaurant-intelligence") return await aiRestaurantIntelligence(method, body, headers, url.searchParams);
    if (pathname === "/ai/trends") return await aiTrends(method, body, headers, url.searchParams);
    if (method === "POST" && pathname === "/reservations") return await createReservation(body, headers);
    if (pathname === "/admin/content") return await adminContent(method, body, headers);
    if (pathname === "/admin/restaurants") return await adminRestaurants(method, body, headers, url.searchParams);
    if (pathname === "/admin/partners") return await adminPartners(method, body, headers);
    if (pathname === "/admin/impersonate-partner") return await adminImpersonatePartner(method, body, headers);
    if (pathname === "/admin/offers") return await adminOffers(method, body, headers);
    if (pathname === "/admin/reviews") return await adminReviews(method, body, headers);
    if (pathname === "/admin/photo-reward-submissions") return await adminPhotoRewardSubmissions(method, body, headers);
    if (pathname === "/admin/notifications") return await adminNotifications(method, body, headers);
    if (pathname === "/admin/settings/platform-mode") return await adminPlatformSettings(method, body, headers);
    if (pathname === "/admin/integrations") return await integrationHub(method, body, headers, url.searchParams, "admin");
    if (pathname === "/admin/feature-flags") return await adminFeatureFlags(method, body, headers);
    if (pathname === "/admin/errors") return await adminMonitoring(method, headers);
    if (pathname === "/admin/email-diagnostics") return await adminEmailDiagnostics(method, headers, url.searchParams);
    if (pathname === "/admin/email-queue") return await adminEmailQueue(method, body, headers, url.searchParams);
    if (pathname === "/admin/billing") return await adminBilling(method, headers);
    if (pathname === "/privacy/requests") return await privacyRequests(method, body, headers);
    if (pathname === "/admin/reservations") return await adminReservations(method, body, headers, url.searchParams);
    if (method === "GET" && pathname === "/admin/stats") return await adminStats(headers);
    if (pathname === "/partner/profile") return await partnerProfile(method, body, headers, url.searchParams);
    if (pathname === "/partner/integrations") return await integrationHub(method, body, headers, url.searchParams, "partner");
    if (pathname === "/integrations/import-reservations") return await reservationDataImport(method, body, headers, url.searchParams);
    if (pathname === "/partner/storage/sign-upload") return await partnerStorageSignUpload(method, body, headers, url.searchParams);
    if (pathname === "/partner/offers" || pathname === "/restaurant/offers") return await partnerOffers(method, body, headers, url.searchParams);
    if (pathname === "/partner/photo-reward-submissions") return await partnerPhotoRewardSubmissions(method, body, headers, url.searchParams);
    if (pathname === "/partner/reservations" || pathname === "/restaurant/reservations") return await partnerReservations(method, body, headers, url.searchParams);
    if (method === "GET" && pathname === "/partner/stats") return await partnerStats(headers, url.searchParams);
    return json(404, { error: "API endpoint not found." });
  } catch (error) {
    const status = error.status || 500;
    logSafeServerEvent("api_request_failed", {
      method,
      path: pathname,
      status,
      code: error.code || "API_ERROR"
    });
    const payload = {
      error: IS_PRODUCTION_RUNTIME && status >= 500
        ? "Server error."
        : error.message || "Server error."
    };
    if (error.code) payload.code = error.code;
    if (error.details?.send_after) payload.send_after = error.details.send_after;
    return json(status, payload);
  }
}

export function isSupabaseConfigured() {
  return supabaseConfigured;
}

export async function getRuntimeHealth() {
  return runtimeHealthPayload();
}
