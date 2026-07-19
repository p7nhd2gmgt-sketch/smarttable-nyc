# SmartTable BASIC Release Checklist

Date: 2026-07-19

Scope: BASIC discounted restaurant reservation marketplace only.

## Release Gate

- [x] Build passing
- [x] Tests passing
- [x] Type check passing
- [x] Lint passing
- [x] Database ready for configured environment
- [x] Authentication verified by automated/API checks
- [x] Guest workflow verified by automated/API checks
- [x] Partner workflow verified by automated/API checks
- [x] Admin workflow verified by automated/API checks
- [x] Super Admin workflow verified by automated/API checks
- [x] Emails verified by automated checks
- [ ] Emails re-verified in real inbox during this pass
- [x] Mobile responsive overflow checked in headless Edge/CDP
- [ ] Physical mobile verified
- [x] Edge/Chromium browser shell verified
- [ ] Chrome desktop manually verified
- [ ] Firefox manually verified
- [ ] Safari/WebKit manually verified
- [x] Localization verified by automated EN/ES/HU checks
- [ ] Localization visually verified by human in EN/ES/HU
- [x] Accessibility reviewed by static checks and basic Edge DOM probe
- [ ] Accessibility manually reviewed with keyboard/screen reader/contrast checks
- [x] Authorization reviewed by automated/API checks
- [x] No POS integration
- [x] AI features hidden in BASIC by feature registry/mode checks
- [x] No unresolved P0 defects
- [x] No unresolved P1 defects
- [x] Environment variables documented
- [x] Deployment rollback procedure known/documented in deployment notes

## Environment Variables

Required production values are documented in `.env.example`, `README.md`, and `DEPLOYMENT.md`.

- [x] `PORT`
- [x] `PUBLIC_BASE_URL`
- [x] `SUPABASE_URL`
- [x] `SUPABASE_ANON_KEY`
- [x] `SUPABASE_SERVICE_ROLE_KEY`
- [x] `EMAIL_FROM`
- [x] `EMAIL_REPLY_TO`
- [x] `RESEND_API_KEY`
- [x] `RESEND_WEBHOOK_SECRET` documented as deferred for delivery-state tracking
- [x] `EMAIL_TEMPLATE_VERSION`
- [x] `EMAIL_RETRY_LIMIT`
- [x] `EMAIL_QUEUE_MAX_ATTEMPTS`
- [x] `EMAIL_WEBHOOK_TOLERANCE_SECONDS`
- [x] `ADMIN_NOTIFICATION_EMAIL`
- [x] `SUPABASE_STORAGE_BUCKET`

## Manual QA Still Required

- [ ] Complete `docs/BASIC-Launch-Manual-QA-Checklist.md` in desktop Chrome or Edge.
- [ ] Complete one Firefox desktop pass.
- [ ] Complete one Safari/WebKit pass where available.
- [ ] Complete one real mobile-device pass.
- [ ] Verify authenticated guest signup/login/account/reservation flows through the UI.
- [ ] Verify partner offer and reservation management through the UI.
- [ ] Verify admin and Super Admin management screens through the UI.
- [ ] Verify EN/ES/HU visual wrapping in the UI.
- [ ] Verify keyboard navigation and modal focus behavior manually.
- [ ] Verify staging Supabase unavailable/degraded behavior.

## Release Decision

- [x] B. RELEASE READY WITH DOCUMENTED MINOR ISSUES

Conditions:

- No unresolved P0 issue is known.
- No unresolved P1 issue is known.
- Remaining issues are P2/P3 verification and polish items documented in `docs/qa/SMARTTABLE_BASIC_FINAL_QA.md`.

## Rollback Awareness

- [x] Do not run destructive migrations during release.
- [x] Preserve existing restaurants, offers, reservations, users, email logs, and authentication data.
- [x] Roll back application deployment first if a UI/API regression is detected.
- [x] Review migration history before any production database rollback.
- [x] Keep Resend webhook delivery tracking deferred unless configured and tested separately.
