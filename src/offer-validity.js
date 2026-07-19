const DEFAULT_RESTAURANT_TIMEZONE = "America/New_York";

const OFFER_ERROR_MESSAGES = {
  OFFER_EXPIRED: "This offer has expired.",
  OFFER_NOT_STARTED: "This offer is not available at the selected time.",
  BOOKING_CUTOFF_PASSED: "Booking has closed for this offer.",
  OFFER_SOLD_OUT: "No tables are available for this party size.",
  OFFER_INACTIVE: "This offer is not active.",
  OFFER_NOT_FOUND: "Offer not found.",
  INVALID_OFFER_TIME: "Selected time is outside this offer window.",
  OFFER_DATE_MISMATCH: "Selected date is not available for this offer.",
  OFFER_UNAVAILABLE: "This offer is not available."
};

function clean(value) {
  return String(value ?? "").trim();
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeDate(value) {
  const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function parseTime(value) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return { hour, minute, second };
}

function timeToMinutes(value) {
  const parsed = parseTime(value);
  return parsed ? parsed.hour * 60 + parsed.minute : null;
}

function normalizeTimezone(value) {
  const timezone = clean(value) || DEFAULT_RESTAURANT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_RESTAURANT_TIMEZONE;
  }
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const out = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second
  };
}

function zonedLocalLabel(date, timezone) {
  const parts = zonedParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}`;
}

function wallTimeToUtcMs(dateValue, timeValue, timezone) {
  const date = normalizeDate(dateValue);
  const time = parseTime(timeValue);
  if (!date || !time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, time.hour, time.minute, time.second || 0);
  let utc = targetAsUtc;
  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(new Date(utc), timezone);
    const actualAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
    const diff = targetAsUtc - actualAsUtc;
    if (diff === 0) break;
    utc += diff;
  }
  const final = zonedParts(new Date(utc), timezone);
  const matches = final.year === year
    && final.month === month
    && final.day === day
    && final.hour === time.hour
    && final.minute === time.minute;
  return matches ? utc : null;
}

function addDays(dateValue, days) {
  const [year, month, day] = normalizeDate(dateValue).split("-").map(Number);
  if (!year || !month || !day) return "";
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

function availableTablesForOffer(offer = {}) {
  const fallbackTables = Math.ceil(numberOr(offer.seat_count, 0) / Math.max(numberOr(offer.max_party_size, 4), 1));
  return Math.max(0, numberOr(offer.available_tables, fallbackTables) - numberOr(offer.reserved_tables, 0));
}

function availableSeatsForOffer(offer = {}) {
  return Math.max(
    availableTablesForOffer(offer) * numberOr(offer.max_party_size, 4),
    numberOr(offer.seat_count, 0) - numberOr(offer.reserved_seats, 0)
  );
}

function offerTimezone(offer = {}) {
  return normalizeTimezone(
    offer.primary_timezone
    || offer.timezone
    || offer.restaurant_timezone
    || offer.restaurant?.primary_timezone
    || offer.restaurants?.primary_timezone
  );
}

function bookingCutoffMs(offer = {}, startMs, timezone) {
  const absolute = clean(offer.booking_cutoff_at || offer.expires_at);
  if (absolute) {
    const parsed = Date.parse(absolute);
    if (Number.isFinite(parsed)) return parsed;
  }
  const rawMinutes = offer.booking_cutoff_minutes ?? offer.bookingCutoffMinutes ?? offer.restaurant?.booking_cutoff_minutes ?? offer.restaurants?.booking_cutoff_minutes;
  if (rawMinutes === null || rawMinutes === undefined || rawMinutes === "") return null;
  const minutes = Number(rawMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return startMs - minutes * 60 * 1000;
}

function result(status, code, details) {
  return {
    ...details,
    status,
    code,
    message: code ? OFFER_ERROR_MESSAGES[code] || OFFER_ERROR_MESSAGES.OFFER_UNAVAILABLE : "",
    bookable: !code && ["upcoming", "active"].includes(status)
  };
}

export function evaluateOfferValidity(offer = null, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();
  const timezone = offerTimezone(offer || {});
  const details = {
    timezone,
    now_utc: Number.isFinite(nowMs) ? now.toISOString() : new Date().toISOString(),
    now_restaurant_local: Number.isFinite(nowMs) ? zonedLocalLabel(now, timezone) : "",
    offer_date: "",
    offer_start_at_utc: "",
    offer_end_at_utc: "",
    booking_cutoff_at_utc: "",
    booking_cutoff_minutes: null,
    available_tables: 0,
    available_seats: 0
  };

  if (!offer) return result("unavailable", "OFFER_NOT_FOUND", details);

  const storedStatus = clean(offer.status || offer.offer_status || offer.deal_status).toLowerCase();
  if (storedStatus && !["active", "published"].includes(storedStatus)) {
    if (storedStatus === "sold_out") return result("sold_out", "OFFER_SOLD_OUT", details);
    if (storedStatus === "expired") return result("expired", "OFFER_EXPIRED", details);
    return result("unavailable", "OFFER_INACTIVE", details);
  }

  const offerDate = normalizeDate(offer.offer_date || offer.reservation_date || offer.valid_date);
  const requestedDate = normalizeDate(options.reservationDate || options.reservation_date || offerDate);
  const startTime = clean(offer.start_time || offer.offer_time);
  const endTime = clean(offer.end_time || startTime || "23:59");
  const requestedTime = clean(options.reservationTime || options.reservation_time || startTime);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const requestedMinutes = timeToMinutes(requestedTime);
  details.offer_date = offerDate;

  if (!offerDate || startMinutes === null || endMinutes === null || requestedMinutes === null) {
    return result("unavailable", "INVALID_OFFER_TIME", details);
  }
  if (requestedDate && requestedDate !== offerDate) {
    return result("unavailable", "OFFER_DATE_MISMATCH", details);
  }

  const endDate = endMinutes <= startMinutes ? addDays(offerDate, 1) : offerDate;
  const startMs = wallTimeToUtcMs(offerDate, startTime, timezone);
  const endMs = wallTimeToUtcMs(endDate, endTime, timezone);
  if (startMs === null || endMs === null || endMs <= startMs) {
    return result("unavailable", "INVALID_OFFER_TIME", details);
  }
  details.offer_start_at_utc = new Date(startMs).toISOString();
  details.offer_end_at_utc = new Date(endMs).toISOString();

  const cutoffMs = bookingCutoffMs(offer, startMs, timezone);
  if (cutoffMs !== null) {
    details.booking_cutoff_at_utc = new Date(cutoffMs).toISOString();
    details.booking_cutoff_minutes = Math.max(0, Math.round((startMs - cutoffMs) / 60000));
  }

  const selectedWithinWindow = endMinutes <= startMinutes
    ? (requestedMinutes >= startMinutes || requestedMinutes <= endMinutes)
    : (requestedMinutes >= startMinutes && requestedMinutes <= endMinutes);
  if (!selectedWithinWindow) {
    return result("unavailable", requestedMinutes < startMinutes ? "OFFER_NOT_STARTED" : "INVALID_OFFER_TIME", details);
  }

  details.available_tables = availableTablesForOffer(offer);
  details.available_seats = availableSeatsForOffer(offer);
  const partySize = Math.max(1, numberOr(options.partySize ?? options.party_size, 1));
  if (details.available_tables < 1 || details.available_seats < partySize || partySize > numberOr(offer.max_party_size, 4)) {
    return result("sold_out", "OFFER_SOLD_OUT", details);
  }

  if (nowMs > endMs) return result("expired", "OFFER_EXPIRED", details);
  if (cutoffMs !== null && nowMs > cutoffMs) return result("outside_booking_cutoff", "BOOKING_CUTOFF_PASSED", details);
  return result(nowMs < startMs ? "upcoming" : "active", "", details);
}

export function offerReservationError(validity) {
  return validity?.code ? {
    code: validity.code,
    error: validity.message || OFFER_ERROR_MESSAGES[validity.code] || OFFER_ERROR_MESSAGES.OFFER_UNAVAILABLE,
    offer_status: validity.status
  } : null;
}

export {
  DEFAULT_RESTAURANT_TIMEZONE,
  OFFER_ERROR_MESSAGES,
  availableTablesForOffer,
  availableSeatsForOffer,
  normalizeTimezone,
  wallTimeToUtcMs,
  zonedLocalLabel
};
