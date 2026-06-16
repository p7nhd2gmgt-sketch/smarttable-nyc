import crypto from "node:crypto";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://smarttable.com").replace(/\/$/, "");
const EMAIL_FROM = process.env.EMAIL_FROM || "Smarttable.com <reservations@smarttable.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);

const allowedReservationStatuses = new Set(["requested", "confirmed", "completed", "cancelled", "no_show"]);
const allowedRestaurantStatuses = new Set(["pending", "approved", "suspended"]);
const allowedOfferStatuses = new Set(["active", "paused", "sold_out", "expired"]);

const demo = {
  booted: false,
  users: [],
  profiles: [],
  restaurants: [],
  offers: [],
  reservations: [],
  emailEvents: []
};

function nowIso() {
  return new Date().toISOString();
}

function json(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    },
    body
  };
}

function text(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    },
    body
  };
}

function clean(value) {
  return String(value ?? "").trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function ensureDemo() {
  if (demo.booted) return;
  demo.booted = true;

  const adminId = "00000000-0000-4000-8000-000000000001";
  const restaurantUserId = "00000000-0000-4000-8000-000000000002";
  const guestId = "00000000-0000-4000-8000-000000000003";
  const restaurantId = "10000000-0000-4000-8000-000000000001";
  const secondRestaurantId = "10000000-0000-4000-8000-000000000002";
  const offerId = "20000000-0000-4000-8000-000000000001";
  const secondOfferId = "20000000-0000-4000-8000-000000000002";

  demo.users = [
    { id: adminId, email: "admin@smarttable.com", password: "admin123" },
    { id: restaurantUserId, email: "owner@hudsonhearth.com", password: "restaurant123" },
    { id: guestId, email: "guest@smarttable.com", password: "guest123" }
  ];

  demo.profiles = [
    { id: adminId, email: "admin@smarttable.com", full_name: "Smarttable Admin", role: "admin", restaurant_id: null },
    { id: restaurantUserId, email: "owner@hudsonhearth.com", full_name: "Hudson Hearth Owner", role: "restaurant", restaurant_id: restaurantId },
    { id: guestId, email: "guest@smarttable.com", full_name: "Guest User", role: "guest", restaurant_id: null }
  ];

  demo.restaurants = [
    {
      id: restaurantId,
      name: "Hudson Hearth",
      legal_name: "Hudson Hearth LLC",
      contact_email: "reservations@hudsonhearth.example",
      phone: "+1 212 555 0188",
      address: "128 Perry St, New York, NY 10014",
      district: "West Village",
      cuisine: "New American",
      description: "A polished neighborhood bistro with stronger deals for early and late dinner windows.",
      status: "approved",
      rating: 4.8,
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: secondRestaurantId,
      name: "Casa Luna Trattoria",
      legal_name: "Casa Luna Hospitality Inc.",
      contact_email: "manager@casaluna.example",
      phone: "+1 212 555 0142",
      address: "242 Mott St, New York, NY 10012",
      district: "Nolita",
      cuisine: "Italian",
      description: "Warm trattoria energy, handmade pasta, and discounted tables between peak turns.",
      status: "pending",
      rating: 4.7,
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];

  const today = new Date().toISOString().slice(0, 10);
  demo.offers = [
    {
      id: offerId,
      restaurant_id: restaurantId,
      offer_date: today,
      offer_time: "18:00",
      seat_count: 12,
      reserved_seats: 0,
      discount_percent: 25,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso()
    },
    {
      id: secondOfferId,
      restaurant_id: restaurantId,
      offer_date: today,
      offer_time: "20:30",
      seat_count: 8,
      reserved_seats: 0,
      discount_percent: 30,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso()
    }
  ];
}

function tokenForProfile(profile) {
  return `demo.${Buffer.from(JSON.stringify({
    id: profile.id,
    role: profile.role,
    restaurant_id: profile.restaurant_id,
    exp: Date.now() + 1000 * 60 * 60 * 12
  })).toString("base64url")}`;
}

function profileFromDemoToken(token) {
  if (!token?.startsWith("demo.")) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.slice(5), "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    ensureDemo();
    return demo.profiles.find((profile) => profile.id === payload.id) || null;
  } catch {
    return null;
  }
}

function authToken(headers = {}) {
  const value = headers.authorization || headers.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

async function supabaseFetch(path, options = {}) {
  if (!supabaseConfigured) throw new Error("Supabase is not configured.");

  const service = options.service !== false;
  const key = service ? SUPABASE_SERVICE_ROLE_KEY : SUPABASE_ANON_KEY;
  const token = options.token || key;
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = raw;
    }
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error_description || payload?.error || raw || "Supabase request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.detail = payload;
    throw error;
  }

  return payload;
}

async function getSupabaseProfile(token) {
  const user = await supabaseFetch("/auth/v1/user", { service: false, token });
  const encodedId = encodeURIComponent(user.id);
  const rows = await supabaseFetch(`/rest/v1/profiles?select=*&id=eq.${encodedId}`, { service: true });
  return rows?.[0] || {
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email,
    role: "guest",
    restaurant_id: null
  };
}

async function requireProfile(headers, roles = []) {
  const token = authToken(headers);
  if (!token) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }

  const profile = supabaseConfigured ? await getSupabaseProfile(token) : profileFromDemoToken(token);
  if (!profile) {
    const error = new Error("Invalid or expired session.");
    error.status = 401;
    throw error;
  }

  if (roles.length && !roles.includes(profile.role)) {
    const error = new Error("You do not have access to this resource.");
    error.status = 403;
    throw error;
  }

  return { profile, token };
}

function publicOfferRows() {
  ensureDemo();
  return demo.offers
    .filter((offer) => offer.status === "active" && offer.seat_count > offer.reserved_seats)
    .map((offer) => {
      const restaurant = demo.restaurants.find((item) => item.id === offer.restaurant_id);
      if (!restaurant || restaurant.status !== "approved") return null;
      return {
        offer_id: offer.id,
        restaurant_id: restaurant.id,
        restaurant_name: restaurant.name,
        restaurant_email: restaurant.contact_email,
        district: restaurant.district,
        address: restaurant.address,
        cuisine: restaurant.cuisine,
        rating: restaurant.rating,
        description: restaurant.description,
        offer_date: offer.offer_date,
        offer_time: offer.offer_time,
        available_seats: offer.seat_count - offer.reserved_seats,
        discount_percent: offer.discount_percent
      };
    })
    .filter(Boolean);
}

function reservationOverviewRows() {
  ensureDemo();
  return demo.reservations.map((reservation) => {
    const offer = demo.offers.find((item) => item.id === reservation.offer_id);
    const restaurant = demo.restaurants.find((item) => item.id === reservation.restaurant_id);
    return {
      reservation_id: reservation.id,
      reference: reservation.reference,
      restaurant_id: reservation.restaurant_id,
      restaurant_name: restaurant?.name || "Restaurant",
      restaurant_email: restaurant?.contact_email || "",
      offer_id: reservation.offer_id,
      offer_date: offer?.offer_date || reservation.created_at.slice(0, 10),
      offer_time: offer?.offer_time || "",
      discount_percent: offer?.discount_percent || reservation.discount_percent || 0,
      party_size: reservation.party_size,
      guest_id: reservation.guest_id,
      guest_name: reservation.guest_name,
      guest_email: reservation.guest_email,
      guest_phone: reservation.guest_phone,
      notes: reservation.notes,
      status: reservation.status,
      created_at: reservation.created_at,
      updated_at: reservation.updated_at
    };
  });
}

async function sendEmail(message, context = {}) {
  const email = {
    to: message.to,
    from: EMAIL_FROM,
    subject: message.subject,
    text: message.text,
    html: message.html,
    delivery: RESEND_API_KEY ? "sent" : "demo-outbox",
    provider_id: null
  };

  if (RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "Email delivery failed.");
    }
    email.provider_id = payload.id || null;
  }

  if (supabaseConfigured) {
    await supabaseFetch("/rest/v1/email_events", {
      method: "POST",
      service: true,
      headers: { Prefer: "return=minimal" },
      body: {
        reservation_id: context.reservation_id || null,
        event_type: context.event_type || "notification",
        recipient: email.to,
        subject: email.subject,
        provider: RESEND_API_KEY ? "resend" : "demo",
        provider_id: email.provider_id,
        status: email.delivery
      }
    }).catch(() => null);
  } else {
    ensureDemo();
    demo.emailEvents.unshift({
      id: crypto.randomUUID(),
      reservation_id: context.reservation_id || null,
      event_type: context.event_type || "notification",
      recipient: email.to,
      subject: email.subject,
      provider: RESEND_API_KEY ? "resend" : "demo",
      status: email.delivery,
      created_at: nowIso()
    });
  }

  return email;
}

function reservationEmailText(row) {
  return `${row.restaurant_name}, ${row.offer_date} at ${row.offer_time}, ${row.party_size} ${row.party_size === 1 ? "guest" : "guests"}, ${row.discount_percent}% off`;
}

async function sendReservationCreatedEmails(row) {
  const summary = reservationEmailText(row);
  const confirmationUrl = `${PUBLIC_BASE_URL}/?reservation=${encodeURIComponent(row.reference)}`;
  return Promise.all([
    sendEmail({
      to: row.guest_email,
      subject: `Reservation request received: ${row.reference}`,
      text: `Hi ${row.guest_name}! We received your Smarttable reservation request: ${summary}. You will receive a confirmation email after the restaurant reviews it.`,
      html: `<h2>Reservation request received</h2><p>Hi ${row.guest_name}!</p><p>We received your Smarttable reservation request.</p><p><strong>${summary}</strong></p><p>Reference: ${row.reference}</p>`
    }, { reservation_id: row.reservation_id, event_type: "guest_request_received" }),
    sendEmail({
      to: row.restaurant_email,
      subject: `New Smarttable reservation: ${row.reference}`,
      text: `New reservation request: ${summary}. Guest: ${row.guest_name}, ${row.guest_email}, ${row.guest_phone}. Dashboard: ${confirmationUrl}`,
      html: `<h2>New reservation request</h2><p><strong>${summary}</strong></p><p>Guest: ${row.guest_name}<br>Email: ${row.guest_email}<br>Phone: ${row.guest_phone}</p><p>Notes: ${row.notes || "none"}</p>`
    }, { reservation_id: row.reservation_id, event_type: "restaurant_request_notice" })
  ]);
}

async function sendReservationStatusEmail(row) {
  if (!["confirmed", "cancelled", "completed"].includes(row.status)) return null;
  const subject = {
    confirmed: `Reservation confirmed: ${row.reference}`,
    cancelled: `Reservation cancelled: ${row.reference}`,
    completed: `Reservation completed: ${row.reference}`
  }[row.status];
  const message = {
    confirmed: "The restaurant confirmed your reservation.",
    cancelled: "The restaurant cancelled your reservation.",
    completed: "Thanks for dining with Smarttable."
  }[row.status];
  const summary = reservationEmailText(row);
  return sendEmail({
    to: row.guest_email,
    subject,
    text: `${message} ${summary}`,
    html: `<h2>${subject}</h2><p>${message}</p><p><strong>${summary}</strong></p><p>Reference: ${row.reference}</p>`
  }, { reservation_id: row.reservation_id, event_type: `reservation_${row.status}` });
}

async function login(body) {
  const email = lower(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json(400, { error: "Email and password are required." });

  if (!supabaseConfigured) {
    ensureDemo();
    const user = demo.users.find((item) => item.email === email && item.password === password);
    if (!user) return json(401, { error: "Invalid login credentials." });
    const profile = demo.profiles.find((item) => item.id === user.id);
    return json(200, {
      mode: "demo",
      access_token: tokenForProfile(profile),
      profile
    });
  }

  const session = await supabaseFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    service: false,
    body: { email, password }
  });
  const profile = await getSupabaseProfile(session.access_token);
  return json(200, {
    mode: "supabase",
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    profile
  });
}

async function signupGuest(body) {
  const email = lower(body.email);
  const password = String(body.password || "");
  const fullName = clean(body.full_name || body.name);
  if (!email || !password || !fullName) return json(400, { error: "Name, email, and password are required." });

  if (!supabaseConfigured) {
    ensureDemo();
    if (demo.users.some((item) => item.email === email)) return json(409, { error: "Account already exists." });
    const id = crypto.randomUUID();
    demo.users.push({ id, email, password });
    const profile = { id, email, full_name: fullName, role: "guest", restaurant_id: null };
    demo.profiles.push(profile);
    return json(201, { mode: "demo", access_token: tokenForProfile(profile), profile });
  }

  const signup = await supabaseFetch("/auth/v1/signup", {
    method: "POST",
    service: false,
    body: {
      email,
      password,
      data: { full_name: fullName }
    }
  });
  return json(201, { user: signup.user || signup, message: "Guest account created. Confirm email if Supabase email confirmation is enabled." });
}

async function listPublicOffers() {
  if (!supabaseConfigured) return json(200, { mode: "demo", offers: publicOfferRows() });
  const rows = await supabaseFetch("/rest/v1/public_available_offers?select=*&order=offer_date.asc,offer_time.asc", { service: false });
  return json(200, { mode: "supabase", offers: rows || [] });
}

async function createReservation(body, headers) {
  const offerId = clean(body.offer_id);
  const partySize = Number(body.party_size);
  const guest = {
    name: clean(body.guest_name || body.name),
    email: lower(body.guest_email || body.email),
    phone: clean(body.guest_phone || body.phone)
  };
  const notes = clean(body.notes);
  if (!offerId || !guest.name || !guest.email || !guest.phone || !Number.isInteger(partySize) || partySize < 1) {
    return json(400, { error: "Offer, guest contact details, and party size are required." });
  }

  if (!supabaseConfigured) {
    ensureDemo();
    const offer = demo.offers.find((item) => item.id === offerId);
    if (!offer || offer.status !== "active") return json(404, { error: "Offer not found." });
    if (offer.seat_count - offer.reserved_seats < partySize) return json(409, { error: "Not enough seats available." });
    const restaurant = demo.restaurants.find((item) => item.id === offer.restaurant_id);
    if (!restaurant || restaurant.status !== "approved") return json(409, { error: "Restaurant is not available for reservations." });
    const token = authToken(headers);
    const profile = profileFromDemoToken(token);
    offer.reserved_seats += partySize;
    const reservation = {
      id: crypto.randomUUID(),
      reference: `ST-${Math.floor(10000 + Math.random() * 90000)}`,
      offer_id: offer.id,
      restaurant_id: restaurant.id,
      guest_id: profile?.id || null,
      guest_name: guest.name,
      guest_email: guest.email,
      guest_phone: guest.phone,
      party_size: partySize,
      notes,
      status: "requested",
      created_at: nowIso(),
      updated_at: nowIso()
    };
    demo.reservations.unshift(reservation);
    const row = reservationOverviewRows().find((item) => item.reservation_id === reservation.id);
    const emails = await sendReservationCreatedEmails(row);
    return json(201, { reservation: row, emails });
  }

  const token = authToken(headers);
  const row = await supabaseFetch("/rest/v1/rpc/create_reservation", {
    method: "POST",
    service: false,
    token: token || undefined,
    body: {
      p_offer_id: offerId,
      p_guest_name: guest.name,
      p_guest_email: guest.email,
      p_guest_phone: guest.phone,
      p_party_size: partySize,
      p_notes: notes
    }
  });
  const emails = await sendReservationCreatedEmails(row);
  return json(201, { reservation: row, emails });
}

async function adminRestaurants(method, body, headers, query) {
  await requireProfile(headers, ["admin"]);

  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") return json(200, { restaurants: demo.restaurants });
    if (method === "POST") {
      const item = {
        id: crypto.randomUUID(),
        name: clean(body.name),
        legal_name: clean(body.legal_name),
        contact_email: lower(body.contact_email),
        phone: clean(body.phone),
        address: clean(body.address),
        district: clean(body.district),
        cuisine: clean(body.cuisine),
        description: clean(body.description),
        status: "pending",
        rating: Number(body.rating || 4.5),
        created_at: nowIso(),
        updated_at: nowIso()
      };
      demo.restaurants.unshift(item);
      return json(201, { restaurant: item });
    }
    if (method === "PATCH") {
      const item = demo.restaurants.find((restaurant) => restaurant.id === clean(body.id || query.get("id")));
      if (!item) return json(404, { error: "Restaurant not found." });
      const fields = ["name", "legal_name", "contact_email", "phone", "address", "district", "cuisine", "description", "rating"];
      for (const field of fields) if (body[field] !== undefined) item[field] = body[field];
      if (body.status && allowedRestaurantStatuses.has(body.status)) item.status = body.status;
      item.updated_at = nowIso();
      return json(200, { restaurant: item });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch("/rest/v1/restaurants?select=*&order=created_at.desc", { service: true });
      return json(200, { restaurants: rows || [] });
    }
    if (method === "POST") {
      const rows = await supabaseFetch("/rest/v1/restaurants?select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "return=representation" },
        body: {
          name: clean(body.name),
          legal_name: clean(body.legal_name),
          contact_email: lower(body.contact_email),
          phone: clean(body.phone),
          address: clean(body.address),
          district: clean(body.district),
          cuisine: clean(body.cuisine),
          description: clean(body.description),
          status: body.status && allowedRestaurantStatuses.has(body.status) ? body.status : "pending",
          rating: Number(body.rating || 4.5)
        }
      });
      return json(201, { restaurant: rows?.[0] });
    }
    if (method === "PATCH") {
      const id = clean(body.id || query.get("id"));
      const update = { ...body };
      delete update.id;
      if (update.status && !allowedRestaurantStatuses.has(update.status)) delete update.status;
      const rows = await supabaseFetch(`/rest/v1/restaurants?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: update
      });
      return json(200, { restaurant: rows?.[0] });
    }
  }

  return json(405, { error: "Method not allowed." });
}

async function adminReservations(method, body, headers) {
  await requireProfile(headers, ["admin"]);
  if (method === "GET") {
    if (!supabaseConfigured) return json(200, { reservations: reservationOverviewRows() });
    const rows = await supabaseFetch("/rest/v1/reservation_overview?select=*&order=created_at.desc", { service: true });
    return json(200, { reservations: rows || [] });
  }

  if (method === "PATCH") {
    const id = clean(body.id || body.reservation_id);
    const status = clean(body.status);
    if (!allowedReservationStatuses.has(status)) return json(400, { error: "Invalid reservation status." });
    const row = await updateReservationStatus(id, status, null);
    return json(200, { reservation: row });
  }

  return json(405, { error: "Method not allowed." });
}

async function adminStats(headers) {
  await requireProfile(headers, ["admin"]);
  if (!supabaseConfigured) {
    ensureDemo();
    const reservations = demo.reservations;
    return json(200, {
      stats: {
        restaurants_total: demo.restaurants.length,
        restaurants_pending: demo.restaurants.filter((item) => item.status === "pending").length,
        offers_active: demo.offers.filter((item) => item.status === "active").length,
        reservations_total: reservations.length,
        reservations_requested: reservations.filter((item) => item.status === "requested").length,
        seats_reserved: reservations.reduce((sum, item) => sum + item.party_size, 0)
      }
    });
  }
  const stats = await supabaseFetch("/rest/v1/rpc/admin_dashboard_stats", { method: "POST", service: true, body: {} });
  return json(200, { stats });
}

async function restaurantOffers(method, body, headers, query) {
  const { profile } = await requireProfile(headers, ["restaurant", "admin"]);
  const restaurantId = profile.role === "admin" ? clean(query.get("restaurant_id") || body.restaurant_id || profile.restaurant_id) : profile.restaurant_id;
  if (!restaurantId) return json(400, { error: "Restaurant profile is not linked to a restaurant." });

  if (!supabaseConfigured) {
    ensureDemo();
    if (method === "GET") return json(200, { offers: demo.offers.filter((offer) => offer.restaurant_id === restaurantId) });
    if (method === "POST") {
      const offer = {
        id: crypto.randomUUID(),
        restaurant_id: restaurantId,
        offer_date: clean(body.offer_date),
        offer_time: clean(body.offer_time),
        seat_count: Number(body.seat_count),
        reserved_seats: 0,
        discount_percent: Number(body.discount_percent),
        status: "active",
        created_at: nowIso(),
        updated_at: nowIso()
      };
      demo.offers.unshift(offer);
      return json(201, { offer });
    }
    if (method === "PATCH") {
      const offer = demo.offers.find((item) => item.id === clean(body.id) && item.restaurant_id === restaurantId);
      if (!offer) return json(404, { error: "Offer not found." });
      for (const field of ["offer_date", "offer_time", "seat_count", "discount_percent"]) {
        if (body[field] !== undefined) offer[field] = field.includes("count") || field.includes("percent") ? Number(body[field]) : clean(body[field]);
      }
      if (body.status && allowedOfferStatuses.has(body.status)) offer.status = body.status;
      offer.updated_at = nowIso();
      return json(200, { offer });
    }
  } else {
    if (method === "GET") {
      const rows = await supabaseFetch(`/rest/v1/offers?select=*&restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=offer_date.desc,offer_time.desc`, { service: true });
      return json(200, { offers: rows || [] });
    }
    if (method === "POST") {
      const rows = await supabaseFetch("/rest/v1/offers?select=*", {
        method: "POST",
        service: true,
        headers: { Prefer: "return=representation" },
        body: {
          restaurant_id: restaurantId,
          offer_date: clean(body.offer_date),
          offer_time: clean(body.offer_time),
          seat_count: Number(body.seat_count),
          discount_percent: Number(body.discount_percent),
          status: "active"
        }
      });
      return json(201, { offer: rows?.[0] });
    }
    if (method === "PATCH") {
      const id = clean(body.id);
      const update = { ...body };
      delete update.id;
      delete update.restaurant_id;
      if (update.status && !allowedOfferStatuses.has(update.status)) delete update.status;
      const rows = await supabaseFetch(`/rest/v1/offers?id=eq.${encodeURIComponent(id)}&restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=*`, {
        method: "PATCH",
        service: true,
        headers: { Prefer: "return=representation" },
        body: update
      });
      return json(200, { offer: rows?.[0] });
    }
  }

  return json(405, { error: "Method not allowed." });
}

async function updateReservationStatus(id, status, restaurantId) {
  if (!supabaseConfigured) {
    ensureDemo();
    const reservation = demo.reservations.find((item) => item.id === id);
    if (!reservation || (restaurantId && reservation.restaurant_id !== restaurantId)) {
      const error = new Error("Reservation not found.");
      error.status = 404;
      throw error;
    }
    reservation.status = status;
    reservation.updated_at = nowIso();
    const row = reservationOverviewRows().find((item) => item.reservation_id === id);
    await sendReservationStatusEmail(row);
    return row;
  }

  const existingRows = await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(id)}`, { service: true });
  const existing = existingRows?.[0];
  if (!existing || (restaurantId && existing.restaurant_id !== restaurantId)) {
    const error = new Error("Reservation not found.");
    error.status = 404;
    throw error;
  }
  await supabaseFetch(`/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    service: true,
    headers: { Prefer: "return=minimal" },
    body: { status }
  });
  const rows = await supabaseFetch(`/rest/v1/reservation_overview?select=*&reservation_id=eq.${encodeURIComponent(id)}`, { service: true });
  const row = rows?.[0];
  await sendReservationStatusEmail(row);
  return row;
}

async function restaurantReservations(method, body, headers) {
  const { profile } = await requireProfile(headers, ["restaurant", "admin"]);
  const restaurantId = profile.restaurant_id;
  if (!restaurantId && profile.role !== "admin") return json(400, { error: "Restaurant profile is not linked to a restaurant." });

  if (method === "GET") {
    if (!supabaseConfigured) {
      return json(200, { reservations: reservationOverviewRows().filter((row) => profile.role === "admin" || row.restaurant_id === restaurantId) });
    }
    const filter = profile.role === "admin" ? "" : `&restaurant_id=eq.${encodeURIComponent(restaurantId)}`;
    const rows = await supabaseFetch(`/rest/v1/reservation_overview?select=*${filter}&order=created_at.desc`, { service: true });
    return json(200, { reservations: rows || [] });
  }

  if (method === "PATCH") {
    const id = clean(body.id || body.reservation_id);
    const status = clean(body.status);
    if (!allowedReservationStatuses.has(status)) return json(400, { error: "Invalid reservation status." });
    const row = await updateReservationStatus(id, status, profile.role === "admin" ? null : restaurantId);
    return json(200, { reservation: row });
  }

  return json(405, { error: "Method not allowed." });
}

export async function handleApiRequest(input) {
  const url = new URL(input.url, "http://localhost");
  let pathname = url.pathname;
  if (pathname === "/api/index") {
    pathname = `/${url.searchParams.get("path") || ""}`;
  }
  pathname = pathname.replace(/^\/api\/?/, "/");
  const method = input.method || "GET";
  const body = input.body || {};
  const headers = input.headers || {};

  try {
    if (method === "GET" && pathname === "/health") {
      return json(200, { ok: true, mode: supabaseConfigured ? "supabase" : "demo", publicBaseUrl: PUBLIC_BASE_URL });
    }
    if (method === "POST" && pathname === "/auth/login") return await login(body);
    if (method === "POST" && pathname === "/auth/signup-guest") return await signupGuest(body);
    if (method === "GET" && pathname === "/auth/me") {
      const { profile } = await requireProfile(headers, []);
      return json(200, { profile });
    }
    if (method === "GET" && pathname === "/public/offers") return await listPublicOffers();
    if (method === "POST" && pathname === "/reservations") return await createReservation(body, headers);
    if (pathname === "/admin/restaurants") return await adminRestaurants(method, body, headers, url.searchParams);
    if (pathname === "/admin/reservations") return await adminReservations(method, body, headers);
    if (method === "GET" && pathname === "/admin/stats") return await adminStats(headers);
    if (pathname === "/restaurant/offers") return await restaurantOffers(method, body, headers, url.searchParams);
    if (pathname === "/restaurant/reservations") return await restaurantReservations(method, body, headers);
    return json(404, { error: "API endpoint not found." });
  } catch (error) {
    return json(error.status || 500, { error: error.message || "Server error." });
  }
}

export function isSupabaseConfigured() {
  return supabaseConfigured;
}
