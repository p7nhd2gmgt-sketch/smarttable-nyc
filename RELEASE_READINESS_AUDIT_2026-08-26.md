# SmartTable release-readiness audit — updated 2026-08-27

## Decision

Overall status: **NOT READY for a combined Web + Guest App + Partner App public release**.

The web application passed the complete local release audit and the non-production preview and staging checks performed in this audit. The mobile code, tests, Expo Doctor checks, and unsigned platform exports passed. A controlled staging Guest-to-Partner reservation lifecycle, verified-review photo transaction, and restricted staging-email transaction also passed without touching production or applying migrations. The combined release remains blocked by signed mobile builds, physical-device acceptance testing, store and deep-link setup, native remote-push integration, and approved non-test Crave launch media.

## Verified results

- Web release audit: PASS.
- Web unit/integration regressions: PASS.
- Playwright web E2E: 40/40 PASS.
- Web build, lint, TypeScript, route map, accessibility, security boundaries, secret scan, analytics, billing, Stripe webhook, and migration-chain checks: PASS.
- Guest + Shared Mobile Core tests: 88/88 PASS across 23 test files.
- Partner App tests: 42/42 PASS across 7 suites.
- Mobile strict TypeScript: PASS.
- Expo Doctor: Guest 21/21 PASS; Partner 21/21 PASS.
- Unsigned release exports: Guest Android PASS, Guest iOS PASS, Partner Android PASS, Partner iOS PASS.
- Staging authentication: Guest, Partner, Admin, and Superadmin login, refresh, direct-route protection, forbidden-route handling, and logout PASS.
- Staging Crave: preview API inventory PASS; mobile rendering PASS; real video playback PASS; test-content isolation PASS; no test-content leak into the normal public feed.
- Staging reservation and verified review: PASS. A canonical staging test Guest created a test reservation, the staging Partner moved it through `pending -> accepted -> arrived -> completed`, review eligibility became active, a verified review with an uploaded photo was persisted, the photo remained attached to the exact review, and a duplicate submission was rejected with HTTP 409.
- Staging email: PASS. The restricted Resend staging sender and recipient allowlist are configured in the ignored protected staging environment. Reservation creation and acceptance messages were accepted by the provider with zero failures; no credential value was logged or committed.
- Staging safety restoration: PASS. The canonical test restaurant was exposed only inside the controlled transaction window, stayed marked as test data, remained excluded by normal public test-data filters, and was verified hidden again after the test.
- Native mobile push contract: DEFERRED/GATED. The web backend currently supports Web Push, while the Shared Mobile Core correctly refuses to enable native remote push until the backend advertises a compatible native-token contract. Guest and Partner v1 therefore truthfully retain in-app and email notification UX without pretending Expo/APNs/FCM delivery works.
- Non-production Vercel Preview: health and direct public route checks PASS.
- Dependency audit: web has 0 known vulnerabilities at the configured gate. Mobile has no high or critical findings; 11 moderate findings remain in transitive Expo build tooling and require a breaking/forced dependency upgrade, so no unsafe forced upgrade was applied.

## Changes made during the audit

- Updated analytics writes and checks to match the current analytics schema without the obsolete `profile_key` field.
- Made staging browser-login analytics persistence failures visible instead of silently passing.
- Added missing SPA rewrites for direct restaurant, offer, food-feed, and public-information routes, plus regression assertions for those routes.
- Added a staging-only Crave preview test that verifies environment isolation, preview data, mobile rendering, playback, and public-feed isolation. It refuses production and does not delete data.
- Added a staging-only reservation/review E2E gate that validates the exact staging project and test identities, creates or reuses test-only availability, completes the canonical reservation lifecycle, verifies review persistence and duplicate protection, restores the restaurant's hidden state in a `finally` guard, refuses production, and performs no destructive cleanup.
- Extended the staging review E2E gate to request a signed upload, upload a minimal valid image, submit it with the verified review, and prove Partner retrieval returns exactly that photo under the exact review.
- Corrected reservation notification routing so the dedicated restaurant reservation address takes precedence consistently in the application, resend utility, diagnostics, and regression tests.
- Added a Guest staging-build guard for the canonical hidden QA restaurant. A staging build now fails clearly if the preview restaurant is not configured, while production always discards the staging-only identifier.
- Configured and verified the Guest Android and iOS staging exports with the hidden Crave QA restaurant; production-mode configuration was separately proven not to expose that identifier.
- Kept native remote push feature-gated to the canonical Shared Mobile Core contract; no duplicate push implementation or unsupported token registration was introduced.
- Preserved the existing uncommitted Partner navigation and Crave-management work; no reset, cleanup, or overwrite was performed.

## Remaining release blockers

1. Signed iOS builds require the correct Apple Developer team, certificates, provisioning profile, and physical-iPhone acceptance testing.
2. Signed Android release artifacts require the project signing/EAS credentials and physical-Android acceptance testing.
3. Universal-link/App-Link association files and final hosted domains must be configured and verified on physical devices.
4. Native remote push is not backed by the required external Expo/APNs/FCM token contract and credentials; the app correctly keeps it disabled until that separate backend integration is completed.
5. App Store and Google Play metadata, privacy declarations, screenshots, account agreements, and submission steps require account-owner action.
6. The normal public Crave feed still needs approved, non-test launch media. The verified video used here is staging-only test data.

## Controlled staging transaction evidence

- Exact environment guard: staging Supabase project verified; production hosts and project identifiers are refused.
- Test isolation: Guest, Partner, restaurant, offer, reservation, and review are staging test data only.
- Reservation lifecycle: PASS (`pending -> accepted -> arrived -> completed`).
- Verified-review eligibility, persistence, photo upload, and exact photo association: PASS.
- Duplicate review protection: PASS (HTTP 409, `review_already_submitted`).
- Internal review identifiers and guest PII are not returned by the Guest submission response: PASS.
- Test restaurant hidden state after the transaction: PASS.
- Restricted staging email handoff: PASS; creation and acceptance messages were accepted with zero provider failures.
- Destructive cleanup: not performed. The staging-only QA records remain intentionally because destructive database operations are prohibited.

## Safety statement

- Production touched: **NO**.
- Production deployment: **NO**.
- Production write test: **NO**.
- Migration applied: **NO**.
- Database cleanup or destructive operation: **NO**.
- Secret values recorded in this report: **NO**.
