import assert from "node:assert/strict";

process.env.RESEND_API_KEY = "";

const { handleApiRequest } = await import(`../src/app-core.js?reservation-lifecycle=${Date.now()}`);

async function rawApi(method, path, body = {}, headers = {}) {
  return await handleApiRequest({
    method,
    url: `/api${path}`,
    body,
    headers
  });
}

async function api(method, path, body = {}, headers = {}) {
  const response = await rawApi(method, path, body, headers);
  if (response.status >= 400) {
    throw new Error(`${method} ${path} failed with ${response.status}: ${response.body?.code || response.body?.error || "unknown error"}`);
  }
  return response.body;
}

function authHeaders(token) {
  return { authorization: `Bearer ${token}` };
}

function uniqueEmail(prefix = "reservation-lifecycle") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function validSignupPayload(overrides = {}) {
  return {
    first_name: "Lifecycle",
    last_name: "Guest",
    email: uniqueEmail(),
    password: "Strong!12345",
    confirm_password: "Strong!12345",
    phone: "+1 212 555 0199",
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
    discount_levels: ["15%", "20%"],
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

async function loginAs(email, password) {
  const result = await api("POST", "/auth/login", { email, password });
  assert(result.access_token, `${email} must receive an access token.`);
  return {
    profile: result.profile,
    headers: authHeaders(result.access_token)
  };
}

async function createGuest(overrides = {}) {
  const payload = validSignupPayload(overrides);
  const result = await api("POST", "/auth/signup-guest", payload);
  return {
    payload,
    profile: result.profile,
    headers: authHeaders(result.access_token)
  };
}

async function createReservationForGuest(offer, guest, overrides = {}) {
  return await api("POST", "/reservations", {
    offer_id: offer.offer_id || offer.id,
    reservation_date: offer.reservation_date || offer.offer_date,
    reservation_time: offer.start_time || offer.offer_time,
    party_size: 2,
    notes: "Reservation lifecycle test.",
    guest_name: guest.profile?.full_name || `${guest.payload.first_name} ${guest.payload.last_name}`,
    guest_email: guest.profile?.email || guest.payload.email,
    guest_phone: guest.payload.phone,
    guest_language: guest.payload.preferred_language || "en",
    ...overrides
  }, guest.headers);
}

const partner = await loginAs("owner@hudsonhearth.com", "restaurant123");
const admin = await loginAs("admin@smarttable.com", "admin123");
const partnerProfile = await api("GET", "/partner/profile", {}, partner.headers);
const offers = await api("GET", "/public/offers?lang=en");
const ownOffer = offers.offers.find((offer) => offer.restaurant_id === partnerProfile.restaurant.id);
assert(ownOffer, "Partner restaurant must have an active public offer.");
const adminOffers = await api("GET", "/admin/offers", {}, admin.headers);
const otherOfferSeed = adminOffers.offers.find((offer) => offer.restaurant_id !== partnerProfile.restaurant.id);
assert(otherOfferSeed, "Demo data must include another restaurant offer for ownership checks.");
await api("PATCH", "/admin/restaurants", {
  id: otherOfferSeed.restaurant_id,
  status: "approved"
}, admin.headers);
const patchedOtherOffer = await api("PATCH", "/admin/offers", {
  id: otherOfferSeed.id || otherOfferSeed.offer_id,
  status: "active",
  offer_date: ownOffer.reservation_date || ownOffer.offer_date,
  valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  start_time: ownOffer.start_time || ownOffer.offer_time,
  end_time: ownOffer.end_time || "23:30",
  available_tables: 3,
  max_party_size: 4,
  discount_value: otherOfferSeed.discount_value || otherOfferSeed.discount_percent || 20
}, admin.headers);
const otherOffer = {
  ...otherOfferSeed,
  ...patchedOtherOffer.offer,
  offer_id: patchedOtherOffer.offer?.id || otherOfferSeed.id || otherOfferSeed.offer_id
};

const guest = await createGuest();
const created = await createReservationForGuest(ownOffer, guest);
const reservation = created.reservation;
assert(reservation?.reservation_id, "Reservation creation must return a reservation id.");
assert.equal(reservation.status, "pending", "New reservation requests must start as pending.");
assert.equal(reservation.booking_source, "SMARTTABLE", "New reservations must use the SmartTable booking source.");
assert.equal(reservation.booking_status, "pending", "New reservations must expose canonical booking status.");
assert(created.email_delivery, "Reservation creation must return truthful email delivery summary.");

const unauthenticatedGuestReservations = await rawApi("GET", "/guest/reservations");
assert.equal(unauthenticatedGuestReservations.status, 401, "Unauthenticated users must not access guest reservations.");

const duplicate = await rawApi("POST", "/reservations", {
  offer_id: ownOffer.offer_id,
  reservation_date: ownOffer.reservation_date || ownOffer.offer_date,
  reservation_time: ownOffer.start_time || ownOffer.offer_time,
  party_size: 2,
  guest_name: guest.profile.full_name,
  guest_email: guest.profile.email,
  guest_phone: guest.payload.phone
}, guest.headers);
assert.equal(duplicate.status, 409, "Duplicate active reservation requests must be blocked.");

const partnerPending = await api("GET", `/partner/reservations?status=pending&search=${encodeURIComponent(reservation.reference)}`, {}, partner.headers);
assert(partnerPending.reservations.some((row) => row.reservation_id === reservation.reservation_id), "Partner filters must find their pending reservation by reference.");

const details = await api("PATCH", "/partner/reservations", { id: reservation.reservation_id }, partner.headers);
assert.equal(details.reservation.reservation_id, reservation.reservation_id, "Partner must be able to open reservation details.");

const accepted = await api("PATCH", "/partner/reservations", {
  id: reservation.reservation_id,
  status: "accepted"
}, partner.headers);
assert.equal(accepted.reservation.status, "accepted", "Pending reservations must be accepted.");
assert(accepted.reservation.accepted_at || accepted.reservation.status_changed_at, "Acceptance must record a timestamp when supported.");
assert.equal(accepted.reservation.status_changed_by || partner.profile.id, partner.profile.id, "Acceptance must carry the acting partner when supported.");

const guestAfterAccept = await api("GET", "/guest/reservations", {}, guest.headers);
assert(
  guestAfterAccept.reservations.some((row) => row.reservation_id === reservation.reservation_id && row.status === "accepted"),
  "Guest reservation history must show accepted status after partner acceptance."
);

const repeatedAccept = await api("PATCH", "/partner/reservations", {
  id: reservation.reservation_id,
  status: "accepted"
}, partner.headers);
assert.equal(repeatedAccept.reservation.status_unchanged, true, "Repeated acceptance must be idempotent.");
assert.equal(repeatedAccept.reservation.email_delivery.accepted_count, 0, "Repeated acceptance must not trigger duplicate emails.");

const invalidDecline = await rawApi("PATCH", "/partner/reservations", {
  id: reservation.reservation_id,
  status: "declined"
}, partner.headers);
assert.equal(invalidDecline.status, 409, "Accepted reservations must not be declined later.");
assert.equal(invalidDecline.body.code, "INVALID_RESERVATION_STATUS_TRANSITION", "Invalid transitions must return a precise code.");

const completed = await api("PATCH", "/partner/reservations", {
  id: reservation.reservation_id,
  status: "completed"
}, partner.headers);
assert.equal(completed.reservation.status, "completed", "Accepted reservations may be completed.");
assert(completed.reservation.completed_at || completed.reservation.status_changed_at, "Completion must record a timestamp when supported.");

const invalidReopen = await rawApi("PATCH", "/partner/reservations", {
  id: reservation.reservation_id,
  status: "pending"
}, partner.headers);
assert.equal(invalidReopen.status, 409, "Completed reservations must not be reopened as pending.");

const guestForDecline = await createGuest({ email: uniqueEmail("reservation-decline") });
const declinable = await createReservationForGuest(ownOffer, guestForDecline);
const declined = await api("PATCH", "/partner/reservations", {
  id: declinable.reservation.reservation_id,
  status: "declined"
}, partner.headers);
assert.equal(declined.reservation.status, "rejected", "Partner decline must resolve the reservation using the supported rejected status.");
assert(declined.reservation.rejected_at || declined.reservation.status_changed_at, "Decline must record a timestamp when supported.");
const guestAfterDecline = await api("GET", "/guest/reservations", {}, guestForDecline.headers);
assert(
  guestAfterDecline.reservations.some((row) => row.reservation_id === declinable.reservation.reservation_id && row.status === "rejected"),
  "Guest reservation history must show the declined/rejected reservation."
);

const guestForCancellation = await createGuest({ email: uniqueEmail("reservation-cancel") });
const cancellable = await createReservationForGuest(ownOffer, guestForCancellation);
const cancellableId = cancellable.reservation.reservation_id;
await api("PATCH", "/partner/reservations", { id: cancellableId, status: "accepted" }, partner.headers);

const intruderCancel = await rawApi("PATCH", "/guest/reservations", { id: cancellableId, action: "cancel" }, guest.headers);
assert.equal(intruderCancel.status, 404, "Guests must not modify another guest's reservation by manipulating the reservation id.");
const intruderReservations = await api("GET", "/guest/reservations", {}, guest.headers);
assert(
  !intruderReservations.reservations.some((row) => row.reservation_id === cancellableId),
  "Guests must not see another guest's reservation in their account history."
);

const cancelled = await api("PATCH", "/guest/reservations", { id: cancellableId, action: "cancel" }, guestForCancellation.headers);
assert.equal(cancelled.reservation.status, "cancelled", "Guests must be able to cancel eligible own reservations.");
assert(cancelled.reservation.cancelled_at, "Guest cancellation must record cancellation timestamp.");
assert.equal(cancelled.reservation.cancelled_by_label, "Guest", "Guest cancellation must record a safe actor label.");
const repeatedCancel = await rawApi("PATCH", "/guest/reservations", { id: cancellableId, action: "cancel" }, guestForCancellation.headers);
assert.equal(repeatedCancel.status, 409, "Repeated guest cancellation must be blocked.");

const otherGuest = await createGuest({ email: uniqueEmail("other-restaurant") });
const otherReservation = await createReservationForGuest(otherOffer, otherGuest);
const crossRestaurantAttempt = await rawApi("PATCH", "/partner/reservations", {
  id: otherReservation.reservation.reservation_id,
  status: "accepted"
}, partner.headers);
assert.equal(crossRestaurantAttempt.status, 404, "Partner must not modify another restaurant's reservation.");

const adminSearch = await api("GET", `/admin/reservations?search=${encodeURIComponent(reservation.reference)}&status=completed`, {}, admin.headers);
assert(adminSearch.reservations.some((row) => row.reservation_id === reservation.reservation_id), "Super Admin reservation search and status filter must work.");
const adminDetails = await api("PATCH", "/admin/reservations", { id: reservation.reservation_id }, admin.headers);
assert.equal(adminDetails.reservation.reservation_id, reservation.reservation_id, "Super Admin must be able to open reservation details.");

const adminCancelWithoutConfirm = await rawApi("PATCH", "/admin/reservations", {
  id: otherReservation.reservation.reservation_id,
  status: "cancelled"
}, admin.headers);
assert.equal(adminCancelWithoutConfirm.status, 400, "Super Admin cancellation must require explicit confirmation.");

const adminCancelled = await api("PATCH", "/admin/reservations", {
  id: otherReservation.reservation.reservation_id,
  status: "cancelled",
  confirm: true
}, admin.headers);
assert.equal(adminCancelled.reservation.status, "cancelled", "Super Admin must be able to cancel with explicit confirmation.");
assert(adminCancelled.reservation.cancelled_at, "Super Admin cancellation must record cancellation timestamp.");

console.log("Reservation lifecycle checks passed.");
