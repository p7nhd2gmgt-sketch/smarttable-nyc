/**
 * @typedef {"active" | "inactive" | "draft"} MarketStatus
 *
 * @typedef {Object} MarketDefinition
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {string} country_code
 * @property {string} city_name
 * @property {string} currency_code
 * @property {string} timezone
 * @property {string} default_locale
 * @property {string[]} supported_locales
 * @property {MarketStatus} status
 * @property {Record<string, unknown>} configuration
 */

export const DEFAULT_MARKET_CODE = "nyc";
export const DEFAULT_MARKET_ID = "10000000-0000-4000-8000-000000000001";
export const BUDAPEST_MARKET_ID = "10000000-0000-4000-8000-000000000002";

export const MARKET_STATUSES = Object.freeze(["active", "inactive", "draft"]);
// Stripe treats HUF as a zero-decimal currency. This phase documents and
// centralizes that fact only; live subscription prices are intentionally unchanged.
export const ZERO_DECIMAL_CURRENCIES = Object.freeze(["BIF", "CLP", "DJF", "GNF", "HUF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

const MARKET_DEFINITIONS = [
  {
    id: DEFAULT_MARKET_ID,
    code: "nyc",
    name: "New York City",
    country_code: "US",
    city_name: "New York",
    currency_code: "USD",
    timezone: "America/New_York",
    default_locale: "en-US",
    supported_locales: ["en-US"],
    status: "active",
    configuration: {
      launch_stage: "public",
      default_neighborhood_label: "Neighborhood",
      stripe_zero_decimal_currency: false
    }
  },
  {
    id: BUDAPEST_MARKET_ID,
    code: "budapest",
    name: "Budapest",
    country_code: "HU",
    city_name: "Budapest",
    currency_code: "HUF",
    timezone: "Europe/Budapest",
    default_locale: "hu-HU",
    supported_locales: ["hu-HU", "en-US"],
    status: "draft",
    configuration: {
      launch_stage: "internal",
      default_neighborhood_label: "District",
      stripe_zero_decimal_currency: true
    }
  }
];

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function normalizeText(value = "") {
  return String(value ?? "").trim();
}

function normalizeCode(value = "") {
  return normalizeText(value).toLowerCase();
}

function normalizeUpper(value = "") {
  return normalizeText(value).toUpperCase();
}

function isValidUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value));
}

export function isValidCountryCode(value = "") {
  return /^[A-Z]{2}$/.test(normalizeUpper(value));
}

export function isValidCurrencyCode(value = "") {
  const currency = normalizeUpper(value);
  if (!/^[A-Z]{3}$/.test(currency)) return false;
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(1);
    return true;
  } catch {
    return false;
  }
}

export function isValidTimezone(value = "") {
  const timezone = normalizeText(value);
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isValidLocale(value = "") {
  const locale = normalizeText(value);
  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) return false;
  try {
    return Intl.getCanonicalLocales(locale)[0] === locale;
  } catch {
    return false;
  }
}

function cloneMarket(market) {
  return {
    ...market,
    supported_locales: [...market.supported_locales],
    configuration: { ...market.configuration }
  };
}

export function normalizeMarketCode(value = "") {
  const normalized = normalizeCode(value);
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized) ? normalized : DEFAULT_MARKET_CODE;
}

export function normalizeMarketStatus(value = "") {
  const normalized = normalizeCode(value);
  return MARKET_STATUSES.includes(normalized) ? normalized : "draft";
}

export function validateMarketDefinition(market = {}) {
  const issues = [];
  const supportedLocales = Array.isArray(market.supported_locales) ? market.supported_locales : [];
  if (!isValidUuid(market.id)) issues.push("INVALID_MARKET_ID");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalizeText(market.code))) issues.push("INVALID_MARKET_CODE");
  if (!normalizeText(market.name)) issues.push("MARKET_NAME_REQUIRED");
  if (!isValidCountryCode(market.country_code)) issues.push("INVALID_COUNTRY_CODE");
  if (!normalizeText(market.city_name)) issues.push("MARKET_CITY_REQUIRED");
  if (!isValidCurrencyCode(market.currency_code)) issues.push("INVALID_CURRENCY_CODE");
  if (!isValidTimezone(market.timezone)) issues.push("INVALID_TIMEZONE");
  if (!isValidLocale(market.default_locale)) issues.push("INVALID_DEFAULT_LOCALE");
  if (!supportedLocales.length || supportedLocales.some((locale) => !isValidLocale(locale))) {
    issues.push("INVALID_SUPPORTED_LOCALES");
  }
  if (supportedLocales.length && !supportedLocales.includes(market.default_locale)) {
    issues.push("DEFAULT_LOCALE_NOT_SUPPORTED");
  }
  if (!MARKET_STATUSES.includes(market.status)) issues.push("INVALID_MARKET_STATUS");
  if (!market.configuration || typeof market.configuration !== "object" || Array.isArray(market.configuration)) {
    issues.push("INVALID_MARKET_CONFIGURATION");
  }
  return {
    valid: issues.length === 0,
    issues
  };
}

export function assertMarketDefinition(market) {
  const result = validateMarketDefinition(market);
  if (!result.valid) {
    throw new Error(`Invalid SmartTable market ${market?.code || market?.id || "unknown"}: ${result.issues.join(", ")}`);
  }
  return market;
}

export const MARKETS = deepFreeze(
  Object.fromEntries(MARKET_DEFINITIONS.map((market) => [market.code, assertMarketDefinition(cloneMarket(market))]))
);

export const MARKET_LIST = deepFreeze(Object.values(MARKETS).map(cloneMarket));

const MARKETS_BY_ID = new Map(MARKET_LIST.map((market) => [market.id, market]));

export function defaultMarket() {
  return cloneMarket(MARKETS[DEFAULT_MARKET_CODE]);
}

export function getMarketByCode(code, options = {}) {
  const fallback = options.fallback !== false;
  const market = MARKETS[normalizeMarketCode(code)];
  return market ? cloneMarket(market) : (fallback ? defaultMarket() : null);
}

export function getMarketById(id, options = {}) {
  const fallback = options.fallback !== false;
  const market = MARKETS_BY_ID.get(normalizeText(id));
  return market ? cloneMarket(market) : (fallback ? defaultMarket() : null);
}

function marketFromEntity(entity = {}) {
  if (!entity || typeof entity !== "object") return null;
  if (entity.market_id) return getMarketById(entity.market_id, { fallback: false });
  if (entity.marketId) return getMarketById(entity.marketId, { fallback: false });
  if (entity.market?.id) return getMarketById(entity.market.id, { fallback: false });
  if (entity.market_code) return getMarketByCode(entity.market_code, { fallback: false });
  if (entity.marketCode) return getMarketByCode(entity.marketCode, { fallback: false });
  if (entity.market?.code) return getMarketByCode(entity.market.code, { fallback: false });
  return null;
}

function explicitMarketCodeFrom(input = {}) {
  if (input.marketCode || input.market_code || input.market) {
    return input.marketCode || input.market_code || input.market;
  }
  const query = input.query || input.searchParams;
  if (query && typeof query.get === "function") {
    return query.get("market") || query.get("market_code") || query.get("marketCode") || "";
  }
  if (query && typeof query === "object") {
    return query.market || query.market_code || query.marketCode || "";
  }
  return "";
}

function publicAllowed(market, options = {}) {
  return !options.publicOnly || market?.status === "active";
}

export function resolveMarketContext(input = {}) {
  const entityCandidates = [input.tenant, input.restaurant, input.venue].filter(Boolean);
  for (const entity of entityCandidates) {
    const market = marketFromEntity(entity);
    if (market && publicAllowed(market, input)) {
      return { market, source: "entity" };
    }
  }

  const explicitCode = explicitMarketCodeFrom(input);
  if (explicitCode) {
    const market = getMarketByCode(explicitCode, { fallback: false });
    if (market && publicAllowed(market, input)) {
      return { market, source: "explicit_code" };
    }
  }

  const existing = marketFromEntity(input.existingMarket || input.currentMarket || {});
  if (existing && publicAllowed(existing, input)) {
    return { market: existing, source: "existing_behavior" };
  }

  return { market: defaultMarket(), source: "nyc_fallback" };
}

export function currencyMinorUnitFactor(currencyCode = "") {
  return ZERO_DECIMAL_CURRENCIES.includes(normalizeUpper(currencyCode)) ? 1 : 100;
}

export function currencyMinorUnitFactorForMarket(market = defaultMarket()) {
  return currencyMinorUnitFactor(market.currency_code);
}

export function normalizeLocaleForMarket(locale = "", market = defaultMarket()) {
  const requested = normalizeText(locale);
  return market.supported_locales.includes(requested) ? requested : market.default_locale;
}

export function isLocaleSupportedForMarket(locale = "", market = defaultMarket()) {
  return market.supported_locales.includes(normalizeText(locale));
}

export function isCurrencySupportedForMarket(currencyCode = "", market = defaultMarket()) {
  return normalizeUpper(currencyCode) === normalizeUpper(market.currency_code);
}

export function formatCurrencyForMarket(amountMinorUnits, market = defaultMarket(), options = {}) {
  const resolvedMarket = market?.code ? market : defaultMarket();
  const currency = normalizeUpper(resolvedMarket.currency_code);
  const factor = currencyMinorUnitFactor(currency);
  const amount = Number.isFinite(Number(amountMinorUnits)) ? Math.trunc(Number(amountMinorUnits)) : 0;
  const locale = normalizeLocaleForMarket(options.locale || resolvedMarket.default_locale, resolvedMarket);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: factor === 1 ? 0 : undefined,
    maximumFractionDigits: factor === 1 ? 0 : undefined
  }).format(amount / factor);
}

export function dateTimePartsForMarket(dateValue, market = defaultMarket()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: market.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
}

export function formatDateTimeForMarket(dateValue, market = defaultMarket(), options = {}) {
  const locale = normalizeLocaleForMarket(options.locale || market.default_locale, market);
  return new Intl.DateTimeFormat(locale, {
    timeZone: market.timezone,
    dateStyle: options.dateStyle || "medium",
    timeStyle: options.timeStyle || "short"
  }).format(dateValue instanceof Date ? dateValue : new Date(dateValue));
}

export function formatDateForMarket(dateValue, market = defaultMarket(), options = {}) {
  const locale = normalizeLocaleForMarket(options.locale || market.default_locale, market);
  return new Intl.DateTimeFormat(locale, {
    timeZone: market.timezone,
    dateStyle: options.dateStyle || "medium"
  }).format(dateValue instanceof Date ? dateValue : new Date(dateValue));
}

export function formatTimeForMarket(dateValue, market = defaultMarket(), options = {}) {
  const locale = normalizeLocaleForMarket(options.locale || market.default_locale, market);
  return new Intl.DateTimeFormat(locale, {
    timeZone: market.timezone,
    timeStyle: options.timeStyle || "short"
  }).format(dateValue instanceof Date ? dateValue : new Date(dateValue));
}

export function publicMarketConfig(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  return MARKET_LIST
    .filter((market) => includeInactive || market.status === "active")
    .map((market) => ({
      id: market.id,
      code: market.code,
      name: market.name,
      country_code: market.country_code,
      city_name: market.city_name,
      currency_code: market.currency_code,
      timezone: market.timezone,
      default_locale: market.default_locale,
      supported_locales: [...market.supported_locales],
      status: market.status,
      configuration: { ...market.configuration }
    }));
}
