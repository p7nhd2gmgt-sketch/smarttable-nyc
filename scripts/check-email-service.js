import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { createEmailService, isEmailAccepted } from "../src/email-service.js";

const baseMessage = {
  to: "guest@example.com",
  from: "SmartTable <reservations@mail.smarttablenyc.com>",
  subject: "Reservation request received",
  text: "Your reservation request was received."
};

const unconfigured = createEmailService({
  resendApiKey: "",
  defaultFrom: "SmartTable <reservations@mail.smarttablenyc.com>"
});
const unconfiguredResult = await unconfigured.sendEmail(baseMessage);
assert.equal(unconfiguredResult.accepted, false);
assert.equal(unconfiguredResult.status, "failed");
assert.equal(unconfiguredResult.errorCode, "EMAIL_PROVIDER_NOT_CONFIGURED");
assert.equal(isEmailAccepted(unconfiguredResult), false);

const accepted = createEmailService({
  resendApiKey: "test-key",
  defaultFrom: "SmartTable <reservations@mail.smarttablenyc.com>",
  defaultReplyTo: "support@smarttablenyc.com",
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    json: async () => ({ id: "resend-message-123" })
  })
});
const acceptedResult = await accepted.sendEmail(baseMessage);
assert.equal(acceptedResult.accepted, true);
assert.equal(acceptedResult.status, "sent");
assert.equal(acceptedResult.messageId, "resend-message-123");
assert.equal(isEmailAccepted(acceptedResult), true);

let capturedBody = null;
const acceptedWithReplyTo = createEmailService({
  resendApiKey: "test-key",
  defaultFrom: "SmartTable <reservations@mail.smarttablenyc.com>",
  defaultReplyTo: "support@smarttablenyc.com",
  fetchImpl: async (_url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: "resend-message-reply-to" })
    };
  }
});
await acceptedWithReplyTo.sendEmail(baseMessage);
assert.equal(capturedBody.reply_to, "support@smarttablenyc.com");

const rejected = createEmailService({
  resendApiKey: "test-key",
  defaultFrom: "SmartTable <reservations@mail.smarttablenyc.com>",
  fetchImpl: async () => ({
    ok: false,
    status: 403,
    json: async () => ({ message: "Domain is not verified." })
  })
});
const rejectedResult = await rejected.sendEmail(baseMessage);
assert.equal(rejectedResult.accepted, false);
assert.equal(rejectedResult.status, "failed");
assert.equal(rejectedResult.errorCode, "RESEND_403");
assert.match(rejectedResult.errorMessage, /Domain is not verified/);

const invalidResult = await accepted.sendEmail({ ...baseMessage, to: "not-an-email" });
assert.equal(invalidResult.accepted, false);
assert.equal(invalidResult.errorCode, "INVALID_RECIPIENT");

process.env.RESEND_API_KEY = "";
process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";
const { handleApiRequest } = await import(`../src/app-core.js?email-idempotency=${Date.now()}`);

async function rawApi(method, path, body = {}, headers = {}) {
  const response = await handleApiRequest({
    method,
    url: `/api${path}`,
    headers,
    body
  });
  return response;
}

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function uniqueEmail(prefix = "email-check") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function validSignupPayload(overrides = {}) {
  return {
    first_name: "Email",
    last_name: "Tester",
    email: uniqueEmail(),
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    phone: "+1 212 555 0133",
    city: "New York",
    region: "NY",
    postal_code: "10014",
    preferred_neighborhoods: ["West Village", "SoHo"],
    travel_distance_miles: "5",
    transportation_method: "Walking",
    transportation_methods: ["Walking", "Public transportation"],
    cuisines: ["American", "Italian"],
    food_categories: ["Steak", "Pasta"],
    dietary_needs: ["No restrictions"],
    allergy_notes: "",
    drink_preferences: ["Wine", "Coffee"],
    dining_experiences: ["Casual dining", "Quiet atmosphere"],
    companions: ["Partner"],
    party_size: "2",
    preferred_days: ["Friday", "Saturday"],
    preferred_time_windows: ["Early dinner", "Dinner"],
    booking_lead_time: "1-2 days",
    dining_duration: "60-90 minutes",
    discovery_preference: "A balance of both",
    selection_priorities: ["Food quality", "Discount", "Location"],
    new_restaurant_recommendations: "Yes",
    new_menu_item_recommendations: "No",
    excluded_categories: ["No exclusions"],
    spending_range: "$35-$50",
    discount_levels: ["10%", "20%"],
    consider_no_discount_match: "Sometimes",
    notification_preferences: ["Reservation status updates", "Reservation reminders"],
    notification_channels: ["Email"],
    notification_frequency: "Immediately",
    event_recommendations_interest: "No",
    future_calendar_interest: "No",
    transactional_email_consent: true,
    sms_consent: false,
    marketing_consent: false,
    allergy_acknowledgement: false,
    privacy_consent: true,
    terms_consent: true,
    preferred_language: "en",
    ...overrides
  };
}

function signedWebhookBody(payload, secret = process.env.RESEND_WEBHOOK_SECRET) {
  const raw = JSON.stringify(payload);
  return {
    body: { ...payload, __rawBody: raw },
    headers: { "x-smarttable-signature": crypto.createHmac("sha256", secret).update(raw).digest("hex") }
  };
}

const partnerSession = await api("POST", "/auth/login", {
  email: "owner@hudsonhearth.com",
  password: "restaurant123"
});
const partnerHeaders = { authorization: `Bearer ${partnerSession.access_token}` };
const publicOffers = await api("GET", "/public/offers");
const offer = publicOffers.offers?.find((item) => item.offer_id);
assert(offer, "Expected a demo offer for email idempotency test.");

const reservation = await api("POST", "/reservations", {
  offer_id: offer.offer_id,
  reservation_date: offer.reservation_date || offer.offer_date,
  reservation_time: offer.start_time || offer.offer_time,
  party_size: 2,
  guest_name: "Email Idempotency Guest",
  guest_email: `email-idempotency-${Date.now()}@example.com`,
  guest_phone: "+1 212 555 0180",
  guest_language: "en",
  notes: "Email idempotency test."
});
const reservationId = reservation.reservation.reservation_id;
const firstAccept = await api("PATCH", "/partner/reservations", {
  id: reservationId,
  status: "accepted"
}, partnerHeaders);
const secondAccept = await api("PATCH", "/partner/reservations", {
  id: reservationId,
  status: "accepted"
}, partnerHeaders);
const firstEmail = firstAccept.reservation.emails?.[0];
const secondEmail = secondAccept.reservation.emails?.[0];
assert.equal(firstEmail?.errorCode, "EMAIL_PROVIDER_NOT_CONFIGURED");
assert.equal(secondAccept.reservation.status_unchanged, true, "Repeated acceptance must not trigger another email send.");
assert.equal(secondAccept.reservation.email_delivery?.accepted_count, 0);
assert.equal(secondEmail, undefined);

const postVisitAttempt = await rawApi("PATCH", "/partner/reservations", {
  id: "30000000-0000-4000-8000-000000001042",
  action: "send_post_visit_email"
}, partnerHeaders);
assert.equal(postVisitAttempt.status, 409);
assert.equal(postVisitAttempt.body.code, "POST_VISIT_FEEDBACK_ALREADY_SUBMITTED");

const adminSession = await api("POST", "/auth/login", {
  email: "admin@smarttable.com",
  password: "admin123"
});
const diagnostics = await api("GET", "/admin/email-diagnostics", {}, {
  authorization: `Bearer ${adminSession.access_token}`
});
assert.equal(diagnostics.configuration.provider, "resend");
assert.equal(diagnostics.configuration.can_send_real_email, false);
assert(Array.isArray(diagnostics.recent_logs));
assert(Array.isArray(diagnostics.recent_queue));
assert(Number(diagnostics.summary.queued_count) >= 0);
assert(diagnostics.recent_logs.every((row) => !String(row.recipient_email || "").includes("email-idempotency-")), "Diagnostics must mask recipient email addresses.");

const queueDiagnostics = await api("GET", "/admin/email-queue", {}, {
  authorization: `Bearer ${adminSession.access_token}`
});
assert(Array.isArray(queueDiagnostics.queue));
assert(queueDiagnostics.queue.every((row) => !String(row.payload?.text || "").includes("Email Idempotency Guest")), "Queue diagnostics must not expose email body text.");

const webhookPayload = {
  id: "evt_email_delivered_test",
  type: "email.delivered",
  data: { id: "resend-message-does-not-exist" }
};
const rawWebhookPayload = JSON.stringify(webhookPayload);
const signature = crypto.createHmac("sha256", process.env.RESEND_WEBHOOK_SECRET).update(rawWebhookPayload).digest("hex");
const webhook = await rawApi("POST", "/webhooks/resend", {
  ...webhookPayload,
  __rawBody: rawWebhookPayload
}, {
  "x-smarttable-signature": signature
});
assert.equal(webhook.status, 200);
assert.equal(webhook.body.mapped_status, "delivered");
assert.equal(webhook.body.reason, "EMAIL_LOG_NOT_FOUND");

const complaintPayload = {
  id: "evt_email_complained_test",
  type: "email.complained",
  data: { id: "resend-message-does-not-exist" }
};
const rawComplaintPayload = JSON.stringify(complaintPayload);
const complaintSignature = crypto.createHmac("sha256", process.env.RESEND_WEBHOOK_SECRET).update(rawComplaintPayload).digest("hex");
const complaintWebhook = await rawApi("POST", "/webhooks/resend", {
  ...complaintPayload,
  __rawBody: rawComplaintPayload
}, {
  "x-smarttable-signature": complaintSignature
});
assert.equal(complaintWebhook.status, 200);
assert.equal(complaintWebhook.body.mapped_status, "complained");

const invalidWebhook = await rawApi("POST", "/webhooks/resend", webhookPayload, {
  "x-smarttable-signature": "invalid"
});
assert.equal(invalidWebhook.status, 401);

async function runConfiguredProviderChecks() {
  const originalFetch = globalThis.fetch;
  let providerMode = "success";
  let providerCounter = 0;
  const sentMessages = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("api.resend.com")) {
      providerCounter += 1;
      sentMessages.push(JSON.parse(options.body || "{}"));
      if (providerMode === "outage") throw new Error("Mock Resend outage");
      if (providerMode === "temporary") {
        return {
          ok: false,
          status: 503,
          json: async () => ({ message: "Temporary provider outage." })
        };
      }
      if (providerMode === "permanent") {
        return {
          ok: false,
          status: 422,
          json: async () => ({ message: "Permanent provider rejection." })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: `resend-mock-${providerCounter}` })
      };
    }
    return originalFetch(url, options);
  };

  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "SmartTable <reservations@mail.smarttablenyc.com>";
  process.env.EMAIL_REPLY_TO = "reply@example.com";
  process.env.EMAIL_RECIPIENT_ALLOWLIST = "reply@example.com,*@example.com,*@smarttable.com,*@hudsonhearth.example,*@casaluna.example,*@smarttable.local";
  process.env.RESEND_WEBHOOK_SECRET = "configured-provider-secret";
  const configured = await import(`../src/app-core.js?email-configured=${Date.now()}`);

  async function rawApiConfigured(method, path, body = {}, headers = {}) {
    return await configured.handleApiRequest({
      method,
      url: `/api${path}`,
      headers,
      body
    });
  }

  async function apiConfigured(method, path, body = {}, headers = {}) {
    const response = await rawApiConfigured(method, path, body, headers);
    if (response.status >= 400) {
      throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.error || "unknown error"}`);
    }
    return response.body;
  }

  async function signedWebhookConfigured(type, messageId, eventId) {
    const signed = signedWebhookBody({
      id: eventId,
      type,
      data: { id: messageId }
    }, process.env.RESEND_WEBHOOK_SECRET);
    return await rawApiConfigured("POST", "/webhooks/resend", signed.body, signed.headers);
  }

  try {
    const admin = await apiConfigured("POST", "/auth/login", { email: "admin@smarttable.com", password: "admin123" });
    const adminHeaders = { authorization: `Bearer ${admin.access_token}` };
    const diagnostics = await apiConfigured("GET", "/admin/email-diagnostics", {}, adminHeaders);
    assert.equal(diagnostics.configuration.can_send_real_email, true);
    assert.equal(diagnostics.configuration.sender.email, "reservations@mail.smarttablenyc.com");
    assert.equal(diagnostics.configuration.reply_to.email, "reply@example.com");
    assert.equal(diagnostics.configuration.webhook.configured, true);
    assert.equal(diagnostics.configuration.webhook.production_endpoint, "https://smarttablenyc.com/api/webhooks/resend");
    assert(diagnostics.configuration.webhook.required_events.includes("email.delivered"));

    const diagnosticSend = await apiConfigured("POST", "/admin/email-queue", { action: "send_test" }, adminHeaders);
    assert.equal(diagnosticSend.accepted, true, "Diagnostic queue send must be accepted by the mocked provider.");
    assert.equal(diagnosticSend.provider_response.id, diagnosticSend.message_id);
    assert(diagnosticSend.email_queue_id, "Provider-accepted messages must have a queue record.");
    assert(sentMessages.at(-1).from === "SmartTable <reservations@mail.smarttablenyc.com>", "Configured sender must be used.");

    const delivered = await signedWebhookConfigured("email.delivered", diagnosticSend.message_id, "evt_mock_delivered");
    assert.equal(delivered.status, 200);
    assert.equal(delivered.body.mapped_status, "delivered");
    const repeatedDelivered = await signedWebhookConfigured("email.delivered", diagnosticSend.message_id, "evt_mock_delivered");
    assert.equal(repeatedDelivered.status, 200);
    assert.equal(repeatedDelivered.body.reason, "WEBHOOK_EVENT_ALREADY_PROCESSED");
    const deliveredDiagnostics = await apiConfigured("GET", "/admin/email-diagnostics", {}, adminHeaders);
    const deliveredLog = deliveredDiagnostics.recent_logs.find((row) => row.provider_message_id === diagnosticSend.message_id);
    const deliveredQueue = deliveredDiagnostics.recent_queue.find((row) => row.provider_message_id === diagnosticSend.message_id);
    assert.equal(deliveredLog?.status, "delivered", "Delivered webhook must update email logs.");
    assert.equal(deliveredQueue?.status, "delivered", "Delivered webhook must update email queue.");
    assert(deliveredLog?.masked_recipient && !deliveredLog.masked_recipient.includes("reply@example.com"), "Diagnostics must mask recipients.");
    assert(deliveredLog?.log_id, "Diagnostics must expose a safe log id.");
    assert(deliveredQueue?.queue_id, "Diagnostics must expose a safe queue id.");
    assert(deliveredQueue?.template, "Diagnostics must expose the email template/type.");
    assert(deliveredQueue?.language, "Diagnostics must expose the locale/language.");

    const filteredDiagnostics = await apiConfigured("GET", "/admin/email-diagnostics?email_type=diagnostic_test_email&status=delivered&recipient_type=user", {}, adminHeaders);
    assert(filteredDiagnostics.recent_logs.some((row) => row.provider_message_id === diagnosticSend.message_id), "Diagnostics must filter logs by type/status/recipient type.");
    assert(filteredDiagnostics.recent_queue.some((row) => row.provider_message_id === diagnosticSend.message_id), "Diagnostics must filter queue by type/status/recipient type.");
    const filteredQueue = await apiConfigured("GET", "/admin/email-queue?email_type=diagnostic_test_email&status=delivered&recipient_type=user", {}, adminHeaders);
    assert(filteredQueue.queue.some((row) => row.provider_message_id === diagnosticSend.message_id), "Email queue endpoint must support the same diagnostics filters.");

    const bouncedSend = await apiConfigured("POST", "/admin/email-queue", { action: "send_test", email_type: "bounced_test" }, adminHeaders);
    const bounced = await signedWebhookConfigured("email.bounced", bouncedSend.message_id, "evt_mock_bounced");
    assert.equal(bounced.body.mapped_status, "bounced");

    const failedSend = await apiConfigured("POST", "/admin/email-queue", { action: "send_test", email_type: "failed_test" }, adminHeaders);
    const failedWebhook = await signedWebhookConfigured("email.failed", failedSend.message_id, "evt_mock_failed");
    assert.equal(failedWebhook.body.mapped_status, "failed");

    const complainedSend = await apiConfigured("POST", "/admin/email-queue", { action: "send_test", email_type: "complained_test" }, adminHeaders);
    const complained = await signedWebhookConfigured("email.complained", complainedSend.message_id, "evt_mock_complained");
    assert.equal(complained.body.mapped_status, "complained");

    providerMode = "temporary";
    const temporary = await rawApiConfigured("POST", "/admin/email-queue", { action: "send_test", email_type: "temporary_retry_test" }, adminHeaders);
    assert.equal(temporary.status, 502);
    assert.equal(temporary.body.errorCode, "RESEND_503");
    const queuedAfterTemporary = await apiConfigured("GET", "/admin/email-queue", {}, adminHeaders);
    const temporaryQueue = queuedAfterTemporary.queue.find((row) => row.id === temporary.body.email_queue_id);
    assert.equal(temporaryQueue?.status, "queued");
    assert.equal(temporaryQueue?.retry_allowed, true);

    providerMode = "success";
    const retrySuccess = await apiConfigured("POST", "/admin/email-queue", { action: "retry", id: temporary.body.email_queue_id }, adminHeaders);
    assert.equal(retrySuccess.processed[0].accepted, true, "Manual retry must process a retryable queued email.");

    providerMode = "temporary";
    const maxRetry = await rawApiConfigured("POST", "/admin/email-queue", { action: "send_test", email_type: "max_retry_test" }, adminHeaders);
    await rawApiConfigured("POST", "/admin/email-queue", { action: "retry", id: maxRetry.body.email_queue_id }, adminHeaders);
    await rawApiConfigured("POST", "/admin/email-queue", { action: "retry", id: maxRetry.body.email_queue_id }, adminHeaders);
    const afterMaxRetry = await apiConfigured("GET", "/admin/email-queue", {}, adminHeaders);
    const maxRetryQueue = afterMaxRetry.queue.find((row) => row.id === maxRetry.body.email_queue_id);
    assert.equal(maxRetryQueue?.status, "failed");
    assert(Number(maxRetryQueue?.attempt_count || 0) >= 3, "Maximum retry limit must be recorded.");
    assert.equal(maxRetryQueue?.retry_allowed, false);

    providerMode = "success";
    const missingRecipient = await rawApiConfigured("POST", "/admin/email-queue", { action: "send_test", to: "not-an-email" }, adminHeaders);
    assert.equal(missingRecipient.status, 502);
    assert.equal(missingRecipient.body.errorCode, "INVALID_RECIPIENT");

    const partner = await apiConfigured("POST", "/auth/login", { email: "owner@hudsonhearth.com", password: "restaurant123" });
    const partnerHeaders = { authorization: `Bearer ${partner.access_token}` };
    const offers = await apiConfigured("GET", "/public/offers");
    const configuredOffer = offers.offers?.find((item) => item.offer_id);
    assert(configuredOffer, "Configured provider checks need a public offer.");

    const missingGuestEmail = await rawApiConfigured("POST", "/reservations", {
      offer_id: configuredOffer.offer_id,
      reservation_date: configuredOffer.reservation_date || configuredOffer.offer_date,
      reservation_time: configuredOffer.start_time || configuredOffer.offer_time,
      party_size: 2,
      guest_name: "Missing Email Guest",
      guest_phone: "+1 212 555 0189",
      guest_language: "en"
    });
    assert.equal(missingGuestEmail.status, 400, "Reservation requests without a guest email must fail validation before email queueing.");

    const originalPartnerProfile = await apiConfigured("GET", "/partner/profile", {}, partnerHeaders);
    await apiConfigured("PATCH", "/partner/profile", { email: "" }, partnerHeaders);
    const missingRestaurantEmailReservation = await apiConfigured("POST", "/reservations", {
      offer_id: configuredOffer.offer_id,
      reservation_date: configuredOffer.reservation_date || configuredOffer.offer_date,
      reservation_time: configuredOffer.start_time || configuredOffer.offer_time,
      party_size: 2,
      guest_name: "Missing Restaurant Email Guest",
      guest_email: uniqueEmail("missing-restaurant-email"),
      guest_phone: "+1 212 555 0190",
      guest_language: "en"
    });
    assert(missingRestaurantEmailReservation.email_delivery?.failed_count >= 1, "Missing restaurant notification email must be recorded as a failed configuration state.");
    assert(missingRestaurantEmailReservation.email_delivery.errors.some((item) => item.errorCode === "MISSING_RESTAURANT_NOTIFICATION_EMAIL"), "Missing restaurant email must use a safe explicit error code.");
    const missingRestaurantEmailId = missingRestaurantEmailReservation.reservation?.reservation_id;
    const missingRestaurantDiagnostics = await apiConfigured("GET", `/admin/email-diagnostics?reservation=${missingRestaurantEmailId}&email_type=restaurant_request_notice&status=failed`, {}, adminHeaders);
    assert(missingRestaurantDiagnostics.recent_logs.some((row) => row.last_safe_error || row.last_error_code === "MISSING_RESTAURANT_NOTIFICATION_EMAIL"), "Super Admin diagnostics must show the missing partner email failure.");
    await apiConfigured("PATCH", "/partner/profile", { email: originalPartnerProfile.restaurant.email }, partnerHeaders);

    providerMode = "temporary";
    const reservationDuringOutage = await rawApiConfigured("POST", "/reservations", {
      offer_id: configuredOffer.offer_id,
      reservation_date: configuredOffer.reservation_date || configuredOffer.offer_date,
      reservation_time: configuredOffer.start_time || configuredOffer.offer_time,
      party_size: 2,
      guest_name: "Provider Outage Guest",
      guest_email: uniqueEmail("provider-outage"),
      guest_phone: "+1 212 555 0188",
      guest_language: "en"
    });
    assert.equal(reservationDuringOutage.status, 201, "A valid reservation must remain saved when email delivery fails.");
    assert(reservationDuringOutage.body.reservation?.reservation_id, "Reservation id must be returned even when email sending fails.");
    assert(reservationDuringOutage.body.email_delivery?.failed_count > 0, "Email failures must be reported truthfully.");

    providerMode = "success";
    const guest = await apiConfigured("POST", "/auth/signup-guest", validSignupPayload({ preferred_language: "es" }));
    assert(guest.email_delivery?.accepted_count >= 1, "Guest registration email must be triggered.");
    await apiConfigured("POST", "/auth/verification", {}, { authorization: `Bearer ${guest.access_token}` });
    const forgotResult = await apiConfigured("POST", "/auth/forgot-password", { email: guest.profile.email });
    assert(forgotResult.email_delivery?.accepted_count >= 1, "Forgot-password email must be triggered without exposing account existence.");
    const resetResult = await apiConfigured("POST", "/auth/reset-password", {
      token: forgotResult.demo_reset_token,
      password: "NewStrong!12345",
      confirm_password: "NewStrong!12345"
    });
    assert(resetResult.email_delivery?.accepted_count >= 1, "Successful password reset must trigger a password-changed email.");

    const acceptedReservation = await apiConfigured("POST", "/reservations", {
      offer_id: configuredOffer.offer_id,
      reservation_date: configuredOffer.reservation_date || configuredOffer.offer_date,
      reservation_time: configuredOffer.start_time || configuredOffer.offer_time,
      party_size: 2,
      guest_name: "Accepted Email Guest",
      guest_email: uniqueEmail("accepted-flow"),
      guest_phone: "+1 212 555 0191",
      guest_language: "hu"
    });
    const acceptedId = acceptedReservation.body?.reservation?.reservation_id || acceptedReservation.reservation?.reservation_id;
    const firstAcceptConfigured = await apiConfigured("PATCH", "/partner/reservations", { id: acceptedId, status: "accepted" }, partnerHeaders);
    const secondAcceptConfigured = await apiConfigured("PATCH", "/partner/reservations", { id: acceptedId, status: "accepted" }, partnerHeaders);
    assert.equal(firstAcceptConfigured.reservation.email_delivery.accepted_count, 1);
    assert.equal(secondAcceptConfigured.reservation.status_unchanged, true, "Repeated partner acceptance must not send a duplicate email.");
    assert.equal(secondAcceptConfigured.reservation.email_delivery.accepted_count, 0);
    const acceptedDiagnostics = await apiConfigured("GET", `/admin/email-diagnostics?reservation=${acceptedId}&restaurant=${configuredOffer.restaurant_id}&email_type=reservation_accepted&status=sent`, {}, adminHeaders);
    const acceptedDiagnostic = acceptedDiagnostics.recent_logs.find((row) => row.email_type === "reservation_accepted" || row.event_type === "reservation_accepted");
    assert.equal(acceptedDiagnostic?.language, "hu", "Accepted reservation email must use the guest language.");
    assert(acceptedDiagnostic?.template, "Accepted reservation diagnostic must include a template/type.");
    assert(acceptedDiagnostic?.related_reservation_reference, "Accepted reservation diagnostic must include the reservation reference.");

    const rejectedReservation = await apiConfigured("POST", "/reservations", {
      offer_id: configuredOffer.offer_id,
      reservation_date: configuredOffer.reservation_date || configuredOffer.offer_date,
      reservation_time: configuredOffer.start_time || configuredOffer.offer_time,
      party_size: 2,
      guest_name: "Rejected Email Guest",
      guest_email: uniqueEmail("rejected-flow"),
      guest_phone: "+1 212 555 0192",
      guest_language: "en"
    });
    const rejectedId = rejectedReservation.body?.reservation?.reservation_id || rejectedReservation.reservation?.reservation_id;
    const rejectResult = await apiConfigured("PATCH", "/partner/reservations", { id: rejectedId, status: "rejected" }, partnerHeaders);
    assert.equal(rejectResult.reservation.email_delivery.accepted_count, 1, "Reservation declined email must be triggered.");

    const cancellationGuest = await apiConfigured("POST", "/auth/signup-guest", validSignupPayload({ email: uniqueEmail("cancel-guest") }));
    const cancellable = await apiConfigured("POST", "/reservations", {
      offer_id: configuredOffer.offer_id,
      reservation_date: configuredOffer.reservation_date || configuredOffer.offer_date,
      reservation_time: configuredOffer.start_time || configuredOffer.offer_time,
      party_size: 2,
      guest_name: cancellationGuest.profile.full_name,
      guest_email: cancellationGuest.profile.email,
      guest_phone: "+1 212 555 0193",
      guest_language: "en"
    }, { authorization: `Bearer ${cancellationGuest.access_token}` });
    const cancelled = await apiConfigured("PATCH", "/guest/reservations", {
      id: cancellable.reservation.reservation_id,
      action: "cancel"
    }, { authorization: `Bearer ${cancellationGuest.access_token}` });
    assert(cancelled.reservation.email_delivery.accepted_count >= 2, "Cancellation must notify guest and restaurant partner.");

    const postVisit = await apiConfigured("PATCH", "/partner/reservations", {
      id: "30000000-0000-4000-8000-000000001043",
      action: "send_post_visit_email"
    }, partnerHeaders);
    assert.equal(postVisit.email_delivery.accepted_count, 1, "Eligible completed booking must trigger the post-visit feedback email.");
    const postVisitAgain = await rawApiConfigured("PATCH", "/partner/reservations", {
      id: "30000000-0000-4000-8000-000000001043",
      action: "send_post_visit_email"
    }, partnerHeaders);
    assert.equal(postVisitAgain.status, 409, "Post-visit feedback email must not be sent twice for the same reservation.");
    assert.equal(postVisitAgain.body.code, "POST_VISIT_EMAIL_ALREADY_SENT");

    const finalDiagnostics = await apiConfigured("GET", "/admin/email-diagnostics", {}, adminHeaders);
    const finalQueue = await apiConfigured("GET", "/admin/email-queue?limit=100", {}, adminHeaders);
    const eventTypes = new Set([
      ...finalDiagnostics.recent_logs,
      ...finalQueue.queue
    ].map((row) => row.email_type || row.event_type));
    for (const type of [
      "guest_registration",
      "email_verification",
      "password_reset",
      "password_changed",
      "guest_request_received",
      "restaurant_request_notice",
      "reservation_accepted",
      "reservation_rejected",
      "reservation_cancelled",
      "restaurant_guest_cancelled",
      "booking_completed"
    ]) {
      assert(eventTypes.has(type), `Expected email flow/type ${type} in diagnostics.`);
    }

    const coreSource = await readFile(new URL("../src/app-core.js", import.meta.url), "utf8");
    for (const key of [
      "email_guest_registration_subject",
      "email_verification_subject",
      "email_password_reset_subject",
      "email_password_changed_subject",
      "email_guest_received_subject",
      "email_guest_pending_notice",
      "email_restaurant_new_subject",
      "email_guest_accepted_subject",
      "email_guest_accepted_notice",
      "email_guest_rejected_subject",
      "email_guest_rejected_notice",
      "email_guest_cancelled_subject",
      "email_guest_cancelled_notice",
      "email_restaurant_cancelled_subject",
      "post_visit_email_subject"
    ]) {
      assert(coreSource.includes(key), `Template key ${key} must exist.`);
    }
    for (const idempotencyPattern of [
      "welcome:",
      "verification:",
      "password-reset:",
      "reservation-request-guest:",
      "reservation-request-partner:",
      "reservation-accepted:",
      "reservation-declined:",
      "reservation-cancelled-guest:",
      "reservation-cancelled-partner:",
      "post-visit-feedback:"
    ]) {
      assert(coreSource.includes(idempotencyPattern), `Idempotency pattern ${idempotencyPattern} must exist.`);
    }
    assert(coreSource.includes("MISSING_RESTAURANT_NOTIFICATION_EMAIL"), "Missing partner notification email must be logged as configuration failure.");
    assert(!coreSource.includes("You will receive a confirmation email shortly"), "Reservation UI copy must not imply delivered email.");
    for (const locale of ["en", "es", "hu"]) {
      const localeFile = await readFile(new URL(`../public/locales/${locale}.json`, import.meta.url), "utf8");
      assert(localeFile.length > 10, `${locale} locale file must be present for email-related UI.`);
      assert(localeFile.includes("confirmation email has been queued") || locale !== "en", "English reservation success copy must say queued, not delivered.");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await runConfiguredProviderChecks();

console.log("Email service checks passed.");
