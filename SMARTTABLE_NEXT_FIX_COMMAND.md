# SmartTable Next Fix Command

Copy the command below into a new Codex task. It is intentionally scoped to the critical, high-priority, and production-blocking findings from `SMARTTABLE_FULL_SYSTEM_AUDIT.md`.

Do not add new product features. Do not begin Enterprise, AI, billing, Stripe, POS, or reservation-platform integration work. This command is only for stabilization, security hardening, and making the current SmartTable BASIC system safe for controlled public testing.

```text
SMARTTABLE BASIC — CRITICAL/HIGH PRIORITY PRODUCTION BLOCKER FIX PASS

You are working inside the existing SmartTable repository.

Primary goal:
Fix only the critical, high-priority, and production-blocking issues documented in SMARTTABLE_FULL_SYSTEM_AUDIT.md.

Do not redesign the product.
Do not add new product features.
Do not enable AI Concierge.
Do not add POS integrations.
Do not add Stripe/billing architecture.
Do not implement reservation-platform integrations.
Do not configure or expand deferred Resend webhook delivery tracking.
Do not reset or delete production data.
Do not run destructive migrations.
Do not expose secrets.
Do not deploy unless explicitly authorized after all checks pass.

PHASE 0 — SAFETY BASELINE

1. Identify the project root.
2. Run:
   - git status
   - git branch --show-current
   - git rev-parse --short HEAD
   - git remote -v
3. Review existing changed/untracked files.
4. Do not overwrite unrelated user changes.
5. Confirm `.env`, `.env.local`, provider keys, service-role keys, passwords, tokens, database URLs with credentials, screenshots containing secrets, and private production data are not committed.
6. Run baseline checks before editing:
   - npm.cmd run build
   - npm.cmd run lint
   - npm.cmd test
   - npm.cmd audit --omit=dev --audit-level=moderate
7. Record all baseline results.
8. If baseline fails, determine whether the failure predates your work. Fix only blockers that are directly relevant to the critical/high-priority audit findings.

PHASE 1 — FIX CRITICAL BLOCKER ST-C-001

Issue:
`GET /api/public/rewards/context?bookingId=...` can expose guest PII by booking reference.

Affected code:
`src/app-core.js`, function `publicRewardsContext()`, currently exposed as `/api/public/rewards/context`.

Required fix:
1. Do not return guest name, guest email, guest phone, guest ID, profile key, or any private guest data from this public endpoint without authenticated ownership.
2. Choose the lowest-risk compatible fix:
   - Preferred: require an authenticated guest session and verify the reservation belongs to the authenticated guest before returning any guest-owned context.
   - If the post-visit feedback flow requires unauthenticated access from an email link, return only non-PII public reservation metadata and require a signed, expiring, single-purpose token before exposing guest-owned context. Do not build a broad new token system unless already present.
3. Preserve the existing post-visit feedback flow where safe.
4. Ensure a missing/invalid auth state returns `401 AUTHENTICATION_REQUIRED` or a safe limited public response.
5. Ensure a reservation owned by another guest returns `403 FORBIDDEN` or `404 NOT_FOUND`.
6. Ensure nonexistent references return `404`.
7. Add regression tests proving:
   - unauthenticated request does not expose guest PII;
   - authenticated owner can access only allowed context;
   - another guest cannot access the reservation context;
   - response contains no `guestEmail`, `guest_email`, `guestName`, `guest_name`, `guestPhone`, `guest_phone`, or private profile data unless strictly authenticated and required.

Acceptance criteria:
- No unauthenticated public endpoint exposes guest PII by booking reference.
- Existing eligible feedback flow still has a safe path.
- Tests cover the privacy boundary.

PHASE 2 — FIX CRITICAL BLOCKER ST-C-002

Issue:
`GET /api/guest/notifications` can be queried by `guest_email`, `email`, or `profile_key` without authentication.

Affected code:
`src/app-core.js`, function `guestNotifications()`.

Required fix:
1. Require authenticated guest session for all `/api/guest/notifications` GET and PATCH operations.
2. Do not accept `guest_email`, `email`, or `profile_key` query parameters as authorization.
3. Derive the guest identity only from the authenticated profile/session.
4. Return:
   - `401 AUTHENTICATION_REQUIRED` when logged out;
   - `403 FORBIDDEN` when role is not guest;
   - no private notifications for another user.
5. Preserve guest notification center behavior for logged-in guests.
6. Add regression tests proving:
   - unauthenticated GET returns 401 and no data;
   - query-string email cannot retrieve notifications;
   - query-string profile_key cannot retrieve notifications;
   - authenticated guest sees only their notifications;
   - PATCH mark-read is still scoped to the authenticated guest.

Acceptance criteria:
- Guest notification history is no longer accessible by email/profile-key lookup.
- Guest notification UI still works after login.

PHASE 3 — FIX HIGH PRIORITY API BODY SIZE LIMIT

Issue:
`server.js` and `api/index.js` read request bodies without an explicit maximum size.

Affected code:
- `server.js`, `parseJson(req)`
- `api/index.js`, `readBody(req)`

Required fix:
1. Add a shared or equivalent conservative JSON body limit.
2. Suggested default: 1 MB, configurable with a server-only env var such as `SMARTTABLE_MAX_JSON_BODY_BYTES`.
3. Do not expose the limit value as a secret.
4. Return HTTP `413` with safe error:
   - `code: "PAYLOAD_TOO_LARGE"`
   - `error: "Request body is too large."`
5. Preserve valid existing signup, reservation, profile, admin and partner payload behavior.
6. Ensure invalid JSON still returns a safe `400` where currently expected.
7. Add tests for:
   - oversized local-server parse path if practical;
   - oversized Vercel API parse path if practical;
   - normal valid reservation/signup payload still works.

Acceptance criteria:
- Oversized requests cannot force unbounded memory reads.
- Existing valid flows are not broken.

PHASE 4 — FIX HIGH PRIORITY LIST RESPONSE SCALING WHERE LOW RISK

Issue:
Several endpoints use broad `select=*` and/or no cursor pagination. Do not perform a broad API redesign. Fix only low-risk public/primary paths.

Minimum required low-risk fixes:
1. Public offers:
   - Replace `select=*` for `/api/public/offers` with an explicit field list or a public view that contains only safe display fields.
   - Add a safe upper limit if the existing UX does not require all offers at once.
   - Preserve current homepage/listing behavior.
2. Guest reservations:
   - Ensure guest reservation history is scoped to the authenticated guest and has a sensible limit or future pagination placeholder without breaking UI.
3. Admin/partner dashboards:
   - Do not rewrite dashboards.
   - Where existing queries already use limits, document remaining pagination work.

Add tests proving:
- public offers response does not include private restaurant/admin fields;
- public offers still render;
- guest reservations remain scoped to the authenticated guest;
- large response behavior is bounded where changed.

Acceptance criteria:
- No broad public `select=*` response exposes new private columns.
- Public listing still works.
- High-risk scalability issue is reduced without broad rewrite.

PHASE 5 — PRODUCTION AUTH/EMAIL/ACCOUNT VERIFICATION GUARDRAILS

Issue:
Real production signup/Auth/email/login/account flow is not fully verified by repository-only tests.

Do not perform real production signup unless explicitly authorized and a controlled inbox is provided.

Required repository work:
1. Keep existing production auth flow tests.
2. Add or update a non-secret production QA checklist if missing, focused on:
   - Supabase Auth user creation;
   - SmartTable profile creation;
   - guest onboarding creation;
   - consent records;
   - Supabase confirmation email behavior;
   - Resend welcome email;
   - login;
   - account/reservations/favorites/notifications pages.
3. Ensure no UI message claims email delivery unless provider acceptance is known.
4. Ensure docs clearly state that real delivery and Supabase Dashboard verification are manual unless actually performed.

Acceptance criteria:
- Production verification steps are exact and executable.
- No false claim of production readiness is added.

PHASE 6 — SECURITY REGRESSION TESTS

Add or update automated tests for:

1. Public reward context no longer leaks PII.
2. Guest notifications require authentication.
3. Oversized JSON body returns 413.
4. Public offers response is bounded/safe.
5. Service-role key and Resend key are absent from browser bundle.
6. BASIC mode keeps AI routes hidden.
7. Guest cannot access another guest reservation/account/notification data.
8. Partner cannot access another restaurant reservation/offer/profile data.

Use the existing project test stack.
Do not introduce a large new framework unless unavoidable.

PHASE 7 — FINAL VALIDATION

Run:

- npm.cmd run build
- npm.cmd run lint
- npm.cmd test
- npm.cmd run check:email
- npm.cmd run check:reservation-lifecycle
- npm.cmd run check:basic-security-hardening
- npm.cmd run check:route-protection
- npm.cmd audit --omit=dev --audit-level=moderate

If a command fails:

1. Identify exact failure.
2. Fix only defects caused by this work or directly related blockers.
3. Rerun the affected command.
4. Do not suppress tests, add fake passes, or weaken assertions.

PHASE 8 — DOCUMENTATION

Update:

- `SMARTTABLE_FULL_SYSTEM_AUDIT.md`

Add a short “Fix pass result” section stating:

- which blockers were fixed;
- which files changed;
- which tests were added;
- which checks passed;
- which issues remain manual verification items;
- whether production deployment is still blocked.

Do not mark production GO unless real production signup/Auth/email/browser verification was actually completed.

FINAL REPORT FORMAT

Return:

1. Executive summary.
2. Critical blockers fixed.
3. High-priority issues fixed.
4. Production blockers remaining.
5. Files changed.
6. Tests added/updated.
7. Commands executed and results.
8. Security result.
9. Manual verification still required.
10. Final decision:
    - BLOCKERS FIXED — READY FOR CONTROLLED PRODUCTION QA
    - PARTIAL — MANUAL VERIFICATION REQUIRED
    - NOT READY — BLOCKER REMAINS
```
