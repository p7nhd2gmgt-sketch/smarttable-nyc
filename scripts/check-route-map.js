import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return await readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const appSource = await read("public/app.js");

for (const token of [
  "function currentPublicGuestRoute()",
  "function renderPublicGuestInfoPage(",
  "function renderNotFoundRoute(",
  "function restaurantRouteSlug(",
  "function findPublicRestaurantBySlug(",
  "function routeForGuestAccountTab(",
  '"/restaurants"',
  '"/restaurants/"',
  '"/offers"',
  '"/signup"',
  '"/login"',
  '"/forgot-password"',
  '"/terms"',
  '"/privacy"',
  '"/contact"',
  '"/help"',
  '"/account/reservations"',
  '"/account/favorites"',
  '"/account/profile"',
  '"/account/preferences"',
  '"/account/notifications"',
  '"/account/reviews"',
  '"/account/security"',
  '"/partner/offers"',
  '"/partner/reservations"',
  '"/partner/profile"',
  '"/partner/analytics"',
  '"/partner/settings"',
  '"/admin/restaurants"',
  '"/admin/offers"',
  '"/admin/users"',
  '"/admin/notifications"',
  '"/admin/content"',
  '"/admin/platform-settings"'
]) {
  assert(appSource.includes(token), `Route map is missing ${token}.`);
}

for (const token of [
  'id="guest-offers"',
  'id="guest-restaurants"',
  'data-restaurant-slug',
  "history.pushState(null, \"\", `/restaurants/${button.dataset.restaurantSlug}`)",
  "history.pushState(null, \"\", routeForGuestAccountTab(state.guestAccountTab))"
]) {
  assert(appSource.includes(token), `Route-aware UI wiring is missing ${token}.`);
}

console.log("Route map checks passed.");
