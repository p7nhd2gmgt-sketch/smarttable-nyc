# SmartTable BASIC Release Checklist

Date: 2026-07-19

Scope: BASIC discounted restaurant reservation marketplace only.

## Release Gate

- [x] Build passing
- [x] Tests passing
- [x] Type check passing
- [x] Lint passing
- [x] Database migrations present in repository
- [ ] Production Supabase migration status verified after deployment/environment fix
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
- [x] Production-safe `/api/health` includes database reachability without secrets
- [x] Deprecated `smarttable.com` public base URL fails production preflight
- [x] Public SEO metadata uses `smarttablenyc.com`
- [x] Private/auth/admin/partner/AI preview routes are noindexed
- [x] No POS integration
- [x] AI features hidden in BASIC by feature registry/mode checks
- [x] No unresolved P0 defects
- [x] No unresolved P1 defects
- [x] Environment variables documented
- [x] Deployment rollback procedure known/documented in deployment notes
- [ ] Production custom domain health verified: blocked on Cloudflare `522` during the 2026-07-19 hardening probe
- [ ] Production deployment verified in Supabase mode: blocked because the reachable Vercel default host reported `mode=demo`
- [x] Production code now fails safely instead of falling back to demo storage when mandatory production configuration is missing
- [x] Public Admin/Partner header shortcuts hidden unless an authenticated matching role is active
- [x] Guest onboarding stepper verified in headless Edge at `320`, `375`, `390`, `430`, `768`, `1024`, `1366`, and `1440` widths
- [x] Headless Edge screenshots captured for homepage desktop, signup desktop, and signup mobile

## Production Hardening Update - 2026-07-19

The local code release gate remains green, but the current public deployment is not ready for limited public testing until:

- `https://smarttablenyc.com/api/health` returns `200`;
- the active Vercel production deployment reports `environment=production` and `mode=supabase`;
- `/api/health` reports `database_reachable=true`;
- `PUBLIC_BASE_URL` points to the intended public guest URL;
- `PUBLIC_BASE_URL` is not `smarttable.com`, `localhost`, or another deprecated/non-production URL;
- Supabase and Resend production variables are confirmed in the Vercel production environment.

See `docs/qa/SMARTTABLE_BASIC_PRODUCTION_HARDENING_REPORT.md`.

## Environment Variables

Required production values are documented in `.env.example`, `README.md`, and `DEPLOYMENT.md`.

- [x] `PORT`
- [x] `SMARTTABLE_ENV`
- [x] `PUBLIC_BASE_URL`
- [x] `SUPABASE_URL`
- [x] `SUPABASE_ANON_KEY`
- [x] `SUPABASE_SERVICE_ROLE_KEY`
- [x] `EMAIL_FROM`
- [x] `EMAIL_REPLY_TO`
- [x] `RESEND_API_KEY`
- [x] `RESEND_WEBHOOK_SECRET` documented as deferred for delivery-state tracking
- [x] `EMAIL_RECIPIENT_ALLOWLIST` documented for non-production real email sending
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

- [x] C. NOT READY FOR PUBLIC TESTING

Conditions:

- No unresolved P0 issue is known.
- No unresolved P1 issue is known.
- Local code and automated checks are green.
- Public custom domain health and production Supabase mode remain unverified blockers documented in `docs/qa/SMARTTABLE_BASIC_PRODUCTION_HARDENING_REPORT.md`.

## Rollback Awareness

- [x] Do not run destructive migrations during release.
- [x] Preserve existing restaurants, offers, reservations, users, email logs, and authentication data.
- [x] Roll back application deployment first if a UI/API regression is detected.
- [x] Review migration history before any production database rollback.
- [x] Keep Resend webhook delivery tracking deferred unless configured and tested separately.
