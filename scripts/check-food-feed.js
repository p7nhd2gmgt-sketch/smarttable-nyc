import assert from "node:assert/strict";
import { readRepoFile } from "./billing-check-helpers.mjs";

const [migration, favoritesMigration, appCore, publicApp, styles, indexHtml, securityHeaders, vercelConfig, en, hu, es] = await Promise.all([
  readRepoFile("supabase/migrations/0065_food_feed.sql"),
  readRepoFile("supabase/migrations/0066_food_feed_favorites.sql"),
  readRepoFile("src/app-core.js"),
  readRepoFile("public/app.js"),
  readRepoFile("public/styles.css"),
  readRepoFile("public/index.html"),
  readRepoFile("src/security-headers.js"),
  readRepoFile("vercel.json"),
  readRepoFile("public/locales/en.json").then(JSON.parse),
  readRepoFile("public/locales/hu.json").then(JSON.parse),
  readRepoFile("public/locales/es.json").then(JSON.parse)
]);

for (const token of [
  "create table if not exists public.food_feed_videos",
  "media_type text not null default 'video'",
  "media_type in ('video', 'image')",
  "'image/jpeg', 'image/png', 'image/webp'",
  "duration_ms between 2500 and 3500",
  "height > width",
  "case when media_type = 'image' then 10485760 else 20971520 end",
  "alter table public.food_feed_videos enable row level security",
  "revoke insert, update, delete, truncate, references, trigger",
  "food_feed_videos_public_read",
  "food_feed_videos_partner_read",
  "food_feed_videos_admin_manage",
  "public.is_admin() or public.owns_restaurant(restaurant_id)",
  "'food-feed-videos'",
  "false,",
  "create index if not exists food_feed_videos_public_idx",
  "create trigger food_feed_videos_set_updated_at"
]) {
  assert(migration.includes(token), `Food Feed migration is missing: ${token}`);
}

for (const unsafe of [/drop\s+table/i, /truncate\s+table/i, /delete\s+from/i]) {
  assert(!unsafe.test(migration), `Food Feed migration contains unsafe SQL: ${unsafe}`);
}

for (const token of [
  "create table if not exists public.food_feed_favorites",
  "guest_user_id uuid not null references auth.users(id) on delete cascade",
  "food_feed_video_id uuid not null references public.food_feed_videos(id) on delete cascade",
  "unique (guest_user_id, food_feed_video_id)",
  "alter table public.food_feed_favorites enable row level security",
  "food_feed_favorites_guest_read",
  "food_feed_favorites_guest_insert",
  "food_feed_favorites_guest_delete",
  "guest_user_id = auth.uid()",
  "video.status = 'published'",
  "video.is_test_data is false",
  "revoke all on public.food_feed_favorites from anon",
  "revoke update, truncate, references, trigger on public.food_feed_favorites from authenticated"
]) {
  assert(favoritesMigration.includes(token), `Food Feed favorites migration is missing: ${token}`);
}

for (const unsafe of [/drop\s+table/i, /truncate\s+table/i, /delete\s+from/i, /update\s+public\./i]) {
  assert(!unsafe.test(favoritesMigration), `Food Feed favorites migration contains unsafe data SQL: ${unsafe}`);
}

for (const token of [
  '"/public/food-feed"',
  '"/partner/food-feed"',
  '"/admin/food-feed"',
  "validFoodFeedMediaInput",
  "requireRestaurantAccessRole(restaurant, [\"owner\", \"manager\"])",
  "status=eq.published",
  "is_test_data=eq.false",
  "visible_on_guest_site === false",
  "restaurantRow.is_test_restaurant === true",
  "Invalid restaurant video path.",
  "The selected offer does not belong to this restaurant.",
  "food_feed_video_submitted",
  "food_feed_video_moderated",
  "signedFoodFeedMediaUrl",
  "randomizeFoodFeedVideos",
  "query.get(\"fresh\")",
  "Only Super Admin can upload Crave media.",
  "food_feed_media_uploaded_by_superadmin",
  "publish_immediately"
]) {
  assert(appCore.includes(token), `Food Feed server contract is missing: ${token}`);
}

for (const token of [
  '"/guest/food-feed-favorites"',
  "guestFoodFeedFavorites",
  'requireProfile(headers, ["guest"])',
  "food_feed_video_id",
  "status=eq.published",
  "is_test_data=eq.false"
]) {
  assert(appCore.includes(token), `Food Feed favorites server contract is missing: ${token}`);
}

assert(appCore.includes('const userLat = optionalFiniteNumber(query.get("lat"));'), "Public Food Feed must not interpret a missing latitude as zero.");
assert(appCore.includes('const userLng = optionalFiniteNumber(query.get("lng"));'), "Public Food Feed must not interpret a missing longitude as zero.");
for (const token of [
  'query.get("preview_restaurant_id")',
  'boolValue(query.get("include_test_data"))',
  '"FOOD_FEED_PREVIEW_RESTAURANT_REQUIRED"',
  'is_test_data=eq.true&restaurant_id=eq.${previewRestaurantId}',
  'preview_only: previewMode',
  'preview_mode: previewMode',
  'is_test_data: previewMode && boolValue(video.is_test_data)'
]) {
  assert(appCore.includes(token), `Food Feed test preview server boundary is missing: ${token}`);
}
assert(!publicApp.includes("data-food-feed-sound"), "Public Food Feed must not render a sound control.");
assert(!publicApp.includes("food-feed-sound"), "Public Food Feed must not include sound-control styling or handlers.");
assert(publicApp.includes('class="food-feed-restaurant-link" type="button" data-food-feed-open='), "The visible restaurant name must open the restaurant profile.");
assert(!publicApp.includes('class="ghost-button" type="button" data-food-feed-open='), "Crave must not duplicate the restaurant profile link with a second button.");
assert(publicApp.includes('class="primary-button" type="button" data-food-feed-book='), "Crave must retain the Book a table action.");
assert(publicApp.includes('"/partner/food-feed": "#partner-food-feed"'), "Legacy Partner food-video links must target the embedded profile manager.");
assert(publicApp.includes('"/partner/food-feed": "profile"'), "Legacy Partner food-video links must open the Restaurant Profile tab.");
assert(!/key:\s*"food-feed",\s*label:\s*t\("partner_food_feed_tab"/.test(publicApp), "Food-video management must not occupy a primary Partner navigation tab.");
assert(publicApp.includes('${partnerProfilePanel}${partnerFoodFeedPanel()}'), "Restaurant Profile must include Partner food-video management.");
for (const token of [
  "foodFeedPreviewRequest",
  'query.set("include_test_data", preview.includeTestData ? "true" : "false")',
  'query.set("preview_restaurant_id", preview.restaurantId)',
  'video.preview_mode === true',
  'data-food-feed-preview-note',
  'if (foodFeedPreviewRequest().enabled) return;'
]) {
  assert(publicApp.includes(token), `Food Feed test preview client boundary is missing: ${token}`);
}

for (const token of [
  'path === "/food-feed"',
  "foodFeedPage",
  "prepareFoodFeedCycle",
  "appendNextFoodFeedCycle",
  "bindInfiniteFoodFeedScroll",
  "IntersectionObserver",
  "navigator.geolocation.getCurrentPosition",
  "data-food-feed-video",
  "muted loop playsinline",
  "readFoodFeedVideoMetadata",
  "readFoodFeedImageMetadata",
  "submitAdminFoodFeed",
  'accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"',
  "duration_ms: Math.round(video.duration * 1000)",
  "metadata.height <= metadata.width",
  "partnerFoodFeedPanel",
  "adminFoodFeedPanel",
  "data-partner-food-feed-status",
  "data-admin-food-feed-status"
]) {
  assert(publicApp.includes(token), `Food Feed client is missing: ${token}`);
}


for (const token of [
  "data-food-feed-favorite",
  "showFoodFeedFavoriteAuthPrompt",
  "data-food-feed-auth-login",
  "data-food-feed-auth-signup",
  "data-remove-food-favorite",
  "savedFoodFeedDishesPanel",
  'state.postLoginRedirect = `/food-feed?favorite=${encodeURIComponent(videoId)}`'
]) {
  assert(publicApp.includes(token), `Food Feed favorites client is missing: ${token}`);
}

assert(publicApp.includes('if (rawDistance === null || rawDistance === undefined || rawDistance === "") return "";'), "Food Feed must hide distance until the guest shares a location.");

assert(indexHtml.includes('id="foodFeedNav"'), "Public navigation must expose Food Feed.");
assert(styles.includes("scroll-snap-type: y mandatory"), "Food Feed must use vertical snap navigation.");
assert(styles.includes("body.food-feed-route"), "Food Feed must use its dedicated full-screen route shell.");
assert(styles.includes("height: 100dvh"), "Food Feed must fill the stable mobile viewport height.");
assert(styles.includes(".food-feed-toolbar"), "Food Feed must retain accessible full-screen controls.");
assert(styles.includes("--food-feed-reel-width"), "Food Feed must constrain desktop media to a portrait reel frame.");
assert(styles.includes("min(450px, calc(100dvh * 0.5625), 100vw)"), "Food Feed desktop reel must avoid excessive source upscaling.");
assert(styles.includes("@media (min-width: 721px)"), "Food Feed must define a dedicated tablet and desktop layout.");
assert(styles.includes("object-fit: contain"), "Food Feed desktop media must remain fully visible without destructive cropping.");
assert(publicApp.includes('class="food-feed-grid" data-food-feed-grid'), "Food Feed must render a dedicated responsive grid container.");
assert(publicApp.includes('const grid = stream?.querySelector("[data-food-feed-grid]");'), "Infinite Food Feed loading must append into the responsive grid container.");
assert(styles.includes("@media (min-width: 1024px)"), "Food Feed must define a desktop-only mosaic breakpoint.");
assert(styles.includes("column-count: 4"), "Desktop Food Feed must start with a multi-column masonry layout.");
assert(styles.includes("column-count: 5"), "Wide desktop Food Feed must expand the masonry layout.");
assert(styles.includes("break-inside: avoid"), "Desktop Food Feed cards must not split between masonry columns.");
assert(styles.includes("scroll-snap-type: none"), "Desktop Food Feed must disable mobile reel snapping.");
assert(styles.includes("@media (max-width: 720px)"), "Food Feed must retain its dedicated mobile reel layout.");
assert(styles.includes("-webkit-line-clamp: 2"), "Crave descriptions must stay compact across viewports.");
assert(appCore.includes("width < 720 || height < 1280"), "Food Feed backend must reject low-resolution media.");
assert(publicApp.includes("metadata.width < 720 || metadata.height < 1280"), "Food Feed upload UI must reject low-resolution media before upload.");
assert(styles.includes(".food-feed-management-grid"), "Partner/admin management layout is missing.");
assert(styles.includes(".food-feed-favorite"), "Food Feed favorite control styling is missing.");
assert(styles.includes(".food-feed-favorite-icon"), "Food Feed favorite star icon styling is missing.");
assert(styles.includes(".food-feed-preview-badge"), "Food Feed test preview badge styling is missing.");
assert(styles.includes(".food-feed-preview-note"), "Food Feed test preview safety note styling is missing.");
assert(!publicApp.includes('class="food-feed-favorite-label"'), "Food Feed favorite control must render only the star icon.");
assert(publicApp.includes('"&#9733;" : "&#9734;"'), "Food Feed favorites must use a star icon.");
assert(styles.includes(".food-feed-auth-dialog"), "Food Feed authentication prompt styling is missing.");
assert(styles.includes(".saved-dishes-grid"), "Saved Food Feed dish layout is missing.");
assert(!publicApp.includes("food-feed-position"), "Food Feed must not expose a finite list position.");
assert(securityHeaders.includes("media-src 'self' blob: https:"), "Server CSP must permit local Food Feed metadata previews and signed HTTPS media.");
assert(vercelConfig.includes("media-src 'self' blob: https:"), "Vercel CSP must permit local Food Feed metadata previews and signed HTTPS media.");
assert(securityHeaders.includes("geolocation=(self)"), "Server Permissions-Policy must allow Food Feed geolocation on SmartTable only.");
assert(vercelConfig.includes("geolocation=(self)"), "Vercel Permissions-Policy must allow Food Feed geolocation on SmartTable only.");

for (const [locale, messages] of Object.entries({ en, hu, es })) {
  for (const key of [
    "nav_food_feed",
    "food_feed_title",
    "food_feed_use_location",
    "food_feed_view_restaurant",
    "food_feed_book_table",
    "partner_food_feed_title",
    "partner_food_feed_rules",
    "admin_food_feed_title",
    "admin_food_feed_publish",
    "admin_food_feed_restaurant",
    "admin_food_feed_file",
    "admin_food_feed_publish_immediately",
    "admin_food_feed_upload",
    "food_feed_add_favorite",
    "food_feed_remove_favorite",
    "food_feed_favorite_login_title",
    "food_feed_favorite_login_body",
    "food_feed_favorite_login_button",
    "food_feed_favorite_signup_button",
    "food_feed_saved_dishes_title",
    "food_feed_saved_dishes_empty",
    "food_feed_test_preview_title",
    "food_feed_test_preview_badge",
    "food_feed_test_preview_note"
  ]) {
    assert(typeof messages[key] === "string" && messages[key].trim(), `${locale} is missing Food Feed translation ${key}.`);
  }
}

console.log("Food Feed checks passed.");
