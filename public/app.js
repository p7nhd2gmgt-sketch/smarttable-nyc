const state = {
  mode: "guest",
  apiMode: "loading",
  session: JSON.parse(localStorage.getItem("smarttable.session") || "null"),
  offers: [],
  restaurants: [],
  reservations: [],
  offersMine: [],
  stats: null
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const sessionButton = document.querySelector("#sessionButton");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function headers() {
  return {
    "content-type": "application/json",
    ...(state.session?.access_token ? { authorization: `Bearer ${state.session.access_token}` } : {})
  };
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: headers(),
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

function saveSession(session) {
  state.session = session;
  if (session) localStorage.setItem("smarttable.session", JSON.stringify(session));
  else localStorage.removeItem("smarttable.session");
  updateSessionButton();
}

function updateSessionButton() {
  sessionButton.textContent = state.session ? "Logout" : "Login";
}

function statusBadge(status) {
  return `<span class="status ${status}">${status.replace("_", " ")}</span>`;
}

function currencyDate(date, time) {
  return `${date} at ${time}`;
}

function layoutHero(inner) {
  return `
    <section class="mvp-hero">
      <div class="hero-media" aria-hidden="true"></div>
      <div class="mvp-hero-copy">
        <p class="eyebrow">Smarttable MVP</p>
        <h1>Discounted dining inventory, reservations, and restaurant operations.</h1>
        <p>New York restaurants publish discounted tables, guests request reservations, and teams track every status from request to completion.</p>
      </div>
      ${inner || ""}
    </section>
  `;
}

async function loadPublicOffers() {
  const payload = await api("/public/offers");
  state.apiMode = payload.mode || state.apiMode;
  state.offers = payload.offers || [];
}

function renderGuest() {
  const offers = state.offers.map((offer) => `
    <article class="restaurant-card offer-card">
      <div class="restaurant-photo" aria-hidden="true"></div>
      <div class="restaurant-body">
        <div class="restaurant-footer">
          <div>
            <h3>${offer.restaurant_name}</h3>
            <div class="restaurant-meta">
              <span>${offer.district}</span><span class="dot"></span><span>${offer.cuisine}</span><span class="dot"></span><span>${offer.rating}/5</span>
            </div>
          </div>
          <strong class="discount-pill">-${offer.discount_percent}%</strong>
        </div>
        <p class="muted">${offer.description}</p>
        <p class="muted">${currencyDate(offer.offer_date, offer.offer_time)} - ${offer.available_seats} seats available</p>
        <form class="mini-form" data-reserve="${offer.offer_id}">
          <input name="guest_name" placeholder="Name" required>
          <input name="guest_email" type="email" placeholder="Email" required>
          <input name="guest_phone" placeholder="Phone" required>
          <input name="party_size" type="number" min="1" max="${offer.available_seats}" value="2" required>
          <input name="notes" placeholder="Notes">
          <button class="primary-button wide" type="submit">Reserve</button>
        </form>
      </div>
    </article>
  `).join("");

  app.innerHTML = `
    ${layoutHero(`
      <section class="login-card">
        <span class="section-kicker">Marketplace status</span>
        <h2>${state.apiMode === "demo" ? "Demo mode" : "Supabase connected"}</h2>
        <p class="muted">${state.apiMode === "demo" ? "Connect Supabase env vars for production storage." : "Live database-backed reservations are enabled."}</p>
      </section>
    `)}
    <section class="section-title-row">
      <div>
        <span class="section-kicker">Guest booking</span>
        <h2>Available discounted tables</h2>
      </div>
      <span class="muted">${state.offers.length} offers</span>
    </section>
    <section class="restaurant-grid">${offers || '<div class="empty-state">No active offers yet.</div>'}</section>
  `;

  document.querySelectorAll("[data-reserve]").forEach((form) => {
    form.addEventListener("submit", submitReservation);
  });
}

async function submitReservation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.offer_id = form.dataset.reserve;
  data.party_size = Number(data.party_size);

  try {
    const payload = await api("/reservations", {
      method: "POST",
      body: JSON.stringify(data)
    });
    showToast(`Reservation created: ${payload.reservation.reference}`);
    await loadPublicOffers();
    renderGuest();
  } catch (error) {
    showToast(error.message);
  }
}

function renderLogin(role) {
  const title = role === "admin" ? "Admin login" : "Restaurant login";
  app.innerHTML = `
    ${layoutHero(`
      <form class="login-card" id="loginForm">
        <span class="section-kicker">${title}</span>
        <h2>${role === "admin" ? "Manage Smarttable" : "Manage restaurant inventory"}</h2>
        <label>Email<input name="email" type="email" value="${role === "admin" ? "admin@smarttable.com" : "owner@hudsonhearth.com"}" required></label>
        <label>Password<input name="password" type="password" value="${role === "admin" ? "admin123" : "restaurant123"}" required></label>
        <button class="primary-button wide" type="submit">Login</button>
        ${state.apiMode === "demo" ? '<p class="form-note">Demo credentials are prefilled until Supabase is connected.</p>' : ""}
      </form>
    `)}
  `;
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))
      });
      saveSession(payload);
      state.mode = payload.profile.role === "admin" ? "admin" : "restaurant";
      await renderCurrentMode();
      showToast("Logged in.");
    } catch (error) {
      showToast(error.message);
    }
  });
}

async function loadAdminData() {
  const [stats, restaurants, reservations] = await Promise.all([
    api("/admin/stats"),
    api("/admin/restaurants"),
    api("/admin/reservations")
  ]);
  state.stats = stats.stats;
  state.restaurants = restaurants.restaurants || [];
  state.reservations = reservations.reservations || [];
}

function statCard(label, value) {
  return `<article class="stat-card"><span>${label}</span><strong>${value ?? 0}</strong></article>`;
}

function renderAdmin() {
  if (!state.session || state.session.profile.role !== "admin") return renderLogin("admin");
  const stats = state.stats || {};
  app.innerHTML = `
    <section class="dashboard-head">
      <div>
        <span class="section-kicker">Admin dashboard</span>
        <h1>Smarttable operations</h1>
      </div>
      <button class="primary-button" id="refreshAdmin" type="button">Refresh</button>
    </section>
    <section class="stats-grid">
      ${statCard("Restaurants", stats.restaurants_total)}
      ${statCard("Pending approvals", stats.restaurants_pending)}
      ${statCard("Active offers", stats.offers_active)}
      ${statCard("Reservations", stats.reservations_total)}
      ${statCard("Requested", stats.reservations_requested)}
      ${statCard("Seats reserved", stats.seats_reserved)}
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Restaurants</span><h2>Manage restaurants</h2></div>
        </div>
        <form class="mini-form horizontal" id="restaurantForm">
          <input name="name" placeholder="Restaurant name" required>
          <input name="contact_email" type="email" placeholder="Contact email" required>
          <input name="phone" placeholder="Phone">
          <input name="address" placeholder="Address" required>
          <input name="district" placeholder="Neighborhood" required>
          <input name="cuisine" placeholder="Cuisine" required>
          <button class="primary-button" type="submit">Add</button>
        </form>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Status</th><th>Contact</th><th></th></tr></thead>
            <tbody>
              ${state.restaurants.map((restaurant) => `
                <tr>
                  <td>${restaurant.name}<br><span class="muted">${restaurant.district} - ${restaurant.cuisine}</span></td>
                  <td>${statusBadge(restaurant.status)}</td>
                  <td>${restaurant.contact_email}</td>
                  <td>${restaurant.status !== "approved" ? `<button class="ghost-button" data-approve="${restaurant.id}" type="button">Approve</button>` : ""}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Reservations</span><h2>Track reservations</h2></div>
        </div>
        ${reservationTable(state.reservations, true)}
      </article>
    </section>
  `;
  document.querySelector("#refreshAdmin").addEventListener("click", async () => {
    await loadAdminData();
    renderAdmin();
  });
  document.querySelector("#restaurantForm").addEventListener("submit", submitRestaurant);
  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => approveRestaurant(button.dataset.approve));
  });
  bindReservationStatusButtons("/admin/reservations", loadAdminData, renderAdmin);
}

async function submitRestaurant(event) {
  event.preventDefault();
  try {
    await api("/admin/restaurants", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))
    });
    await loadAdminData();
    renderAdmin();
    showToast("Restaurant added.");
  } catch (error) {
    showToast(error.message);
  }
}

async function approveRestaurant(id) {
  try {
    await api("/admin/restaurants", {
      method: "PATCH",
      body: JSON.stringify({ id, status: "approved" })
    });
    await loadAdminData();
    renderAdmin();
    showToast("Restaurant approved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadRestaurantData() {
  const [offers, reservations] = await Promise.all([
    api("/restaurant/offers"),
    api("/restaurant/reservations")
  ]);
  state.offersMine = offers.offers || [];
  state.reservations = reservations.reservations || [];
}

function renderRestaurant() {
  if (!state.session || !["restaurant", "admin"].includes(state.session.profile.role)) return renderLogin("restaurant");
  app.innerHTML = `
    <section class="dashboard-head">
      <div>
        <span class="section-kicker">Restaurant dashboard</span>
        <h1>${state.session.profile.full_name || "Restaurant operator"}</h1>
      </div>
      <button class="primary-button" id="refreshRestaurant" type="button">Refresh</button>
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Inventory</span><h2>Create discounted table offers</h2></div>
        </div>
        <form class="mini-form horizontal" id="offerForm">
          <input name="offer_date" type="date" required>
          <input name="offer_time" type="time" required>
          <input name="seat_count" type="number" min="1" placeholder="Seats" required>
          <input name="discount_percent" type="number" min="1" max="90" placeholder="Discount %" required>
          <button class="primary-button" type="submit">Create</button>
        </form>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Seats</th><th>Discount</th><th>Status</th></tr></thead>
            <tbody>
              ${state.offersMine.map((offer) => `
                <tr>
                  <td>${offer.offer_date} ${offer.offer_time}</td>
                  <td>${offer.reserved_seats || 0}/${offer.seat_count}</td>
                  <td>${offer.discount_percent}%</td>
                  <td>${statusBadge(offer.status)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </article>
      <article class="panel">
        <div class="section-title-row compact">
          <div><span class="section-kicker">Reservations</span><h2>Manage reservations</h2></div>
        </div>
        ${reservationTable(state.reservations, false)}
      </article>
    </section>
  `;
  document.querySelector("#refreshRestaurant").addEventListener("click", async () => {
    await loadRestaurantData();
    renderRestaurant();
  });
  document.querySelector("#offerForm").addEventListener("submit", submitOffer);
  bindReservationStatusButtons("/restaurant/reservations", loadRestaurantData, renderRestaurant);
}

async function submitOffer(event) {
  event.preventDefault();
  try {
    await api("/restaurant/offers", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries()))
    });
    await loadRestaurantData();
    renderRestaurant();
    showToast("Offer created.");
  } catch (error) {
    showToast(error.message);
  }
}

function reservationTable(rows, showRestaurant) {
  if (!rows.length) return '<div class="empty-state">No reservations yet.</div>';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Reference</th>${showRestaurant ? "<th>Restaurant</th>" : ""}<th>Guest</th><th>Table</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${rows.map((reservation) => `
            <tr>
              <td>${reservation.reference}</td>
              ${showRestaurant ? `<td>${reservation.restaurant_name}</td>` : ""}
              <td>${reservation.guest_name}<br><span class="muted">${reservation.guest_email}</span></td>
              <td>${reservation.offer_date} ${reservation.offer_time}<br><span class="muted">${reservation.party_size} guests - ${reservation.discount_percent}% off</span></td>
              <td>${statusBadge(reservation.status)}</td>
              <td>
                <div class="button-row">
                  <button class="ghost-button" data-status="confirmed" data-reservation="${reservation.reservation_id}" type="button">Confirm</button>
                  <button class="ghost-button" data-status="completed" data-reservation="${reservation.reservation_id}" type="button">Complete</button>
                  <button class="ghost-button" data-status="cancelled" data-reservation="${reservation.reservation_id}" type="button">Cancel</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function bindReservationStatusButtons(endpoint, reload, render) {
  document.querySelectorAll("[data-reservation]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(endpoint, {
          method: "PATCH",
          body: JSON.stringify({ id: button.dataset.reservation, status: button.dataset.status })
        });
        await reload();
        render();
        showToast("Reservation updated.");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

async function renderCurrentMode() {
  updateSessionButton();
  if (state.mode === "admin") {
    if (state.session?.profile.role === "admin") await loadAdminData();
    renderAdmin();
    return;
  }
  if (state.mode === "restaurant") {
    if (state.session && ["restaurant", "admin"].includes(state.session.profile.role)) await loadRestaurantData();
    renderRestaurant();
    return;
  }
  await loadPublicOffers();
  renderGuest();
}

function bindNav() {
  document.querySelector("#guestNav").addEventListener("click", async () => {
    state.mode = "guest";
    await renderCurrentMode();
  });
  document.querySelector("#adminNav").addEventListener("click", async () => {
    state.mode = "admin";
    await renderCurrentMode();
  });
  document.querySelector("#restaurantNav").addEventListener("click", async () => {
    state.mode = "restaurant";
    await renderCurrentMode();
  });
  sessionButton.addEventListener("click", async () => {
    if (state.session) {
      saveSession(null);
      state.mode = "guest";
      await renderCurrentMode();
      showToast("Logged out.");
    } else {
      state.mode = "admin";
      renderLogin("admin");
    }
  });
}

async function boot() {
  bindNav();
  updateSessionButton();
  try {
    const health = await api("/health");
    state.apiMode = health.mode;
  } catch {
    state.apiMode = "offline";
  }
  await renderCurrentMode();
}

boot().catch((error) => {
  app.innerHTML = `<div class="empty-state">${error.message}</div>`;
});
