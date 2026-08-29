#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import {
  ACCOUNT_SPECS,
  TEST_RESTAURANT_ID,
  accountEmail,
  accountPassword,
  loadAndValidateStagingEnv,
  projectRoot
} from "./staging-test-accounts-common.mjs";

const PORT = String(process.env.STAGING_RESERVATION_REVIEW_PORT || 4198);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const RUN_MARKER = `release-qa-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function waitForHttp(url, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let lastError;
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if ((response.statusCode || 0) >= 200 && (response.statusCode || 0) < 500) {
          resolve();
          return;
        }
        retry(new Error(`HTTP ${response.statusCode}`));
      });
      request.setTimeout(1_500, () => request.destroy(new Error("Timed out waiting for staging app.")));
      request.on("error", retry);
    };
    const retry = (error) => {
      lastError = error;
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for the local staging app${lastError ? ` (${lastError.message})` : ""}.`));
        return;
      }
      setTimeout(attempt, 500);
    };
    attempt();
  });
}

function startLocalStagingApp(env) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...env,
      PORT,
      PUBLIC_BASE_URL: BASE_URL,
      SMARTTABLE_ENV: "staging",
      APP_ENV: "staging",
      VERCEL_ENV: "preview"
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true
  });
  child.stderr.on("data", (chunk) => {
    const line = String(chunk);
    if (!/key|token|password|secret|authorization/i.test(line)) process.stderr.write(`[staging-app] ${line}`);
  });
  return child;
}

function stopLocalApp(child) {
  if (child && !child.killed) child.kill();
}

function safeErrorPayload(payload, statusText = "") {
  if (!payload || typeof payload !== "object") return { message: String(payload || statusText).slice(0, 240) };
  return {
    code: payload.code || payload.error_code || null,
    message: String(payload.error || payload.message || statusText || "Request failed.").slice(0, 240)
  };
}

async function rawApi(method, pathname, body, headers = {}) {
  const response = await fetch(`${BASE_URL}/api${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: method === "GET" || body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  return { status: response.status, ok: response.ok, payload };
}

async function api(method, pathname, body, headers = {}) {
  const result = await rawApi(method, pathname, body, headers);
  if (!result.ok) {
    const safe = safeErrorPayload(result.payload);
    const error = new Error(`${method} ${pathname} failed with HTTP ${result.status}: ${safe.code || "API_ERROR"} ${safe.message}`);
    error.status = result.status;
    error.safe = safe;
    throw error;
  }
  return result.payload;
}

async function login(spec, env) {
  const result = await api("POST", "/auth/login", {
    email: accountEmail(env, spec),
    password: accountPassword(env, spec)
  });
  assert(result?.access_token, `${spec.label} did not receive a staging access token.`);
  return {
    profile: result.profile,
    headers: { authorization: `Bearer ${result.access_token}` }
  };
}

function dateInNewYork(offsetDays = 0) {
  const value = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function deliveryCounts(value = {}) {
  return {
    attempted: Number(value.attempted_count || 0),
    accepted: Number(value.accepted_count || 0),
    failed: Number(value.failed_count || 0),
    skipped: Number(value.skipped_count || 0)
  };
}

function deliveryFailureCodes(value = {}) {
  const counts = new Map();
  for (const item of Array.isArray(value.errors) ? value.errors : []) {
    const code = String(item?.errorCode || item?.status || "UNKNOWN_EMAIL_FAILURE").trim();
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

const REVIEW_PHOTO_MIME_TYPE = "image/png";
const REVIEW_PHOTO_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

const { env, projectRef } = loadAndValidateStagingEnv({ requireAnonKey: true });
const guestSpec = ACCOUNT_SPECS.find((item) => item.key === "guest");
const partnerSpec = ACCOUNT_SPECS.find((item) => item.key === "partner");
assert(guestSpec && partnerSpec, "Guest and partner staging test accounts are required.");

let server;
let partner;
let visibilityRestoreRequired = false;
let reservationEmailRestoreRequired = false;
let reservationEmailRestoreValue = "";
try {
  server = startLocalStagingApp(env);
  await waitForHttp(BASE_URL);

  const guest = await login(guestSpec, env);
  partner = await login(partnerSpec, env);
  assert(guest.profile?.role === "guest", "Staging Guest account role mismatch.");
  assert(partner.profile?.role === "partner", "Staging Partner account role mismatch.");
  assert(guest.profile?.is_test_data === true, "Staging Guest account is not marked as test data. No writes were performed.");

  const partnerProfile = await api("GET", "/partner/profile", undefined, partner.headers);
  const restaurant = partnerProfile?.restaurant;
  assert(restaurant?.id, "Staging Partner has no assigned restaurant.");
  assert(restaurant.id === TEST_RESTAURANT_ID, "Staging Partner is not assigned to the canonical SmartTable test restaurant. No writes were performed.");
  assert(restaurant.is_test_restaurant === true, "Canonical staging restaurant is not marked as a test restaurant. No writes were performed.");
  assert(restaurant.is_test_data === true, "Canonical staging restaurant is not marked as test data. No writes were performed.");
  assert(restaurant.visible_on_guest_site === false, "Canonical staging restaurant must remain hidden from ordinary public search. No writes were performed.");
  assert(restaurant.accepts_reservation_requests === true, "Canonical staging restaurant does not accept reservation requests. No writes were performed.");
  assert(restaurant.status === "approved", "Canonical staging test restaurant is not approved. No writes were performed.");

  const controlledPartnerEmail = accountEmail(env, partnerSpec);
  reservationEmailRestoreValue = String(restaurant.reservation_email || "").trim();
  if (reservationEmailRestoreValue.toLowerCase() !== controlledPartnerEmail.toLowerCase()) {
    reservationEmailRestoreRequired = true;
    const controlledNotificationProfile = await api("PATCH", "/partner/profile", {
      reservation_email: controlledPartnerEmail
    }, partner.headers);
    assert(
      String(controlledNotificationProfile?.restaurant?.reservation_email || "").toLowerCase() === controlledPartnerEmail.toLowerCase(),
      "Could not route the staging restaurant notification to the controlled Partner test account."
    );
  }

  const offerDate = dateInNewYork(1);
  const partnerOffers = await api("GET", "/partner/offers", undefined, partner.headers);
  let offer = (partnerOffers?.offers || []).find((item) => (
    String(item.title_en || item.title || "").startsWith("Release QA reservation release-qa-")
    && item.offer_date === offerDate
    && item.status === "active"
    && Number(item.reserved_tables || 0) < Number(item.available_tables || 0)
  ));
  let offerAction = "reused";
  if (!offer) {
    const offerResult = await api("POST", "/partner/offers", {
      title_en: `Release QA reservation ${RUN_MARKER}`,
      description_en: "Controlled staging-only release-readiness transaction. Do not use for production reporting.",
      offer_date: offerDate,
      start_time: "20:45",
      end_time: "21:15",
      available_tables: 1,
      max_party_size: 2,
      discount_value: 11,
      status: "active",
      valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      source: "release_qa"
    }, partner.headers);
    offer = offerResult?.offer;
    offerAction = "created";
  }
  assert(offer?.id, "Staging QA offer was not persisted.");
  assert(offer.restaurant_id === TEST_RESTAURANT_ID, "Staging QA offer was attached to an unexpected restaurant.");

  // The canonical staging restaurant stays hidden from ordinary public search. The
  // database reservation RPC also requires this flag, so enable it only for the
  // controlled test window. Test-data filters still keep the restaurant out of
  // ordinary public responses, and the finally block restores the canonical state.
  visibilityRestoreRequired = true;
  const temporarilyVisible = await api("PATCH", "/partner/profile", {
    visible_on_guest_site: true
  }, partner.headers);
  assert(temporarilyVisible?.restaurant?.visible_on_guest_site === true, "Could not open the controlled staging reservation test window.");

  const reservationResult = await api("POST", "/reservations", {
    offer_id: offer.id,
    reservation_date: offerDate,
    reservation_time: "20:45",
    party_size: 2,
    notes: `Controlled staging-only ${RUN_MARKER}`,
    guest_name: guest.profile?.full_name || "SmartTable Staging Guest",
    guest_email: accountEmail(env, guestSpec),
    guest_phone: "+12125550198",
    guest_language: "en"
  }, guest.headers);
  const reservation = reservationResult?.reservation;
  assert(reservation?.reservation_id, "Staging QA reservation was not persisted.");
  assert(reservation.restaurant_id === TEST_RESTAURANT_ID, "Staging QA reservation restaurant mismatch.");
  assert(reservation.status === "pending", "New staging QA reservation did not start pending.");
  assert(reservation.is_test_reservation === true, "Staging QA reservation was not marked as test data.");

  const accepted = await api("PATCH", "/partner/reservations", {
    id: reservation.reservation_id,
    restaurant_id: TEST_RESTAURANT_ID,
    status: "accepted"
  }, partner.headers);
  assert(accepted?.reservation?.status === "accepted", "Partner acceptance was not persisted.");

  const arrived = await api("PATCH", "/partner/reservations", {
    id: reservation.reservation_id,
    restaurant_id: TEST_RESTAURANT_ID,
    action: "mark_arrived"
  }, partner.headers);
  assert(arrived?.reservation?.arrival_status === "arrived", "Partner arrival state was not persisted.");

  const completed = await api("PATCH", "/partner/reservations", {
    id: reservation.reservation_id,
    restaurant_id: TEST_RESTAURANT_ID,
    action: "mark_visit_completed"
  }, partner.headers);
  assert(completed?.reservation?.status === "completed", "Partner completion was not persisted.");

  const eligibility = await api("GET", `/guest/reviews/verified?reservation_id=${encodeURIComponent(reservation.reservation_id)}`, undefined, guest.headers);
  assert(eligibility?.context?.review_eligibility?.eligible === true, "Completed staging visit did not become eligible for a verified review.");

  const signedPhoto = await api("POST", "/guest/reviews/photos/sign-upload", {
    reservation_id: reservation.reservation_id,
    filename: `${RUN_MARKER}.png`,
    content_type: REVIEW_PHOTO_MIME_TYPE,
    file_size: REVIEW_PHOTO_BYTES.length
  }, guest.headers);
  assert(signedPhoto?.mode === "supabase", "Staging review photo upload did not use Supabase storage.");
  assert(signedPhoto?.storage_path && signedPhoto?.upload_url, "Staging review photo upload was not signed.");
  const photoUpload = await fetch(signedPhoto.upload_url, {
    method: "PUT",
    headers: { "content-type": REVIEW_PHOTO_MIME_TYPE },
    body: REVIEW_PHOTO_BYTES
  });
  assert(photoUpload.ok, `Staging review photo upload failed with HTTP ${photoUpload.status}.`);

  const reviewResult = await api("POST", "/guest/reviews/verified", {
    reservation_id: reservation.reservation_id,
    food_rating: 5,
    service_rating: 5,
    atmosphere_rating: 4,
    written_review: `Controlled staging-only verified review ${RUN_MARKER}.`,
    visit_duration_minutes: 75,
    visit_duration_confirmed: true,
    photos: [{
      storage_path: signedPhoto.storage_path,
      mime_type: REVIEW_PHOTO_MIME_TYPE,
      file_size: REVIEW_PHOTO_BYTES.length
    }]
  }, guest.headers);
  assert(reviewResult?.mode === "supabase", "Verified staging review did not use the staging persistence backend.");
  assert(reviewResult?.review?.restaurant_id === TEST_RESTAURANT_ID, "Verified staging review response did not identify the test restaurant.");
  assert(reviewResult?.review?.food_rating === 5 && reviewResult?.review?.service_rating === 5 && reviewResult?.review?.ambience_rating === 4, "Verified staging review ratings were not persisted.");
  assert(reviewResult?.review?.status === "pending", "Verified staging review did not enter the moderation queue.");
  assert(!Object.hasOwn(reviewResult?.review || {}, "id"), "Guest review response must not expose the internal review id.");
  assert(!Object.hasOwn(reviewResult?.review || {}, "guest_email"), "Guest review response must not expose guest PII.");

  const partnerReviews = await api("GET", "/partner/reviews", undefined, partner.headers);
  const persistedReview = (partnerReviews?.reviews || []).find((item) => item.written_review === `Controlled staging-only verified review ${RUN_MARKER}.`);
  assert(persistedReview?.id, "Partner review list did not expose the newly persisted staging review.");
  assert(persistedReview.photos?.length === 1, "Staging review photo was not attached to the exact persisted review.");
  assert(persistedReview.photos[0]?.review_id === persistedReview.id, "Staging review photo association points to a different review.");
  assert(persistedReview.photos[0]?.mime_type === REVIEW_PHOTO_MIME_TYPE, "Staging review photo metadata mismatch.");

  const duplicate = await rawApi("POST", "/guest/reviews/verified", {
    reservation_id: reservation.reservation_id,
    food_rating: 5,
    service_rating: 5,
    atmosphere_rating: 5
  }, guest.headers);
  assert(duplicate.status === 409, "Duplicate verified review submission was not rejected.");
  assert(duplicate.payload?.code === "review_already_submitted", "Duplicate review rejection did not return the expected code.");

  const guestReservations = await api("GET", "/guest/reservations", undefined, guest.headers);
  const persistedReservation = guestReservations?.reservations?.find((item) => item.reservation_id === reservation.reservation_id);
  assert(persistedReservation?.status === "completed", "Completed reservation was not visible in Guest history.");
  assert(persistedReservation?.verified_review_submitted === true || Boolean(persistedReservation?.review_submitted_at), "Guest history did not expose the submitted verified review state.");

  console.log("STAGING RESERVATION + VERIFIED REVIEW: PASS");
  console.log(`STAGING PROJECT VERIFIED: YES (${projectRef.slice(0, 4)}...${projectRef.slice(-4)})`);
  console.log("CANONICAL TEST RESTAURANT VERIFIED: YES");
  console.log(`OFFER PERSISTED AS TEST QA DATA: YES (${offerAction})`);
  console.log("RESERVATION LIFECYCLE: pending -> accepted -> arrived -> completed");
  console.log("VERIFIED REVIEW PERSISTED: YES");
  console.log("VERIFIED REVIEW PHOTO ASSOCIATION: PASS (1 photo)");
  console.log("DUPLICATE REVIEW PROTECTION: PASS");
  console.log(`CREATION EMAIL DELIVERY: ${JSON.stringify(deliveryCounts(reservationResult.email_delivery))}`);
  console.log(`CREATION EMAIL FAILURE CODES: ${JSON.stringify(deliveryFailureCodes(reservationResult.email_delivery))}`);
  console.log(`ACCEPTANCE EMAIL DELIVERY: ${JSON.stringify(deliveryCounts(accepted?.reservation?.email_delivery))}`);
  console.log(`ACCEPTANCE EMAIL FAILURE CODES: ${JSON.stringify(deliveryFailureCodes(accepted?.reservation?.email_delivery))}`);
  console.log(`COMPLETION EMAIL DELIVERY: ${JSON.stringify(deliveryCounts(completed?.reservation?.email_delivery))}`);
  console.log("PRODUCTION TOUCHED: NO");
  console.log("MIGRATIONS APPLIED: NO");
  console.log("DESTRUCTIVE CLEANUP: NO");
} finally {
  let restoreError = null;
  if (reservationEmailRestoreRequired && partner?.headers) {
    try {
      const restoredEmail = await api("PATCH", "/partner/profile", {
        reservation_email: reservationEmailRestoreValue
      }, partner.headers);
      assert(
        String(restoredEmail?.restaurant?.reservation_email || "").trim().toLowerCase() === reservationEmailRestoreValue.toLowerCase(),
        "CRITICAL: staging test restaurant reservation email was not restored."
      );
    } catch (error) {
      restoreError = error;
    }
  }
  if (visibilityRestoreRequired && partner?.headers) {
    try {
      const restored = await api("PATCH", "/partner/profile", {
        visible_on_guest_site: false
      }, partner.headers);
      assert(restored?.restaurant?.visible_on_guest_site === false, "CRITICAL: staging test restaurant visibility was not restored.");
    } catch (error) {
      restoreError ||= error;
    }
  }
  stopLocalApp(server);
  if (restoreError) throw restoreError;
}
