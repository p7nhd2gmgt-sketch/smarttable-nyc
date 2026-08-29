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

const supabaseUrlEnv = firstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]);
const serviceKeyEnv = firstEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE", "SERVICE_ROLE_KEY"]);
const supabaseUrl = supabaseUrlEnv.value.replace(/\/+$/, "");
const serviceKey = serviceKeyEnv.value;

if (!supabaseUrl || !serviceKey) {
  console.log(JSON.stringify({
    error: "missing_supabase_env",
    has_supabase_url: Boolean(supabaseUrl),
    has_service_key: Boolean(serviceKey),
    supabase_url_variable: supabaseUrlEnv.name || null,
    service_key_variable: serviceKeyEnv.name || null
  }, null, 2));
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
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || text || response.statusText);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function safeLog(row = {}) {
  return {
    id: row.id,
    email_type: row.email_type,
    event_type: row.event_type,
    recipient: maskEmail(row.recipient_email || row.recipient),
    status: row.status || row.delivery_status,
    provider: row.provider,
    provider_message_id: row.provider_message_id || row.provider_id || null,
    attempt_count: row.attempt_count,
    last_error_code: row.last_error_code,
    last_error_message: row.last_error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
    idempotency_key_present: Boolean(row.idempotency_key)
  };
}

function safeQueue(row = {}) {
  return {
    id: row.id,
    email_type: row.email_type,
    event_type: row.event_type,
    recipient: maskEmail(row.recipient_email),
    status: row.status,
    provider: row.provider,
    provider_message_id: row.provider_message_id || null,
    attempt_count: row.attempt_count,
    max_attempts: row.max_attempts,
    last_error_code: row.last_error_code,
    last_error_message: row.last_error_message,
    next_attempt_at: row.next_attempt_at,
    sent_at: row.sent_at,
    failed_at: row.failed_at,
    created_at: row.created_at,
    idempotency_key_present: Boolean(row.idempotency_key),
    payload_redacted: Boolean(row.payload?.redacted)
  };
}

const reservations = await req("/rest/v1/reservations?select=*&order=created_at.desc&limit=5");
const latest = reservations?.[0] || null;
const reservationId = latest?.id || "";
const logs = reservationId
  ? await req(`/rest/v1/email_logs?select=*&reservation_id=eq.${encodeURIComponent(reservationId)}&order=created_at.desc`)
  : [];
const queue = reservationId
  ? await req(`/rest/v1/email_queue?select=*&reservation_id=eq.${encodeURIComponent(reservationId)}&order=created_at.desc`)
  : [];
const restaurantRows = latest?.restaurant_id
  ? await req(`/rest/v1/restaurants?select=*&id=eq.${encodeURIComponent(latest.restaurant_id)}&limit=1`)
  : [];
const restaurant = restaurantRows?.[0] || null;

console.log(JSON.stringify({
  supabase_url_host: new URL(supabaseUrl).hostname,
  supabase_url_variable: supabaseUrlEnv.name,
  service_key_variable: serviceKeyEnv.name,
  email_configuration: {
    email_from: clean(process.env.EMAIL_FROM || ""),
    email_reply_to: maskEmail(clean(process.env.EMAIL_REPLY_TO || "")),
    admin_notification_email: maskEmail(clean(process.env.ADMIN_NOTIFICATION_EMAIL || "")),
    smarttable_test_restaurant_email: maskEmail(clean(process.env.SMARTTABLE_TEST_RESTAURANT_EMAIL || "")),
    resend_api_key_present: Boolean(clean(process.env.RESEND_API_KEY || ""))
  },
  latest_reservation: latest ? {
    id: latest.id,
    reference: latest.reference,
    status: latest.status,
    booking_status: latest.booking_status,
    restaurant_id: latest.restaurant_id,
    offer_id: latest.offer_id,
    guest_email: maskEmail(latest.guest_email),
    guest_language: latest.guest_language,
    created_at: latest.created_at
  } : null,
  restaurant: restaurant ? {
    id: restaurant.id,
    name: restaurant.name,
    status: restaurant.status,
    email: maskEmail(restaurant.email),
    contact_email: maskEmail(restaurant.contact_email),
    reservation_notification_email: maskEmail(
      restaurant.reservation_notification_email || restaurant.reservation_email || restaurant.email || restaurant.contact_email
    )
  } : null,
  email_logs: logs.map(safeLog),
  email_queue: queue.map(safeQueue)
}, null, 2));
