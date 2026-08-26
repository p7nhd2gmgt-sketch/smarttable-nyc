import { readFileSync } from "node:fs";

const files = {
  migration: "supabase/migrations/0060_verified_post_visit_workflow.sql",
  server: "src/app-core.js",
  client: "public/app.js",
  shared: "public/shared-contracts.js",
  en: "public/locales/en.json",
  es: "public/locales/es.json",
  hu: "public/locales/hu.json"
};

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
  }
}

const migration = read(files.migration);
const server = read(files.server);
const client = read(files.client);
const shared = read(files.shared);
const localeDocs = [files.en, files.es, files.hu].map((path) => [path, JSON.parse(read(path))]);
const postVisitNotificationWriter = server.slice(
  server.indexOf("async function createPostVisitNotificationEvent"),
  server.indexOf("async function createPostVisitActionToken")
);
const verifiedReviewWriter = server.slice(
  server.indexOf("async function guestVerifiedReview"),
  server.indexOf("async function guestReviewPhotoSignUpload")
);

[
  "arrival_status",
  "arrived_at",
  "arrival_source",
  "visit_status",
  "visit_started_at",
  "visit_completed_at",
  "completion_source",
  "expected_visit_duration_minutes",
  "review_eligible_at",
  "review_invitation_sent_at",
  "review_submitted_at",
  "verified_visit",
  "post_visit_workflow_version"
].forEach((column) => assert(migration.includes(column), `migration missing reservation column ${column}`));

[
  "review_photos",
  "post_visit_action_tokens",
  "post_visit_notification_events",
  "idx_restaurant_reviews_one_verified_per_reservation",
  "token_hash text not null unique",
  "enable row level security",
  "restaurant_reviews_set_verified_defaults",
  "review_photos_limit",
  "arrival_status in ('not_requested', 'pending', 'arrived', 'on_the_way', 'cannot_attend', 'no_show')",
  "drop policy if exists restaurant_reviews_insert_public",
  "revoke insert on public.restaurant_reviews from anon"
].forEach((needle) => assert(migration.includes(needle), `migration missing ${needle}`));

assert(!/drop\s+table/i.test(migration), "migration must not drop tables");
assert(!/truncate\s+/i.test(migration), "migration must not truncate data");
assert(server.includes("postVisitTokenHash") && server.includes("crypto.createHash(\"sha256\")"), "server must hash action tokens");
assert(server.includes("postVisitAction") && server.includes("/post-visit/action"), "server missing post-visit action endpoint");
assert(server.includes("guestVerifiedReview") && server.includes("/guest/reviews/verified"), "server missing verified review endpoint");
assert(server.includes("guestReviewPhotoSignUpload") && server.includes("/guest/reviews/photos/sign-upload"), "server missing review photo signing endpoint");
assert(server.includes("publicRestaurantReviews") && server.includes("/public/restaurants/reviews"), "server missing public verified reviews endpoint");
assert(server.includes("reviewEligibility") && server.includes("verified_visit"), "server missing verified review eligibility");
assert(server.includes("createPostVisitNotificationEvent") && !server.includes("POST_VISIT_SEND_EMAIL_AUTOMATICALLY"), "server should record events without automatic email sends");
assert(server.includes("postVisitNotificationType") && server.includes("notification_type: notificationType"), "server must write post-visit notification_type");
assert(server.includes("postVisitNotificationChannel") && server.includes("guest_id: nullableClean(row.guest_id)"), "server must normalize notification channel and guest_id");
assert(!/(^|[^\w])event_type:\s*eventType/.test(postVisitNotificationWriter), "server must not write legacy event_type into post_visit_notification_events");
assert(verifiedReviewWriter.includes('moderation_status: "pending_moderation"') && !verifiedReviewWriter.includes('moderation_status: "pending",'), "review photo metadata must use pending_moderation");
const legacyReviewRoute = `"/public/${"reviews"}"`;
const legacyReviewApiRoute = `"/api/public/${"reviews"}"`;
assert(!server.includes(legacyReviewRoute) && !server.includes(legacyReviewApiRoute), "legacy public review endpoints must remain inactive");
assert(shared.includes("\"removed\""), "shared review statuses should include removed moderation state");

[
  "renderPostVisitActionPage",
  "renderVerifiedReviewPage",
  "publicRestaurantReviewsSection",
  "publicReviewPhotoGrid",
  "reviewPhotoLightbox",
  "partnerReviewResponseEditor",
  "submitPartnerReviewResponse",
  "adminReviewResponseModeration",
  "data-guest-visit-action",
  "data-visit-action",
  "data-review-response-status",
  "/review/verified",
  "/post-visit/action",
  "\"/post-visit/action\", \"/review/verified\""
].forEach((needle) => assert(client.includes(needle), `client missing ${needle}`));

[
  "partnerReviewResponseFromMetadata",
  "publicPartnerReviewResponse",
  "partner_review_response_submitted",
  "review_response_moderated",
  "response_status",
  "restaurant_response"
].forEach((needle) => assert(server.includes(needle), `server missing partner review response support: ${needle}`));

assert(!client.includes("Restaurant replies are not enabled yet"), "partner dashboard must not show a disabled restaurant response placeholder");
assert(!client.includes("Restaurant replies are coming soon"), "partner dashboard must not show coming-soon review response copy");

const requiredLocaleKeys = [
  "post_visit_status_label",
  "post_visit_status_not_requested",
  "post_visit_status_cannot_attend",
  "post_visit_action_arrived",
  "post_visit_action_finished",
  "verified_visit_badge",
  "verified_review_title",
  "verified_review_submitted_message",
  "review_atmosphere_label",
  "review_photos_label",
  "verified_reviews_title",
  "guest_photos_label",
  "no_reviews_yet",
  "partner_review_response_title",
  "partner_review_response_submit",
  "partner_review_response_public_label",
  "mark_arrived_button",
  "mark_visit_completed_button"
];

for (const [path, doc] of localeDocs) {
  for (const key of requiredLocaleKeys) {
    assert(typeof doc[key] === "string" && doc[key].trim(), `${path} missing locale key ${key}`);
  }
}

if (!process.exitCode) {
  console.log("PASS post-visit workflow static checks");
}
