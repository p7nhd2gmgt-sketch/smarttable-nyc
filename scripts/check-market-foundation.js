import { readFile } from "node:fs/promises";
import {
  BUDAPEST_MARKET_ID,
  DEFAULT_MARKET_CODE,
  DEFAULT_MARKET_ID,
  MARKET_LIST,
  currencyMinorUnitFactorForMarket,
  dateTimePartsForMarket,
  formatCurrencyForMarket,
  getMarketByCode,
  getMarketById,
  isCurrencySupportedForMarket,
  isLocaleSupportedForMarket,
  isValidCountryCode,
  isValidCurrencyCode,
  isValidLocale,
  isValidTimezone,
  normalizeLocaleForMarket,
  publicMarketConfig,
  resolveMarketContext,
  validateMarketDefinition
} from "../src/market-config.js";
import { handleApiRequest } from "../src/app-core.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(source, token, message) {
  assert(source.includes(token), message || `Expected token missing: ${token}`);
}

const migration = await read("supabase/migrations/0050_multi_market_foundation.sql");
const packageJson = JSON.parse(await read("package.json"));

assert(!/\bdelete\s+from\b/i.test(migration), "Market migration must not delete data.");
assert(!/\btruncate\b/i.test(migration), "Market migration must not truncate data.");
assert(!/\bdrop\s+(table|schema|database|policy|function|trigger|column)\b/i.test(migration), "Market migration must not drop schema objects.");
assert(!/alter\s+table\s+[^;]+drop\b/i.test(migration), "Market migration must not alter tables by dropping objects.");
assert(!/(restaurants_public_approved|offers_public_active|reservations_guest_read|reservations_restaurant_update)/i.test(migration), "Market migration must not replace existing restaurant, offer, or reservation tenant policies.");

for (const token of [
  "create table if not exists public.markets",
  "create extension if not exists pgcrypto",
  "add column if not exists market_id uuid",
  "alter table public.markets enable row level security",
  "restaurants_market_id_fkey",
  "idx_markets_code_unique",
  "idx_restaurants_market_status_visible",
  "markets_read_active_or_admin",
  "public.public_markets"
]) {
  assertIncludes(migration, token, `Market migration is missing ${token}.`);
}

for (const token of [
  "'10000000-0000-4000-8000-000000000001'",
  "'nyc'",
  "'New York City'",
  "'US'",
  "'USD'",
  "'America/New_York'",
  "array['en-US']",
  "'active'",
  "'10000000-0000-4000-8000-000000000002'",
  "'budapest'",
  "'Budapest'",
  "'HU'",
  "'HUF'",
  "'Europe/Budapest'",
  "array['hu-HU','en-US']",
  "'draft'"
]) {
  assertIncludes(migration, token, `Market seed is missing ${token}.`);
}

assertIncludes(migration, "where market_id is null", "Legacy restaurants must be backfilled to NYC only when market_id is missing.");
assertIncludes(migration, "alter column market_id set default '10000000-0000-4000-8000-000000000001'", "New restaurants must keep the legacy NYC default.");
assertIncludes(migration, "alter column market_id set not null", "Restaurant market relationship must be enforced after backfill.");

assert(DEFAULT_MARKET_CODE === "nyc", "Default market code must remain NYC.");
assert(DEFAULT_MARKET_ID === "10000000-0000-4000-8000-000000000001", "Default market ID must match the NYC seed.");
assert(BUDAPEST_MARKET_ID === "10000000-0000-4000-8000-000000000002", "Budapest market ID must match the database seed.");

for (const market of MARKET_LIST) {
  const result = validateMarketDefinition(market);
  assert(result.valid, `${market.code} market definition failed validation: ${result.issues.join(", ")}`);
}

const nyc = getMarketByCode("nyc", { fallback: false });
const budapest = getMarketByCode("budapest", { fallback: false });
const codes = new Set(MARKET_LIST.map((market) => market.code));
assert(codes.size === MARKET_LIST.length, "Market codes must be unique.");
assert(nyc?.status === "active", "NYC must remain active.");
assert(nyc?.currency_code === "USD", "NYC must keep USD.");
assert(nyc?.timezone === "America/New_York", "NYC must keep America/New_York timezone.");
assert(budapest?.status === "draft", "Budapest must not be public by default.");
assert(budapest?.currency_code === "HUF", "Budapest must use HUF.");
assert(budapest?.timezone === "Europe/Budapest", "Budapest must use Europe/Budapest timezone.");
assert(getMarketByCode("unknown").code === "nyc", "Unknown market codes must safely fall back to NYC.");
assert(getMarketById("not-a-market").id === DEFAULT_MARKET_ID, "Unknown market IDs must safely fall back to NYC.");
assert(isValidCountryCode(nyc.country_code), "NYC country code must be valid ISO alpha-2.");
assert(isValidCountryCode(budapest.country_code), "Budapest country code must be valid ISO alpha-2.");
assert(isValidCurrencyCode(nyc.currency_code), "NYC currency code must be valid ISO 4217.");
assert(isValidCurrencyCode(budapest.currency_code), "Budapest currency code must be valid ISO 4217.");
assert(isValidTimezone(nyc.timezone), "NYC timezone must be a valid IANA timezone.");
assert(isValidTimezone(budapest.timezone), "Budapest timezone must be a valid IANA timezone.");
assert(isValidLocale(nyc.default_locale), "NYC default locale must be valid.");
assert(isValidLocale(budapest.default_locale), "Budapest default locale must be valid.");
assert(isLocaleSupportedForMarket("en-US", nyc), "NYC must support en-US.");
assert(!isLocaleSupportedForMarket("hu-HU", nyc), "NYC launch market must not claim Hungarian locale support yet.");
assert(isLocaleSupportedForMarket("hu-HU", budapest), "Budapest must support hu-HU.");
assert(normalizeLocaleForMarket("es-ES", budapest) === "hu-HU", "Unsupported locale must fall back to the market default.");
assert(isCurrencySupportedForMarket("USD", nyc), "NYC must support USD.");
assert(!isCurrencySupportedForMarket("HUF", nyc), "NYC must not be treated as an HUF market.");
assert(isCurrencySupportedForMarket("HUF", budapest), "Budapest must support HUF.");

const entityResolution = resolveMarketContext({
  restaurant: { market_id: DEFAULT_MARKET_ID },
  marketCode: "budapest"
});
assert(entityResolution.source === "entity" && entityResolution.market.code === "nyc", "Entity market must win over an explicit market query.");
const tenantResolution = resolveMarketContext({ tenant: { market_id: BUDAPEST_MARKET_ID } });
assert(tenantResolution.source === "entity" && tenantResolution.market.code === "budapest", "Tenant market resolution must use the tenant market.");
const venueResolution = resolveMarketContext({ venue: { market_code: "budapest" } });
assert(venueResolution.source === "entity" && venueResolution.market.code === "budapest", "Venue market resolution must use the venue market.");
const explicitResolution = resolveMarketContext({ marketCode: "budapest" });
assert(explicitResolution.source === "explicit_code" && explicitResolution.market.code === "budapest", "Valid explicit market code must resolve when the route allows it.");
const publicDraftResolution = resolveMarketContext({ marketCode: "budapest", publicOnly: true });
assert(publicDraftResolution.market.code === "nyc", "Draft Budapest must not resolve on public-only routes.");
const currentBehaviorResolution = resolveMarketContext({ currentMarket: { market_code: "budapest" } });
assert(currentBehaviorResolution.source === "existing_behavior" && currentBehaviorResolution.market.code === "budapest", "Current market context must be honored before fallback.");
const unsafeHeaderResolution = resolveMarketContext({ headers: { "x-smarttable-market": "budapest" } });
assert(unsafeHeaderResolution.market.code === "nyc", "Arbitrary user-controlled headers must not resolve markets.");

const publicMarkets = publicMarketConfig();
assert(publicMarkets.some((market) => market.code === "nyc"), "Public market config must include active NYC.");
assert(!publicMarkets.some((market) => market.code === "budapest"), "Public market config must exclude draft Budapest.");
assert(publicMarketConfig({ includeInactive: true }).some((market) => market.code === "budapest"), "Internal market config must expose Budapest for future rollout.");
assert(currencyMinorUnitFactorForMarket(nyc) === 100, "USD formatting must use cent-based minor units.");
assert(currencyMinorUnitFactorForMarket(budapest) === 1, "HUF must be documented as a zero-decimal currency.");
assert(formatCurrencyForMarket(12345, nyc, { locale: "en-US" }) === "$123.45", "USD minor-unit formatting must remain stable.");
const hufFormatted = formatCurrencyForMarket(1234, budapest);
assert(/(?:Ft|HUF)/.test(hufFormatted), "HUF currency formatting must use the Hungarian currency marker.");
assert(!/[,.]00\b/.test(hufFormatted), "HUF formatting must not display artificial decimal cents.");
assert(dateTimePartsForMarket("2026-07-01T12:00:00Z", nyc).hour === "08", "New York summer EDT conversion must be deterministic.");
assert(dateTimePartsForMarket("2026-01-01T12:00:00Z", nyc).hour === "07", "New York winter EST conversion must be deterministic.");
assert(dateTimePartsForMarket("2026-07-01T12:00:00Z", budapest).hour === "14", "Budapest summer CEST conversion must be deterministic.");
assert(dateTimePartsForMarket("2026-01-01T12:00:00Z", budapest).hour === "13", "Budapest winter CET conversion must be deterministic.");

const response = await handleApiRequest({
  method: "GET",
  url: "/api/public/config",
  body: {},
  headers: {}
});
assert(response.status === 200, `/api/public/config returned ${response.status}.`);
assert(response.body?.default_market_code === "nyc", "Public config must keep NYC as the default market.");
assert(response.body?.default_market?.id === DEFAULT_MARKET_ID, "Public config must expose the NYC default market.");
assert(response.body?.resolved_market_code === "nyc", "Public config must resolve to NYC by default.");
assert(response.body?.market_resolution_source === "nyc_fallback", "Public config without market input must use the legacy NYC fallback.");
assert(response.body?.active_markets?.some((market) => market.code === "nyc"), "Public config must include active NYC market.");
assert(!response.body?.active_markets?.some((market) => market.code === "budapest"), "Public config must not expose draft Budapest as an active market.");

const publicBudapestResponse = await handleApiRequest({
  method: "GET",
  url: "/api/public/config?market=budapest",
  body: {},
  headers: {}
});
assert(publicBudapestResponse.status === 200, `/api/public/config?market=budapest returned ${publicBudapestResponse.status}.`);
assert(publicBudapestResponse.body?.resolved_market_code === "nyc", "Draft Budapest must not become the resolved public market.");
assert(publicBudapestResponse.body?.market_resolution_source === "nyc_fallback", "Public draft market requests must fall back without changing legacy behavior.");

assert(packageJson.scripts.check.includes("src/market-config.js"), "Syntax check must include src/market-config.js.");
assert(packageJson.scripts.test.includes("check:market-foundation"), "Test suite must include market foundation checks.");

console.log("Multi-market foundation checks passed.");
