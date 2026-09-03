import assert from "node:assert/strict";
import { TEST_ACCOUNTS } from "./test-account-credentials.mjs";

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

const partner = await loginAs(TEST_ACCOUNTS.partner.email, TEST_ACCOUNTS.partner.password);
const admin = await loginAs(TEST_ACCOUNTS.superadmin.email, TEST_ACCOUNTS.superadmin.password);
const partnerProfile = await api("GET", "/partner/profile", {}, partner.headers);
const defaultOffers = await api("GET", "/public/offers?lang=en");
assert(
  !defaultOffers.offers.some((offer) => offer.slug === "smarttable-test-bistro" || offer.restaurant_name === "SmartTable Test Bistro"),
  "SmartTable Test Bistro must be hidden from public offers unless test_mode is explicitly enabled."
);
const offers = await api("GET", "/public/offers?lang=en&test_mode=true");
const testBistroOffers = offers.offers.filter((offer) => offer.slug === "smarttable-test-bistro" || offer.restaurant_name === "SmartTable Test Bistro");
assert(testBistroOffers.length >= 3, "SmartTable Test Bistro must expose all three active test offers through the public API.");
assert(testBistroOffers.every((offer) => offer.is_test_restaurant === true), "SmartTable Test Bistro public offers must be marked as test restaurant offers.");
assert(testBistroOffers.every((offer) => Number(offer.available_tables || 0) >= 10), "SmartTable Test Bistro test offers must expose at least 10 available test slots.");
assert(testBistroOffers.every((offer) => offer.district === "Manhattan"), "SmartTable Test Bistro must use the pilot-safe Manhattan test location.");
assert(testBistroOffers.every((offer) => String(offer.address || "").includes("Pilot Test Avenue")), "SmartTable Test Bistro must use an obviously fictional test address.");
assert(testBistroOffers.some((offer) => offer.offer_title === "Early Dinner Special" || offer.title === "Early Dinner Special"), "SmartTable Test Bistro must include the Early Dinner Special offer.");
assert(testBistroOffers.some((offer) => offer.offer_title === "Weekend Lunch" || offer.title === "Weekend Lunch"), "SmartTable Test Bistro must include the Weekend Lunch offer.");
assert(testBistroOffers.some((offer) => offer.offer_title === "Last-Minute Table" || offer.title === "Last-Minute Table"), "SmartTable Test Bistro must include the Last-Minute Table offer.");
const ownOffer = offers.offers.find((offer) => offer.restaurant_id === partnerProfile.restaurant.id);
assert(ownOffer, "Partner restaurant must have an active public offer.");
const adminOffers = await api("GET", "/admin/offers", {}, admin.headers);
const otherOfferSeed = adminOffers.offers.find((offer) => offer.restaurant_id !== partnerProfile.restaurant.id);
assert(otherOfferSeed, "Demo data must include another restaurant offer for ownership checks.");
await api("PATCH", "/admin/restaurants", {
  id: otherOfferSeed.restaurant_id,
  status: "active",
  city: "New York",
  country: "US",
  primary_timezone: "America/New_York",
  activate_confirmed: true
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
const testGuest = await createGuest({ email: uniqueEmail("smarttable-test-bistro") });
const testOffer = testBistroOffers.find((offer) => Number(offer.max_party_size || 0) >= 2) || testBistroOffers[0];
const testReservation = await createReservationForGuest(testOffer, testGuest);
assert(testReservation.reservation?.reservation_id, "SmartTable Test Bistro reservation must be created through the standard reservation endpoint.");
assert.equal(testReservation.reservation.status, "pending", "SmartTable Test Bistro reservations must start pending partner approval.");
assert.equal(testReservation.reservation.is_test_reservation, true, "SmartTable Test Bistro reservations must be clearly marked as test reservations.");
assert.equal(testReservation.reservation.test_record, true, "SmartTable Test Bistro reservations must expose test_record for diagnostics.");
assert(testReservation.email_delivery, "SmartTable Test Bistro reservations must use the existing reservation email flow.");

const duplicateTestReservation = await rawApi("POST", "/reservations", {
  offer_id: testOffer.offer_id,
  reservation_date: testOffer.reservation_date || testOffer.offer_date,
  reservation_time: testOffer.start_time || testOffer.offer_time,
  party_size: 2,
  guest_name: testGuest.profile.full_name,
  guest_email: testGuest.profile.email,
  guest_phone: testGuest.payload.phone
}, testGuest.headers);
assert.equal(duplicateTestReservation.status, 409, "Duplicate SmartTable Test Bistro submissions must be blocked.");

const testPartnerPending = await api("GET", `/partner/reservations?restaurant_id=${encodeURIComponent(testOffer.restaurant_id)}&status=pending&search=${encodeURIComponent(testReservation.reservation.reference)}`, {}, partner.headers);
assert(
  testPartnerPending.reservations.some((row) => row.reservation_id === testReservation.reservation.reservation_id && row.is_test_reservation === true),
  "The assigned partner must be able to view pending SmartTable Test Bistro test reservations."
);

const acceptedTestReservation = await api("PATCH", "/partner/reservations", {
  id: testReservation.reservation.reservation_id,
  restaurant_id: testOffer.restaurant_id,
  status: "accepted"
}, partner.headers);
assert.equal(acceptedTestReservation.reservation.status, "accepted", "Partner must be able to accept a SmartTable Test Bistro pending reservation.");
assert.equal(acceptedTestReservation.reservation.is_test_reservation, true, "Accepted SmartTable Test Bistro reservation must remain marked as test.");

const testGuestReservations = await api("GET", "/guest/reservations", {}, testGuest.headers);
assert(
  testGuestReservations.reservations.some((row) => row.reservation_id === testReservation.reservation.reservation_id && row.status === "accepted" && row.is_test_reservation === true),
  "Guest account must show accepted SmartTable Test Bistro test reservation status."
);

const standardGuest = await createGuest({ email: uniqueEmail("standard-reservation") });
const standardReservationPayload = {
  reservation_type: "standard",
  restaurant_id: partnerProfile.restaurant.id,
  reservation_date: ownOffer.reservation_date || ownOffer.offer_date,
  reservation_time: "22:45",
  party_size: 2,
  notes: "Standard reservation lifecycle test.",
  guest_name: standardGuest.profile.full_name,
  guest_email: standardGuest.profile.email,
  guest_phone: standardGuest.payload.phone,
  guest_language: standardGuest.payload.preferred_language || "en"
};
const standardReservation = await api("POST", "/reservations", standardReservationPayload, standardGuest.headers);
assert(standardReservation.reservation?.reservation_id, "Standard restaurant reservation must be created without an offer.");
assert.equal(standardReservation.reservation.offer_id || null, null, "Standard restaurant reservations must not attach a discount offer id.");
assert.equal(standardReservation.reservation.reservation_type, "standard", "Standard restaurant reservations must expose reservation_type=standard.");
assert.equal(standardReservation.reservation.status, "pending", "Standard restaurant reservations must start pending partner approval.");
const duplicateStandardReservation = await rawApi("POST", "/reservations", standardReservationPayload, standardGuest.headers);
assert.equal(duplicateStandardReservation.status, 409, "Duplicate standard restaurant reservation requests must be blocked.");
const partnerStandardPending = await api("GET", `/partner/reservations?status=pending&search=${encodeURIComponent(standardReservation.reservation.reference)}`, {}, partner.headers);
assert(
  partnerStandardPending.reservations.some((row) => row.reservation_id === standardReservation.reservation.reservation_id && row.restaurant_id === partnerProfile.restaurant.id),
  "Partner reservation list must include standard restaurant reservation requests for their restaurant."
);
const acceptedStandardReservation = await api("PATCH", "/partner/reservations", {
  id: standardReservation.reservation.reservation_id,
  restaurant_id: partnerProfile.restaurant.id,
  status: "accepted"
}, partner.headers);
assert.equal(acceptedStandardReservation.reservation.status, "accepted", "Partner must be able to accept a standard restaurant reservation.");

const finalSlotOffer = await api("POST", "/partner/offers", {
  title_en: "Final-slot concurrency guard",
  description_en: "Controlled one-table offer for reservation race protection.",
  offer_date: testOffer.reservation_date || testOffer.offer_date,
  start_time: "21:30",
  end_time: "22:30",
  discount_type: "percent",
  discount_value: 10,
  available_tables: 1,
  max_party_size: 2,
  status: "active",
  valid_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
}, partner.headers);
assert(finalSlotOffer.offer?.id, "Partner must be able to create a final-slot offer for concurrency testing.");

const finalSlotPublicOffer = {
  ...finalSlotOffer.offer,
  offer_id: finalSlotOffer.offer.id,
  restaurant_id: finalSlotOffer.offer.restaurant_id,
  reservation_date: finalSlotOffer.offer.offer_date,
  offer_date: finalSlotOffer.offer.offer_date,
  start_time: finalSlotOffer.offer.start_time,
  offer_time: finalSlotOffer.offer.offer_time || finalSlotOffer.offer.start_time
};
const finalSlotGuests = await Promise.all([
  createGuest({ email: uniqueEmail("final-slot-a") }),
  createGuest({ email: uniqueEmail("final-slot-b") })
]);
const finalSlotAttempts = await Promise.all(finalSlotGuests.map((raceGuest, index) => rawApi("POST", "/reservations", {
  offer_id: finalSlotPublicOffer.offer_id,
  reservation_date: finalSlotPublicOffer.reservation_date,
  reservation_time: finalSlotPublicOffer.start_time || finalSlotPublicOffer.offer_time,
  party_size: 2,
  guest_name: raceGuest.profile.full_name,
  guest_email: raceGuest.profile.email,
  guest_phone: raceGuest.payload.phone,
  notes: `Final-slot race attempt ${index + 1}.`
}, raceGuest.headers)));
const finalSlotSuccesses = finalSlotAttempts.filter((result) => result.status === 201);
const finalSlotFailures = finalSlotAttempts.filter((result) => result.status === 409);
assert.equal(finalSlotSuccesses.length, 1, "Only one concurrent final-slot reservation may succeed.");
assert.equal(finalSlotFailures.length, 1, "The second concurrent final-slot reservation must receive an availability conflict.");
assert(
  /availability|sold|capacity|active reservation|matching/i.test(`${finalSlotFailures[0].body?.code || ""} ${finalSlotFailures[0].body?.error || ""}`),
  "The failed final-slot attempt must return a clear availability or duplicate error."
);
const finalSlotPartnerOffers = await api("GET", "/partner/offers", {}, partner.headers);
const finalSlotStoredOffer = finalSlotPartnerOffers.offers.find((offer) => offer.id === finalSlotPublicOffer.offer_id || offer.offer_id === finalSlotPublicOffer.offer_id);
assert(finalSlotStoredOffer, "The final-slot offer must remain inspectable by the partner.");
assert.equal(Number(finalSlotStoredOffer.reserved_tables), 1, "Final-slot concurrency must reserve exactly one table.");
assert(Number(finalSlotStoredOffer.available_tables) >= Number(finalSlotStoredOffer.reserved_tables), "Final-slot capacity must never become negative.");

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
