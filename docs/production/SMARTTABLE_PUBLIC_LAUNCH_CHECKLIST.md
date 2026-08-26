# SmartTable Public Launch Checklist

Date: 2026-07-19

Use this checklist before opening SmartTable BASIC to public users. Check an item only after it was actually verified.

## Build And Tests

- [ ] Production build passes.
- [ ] Full automated tests pass.
- [ ] BASIC UI checks pass.
- [ ] Visual readiness checks pass.
- [ ] Reservation lifecycle checks pass.
- [ ] Email checks pass.
- [ ] No unresolved P0 defect remains.
- [ ] No unresolved P1 defect remains.

## Onboarding And Mobile UX

- [ ] Onboarding stepper is readable.
- [ ] Onboarding labels do not overlap.
- [ ] Current onboarding step is visually clear.
- [ ] Completed and future onboarding steps are distinguishable.
- [ ] Mobile layout verified at 320 px.
- [ ] Mobile layout verified at 375 px.
- [ ] Mobile layout verified at 390 px.
- [ ] Mobile layout verified at 430 px.
- [ ] Tablet layout verified.
- [ ] Desktop layout verified.
- [ ] No page-level horizontal overflow.

## Public Navigation

- [ ] Public Super Admin link removed or hidden from normal public navigation.
- [ ] Partner access intentionally placed through protected route or partner login path.
- [ ] Public users see only consumer-appropriate navigation.
- [ ] Direct partner/admin routes remain protected.

## Supabase And Database

- [ ] Production Supabase migrations applied.
- [ ] Latest migration version recorded.
- [ ] RLS reviewed in Supabase dashboard or SQL.
- [ ] Guest authorization verified.
- [ ] Partner tenant isolation verified.
- [ ] Service-role key remains server-only.
- [ ] No service-role key appears in browser bundles.
- [ ] Account deletion, cancellation, and status changes preserve relationships.
- [ ] Backup status verified in Supabase dashboard.
- [ ] Manual backup/export completed before public launch.

## Resend And Email

- [ ] Resend sender verified in Resend dashboard.
- [ ] `EMAIL_FROM` matches the verified sender.
- [ ] Production email tested with approved recipient.
- [ ] Email links use `PUBLIC_BASE_URL`.
- [ ] No production email link contains localhost.
- [ ] Duplicate transactional email protection verified.
- [ ] Email failure does not corrupt reservations.
- [ ] Resend webhook remains deferred unless intentionally activated later.

## Environment And Domain

- [ ] `SMARTTABLE_ENV=production`.
- [ ] `PUBLIC_BASE_URL` points to the intended public guest URL.
- [ ] `PUBLIC_BASE_URL` is not localhost.
- [ ] `PUBLIC_BASE_URL` is not deprecated `smarttable.com`.
- [ ] Supabase Auth redirect allowlist includes production URLs.
- [ ] Vercel domain routes to the current production deployment.
- [ ] Custom domain readiness documented.
- [ ] DNS was not changed without authorization.
- [ ] Health endpoint verified.

## Product Mode And Scope

- [ ] BASIC mode enabled.
- [ ] AI features hidden.
- [ ] AI direct routes inaccessible or unavailable in BASIC.
- [ ] No POS integration exists.
- [ ] Future integration language mentions reservation platforms only.
- [ ] No production mock data is shown as real.

## Security

- [ ] Protected routes require authentication.
- [ ] Role checks enforce guest, partner, admin, and Super Admin boundaries.
- [ ] Cross-restaurant access is blocked.
- [ ] Cross-guest reservation access is blocked.
- [ ] Public API responses do not expose private partner/admin data.
- [ ] Public error messages do not expose stack traces.
- [ ] Secrets are not committed.
- [ ] `.env` and `.env.local` remain ignored.
- [ ] Rollback procedure known.
- [ ] Key-rotation procedure known.

## Documentation

- [ ] `docs/SUPABASE_PRODUCTION_INITIALIZATION.md` reviewed.
- [ ] `docs/production/SMARTTABLE_BACKUP_AND_RECOVERY.md` reviewed.
- [ ] `docs/production/SMARTTABLE_PRODUCTION_HARDENING_REPORT.md` reviewed.
- [ ] Deployment instructions reviewed.
- [ ] Rollback instructions reviewed.

## Final Sign-Off

- [ ] Product owner approval.
- [ ] Engineering approval.
- [ ] Supabase production owner approval.
- [ ] Vercel deployment owner approval.
- [ ] Resend/email owner approval.
- [ ] Manual QA screenshots archived.
