import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [migration, appCore, publicApp] = await Promise.all([
  readFile(new URL("supabase/migrations/0072_server_only_reservation_creation.sql", root), "utf8"),
  readFile(new URL("src/app-core.js", root), "utf8"),
  readFile(new URL("public/app.js", root), "utf8")
]);

assert.match(migration, /p_guest_id uuid/i, "The server-only reservation RPC must accept a verified guest id.");
assert.doesNotMatch(migration, /\bdrop\s+function\b/i, "The forward-only repair must not destructively remove the existing RPC overload.");
assert.match(migration, /\n\s*p_guest_id,\s*\n\s*trim\(p_guest_name\)/i, "The verified guest id must be stored on the reservation.");
assert.match(
  migration,
  /revoke all privileges on function public\.create_reservation[\s\S]*from public, anon, authenticated/i,
  "Direct browser roles must not execute the reservation RPC."
);
assert.match(
  migration,
  /grant execute on function public\.create_reservation[\s\S]*to service_role/i,
  "The SmartTable server must retain reservation RPC access."
);
assert.match(appCore, /\/rest\/v1\/rpc\/create_reservation[\s\S]{0,180}service: true/, "Reservation creation must use the server credential.");
assert.match(appCore, /p_guest_id: guestProfile\?\.id \|\| null/, "Authenticated reservations must retain the verified guest account link.");
assert(publicApp.includes('RESERVATION_SERVICE_UNAVAILABLE: "reservation_error_generic"'), "Infrastructure failures must use the generic localized reservation message.");

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
for (const key of Object.keys(process.env)) {
  if (key.startsWith("SUPABASE_") || key.startsWith("RESEND_") || key.startsWith("EMAIL_")) delete process.env[key];
}

process.env.SMARTTABLE_ENV = "test";
process.env.PUBLIC_BASE_URL = "https://www.smarttablenyc.com";
process.env.SUPABASE_URL = "https://reservation-rpc-test.supabase.co";
process.env.SUPABASE_ANON_KEY = "eyJ.anon.reservation_rpc_test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJ.service.reservation_rpc_test";
process.env.IMPERSONATION_SECRET = "reservation-rpc-test-only-secret-at-least-32";

const guestId = "10000000-0000-4000-8000-000000000901";
const offerId = "10000000-0000-4000-8000-000000000902";
const restaurantId = "10000000-0000-4000-8000-000000000903";
const userToken = "eyJ.verified_guest.reservation_rpc_test";
let rpcMode = "permission";
const rpcRequests = [];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.endsWith("/auth/v1/user")) {
    assert.equal(options.headers?.authorization, `Bearer ${userToken}`, "Only the presented guest session may be resolved.");
    return jsonResponse({ id: guestId, email: "rpc-guest@example.test", email_confirmed_at: new Date().toISOString() });
  }
  if (target.includes("/rest/v1/profiles?")) {
    return jsonResponse([{ id: guestId, email: "rpc-guest@example.test", full_name: "RPC Guest", role: "guest", status: "active" }]);
  }
  if (target.includes("/rest/v1/offers?select=*,restaurants")) {
    return jsonResponse([{
      id: offerId,
      restaurant_id: restaurantId,
      status: "active",
      offer_date: "2099-09-07",
      offer_time: "18:00:00",
      start_time: "18:00:00",
      end_time: "21:15:00",
      valid_days: [],
      available_tables: 4,
      reserved_tables: 0,
      seat_count: 16,
      reserved_seats: 0,
      min_party_size: 1,
      max_party_size: 4,
      discount_percent: 25,
      restaurants: {
        id: restaurantId,
        name: "RPC Test Restaurant",
        email: "restaurant@example.test",
        status: "approved",
        visible_on_guest_site: true,
        accepts_reservation_requests: true,
        primary_timezone: "America/New_York"
      }
    }]);
  }
  if (target.includes("/rest/v1/reservations?select=id,offer_id")) return jsonResponse([]);
  if (target.endsWith("/rest/v1/rpc/create_reservation")) {
    const request = {
      headers: options.headers || {},
      body: JSON.parse(options.body || "{}")
    };
    rpcRequests.push(request);
    assert.equal(request.headers.apikey, process.env.SUPABASE_SERVICE_ROLE_KEY, "The RPC must use the service-role API key.");
    assert.equal(request.headers.authorization, `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "The RPC must execute as the server role.");
    return rpcMode === "permission"
      ? jsonResponse({ code: "42501", message: "permission denied for function create_reservation" }, 403)
      : jsonResponse({ code: "P0001", message: "OFFER_SOLD_OUT" }, 400);
  }
  throw new Error(`Unexpected mock request: ${target}`);
};

try {
  const core = await import(`../src/app-core.js?reservation-rpc-security=${Date.now()}-${Math.random()}`);
  const body = {
    offer_id: offerId,
    restaurant_id: restaurantId,
    reservation_type: "discount_offer",
    reservation_date: "2099-09-07",
    reservation_time: "18:00",
    party_size: 2,
    guest_name: "RPC Guest",
    guest_email: "rpc-guest@example.test",
    guest_phone: "+12125550123"
  };
  const authenticated = await core.handleApiRequest({
    method: "POST",
    url: "/api/reservations",
    body,
    headers: { authorization: `Bearer ${userToken}`, "x-forwarded-for": "198.51.100.72" }
  });
  assert.equal(authenticated.status, 503, "RPC permission failures must be classified as a service failure, not offer unavailability.");
  assert.equal(authenticated.body?.code, "RESERVATION_SERVICE_UNAVAILABLE");
  assert.equal(rpcRequests[0]?.body?.p_guest_id, guestId, "The verified guest id must be forwarded to the server-only RPC.");

  rpcMode = "sold_out";
  const anonymous = await core.handleApiRequest({
    method: "POST",
    url: "/api/reservations",
    body: { ...body, guest_email: "anonymous-rpc-guest@example.test" },
    headers: { "x-forwarded-for": "198.51.100.73" }
  });
  assert.equal(anonymous.status, 409, "Known offer availability failures must retain their normal conflict response.");
  assert.equal(anonymous.body?.code, "OFFER_SOLD_OUT");
  assert.equal(rpcRequests[1]?.body?.p_guest_id, null, "Anonymous reservations must not receive a forged guest id.");
} finally {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

console.log("Server-only reservation RPC regression checks passed.");
