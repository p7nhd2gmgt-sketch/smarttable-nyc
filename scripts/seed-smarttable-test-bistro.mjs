#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../src/env-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const CLEANUP = args.has("--cleanup");
const DIAGNOSE_AUTH = args.has("--diagnose-auth");
const DRY_RUN = !APPLY;

const SUPABASE_URL_ENV_NAMES = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"];
const SERVICE_ROLE_KEY_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SERVICE_ROLE",
  "SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY"
];

function firstEnv(names = []) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== "") return { name, value: String(value) };
  }
  return { name: "", value: "" };
}

function parseEnvFile(source = "") {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function envFileSnapshot(filename) {
  const filePath = path.join(projectRoot, filename);
  if (!existsSync(filePath)) return { filename, filePath, exists: false, values: {} };
  return { filename, filePath, exists: true, values: parseEnvFile(readFileSync(filePath, "utf8")) };
}

function normalizeSupabaseUrl(value = "") {
  const trimmed = String(value).trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return "";
    if (!/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) return "";
    if (parsed.username || parsed.password || (parsed.pathname && parsed.pathname !== "/")) return "";
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    return "";
  }
}

function describeUrlValueForError(value = "") {
  const raw = String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  if (/^\[?sensitive\]?$/i.test(trimmed)) return "redacted placeholder, not a URL";
  try {
    const parsed = new URL(trimmed.replace(/\/+$/, ""));
    return `protocol=${parsed.protocol || "none"}, hostname=${parsed.hostname || "none"}, pathname=${parsed.pathname || ""}`;
  } catch {
    return `not parseable as a URL, length=${trimmed.length}`;
  }
}

const SUPABASE_URL_ENV = firstEnv(SUPABASE_URL_ENV_NAMES);
const SERVICE_ROLE_KEY_ENV = firstEnv(SERVICE_ROLE_KEY_ENV_NAMES);
const SUPABASE_URL = normalizeSupabaseUrl(SUPABASE_URL_ENV.value);
const SERVICE_ROLE_KEY = SERVICE_ROLE_KEY_ENV.value;
const TEST_RESTAURANT_ID = "10000000-0000-4000-8000-000000000123";
const TEST_OFFER_IDS = Array.from(
  { length: 20 },
  (_, index) => `20000000-0000-4000-8000-${String(201 + index).padStart(12, "0")}`
);
const TEST_PARTNER_EMAIL = String(process.env.SMARTTABLE_TEST_PARTNER_EMAIL || "").trim().toLowerCase();
const TEST_PARTNER_PASSWORD = String(process.env.SMARTTABLE_TEST_PARTNER_PASSWORD || "");
const TEST_RESTAURANT_EMAIL = String(
  process.env.SMARTTABLE_TEST_RESTAURANT_EMAIL
  || process.env.EMAIL_REPLY_TO
  || "reservations@smarttable.test"
).trim().toLowerCase();
const PUBLIC_API_BASE_URL = (() => {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (/^https:\/\/(www\.)?smarttablenyc\.com$/i.test(configured)) return configured;
  return "https://smarttablenyc.com";
})();

function safeKeyShape(value = "") {
  const key = String(value || "");
  return {
    prefix: key ? key.slice(0, 8) : "",
    suffix: key ? key.slice(-8) : "",
    length: key.length
  };
}

function authDiagnosticPayload() {
  const envFiles = [envFileSnapshot(".env"), envFileSnapshot(".env.local")];
  const envFilesLoaded = envFiles
    .filter((item) => item.exists)
    .map((item) => ({
      file: item.filename,
      path: item.filePath,
      contains_supabase_url: SUPABASE_URL_ENV_NAMES.some((name) => Object.hasOwn(item.values, name)),
      contains_service_role_key: SERVICE_ROLE_KEY_ENV_NAMES.some((name) => Object.hasOwn(item.values, name))
    }));
  const envLocal = envFiles.find((item) => item.filename === ".env.local");
  const envLocalServiceRole = envLocal?.values?.SUPABASE_SERVICE_ROLE_KEY;
  const currentServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const aliasesPresent = SERVICE_ROLE_KEY_ENV_NAMES.filter((name) => process.env[name] !== undefined && String(process.env[name]).trim() !== "");
  let resolvedUrl = "";
  try {
    const parsed = new URL(SUPABASE_URL);
    resolvedUrl = `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    resolvedUrl = SUPABASE_URL;
  }
  return {
    env_files_loaded: envFilesLoaded,
    resolved_SUPABASE_URL: resolvedUrl,
    supabase_url_variable_used: SUPABASE_URL_ENV.name || null,
    service_role_variable_used: SERVICE_ROLE_KEY_ENV.name || null,
    loaded_key_prefix: safeKeyShape(SERVICE_ROLE_KEY).prefix,
    loaded_key_suffix: safeKeyShape(SERVICE_ROLE_KEY).suffix,
    loaded_key_length: safeKeyShape(SERVICE_ROLE_KEY).length,
    service_role_aliases_present: aliasesPresent,
    another_environment_variable_overrides_SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY_ENV.name
      ? SERVICE_ROLE_KEY_ENV.name !== "SUPABASE_SERVICE_ROLE_KEY"
      : false,
    process_environment_overrides_env_local_SUPABASE_SERVICE_ROLE_KEY: Boolean(
      envLocalServiceRole
      && currentServiceRole
      && currentServiceRole !== envLocalServiceRole
    ),
    authorization_header_format: SERVICE_ROLE_KEY ? `Bearer ${safeKeyShape(SERVICE_ROLE_KEY).prefix}...${safeKeyShape(SERVICE_ROLE_KEY).suffix}` : "",
    apikey_header_format: SERVICE_ROLE_KEY ? `${safeKeyShape(SERVICE_ROLE_KEY).prefix}...${safeKeyShape(SERVICE_ROLE_KEY).suffix}` : ""
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function maskEmail(value = "") {
  const [local, domain] = String(value).split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}***@${domain}`;
}

function assertConfigured() {
  if (DRY_RUN) return;
  if (!SUPABASE_URL_ENV.value) fail(`One Supabase URL variable is required: ${SUPABASE_URL_ENV_NAMES.join(", ")}.`);
  if (!SUPABASE_URL) {
    fail(`${SUPABASE_URL_ENV.name} must be a Supabase API URL like https://<project-ref>.supabase.co. Loaded value is ${describeUrlValueForError(SUPABASE_URL_ENV.value)}.`);
  }
  if (!SERVICE_ROLE_KEY) fail(`One Supabase service-role variable is required: ${SERVICE_ROLE_KEY_ENV_NAMES.join(", ")}.`);
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.message || body?.error_description || body?.error || text || response.statusText;
    const error = new Error(message);
    error.status = response.status;
    error.code = body?.code || body?.error_code || "";
    throw error;
  }
  return body;
}

const REQUIRED_SCHEMA_TABLES = [
  "restaurants",
  "offers",
  "reservations",
  "profiles",
  "public_available_offers"
];

let schemaCache = null;

function openApiDefinitions(spec = {}) {
  return spec.definitions || spec.components?.schemas || {};
}

function findOpenApiTableDefinition(definitions, tableName) {
  return Object.entries(definitions).find(([key]) => key === tableName || key.endsWith(`.${tableName}`))?.[1] || null;
}

async function loadLiveSchema() {
  if (schemaCache) return schemaCache;
  const spec = await supabaseRequest("/rest/v1/", {
    headers: { Accept: "application/openapi+json" }
  });
  const definitions = openApiDefinitions(spec);
  const tables = {};
  for (const tableName of REQUIRED_SCHEMA_TABLES) {
    const definition = findOpenApiTableDefinition(definitions, tableName);
    const properties = definition?.properties || {};
    tables[tableName] = new Set(Object.keys(properties));
  }
  schemaCache = {
    source: "postgrest_openapi_schema_cache",
    tables
  };
  return schemaCache;
}

function tableColumns(schema, tableName) {
  return schema?.tables?.[tableName] || new Set();
}

function hasColumn(schema, tableName, columnName) {
  return tableColumns(schema, tableName).has(columnName);
}

function filterPayload(schema, tableName, payload) {
  const columns = tableColumns(schema, tableName);
  if (!columns.size) throw new Error(`Supabase schema cache did not expose table "${tableName}".`);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)));
}

function filterPayloads(schema, tableName, payloads) {
  return payloads.map((payload) => filterPayload(schema, tableName, payload));
}

function filterSelect(schema, tableName, desiredColumns) {
  const columns = tableColumns(schema, tableName);
  return desiredColumns.filter((columnName) => columns.has(columnName));
}

function selectParam(schema, tableName, desiredColumns) {
  const filtered = filterSelect(schema, tableName, desiredColumns);
  return filtered.length ? filtered.join(",") : "*";
}

function schemaSummary(schema) {
  return Object.fromEntries(
    Object.entries(schema.tables).map(([tableName, columns]) => [tableName, Array.from(columns).sort()])
  );
}

function nyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: String(parts.weekday || "").toLowerCase().slice(0, 3)
  };
}

function nextNyDateForWeekdays(weekdays, hour, minute = 0) {
  const allowed = new Set(weekdays);
  const now = new Date();
  for (let offset = 0; offset < 21; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 86400000);
    const parts = nyParts(candidate);
    if (!allowed.has(parts.weekday)) continue;
    if (offset === 0 && (parts.hour > hour || (parts.hour === hour && parts.minute >= minute))) continue;
    return parts.date;
  }
  return nyParts(new Date(now.getTime() + 86400000)).date;
}

function sameDayWindow() {
  const now = new Date();
  const parts = nyParts(now);
  if (parts.hour < 20 || (parts.hour === 20 && parts.minute <= 30)) {
    const startHour = Math.max(17, Math.min(20, parts.hour + 2));
    const start = `${String(startHour).padStart(2, "0")}:${parts.minute >= 30 ? "30" : "00"}`;
    const endHour = Math.min(22, startHour + 1);
    const end = `${String(endHour).padStart(2, "0")}:${parts.minute >= 30 ? "30" : "00"}`;
    return { date: parts.date, start, end };
  }
  return { date: nextNyDateForWeekdays(["mon", "tue", "wed", "thu", "fri", "sat", "sun"], 17), start: "17:00", end: "18:30" };
}

function addDaysIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function restaurantRecord(ownerUserId = null) {
  return {
    id: TEST_RESTAURANT_ID,
    slug: "smarttable-test-bistro",
    name: "SmartTable Test Bistro",
    legal_name: "SmartTable Test Bistro",
    owner_user_id: ownerUserId,
    contact_email: TEST_RESTAURANT_EMAIL,
    email: TEST_RESTAURANT_EMAIL,
    phone: "+1 212 555 0123",
    address: "123 Pilot Test Avenue, New York, NY 10001",
    district: "Manhattan",
    cuisine: "Modern American",
    cuisine_type: "Modern American",
    restaurant_type: "Test / Demo restaurant",
    website: "https://smarttablenyc.com",
    google_maps_url: "https://maps.google.com/?q=123+Pilot+Test+Avenue+New+York+NY+10001",
    latitude: 40.7505,
    longitude: -73.9934,
    opening_hours: "Mon-Thu 5:00 PM - 10:00 PM; Fri 5:00 PM - 11:00 PM; Sat 12:00 PM - 11:00 PM; Sun 12:00 PM - 9:00 PM",
    opening_hours_json: {
      mon: [["17:00", "22:00"]],
      tue: [["17:00", "22:00"]],
      wed: [["17:00", "22:00"]],
      thu: [["17:00", "22:00"]],
      fri: [["17:00", "23:00"]],
      sat: [["12:00", "23:00"]],
      sun: [["12:00", "21:00"]]
    },
    description: "A SmartTable demonstration restaurant created for testing the complete guest reservation journey. No real reservation is created outside the SmartTable test environment.",
    description_en: "A SmartTable demonstration restaurant created for testing the complete guest reservation journey. No real reservation is created outside the SmartTable test environment.",
    description_es: "Un restaurante de demostración de SmartTable creado para probar el proceso completo de reservas de huéspedes. No se crea ninguna reserva real fuera del entorno de prueba de SmartTable.",
    description_hu: "A SmartTable teljes vendégfoglalási folyamatának tesztelésére létrehozott bemutató étterem. A tesztkörnyezeten kívül nem jön létre valódi foglalás.",
    cover_image: "/assets/restaurant-hero.png",
    card_image: "/assets/restaurant-hero.png",
    icon_image: "/assets/restaurant-hero.png",
    logo_url: "/assets/restaurant-hero.png",
    hero_image_url: "/assets/restaurant-hero.png",
    price_range: "$$",
    dress_code: "Casual",
    outdoor_seating: true,
    parking_available: false,
    kids_friendly: true,
    pet_friendly: false,
    wheelchair_accessible: true,
    payment_methods: ["Visa", "Mastercard", "Amex"],
    chef_name: "SmartTable Test Kitchen",
    year_opened: 2026,
    capacity: 80,
    private_room_available: false,
    gallery_images: ["/assets/restaurant-hero.png"],
    billing_plan: "free",
    billing_status: "active",
    monthly_fee: 0,
    fee_per_booking: 0,
    status: "approved",
    visible_on_guest_site: true,
    is_test_restaurant: true,
    accepts_reservation_requests: true,
    reservation_provider: "internal_test",
    primary_timezone: "America/New_York",
    booking_interval_minutes: 30,
    minimum_advance_minutes: 30,
    maximum_booking_window_days: 30,
    min_party_size: 1,
    max_party_size: 8,
    auto_confirmation: false,
    partner_approval_required: true,
    sort_order: 3,
    ai_discount_enabled: false,
    min_discount_percent: 15,
    max_discount_percent: 30,
    target_margin_percent: 65,
    average_service_minutes: 75,
    rating: 4.9,
    views_count: 0,
    settings: { test_record: true, public_badge: "Test restaurant - no real reservation" }
  };
}

function offerRecords() {
  const lastMinute = sameDayWindow();
  const offers = [
    {
      id: TEST_OFFER_IDS[0],
      title_en: "Early Dinner Special",
      title_es: "Cena temprana especial",
      title_hu: "Korai vacsoraajánlat",
      description_en: "Twenty percent off an early dinner test table from Monday through Thursday.",
      description_es: "Veinte por ciento de descuento en una mesa de prueba para cena temprana de lunes a jueves.",
      description_hu: "Húsz százalék kedvezmény korai tesztvacsora-asztalra hétfőtől csütörtökig.",
      offer_date: nextNyDateForWeekdays(["mon", "tue", "wed", "thu"], 17),
      start_time: "17:00",
      end_time: "18:30",
      valid_days: ["mon", "tue", "wed", "thu"],
      discount_value: 20,
      available_tables: 10,
      min_party_size: 2,
      max_party_size: 6
    },
    {
      id: TEST_OFFER_IDS[1],
      title_en: "Weekend Lunch",
      title_es: "Almuerzo de fin de semana",
      title_hu: "Hétvégi ebéd",
      description_en: "Fifteen percent off a weekend lunch test reservation.",
      description_es: "Quince por ciento de descuento en una reserva de prueba para almuerzo de fin de semana.",
      description_hu: "Tizenöt százalék kedvezmény hétvégi tesztebéd-foglalásra.",
      offer_date: nextNyDateForWeekdays(["sat", "sun"], 12),
      start_time: "12:00",
      end_time: "15:00",
      valid_days: ["sat", "sun"],
      discount_value: 15,
      available_tables: 10,
      min_party_size: 1,
      max_party_size: 8
    },
    {
      id: TEST_OFFER_IDS[2],
      title_en: "Last-Minute Table",
      title_es: "Mesa de último minuto",
      title_hu: "Utolsó pillanatos asztal",
      description_en: "Thirty percent off a configurable same-day SmartTable test slot.",
      description_es: "Treinta por ciento de descuento en un turno de prueba configurable para el mismo día.",
      description_hu: "Harminc százalék kedvezmény konfigurálható, aznapi SmartTable tesztidősávra.",
      offer_date: lastMinute.date,
      start_time: lastMinute.start,
      end_time: lastMinute.end,
      valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      discount_value: 30,
      available_tables: 10,
      min_party_size: 1,
      max_party_size: 8
    }
  ];
  return offers.map((offer) => ({
    ...offer,
    restaurant_id: TEST_RESTAURANT_ID,
    discount_type: "percent",
    discount_percent: offer.discount_value,
    offer_time: offer.start_time,
    reserved_tables: 0,
    seat_count: offer.available_tables * offer.max_party_size,
    reserved_seats: 0,
    structured_conditions: {
      min_party_size: offer.min_party_size,
      max_party_size: offer.max_party_size,
      custom_terms: { test_record: "No real reservation is created outside the SmartTable test environment." }
    },
    offer_image: "/assets/restaurant-hero.png",
    is_test_offer: true,
    source: "internal_test_seed",
    status: "active"
  }));
}

function buildDemoOfferRecords() {
  const today = nyParts(new Date()).date;
  const slotTemplates = [
    { start_time: "11:30", end_time: "13:30", title: "Lunch Table", min_party_size: 2, max_party_size: 4 },
    { start_time: "12:30", end_time: "14:30", title: "Weekend Lunch", min_party_size: 2, max_party_size: 8 },
    { start_time: "17:30", end_time: "19:30", title: "Early Dinner Special", min_party_size: 2, max_party_size: 6 },
    { start_time: "19:00", end_time: "21:00", title: "Prime Dinner Offer", min_party_size: 2, max_party_size: 8 }
  ];
  const discounts = [10, 20, 30, 40, 50];
  return TEST_OFFER_IDS.map((id, index) => {
    const template = slotTemplates[index % slotTemplates.length];
    const discount = discounts[index % discounts.length];
    const availableTables = 10;
    const maxPartySize = template.max_party_size;
    return {
      id,
      restaurant_id: TEST_RESTAURANT_ID,
      title_en: `${template.title} ${discount}%`,
      title_es: `${template.title} ${discount}%`,
      title_hu: `${template.title} ${discount}%`,
      description_en: `Demo SmartTable offer for public reservation testing. ${discount}% off at SmartTable Test Bistro.`,
      description_es: `Oferta demo de SmartTable para probar reservas. ${discount}% de descuento en SmartTable Test Bistro.`,
      description_hu: `SmartTable demo ajanlat foglalasi teszthez. ${discount}% kedvezmeny a SmartTable Test Bistroban.`,
      offer_date: addDaysIsoDate(today, 1 + (index % 14)),
      offer_time: template.start_time,
      start_time: template.start_time,
      end_time: template.end_time,
      valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      discount_type: "percent",
      discount_value: discount,
      discount_percent: discount,
      available_tables: availableTables,
      reserved_tables: 0,
      seat_count: availableTables * maxPartySize,
      reserved_seats: 0,
      min_party_size: template.min_party_size,
      max_party_size: maxPartySize,
      structured_conditions: {
        min_party_size: template.min_party_size,
        max_party_size: maxPartySize,
        custom_terms: { test_record: "No real reservation is created outside the SmartTable test environment." }
      },
      offer_image: "/assets/restaurant-hero.png",
      is_test_offer: true,
      source: "smarttable_permanent_demo_dataset",
      status: "active"
    };
  });
}

async function backupAffectedRows(schema) {
  const reservationSelect = selectParam(schema, "reservations", [
    "id",
    "reference",
    "restaurant_id",
    "status",
    "is_test_reservation",
    "test_record",
    "created_at"
  ]);
  const [restaurants, offers, reservations] = await Promise.all([
    supabaseRequest(`/rest/v1/restaurants?select=*&id=eq.${TEST_RESTAURANT_ID}`).catch((error) => ({ error: error.message, code: error.code || error.status })),
    supabaseRequest(`/rest/v1/offers?select=*&restaurant_id=eq.${TEST_RESTAURANT_ID}`).catch((error) => ({ error: error.message, code: error.code || error.status })),
    supabaseRequest(`/rest/v1/reservations?select=${reservationSelect}&restaurant_id=eq.${TEST_RESTAURANT_ID}`).catch((error) => ({ error: error.message, code: error.code || error.status }))
  ]);
  const backup = {
    created_at: new Date().toISOString(),
    supabase_project: new URL(SUPABASE_URL).hostname,
    test_restaurant_id: TEST_RESTAURANT_ID,
    restaurants,
    offers,
    reservations
  };
  const dir = path.join(projectRoot, "backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `smarttable-test-bistro-before-${backup.created_at.replace(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify(backup, null, 2), "utf8");
  return file;
}

async function findAuthUserByEmail(email) {
  if (!email) return null;
  const page = await supabaseRequest("/auth/v1/admin/users?page=1&per_page=1000");
  const users = Array.isArray(page?.users) ? page.users : Array.isArray(page) ? page : [];
  return users.find((user) => String(user.email || "").toLowerCase() === email) || null;
}

async function ensurePartnerUser(schema) {
  if (!TEST_PARTNER_EMAIL) return null;
  let user = await findAuthUserByEmail(TEST_PARTNER_EMAIL);
  if (!user && !TEST_PARTNER_PASSWORD) {
    console.log("Partner account not created: SMARTTABLE_TEST_PARTNER_PASSWORD is not set.");
    return null;
  }
  if (!user) {
    user = await supabaseRequest("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: TEST_PARTNER_EMAIL,
        password: TEST_PARTNER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "SmartTable Test Partner" }
      })
    });
  }
  const userId = user?.id || user?.user?.id;
  if (!userId) throw new Error("Partner auth user was not returned by Supabase.");
  const profilePayload = filterPayload(schema, "profiles", {
    id: userId,
    email: TEST_PARTNER_EMAIL,
    full_name: "SmartTable Test Partner",
    role: "partner",
    restaurant_id: TEST_RESTAURANT_ID,
    preferred_language: "en"
  });
  await supabaseRequest("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(profilePayload)
  });
  return userId;
}

function isFutureOrTodayIsoDate(isoDate) {
  return String(isoDate || "") >= nyParts(new Date()).date;
}

async function verifySeed(schema) {
  const restaurantSelect = selectParam(schema, "restaurants", [
    "id",
    "name",
    "status",
    "district",
    "visible_on_guest_site",
    "accepts_reservation_requests",
    "primary_timezone"
  ]);
  const offerSelect = selectParam(schema, "offers", [
    "id",
    "restaurant_id",
    "title_en",
    "status",
    "offer_date",
    "offer_time",
    "start_time",
    "end_time",
    "available_tables",
    "reserved_tables",
    "seat_count",
    "reserved_seats",
    "discount_percent",
    "discount_value",
    "source"
  ]);
  const [restaurants, offers, publicAvailableRows] = await Promise.all([
    supabaseRequest(`/rest/v1/restaurants?select=${restaurantSelect}&id=eq.${TEST_RESTAURANT_ID}`),
    supabaseRequest(`/rest/v1/offers?select=${offerSelect}&restaurant_id=eq.${TEST_RESTAURANT_ID}&order=offer_date.asc`),
    supabaseRequest(`/rest/v1/public_available_offers?select=*&restaurant_id=eq.${TEST_RESTAURANT_ID}`).catch((error) => ({ error: error.message, code: error.code || error.status }))
  ]);

  let publicApi = {
    status: 0,
    test_offer_count: 0,
    error: ""
  };
  try {
    const response = await fetch(`${PUBLIC_API_BASE_URL}/api/public/offers?lang=en`, {
      headers: { Accept: "application/json" }
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    const apiOffers = Array.isArray(body?.offers) ? body.offers : [];
    const testOffers = apiOffers.filter((offer) => {
      const restaurantId = offer.restaurant_id || offer.restaurantId;
      const restaurantName = offer.restaurant_name || offer.restaurantName || offer.restaurant?.name || "";
      return restaurantId === TEST_RESTAURANT_ID || String(restaurantName).toLowerCase() === "smarttable test bistro";
    });
    publicApi = {
      status: response.status,
      test_offer_count: testOffers.length,
      mode: body?.mode || null
    };
  } catch (error) {
    publicApi.error = error.message;
  }

  const activeFutureOffers = Array.isArray(offers)
    ? offers.filter((offer) => offer.status === "active" && isFutureOrTodayIsoDate(offer.offer_date))
    : [];
  const publicAvailableCount = Array.isArray(publicAvailableRows) ? publicAvailableRows.length : 0;
  const checks = {
    restaurant_exists: Array.isArray(restaurants) && restaurants.length === 1,
    at_least_15_active_future_offers: activeFutureOffers.length >= 15,
    public_available_offers_has_test_offers: publicAvailableCount >= 15,
    public_api_returns_test_offers: publicApi.status === 200 && publicApi.test_offer_count >= 15
  };
  const verification = {
    checks,
    restaurant: Array.isArray(restaurants) ? restaurants[0] || null : restaurants,
    offer_count: Array.isArray(offers) ? offers.length : 0,
    active_future_offer_count: activeFutureOffers.length,
    public_available_offers_count: publicAvailableCount,
    public_available_offers_error: Array.isArray(publicAvailableRows) ? "" : publicAvailableRows?.error || "",
    public_api: publicApi,
    offer_date_range: {
      earliest: activeFutureOffers[0]?.offer_date || null,
      latest: activeFutureOffers.at(-1)?.offer_date || null
    }
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failedChecks.length) {
    const error = new Error(`Seed verification failed: ${failedChecks.join(", ")}`);
    error.verification = verification;
    throw error;
  }
  return verification;
}

async function seed() {
  const schema = DRY_RUN ? null : await loadLiveSchema();
  const partnerUserId = DRY_RUN ? null : await ensurePartnerUser(schema);
  const restaurant = DRY_RUN ? restaurantRecord(partnerUserId) : filterPayload(schema, "restaurants", restaurantRecord(partnerUserId));
  const offers = DRY_RUN ? buildDemoOfferRecords() : filterPayloads(schema, "offers", buildDemoOfferRecords());
  if (DRY_RUN) {
    console.log(JSON.stringify({
      mode: "dry-run",
      action: "seed",
      restaurant: { id: restaurant.id, slug: restaurant.slug, district: restaurant.district, address: restaurant.address, contact_email: maskEmail(restaurant.contact_email) },
      offers: offers.map((offer) => ({ id: offer.id, title: offer.title_en, offer_date: offer.offer_date, start_time: offer.start_time, available_tables: offer.available_tables })),
      partner_email_configured: Boolean(TEST_PARTNER_EMAIL),
      partner_password_configured: Boolean(TEST_PARTNER_PASSWORD)
    }, null, 2));
    return;
  }
  const backupFile = await backupAffectedRows(schema);
  await supabaseRequest("/rest/v1/restaurants?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(restaurant)
  });
  await supabaseRequest("/rest/v1/offers?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(offers)
  });
  const verification = await verifySeed(schema);
  console.log(JSON.stringify({
    mode: "applied",
    action: "seed",
    schema_source: schema.source,
    live_schema_columns: schemaSummary(schema),
    backup_file: backupFile,
    restaurant_id: TEST_RESTAURANT_ID,
    offers_seeded: offers.length,
    partner_assigned: Boolean(partnerUserId),
    test_restaurant_email: maskEmail(TEST_RESTAURANT_EMAIL),
    verification
  }, null, 2));
}

async function cleanup() {
  if (DRY_RUN) {
    console.log(JSON.stringify({ mode: "dry-run", action: "cleanup", restaurant_id: TEST_RESTAURANT_ID, offer_ids: TEST_OFFER_IDS }, null, 2));
    return;
  }
  const schema = await loadLiveSchema();
  const backupFile = await backupAffectedRows(schema);
  await supabaseRequest(`/rest/v1/reservations?restaurant_id=eq.${TEST_RESTAURANT_ID}`, { method: "DELETE" });
  await supabaseRequest(`/rest/v1/offers?restaurant_id=eq.${TEST_RESTAURANT_ID}&id=in.(${TEST_OFFER_IDS.join(",")})`, { method: "DELETE" });
  if (hasColumn(schema, "profiles", "restaurant_id")) {
    await supabaseRequest(`/rest/v1/profiles?restaurant_id=eq.${TEST_RESTAURANT_ID}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ restaurant_id: null })
    });
  }
  await supabaseRequest(`/rest/v1/restaurants?id=eq.${TEST_RESTAURANT_ID}&name=eq.SmartTable%20Test%20Bistro`, { method: "DELETE" });
  console.log(JSON.stringify({ mode: "applied", action: "cleanup", backup_file: backupFile, restaurant_id: TEST_RESTAURANT_ID }, null, 2));
}

if (DIAGNOSE_AUTH) {
  console.log(JSON.stringify(authDiagnosticPayload(), null, 2));
  process.exit(0);
}

assertConfigured();
if (CLEANUP) {
  await cleanup();
} else {
  await seed();
}
