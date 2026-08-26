#!/usr/bin/env node
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import "../src/env-loader.js";
import { createEmailService, isEmailAccepted } from "../src/email-service.js";

const args = process.argv.slice(2);

function argValue(name) {
  const prefix = `${name}=`;
  const item = args.find((arg) => arg === name || arg.startsWith(prefix));
  if (!item || item === name) return "";
  return item.slice(prefix.length);
}

function clean(value = "") {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function parseEnvFile(source = "") {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = clean(line.slice(separator + 1));
  }
  return values;
}

function loadEnvFile(filename = "") {
  const file = clean(filename);
  if (!file || !existsSync(file)) return { loaded: false, file };
  const values = parseEnvFile(readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (/^\[?sensitive\]?$/i.test(value)) continue;
    process.env[key] = value;
  }
  return { loaded: true, file, key_count: Object.keys(values).length };
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function maskEmail(value = "") {
  const [local, domain] = String(value || "").split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}***@${domain}`;
}

function firstEnv(names = []) {
  for (const name of names) {
    const value = clean(process.env[name] || "");
    if (value) return { name, value };
  }
  return { name: "", value: "" };
}

function hash(value = "") {
  return crypto.createHash("sha256").update(clean(value)).digest("hex");
}

function normalizeLanguage(value = "") {
  const lang = lower(value).slice(0, 2);
  return ["en", "es", "hu"].includes(lang) ? lang : "en";
}

function template(value = "", context = {}) {
  return clean(value).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => clean(context[key]));
}

function htmlEscape(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function appEmailHtml(subject, body, cta = null) {
  const paragraphs = clean(body)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${htmlEscape(line)}</p>`)
    .join("");
  const button = cta?.url
    ? `<p><a href="${htmlEscape(cta.url)}" style="display:inline-block;margin-top:8px;padding:10px 14px;background:#0f735d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700">${htmlEscape(clean(cta.label || "Open SmartTable"))}</a></p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head><body style="margin:0;padding:0;background:#f4fbf8;color:#173d33"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f4fbf8"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:640px;background:#ffffff;border:1px solid #d8ebe4;border-radius:12px;color:#173d33"><tr><td style="padding:28px;font-family:Inter,Arial,sans-serif;line-height:1.55"><p aria-label="SmartTable logo" style="font-weight:900;letter-spacing:0;margin:0 0 18px;color:#0f735d;font-size:18px">SmartTable</p><h1 style="font-size:24px;line-height:1.25;margin:0 0 16px;font-weight:800">${htmlEscape(subject)}</h1><div style="font-size:15px">${paragraphs}${button}</div><p style="margin-top:28px;color:#68746f;font-size:12px;line-height:1.5">SmartTable sends transactional account and reservation emails only when needed to operate your account or reservation request.</p></td></tr></table></td></tr></table></body></html>`;
}

const loadedEnvFile = loadEnvFile(argValue("--env-file"));
const supabaseUrlEnv = firstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]);
const serviceKeyEnv = firstEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE", "SERVICE_ROLE_KEY"]);
const supabaseUrl = supabaseUrlEnv.value.replace(/\/+$/, "");
const serviceKey = serviceKeyEnv.value;
const resendApiKey = clean(process.env.RESEND_API_KEY || "");
const publicBaseUrl = clean(process.env.PUBLIC_BASE_URL || "https://smarttablenyc.com").replace(/\/+$/, "") || "https://smarttablenyc.com";
const rawEmailFrom = clean(process.env.EMAIL_FROM || "");
const emailFrom = rawEmailFrom && !/^\[?sensitive\]?$/i.test(rawEmailFrom)
  ? rawEmailFrom
  : "SmartTable <reservations@mail.smarttablenyc.com>";
const emailReplyTo = clean(process.env.EMAIL_REPLY_TO || "");
const reservationId = clean(argValue("--reservation-id"));

if (!supabaseUrl || !serviceKey || !resendApiKey) {
  console.log(JSON.stringify({
    error: "missing_required_environment",
    has_supabase_url: Boolean(supabaseUrl),
    has_service_key: Boolean(serviceKey),
    has_resend_api_key: Boolean(resendApiKey)
  }, null, 2));
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json"
};

async function req(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
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
    error.code = body?.code || body?.error_code || "";
    error.body = body;
    throw error;
  }
  return body;
}

let schemaPromise = null;
async function schema() {
  if (!schemaPromise) {
    schemaPromise = req("/rest/v1/", { headers: { Accept: "application/openapi+json" } }).catch(() => null);
  }
  return schemaPromise;
}

function definitions(spec = {}) {
  return spec.definitions || spec.components?.schemas || {};
}

async function tableColumns(tableName) {
  const spec = await schema();
  const definition = Object.entries(definitions(spec || {}))
    .find(([key]) => key === tableName || key.endsWith(`.${tableName}`))?.[1] || null;
  return new Set(Object.keys(definition?.properties || {}));
}

async function filterPayload(tableName, payload = {}) {
  const columns = await tableColumns(tableName);
  if (!columns.size) return payload;
  return Object.fromEntries(Object.entries(payload).filter(([key]) => columns.has(key)));
}

async function contentRows() {
  return await req("/rest/v1/site_content?select=key,value_en,value_es,value_hu&order=key.asc").catch(() => []);
}

function contentValue(rows, key, fallback, lang) {
  const row = rows.find((item) => item.key === key);
  if (!row) return fallback;
  return clean(row[`value_${lang}`] || row.value_en || fallback);
}

function reservationSummary(row, lang = "en") {
  const date = row.reservation_date || row.offer_date;
  const time = row.reservation_time || row.offer_time || row.start_time;
  const discount = row.discount_percent || row.discount_value || "";
  if (lang === "hu") return `${row.restaurant_name}, ${date} ${time}, ${row.party_size} vendeg, ${discount}% kedvezmeny`;
  if (lang === "es") return `${row.restaurant_name}, ${date} a las ${time}, ${row.party_size} personas, ${discount}% de descuento`;
  return `${row.restaurant_name}, ${date} at ${time}, ${row.party_size} guests, ${discount}% off`;
}

function emailContext(row) {
  return {
    restaurant_name: row.restaurant_name,
    offer_title: row.offer_title || row.title_en || "SmartTable offer",
    discount: row.discount_percent || row.discount_value || "",
    discount_percent: row.discount_percent || row.discount_value || "",
    reservation_date: row.reservation_date || row.offer_date,
    reservation_time: row.reservation_time || row.offer_time || row.start_time,
    party_size: row.party_size,
    reference: row.reference,
    guest_name: row.guest_name,
    guest_email: row.guest_email,
    guest_phone: row.guest_phone,
    notes: row.notes || "",
    dashboard_url: `${publicBaseUrl}/partner/reservations`,
    my_reservations_url: `${publicBaseUrl}/account/reservations`
  };
}

async function reservationRow() {
  const idFilter = reservationId ? `reservation_id=eq.${encodeURIComponent(reservationId)}&` : "";
  const overviewRows = await req(`/rest/v1/reservation_overview?select=*&${idFilter}order=created_at.desc&limit=1`).catch(() => []);
  if (overviewRows?.[0]) return overviewRows[0];
  const reservationRows = await req(`/rest/v1/reservations?select=*&${reservationId ? `id=eq.${encodeURIComponent(reservationId)}&` : ""}order=created_at.desc&limit=1`);
  const reservation = reservationRows?.[0];
  if (!reservation) return null;
  const restaurantRows = await req(`/rest/v1/restaurants?select=*&id=eq.${encodeURIComponent(reservation.restaurant_id)}&limit=1`);
  const offerRows = await req(`/rest/v1/offers?select=*&id=eq.${encodeURIComponent(reservation.offer_id)}&limit=1`);
  const restaurant = restaurantRows?.[0] || {};
  const offer = offerRows?.[0] || {};
  return {
    ...reservation,
    reservation_id: reservation.id,
    restaurant_name: restaurant.name,
    restaurant_email: restaurant.reservation_notification_email || restaurant.email || restaurant.contact_email,
    offer_title: offer.title_en,
    discount_percent: offer.discount_percent || offer.discount_value,
    offer_date: offer.offer_date,
    offer_time: offer.offer_time || offer.start_time,
    start_time: offer.start_time
  };
}

function queuePayload(message = {}) {
  return {
    to: lower(message.to),
    from: clean(message.from || emailFrom),
    subject: clean(message.subject),
    reply_to: clean(message.reply_to || emailReplyTo),
    redacted: false,
    text: clean(message.text),
    html: clean(message.html)
  };
}

async function writeQueue(message, context) {
  const now = new Date().toISOString();
  const existingRows = await req(`/rest/v1/email_queue?select=*&idempotency_key=eq.${encodeURIComponent(context.idempotency_key)}&limit=1`).catch(() => []);
  const existing = existingRows?.[0] || null;
  if (existing?.id) {
    const patch = {
      status: "queued",
      attempt_count: Number(existing.attempt_count || 0),
      next_attempt_at: now,
      failed_at: null,
      last_error_code: null,
      last_error_message: null,
      payload: queuePayload(message),
      updated_at: now
    };
    await req(`/rest/v1/email_queue?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: await filterPayload("email_queue", patch)
    });
    return { ...existing, ...patch };
  }
  const row = {
    id: crypto.randomUUID(),
    email_log_id: null,
    email_type: context.email_type,
    event_type: context.event_type,
    recipient_email: lower(message.to),
    recipient_user_id: context.recipient_user_id || null,
    restaurant_id: context.restaurant_id,
    reservation_id: context.reservation_id,
    provider: "resend",
    provider_message_id: null,
    status: "queued",
    attempt_count: 0,
    max_attempts: 3,
    locale: context.locale,
    template_version: context.template_version,
    idempotency_key: context.idempotency_key,
    payload: queuePayload(message),
    next_attempt_at: now,
    last_attempt_at: null,
    sent_at: null,
    failed_at: null,
    last_error_code: null,
    last_error_message: null,
    created_at: now,
    updated_at: now
  };
  const rows = await req("/rest/v1/email_queue?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: await filterPayload("email_queue", row)
  });
  return rows?.[0] || row;
}

async function writeLog(result, context, existing = null) {
  const now = new Date().toISOString();
  const status = isEmailAccepted(result) ? "sent" : "failed";
  const row = {
    id: existing?.id || crypto.randomUUID(),
    reservation_id: context.reservation_id,
    restaurant_id: context.restaurant_id,
    recipient_user_id: context.recipient_user_id || null,
    email_type: context.email_type,
    event_type: context.event_type,
    recipient: lower(result.to),
    recipient_email: lower(result.to),
    subject: result.subject,
    provider: result.provider || "resend",
    provider_id: result.messageId || result.provider_id || null,
    provider_message_id: result.messageId || result.provider_id || null,
    delivery_status: status,
    status,
    attempt_count: (Number(existing?.attempt_count || 0) + 1),
    last_error_code: result.errorCode || null,
    last_error_message: result.errorMessage || null,
    error_message: result.errorMessage || null,
    sent_at: isEmailAccepted(result) ? (existing?.sent_at || now) : existing?.sent_at || null,
    failed_at: isEmailAccepted(result) ? existing?.failed_at || null : now,
    locale: context.locale,
    template_version: context.template_version,
    idempotency_key: context.idempotency_key,
    metadata: {
      accepted: Boolean(result.accepted),
      status: result.status,
      error_code: result.errorCode || null,
      error_message: result.errorMessage || null,
      provider_response: result.providerResponse || null
    },
    created_at: existing?.created_at || now,
    updated_at: now
  };
  const payload = await filterPayload("email_logs", row);
  if (existing?.id) {
    await req(`/rest/v1/email_logs?id=eq.${encodeURIComponent(existing.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: payload
    });
    return row;
  }
  await req("/rest/v1/email_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: payload
  });
  return row;
}

async function patchQueue(queue, log, result) {
  const now = new Date().toISOString();
  const status = isEmailAccepted(result) ? "sent" : "failed";
  await req(`/rest/v1/email_queue?id=eq.${encodeURIComponent(queue.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: await filterPayload("email_queue", {
      email_log_id: log.id,
      provider_message_id: result.messageId || result.provider_id || null,
      status,
      attempt_count: 1,
      last_attempt_at: now,
      next_attempt_at: null,
      sent_at: isEmailAccepted(result) ? now : null,
      failed_at: isEmailAccepted(result) ? null : now,
      last_error_code: result.errorCode || null,
      last_error_message: result.errorMessage || null,
      payload: { ...queue.payload, text: "", html: "", redacted: true, redaction_reason: isEmailAccepted(result) ? "redacted_after_provider_acceptance" : "redacted_after_terminal_failure" }
    })
  });
}

async function sendOne(message, context) {
  const existingLogs = await req(`/rest/v1/email_logs?select=*&idempotency_key=eq.${encodeURIComponent(context.idempotency_key)}&limit=1`).catch(() => []);
  const existing = existingLogs?.[0] || null;
  if (existing && ["queued", "sent", "delivered"].includes(lower(existing.status || existing.delivery_status))) {
    return {
      event_type: context.event_type,
      recipient: maskEmail(message.to),
      duplicate_suppressed: true,
      status: existing.status || existing.delivery_status,
      provider_message_id: existing.provider_message_id || existing.provider_id || null,
      email_log_id: existing.id,
      email_queue_id: null,
      provider_response: {}
    };
  }
  const queue = await writeQueue(message, context);
  const service = createEmailService({
    provider: "resend",
    resendApiKey,
    defaultFrom: emailFrom,
    defaultReplyTo: emailReplyTo,
    environment: "production",
    fetchImpl: fetch
  });
  const result = await service.sendEmail({ ...message, from: emailFrom, reply_to: emailReplyTo });
  const log = await writeLog(result, context, existing);
  await patchQueue(queue, log, result);
  return {
    event_type: context.event_type,
    recipient: maskEmail(message.to),
    accepted: isEmailAccepted(result),
    status: result.status,
    errorCode: result.errorCode || null,
    errorMessage: result.errorMessage || null,
    provider_response: result.providerResponse || {},
    provider_message_id: result.messageId || result.provider_id || null,
    email_log_id: log.id,
    email_queue_id: queue.id
  };
}

const row = await reservationRow();
if (!row?.reservation_id) {
  console.log(JSON.stringify({ error: "reservation_not_found", reservation_id: reservationId || null }, null, 2));
  process.exit(1);
}

const rows = await contentRows();
const lang = normalizeLanguage(row.guest_language || "en");
const context = {
  ...emailContext(row),
  reservation_summary: reservationSummary(row, lang)
};
const restaurantLang = "en";
const restaurantContext = {
  ...emailContext(row),
  reservation_summary: reservationSummary(row, restaurantLang)
};

const guestSubject = template(contentValue(rows, "email_guest_received_subject", "Your Smart Table reservation request was received", lang), context);
const guestBase = template(contentValue(rows, "email_guest_received_body", "Hi {{guest_name}}, we received your reservation request for {{reservation_summary}}. Reference: {{reference}}.", lang), context);
const guestNotice = template(contentValue(rows, "email_guest_pending_notice", "Status: pending. This is a reservation request, not a confirmed reservation yet. The restaurant must accept it before it is confirmed.", lang), context);
const guestBody = [guestBase, guestNotice].filter(Boolean).join("\n\n");
const partnerSubject = template(contentValue(rows, "email_restaurant_new_subject", "New reservation request from Smart Table", restaurantLang), restaurantContext);
const partnerBody = template(contentValue(rows, "email_restaurant_new_body", "New pending reservation request for {{restaurant_name}}. Reference: {{reference}}. Offer: {{offer_title}}. Date/time: {{reservation_date}} {{reservation_time}}. Party size: {{party_size}}. Guest: {{guest_name}}, {{guest_email}}, {{guest_phone}}. Notes: {{notes}}.", restaurantLang), restaurantContext);
const guestCta = contentValue(rows, "email_cta_my_reservations", "View My Reservations", lang);
const partnerCta = contentValue(rows, "email_cta_open_dashboard", "Open dashboard", restaurantLang);

const messages = [
  {
    message: {
      to: row.guest_email,
      subject: guestSubject,
      text: `${guestBody}\n\n${context.my_reservations_url}`,
      html: appEmailHtml(guestSubject, guestBody, { label: guestCta, url: context.my_reservations_url })
    },
    context: {
      reservation_id: row.reservation_id,
      restaurant_id: row.restaurant_id,
      event_type: "guest_request_received",
      email_type: "guest_request_received",
      locale: lang,
      template_version: clean(process.env.EMAIL_TEMPLATE_VERSION || "2026-07-19"),
      idempotency_key: hash(`reservation-request-guest:${row.reservation_id}`)
    }
  },
  {
    message: {
      to: row.restaurant_email,
      subject: partnerSubject,
      text: `${partnerBody}\n\nDashboard: ${context.dashboard_url}`,
      html: appEmailHtml(partnerSubject, partnerBody, { label: partnerCta, url: context.dashboard_url })
    },
    context: {
      reservation_id: row.reservation_id,
      restaurant_id: row.restaurant_id,
      event_type: "restaurant_request_notice",
      email_type: "restaurant_request_notice",
      locale: restaurantLang,
      template_version: clean(process.env.EMAIL_TEMPLATE_VERSION || "2026-07-19"),
      idempotency_key: hash(`reservation-request-partner:${row.reservation_id}`)
    }
  }
];

const results = [];
for (const item of messages) {
  results.push(await sendOne(item.message, item.context));
}

const latest = await req(`/rest/v1/reservations?select=id,reference,status,booking_status&id=eq.${encodeURIComponent(row.reservation_id)}&limit=1`);
console.log(JSON.stringify({
  reservation: latest?.[0] || null,
  env_file_loaded: loadedEnvFile.loaded,
  email_from: emailFrom,
  reply_to: maskEmail(emailReplyTo),
  results
}, null, 2));
