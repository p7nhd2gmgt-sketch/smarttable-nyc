import assert from "node:assert/strict";
import { evaluateOfferValidity } from "../src/offer-validity.js";

const baseOffer = {
  id: "offer-test",
  status: "active",
  offer_date: "2026-07-18",
  start_time: "20:30",
  end_time: "22:00",
  available_tables: 3,
  reserved_tables: 0,
  max_party_size: 4,
  primary_timezone: "America/New_York"
};

function check(name, offer, options, expected) {
  const validity = evaluateOfferValidity({ ...baseOffer, ...offer }, options);
  if (expected.bookable !== undefined) assert.equal(validity.bookable, expected.bookable, name);
  if (expected.status) assert.equal(validity.status, expected.status, name);
  if (expected.code !== undefined) assert.equal(validity.code, expected.code, name);
  if (expected.startUtc) assert.equal(validity.offer_start_at_utc, expected.startUtc, name);
  if (expected.endUtc) assert.equal(validity.offer_end_at_utc, expected.endUtc, name);
  return validity;
}

check(
  "exact New York false-expiration case stays bookable",
  {},
  {
    now: "2026-07-19T00:10:00.000Z",
    reservationDate: "2026-07-18",
    reservationTime: "20:30",
    partySize: 2
  },
  { bookable: true, status: "upcoming", code: "", startUtc: "2026-07-19T00:30:00.000Z" }
);

check(
  "offer later today is upcoming",
  {},
  { now: "2026-07-18T16:00:00.000Z", reservationDate: "2026-07-18", reservationTime: "20:30", partySize: 2 },
  { bookable: true, status: "upcoming", code: "" }
);

check(
  "offer currently active is bookable",
  {},
  { now: "2026-07-19T01:00:00.000Z", reservationDate: "2026-07-18", reservationTime: "21:00", partySize: 2 },
  { bookable: true, status: "active", code: "" }
);

check(
  "offer ending later today is still active",
  {},
  { now: "2026-07-19T01:45:00.000Z", reservationDate: "2026-07-18", reservationTime: "21:45", partySize: 2 },
  { bookable: true, status: "active", code: "" }
);

check(
  "offer already ended is expired",
  {},
  { now: "2026-07-19T02:01:00.000Z", reservationDate: "2026-07-18", reservationTime: "21:45", partySize: 2 },
  { bookable: false, status: "expired", code: "OFFER_EXPIRED" }
);

check(
  "future-date offer is upcoming",
  { offer_date: "2026-07-19" },
  { now: "2026-07-19T00:10:00.000Z", reservationDate: "2026-07-19", reservationTime: "20:30", partySize: 2 },
  { bookable: true, status: "upcoming", code: "" }
);

check(
  "booking cutoff before start time closes booking explicitly",
  { booking_cutoff_minutes: 30 },
  { now: "2026-07-19T00:10:00.000Z", reservationDate: "2026-07-18", reservationTime: "20:30", partySize: 2 },
  { bookable: false, status: "outside_booking_cutoff", code: "BOOKING_CUTOFF_PASSED" }
);

check(
  "no booking cutoff does not silently close booking",
  {},
  { now: "2026-07-19T00:10:00.000Z", reservationDate: "2026-07-18", reservationTime: "20:30", partySize: 2 },
  { bookable: true, status: "upcoming", code: "" }
);

check(
  "selected time before offer window is not started",
  {},
  { now: "2026-07-18T23:30:00.000Z", reservationDate: "2026-07-18", reservationTime: "19:00", partySize: 2 },
  { bookable: false, status: "unavailable", code: "OFFER_NOT_STARTED" }
);

check(
  "sold-out offer is not bookable",
  { available_tables: 1, reserved_tables: 1 },
  { now: "2026-07-19T00:10:00.000Z", reservationDate: "2026-07-18", reservationTime: "20:30", partySize: 2 },
  { bookable: false, status: "sold_out", code: "OFFER_SOLD_OUT" }
);

check(
  "inactive offer is not bookable",
  { status: "paused" },
  { now: "2026-07-19T00:10:00.000Z", reservationDate: "2026-07-18", reservationTime: "20:30", partySize: 2 },
  { bookable: false, status: "unavailable", code: "OFFER_INACTIVE" }
);

check(
  "New York summer EDT offset is respected",
  {},
  { now: "2026-07-19T00:10:00.000Z", reservationDate: "2026-07-18", reservationTime: "20:30", partySize: 2 },
  { startUtc: "2026-07-19T00:30:00.000Z", endUtc: "2026-07-19T02:00:00.000Z" }
);

check(
  "New York winter EST offset is respected",
  { offer_date: "2026-01-18" },
  { now: "2026-01-19T01:10:00.000Z", reservationDate: "2026-01-18", reservationTime: "20:30", partySize: 2 },
  { bookable: true, status: "upcoming", code: "", startUtc: "2026-01-19T01:30:00.000Z", endUtc: "2026-01-19T03:00:00.000Z" }
);

check(
  "server UTC time is evaluated in restaurant timezone",
  {},
  { now: "2026-07-19T00:10:00.000Z", reservationDate: "2026-07-18", reservationTime: "20:30", partySize: 2 },
  { bookable: true, status: "upcoming", code: "" }
);

console.log("Offer validity checks passed.");
