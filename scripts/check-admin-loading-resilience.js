#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { requestJson, SmartTableApiError } from "../public/api-client.js";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const apiClient = await readFile(new URL("../public/api-client.js", import.meta.url), "utf8");
const appCore = await readFile(new URL("../src/app-core.js", import.meta.url), "utf8");

for (const required of [
  "DEFAULT_REQUEST_TIMEOUT_MS = 15_000",
  "REQUEST_TIMEOUT",
  "controller.abort()",
  "SmartTable took too long to respond"
]) {
  assert(apiClient.includes(required), `API timeout protection is missing ${required}.`);
}

for (const required of [
  "ADMIN_DATA_REQUEST_TIMEOUT_MS = 12_000",
  "async function adminDataWithFallback",
  "state.adminLoadWarnings = []",
  "adminLoadWarningPanel()",
  'id="retryAdminData"',
  'adminDataApi("stats", "/admin/stats"',
  'adminDataWithFallback("restaurants"',
  'adminDataApi("notifications", "/admin/notifications"'
]) {
  assert(app.includes(required), `Admin partial-load protection is missing ${required}.`);
}

assert(appCore.includes("const bookingOptionCountByRestaurant = new Map()"), "Booking-option analytics must aggregate one paginated event stream.");
assert(appCore.includes("const analyticsPageSize = 1000"), "Booking-option analytics must use bounded pages.");
assert(!appCore.includes('event_type=eq.restaurant_booking_options_viewed&restaurant_id=eq.${encodeURIComponent(restaurant.id)}'), "Booking-option analytics must not issue an N+1 count request.");

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    const rejectAbort = () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (options.signal?.aborted) rejectAbort();
    else options.signal?.addEventListener("abort", rejectAbort, { once: true });
  });
  const startedAt = Date.now();
  await assert.rejects(
    requestJson("/intentionally-slow", { timeoutMs: 20 }),
    (error) => error instanceof SmartTableApiError
      && error.status === 504
      && error.payload?.code === "REQUEST_TIMEOUT"
  );
  assert(Date.now() - startedAt < 1000, "Timed-out requests must reject promptly.");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Admin loading resilience checks passed.");
