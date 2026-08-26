#!/usr/bin/env node
import "../src/env-loader.js";

function clean(value = "") {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function firstEnv(names = []) {
  for (const name of names) {
    const value = clean(process.env[name] || "");
    if (value) return { name, value };
  }
  return { name: "", value: "" };
}

function maskEmail(value = "") {
  const [local, domain] = String(value || "").split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}***@${domain}`;
}

const supabaseUrl = firstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]).value.replace(/\/+$/, "");
const serviceKey = firstEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE", "SERVICE_ROLE_KEY"]).value;
const publicBaseUrl = "https://smarttablenyc.com";

if (!supabaseUrl || !serviceKey) {
  console.log(JSON.stringify({ error: "missing_supabase_env" }, null, 2));
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json"
};

async function req(pathname) {
  const response = await fetch(`${supabaseUrl}${pathname}`, { headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.message || text || response.statusText);
  return body;
}

const latestRows = await req("/rest/v1/reservations?select=*&restaurant_id=eq.10000000-0000-4000-8000-000000000123&order=created_at.desc&limit=1");
const latest = latestRows?.[0];
const offersResponse = await fetch(`${publicBaseUrl}/api/public/offers?lang=en`);
const offersBody = await offersResponse.json();
const offers = Array.isArray(offersBody?.offers) ? offersBody.offers : [];
const offer = offers.find((item) => (
  (item.restaurant_id || item.restaurantId) === "10000000-0000-4000-8000-000000000123"
  && (item.offer_id || item.id) !== latest?.offer_id
));

if (!latest?.guest_email || !offer) {
  console.log(JSON.stringify({
    error: "missing_test_inputs",
    has_latest_guest_email: Boolean(latest?.guest_email),
    has_offer: Boolean(offer)
  }, null, 2));
  process.exit(1);
}

const offerId = offer.offer_id || offer.id;
const body = {
  offer_id: offerId,
  party_size: Math.min(Math.max(Number(offer.min_party_size || 2), 2), Number(offer.max_party_size || 4)),
  reservation_date: offer.offer_date,
  reservation_time: offer.start_time || offer.offer_time,
  guest_name: "SmartTable Email QA",
  guest_email: latest.guest_email,
  guest_phone: latest.guest_phone || "+1 212 555 0199",
  guest_language: latest.guest_language || "en",
  notes: "Production email pipeline verification for SmartTable Test Bistro."
};

const response = await fetch(`${publicBaseUrl}/api/reservations`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});
const text = await response.text();
const payload = text ? JSON.parse(text) : {};

console.log(JSON.stringify({
  status: response.status,
  reservation: payload.reservation ? {
    reservation_id: payload.reservation.reservation_id,
    reference: payload.reservation.reference,
    status: payload.reservation.status,
    booking_status: payload.reservation.booking_status,
    guest_email: maskEmail(payload.reservation.guest_email)
  } : null,
  email_delivery: payload.email_delivery || null,
  emails: Array.isArray(payload.emails)
    ? payload.emails.map((item) => ({
      event_type: item.event_type,
      recipient: maskEmail(item.to),
      accepted: item.accepted,
      status: item.status,
      errorCode: item.errorCode || null,
      errorMessage: item.errorMessage || null,
      provider_message_id: item.messageId || item.provider_id || null,
      provider_response: item.providerResponse || {}
    }))
    : null,
  error: payload.error || null
}, null, 2));
