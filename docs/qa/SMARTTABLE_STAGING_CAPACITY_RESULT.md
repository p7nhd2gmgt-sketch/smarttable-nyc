# SmartTable staging capacity result

Date: 2026-08-20

## Target safety

- Application: Vercel Preview, not the production domain
- Runtime: `preview`
- Supabase project ref: `zwapighnwlwmdkqscrzn` (SmartTable staging)
- Verified build: `dpl_BUaSWjg8mg6xsD4jVV5dtkxvk9gn`
- Production domain and production Supabase ref are rejected by the load-test guard.
- All measured application requests used `GET`.
- No reservation, offer, user, restaurant, notification, billing, or authentication data was created or changed.
- The partner session was established once before measurement; credentials and tokens were not written to reports.

## Results

| Profile | Simulated users | Requests | Concurrency | Failures | Error rate | p50 | p95 | p99 | Throughput |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Smoke | 10 | 20 | 5 | 0 | 0.00% | 223 ms | 1069 ms | 1578 ms | 12.60 req/s |
| 100 | 100 | 300 | 20 | 0 | 0.00% | 208 ms | 1050 ms | 1500 ms | 59.87 req/s |
| 300 | 300 | 1200 | 50 | 0 | 0.00% | 230 ms | 901 ms | 1536 ms | 139.11 req/s |
| 1000 | 1000 | 4000 | 100 | 0 | 0.00% | 406 ms | 1659 ms | 3301 ms | 150.04 req/s |
| 3000 | 3000 | 9000 | 150 | 0 | 0.00% | 464 ms | 2133 ms | 3268 ms | 184.65 req/s |

Acceptance thresholds were an error rate no greater than 1%, p95 no greater than 2500 ms, and p99 no greater than 5000 ms. Every profile passed.

## Covered traffic

The run exercised public configuration, restaurant, offer, newest restaurant, Food Feed, and localized content reads. Authenticated partner reads covered session restoration, profile, dashboard statistics, reservations, offers, reviews, analytics, and notification settings.

## Interpretation

The verified staging build handled the synthetic read workload representing up to 3000 concurrently scheduled users without an HTTP failure and remained within the defined latency gates. This is a strong launch-readiness signal for the stated initial audience size.

This result does not prove the following independently:

- 1000 distinct restaurant tenants with production-sized records;
- simultaneous reservation creation and acceptance writes;
- notification fan-out through email, push, or SMS;
- Stripe checkout and webhook bursts;
- long-duration soak behavior or regional latency outside the tested Vercel/Supabase path.

Those paths intentionally remain outside this non-destructive test because they create data or contact external providers. They require isolated QA fixtures, provider test modes, and before/after row verification.

## Reproduction

Run the safety check first:

```powershell
npm run check:load-test-safety
```

Then set the protected staging URL and run profiles in order:

```powershell
npm run load:test:staging:smoke
npm run load:test:staging:100 -- --confirm-staging-load-test
npm run load:test:staging:300 -- --confirm-staging-load-test
npm run load:test:staging:1000 -- --confirm-staging-load-test
npm run load:test:staging:3000 -- --confirm-staging-load-test
```

Machine-readable reports are written under the ignored `test-results/load/` directory and contain metrics only.
